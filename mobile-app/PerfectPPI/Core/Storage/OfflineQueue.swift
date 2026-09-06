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
    @Published private(set) var isOnline: Bool = true
    @Published private(set) var persistenceError: String?

    private let monitor = NWPathMonitor()
    private let storeURL: URL
    private let mediaDirectory: URL

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
        do {
            try writeSnapshot()
            persistenceError = nil
        } catch {
            pendingMedia.removeAll { $0.id == item.id }
            persistenceError = "Offline changes could not be saved."
            throw error
        }
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

        // Drain media uploads.
        var stillPendingMedia: [PendingMedia] = []
        for entry in pendingMedia {
            do {
                let data = try Data(contentsOf: entry.localFileURL)
                let url = try await R2Uploader.upload(
                    data: data,
                    filename: entry.filename,
                    contentType: entry.contentType,
                    entity: "ppi_media",
                    recordId: entry.submissionId
                )
                _ = try await PpiAPI.attachMedia(
                    submissionId: entry.submissionId,
                    payload: AttachMediaRequest(
                        ppiSectionId: entry.sectionId,
                        ppiAnswerId: entry.answerId,
                        url: url,
                        mediaType: "image",
                        capturedAt: entry.capturedAt
                    )
                )
                try? FileManager.default.removeItem(at: entry.localFileURL)
            } catch {
                stillPendingMedia.append(entry)
            }
        }
        pendingMedia = stillPendingMedia

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
