import Foundation
import Combine
import Network

/// Lightweight offline queue for inspection drafts. Persists pending answers
/// and pending media uploads under Application Support and drains them when
/// the network comes back. We deliberately avoid Core Data to keep the v1
/// surface area small — JSON is sufficient for the volumes a single
/// inspection produces.
@MainActor
final class OfflineQueue: ObservableObject {
    static let shared = OfflineQueue()

    struct PendingAnswer: Codable, Identifiable {
        var id: String { "\(submissionId):\(payload.answerId)" }
        let submissionId: String
        let payload: PpiAPI.SaveAnswerPayload
    }

    struct PendingMedia: Codable, Identifiable {
        let id: String  // local UUID
        let submissionId: String
        let sectionId: String
        let answerId: String?
        let localFileURL: URL
        let filename: String
        let contentType: String
        let capturedAt: Date
        var uploadedReference: String? = nil
    }

    struct PendingOBDSnapshot: Codable, Identifiable {
        let id: String
        let submissionId: String
        let snapshot: OBDDiagnosticSnapshot
        let transcript: [OBDExchange]
    }

    @Published private(set) var pendingAnswers: [PendingAnswer] = []
    @Published private(set) var pendingMedia: [PendingMedia] = []
    @Published private(set) var pendingOBDSnapshots: [PendingOBDSnapshot] = []
    @Published private(set) var mediaUploadProgress: [String: Double] = [:]
    @Published private(set) var mediaUploadErrors: [String: String] = [:]
    @Published private(set) var mediaSyncRevision = 0
    @Published private(set) var isOnline: Bool = true
    @Published private(set) var persistenceError: String?

    private let monitor = NWPathMonitor()
    private let storeURL: URL
    private let mediaDirectory: URL
    private var activeMediaIds: Set<String> = []

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PerfectPPI", isDirectory: true)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        self.storeURL = support.appendingPathComponent("offline-queue.json")
        self.mediaDirectory = support.appendingPathComponent("offline-media", isDirectory: true)
        try? FileManager.default.createDirectory(at: mediaDirectory, withIntermediateDirectories: true)

        load()
        startMonitor()
    }

    // MARK: - Public API

    func enqueueAnswer(submissionId: String, payload: PpiAPI.SaveAnswerPayload) throws {
        let previous = pendingAnswers
        // Replace existing entry for the same question, otherwise append.
        if let idx = pendingAnswers.firstIndex(where: {
            $0.submissionId == submissionId && $0.payload.answerId == payload.answerId
        }) {
            pendingAnswers[idx] = PendingAnswer(submissionId: submissionId, payload: payload)
        } else {
            pendingAnswers.append(PendingAnswer(submissionId: submissionId, payload: payload))
        }
        do {
            try writeSnapshot()
            persistenceError = nil
        } catch {
            pendingAnswers = previous
            persistenceError = "Offline changes could not be saved."
            throw error
        }
    }

    func enqueueMedia(_ item: PendingMedia) throws {
        pendingMedia.append(item)
        mediaUploadErrors[item.id] = nil
        do {
            try writeSnapshot()
            persistenceError = nil
        } catch {
            pendingMedia.removeAll { $0.id == item.id }
            persistenceError = "Offline changes could not be saved."
            throw error
        }
    }

    /// Upload one retained inspection photo now. The queue row is removed only
    /// after both object upload and inspection attachment succeed, so a failed
    /// attempt remains visible and retryable without asking for the photo again.
    func retryMedia(id: String) async throws -> PpiMedia {
        guard let entry = pendingMedia.first(where: { $0.id == id }) else {
            throw CocoaError(.fileNoSuchFile)
        }
        guard !activeMediaIds.contains(id) else {
            throw APIError.server(status: 409, message: "This photo is already uploading.")
        }

        activeMediaIds.insert(id)
        mediaUploadErrors[id] = nil
        mediaUploadProgress[id] = 0
        defer {
            activeMediaIds.remove(id)
            mediaUploadProgress[id] = nil
        }

        do {
            let url: String
            if let uploadedReference = entry.uploadedReference {
                url = uploadedReference
            } else {
                let data = try Data(contentsOf: entry.localFileURL)
                url = try await R2Uploader.upload(
                    data: data,
                    filename: entry.filename,
                    contentType: entry.contentType,
                    entity: "ppi_media",
                    recordId: entry.submissionId,
                    onProgress: { [weak self] fraction in
                        Task { @MainActor [weak self] in
                            self?.mediaUploadProgress[id] = min(max(fraction, 0), 1)
                        }
                    }
                )
                if let index = pendingMedia.firstIndex(where: { $0.id == id }) {
                    pendingMedia[index].uploadedReference = url
                    try writeSnapshot()
                }
            }
            mediaUploadProgress[id] = 1
            let media = try await PpiAPI.attachMedia(
                submissionId: entry.submissionId,
                payload: AttachMediaRequest(
                    ppiSectionId: entry.sectionId,
                    ppiAnswerId: entry.answerId,
                    url: url,
                    mediaType: "image",
                    capturedAt: entry.capturedAt
                )
            )

            pendingMedia.removeAll { $0.id == id }
            mediaUploadErrors[id] = nil
            try? FileManager.default.removeItem(at: entry.localFileURL)
            mediaSyncRevision &+= 1
            save()
            return media
        } catch {
            mediaUploadErrors[id] = error.localizedDescription
            save()
            throw error
        }
    }

    /// Discard a retained photo that has not reached the inspection record.
    func removeMedia(id: String) async throws {
        guard let entry = pendingMedia.first(where: { $0.id == id }) else { return }
        guard !activeMediaIds.contains(id) else {
            throw APIError.server(status: 409, message: "Wait for this upload to finish before removing it.")
        }
        if let uploadedReference = entry.uploadedReference {
            _ = try await PpiAPI.discardPendingMedia(
                submissionId: entry.submissionId,
                storageReference: uploadedReference
            )
        }
        let previous = pendingMedia
        pendingMedia.removeAll { $0.id == id }
        do {
            try writeSnapshot()
            mediaUploadErrors[id] = nil
            mediaUploadProgress[id] = nil
            try? FileManager.default.removeItem(at: entry.localFileURL)
            persistenceError = nil
        } catch {
            pendingMedia = previous
            persistenceError = "Offline changes could not be saved."
            throw error
        }
    }

    func isMediaUploading(id: String) -> Bool {
        activeMediaIds.contains(id)
    }

    func persistMedia(_ data: Data, filename: String) throws -> URL {
        let safeExtension = URL(fileURLWithPath: filename).pathExtension
        let destination = mediaDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(safeExtension.isEmpty ? "jpg" : safeExtension)
        try data.write(to: destination, options: [.atomic, .completeFileProtection])
        return destination
    }

    func enqueueOBDSnapshot(submissionId: String, snapshot: OBDDiagnosticSnapshot, transcript: [OBDExchange]) throws {
        let previous = pendingOBDSnapshots
        let item = PendingOBDSnapshot(
            id: "\(submissionId):\(Int(Date().timeIntervalSince1970))",
            submissionId: submissionId,
            snapshot: snapshot,
            transcript: transcript
        )
        pendingOBDSnapshots.removeAll { $0.submissionId == submissionId }
        pendingOBDSnapshots.append(item)
        do {
            try writeSnapshot()
            persistenceError = nil
        } catch {
            pendingOBDSnapshots = previous
            persistenceError = "Offline changes could not be saved."
            throw error
        }
    }

    /// Try to flush every queued item. Called on app foreground and on
    /// reachability change.
    func drain() async {
        guard isOnline else { return }

        // Drain answers first.
        var stillPendingAnswers: [PendingAnswer] = []
        for entry in pendingAnswers {
            do {
                _ = try await PpiAPI.saveAnswer(
                    submissionId: entry.submissionId,
                    payload: entry.payload
                )
            } catch {
                stillPendingAnswers.append(entry)
            }
        }
        pendingAnswers = stillPendingAnswers

        // Drain a stable id snapshot. retryMedia owns progress/error state and
        // removes each item only after its attachment row exists.
        for id in pendingMedia.map(\.id) where !activeMediaIds.contains(id) {
            do {
                _ = try await retryMedia(id: id)
            } catch {
                // The retained tile exposes the specific reason and retry action.
            }
        }

        var stillPendingOBD: [PendingOBDSnapshot] = []
        for entry in pendingOBDSnapshots {
            do {
                _ = try await PpiAPI.saveOBDSnapshot(
                    submissionId: entry.submissionId,
                    snapshot: entry.snapshot,
                    transcript: entry.transcript
                )
            } catch {
                stillPendingOBD.append(entry)
            }
        }
        pendingOBDSnapshots = stillPendingOBD

        save()
    }

    // MARK: - Persistence

    private struct Snapshot: Codable {
        let pendingAnswers: [PendingAnswer]
        let pendingMedia: [PendingMedia]
        let pendingOBDSnapshots: [PendingOBDSnapshot]?
    }

    private func save() {
        do {
            try writeSnapshot()
            persistenceError = nil
        } catch {
            persistenceError = "Offline changes could not be saved."
        }
    }

    private func writeSnapshot() throws {
        let snapshot = Snapshot(
            pendingAnswers: pendingAnswers,
            pendingMedia: pendingMedia,
            pendingOBDSnapshots: pendingOBDSnapshots
        )
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: storeURL, options: [.atomic, .completeFileProtection])
    }

    private func load() {
        guard let data = try? Data(contentsOf: storeURL),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        pendingAnswers = snapshot.pendingAnswers
        pendingMedia = snapshot.pendingMedia
        pendingOBDSnapshots = snapshot.pendingOBDSnapshots ?? []
    }

    // MARK: - Reachability

    private func startMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                let online = path.status == .satisfied
                self?.isOnline = online
                if online {
                    await self?.drain()
                }
            }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))
    }
}
