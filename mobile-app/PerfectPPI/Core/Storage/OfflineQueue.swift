import Foundation
import Combine
import Network

/// Lightweight offline queue for inspection drafts. Persists pending answers
/// and pending media uploads to a JSON file in Caches/ and drains them when
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

    private let monitor = NWPathMonitor()
    private let storeURL: URL

    private init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.storeURL = caches.appendingPathComponent("perfectppi-offline.json")

        load()
        startMonitor()
    }

    // MARK: - Public API

    func enqueueAnswer(submissionId: String, payload: PpiAPI.SaveAnswerPayload) {
        // Replace existing entry for the same question, otherwise append.
        if let idx = pendingAnswers.firstIndex(where: {
            $0.submissionId == submissionId && $0.payload.answerId == payload.answerId
        }) {
            pendingAnswers[idx] = PendingAnswer(submissionId: submissionId, payload: payload)
        } else {
            pendingAnswers.append(PendingAnswer(submissionId: submissionId, payload: payload))
        }
        save()
    }

    func enqueueMedia(_ item: PendingMedia) {
        pendingMedia.append(item)
        save()
    }

    func enqueueOBDSnapshot(submissionId: String, snapshot: OBDDiagnosticSnapshot, transcript: [OBDExchange]) {
        let item = PendingOBDSnapshot(
            id: "\(submissionId):\(Int(Date().timeIntervalSince1970))",
            submissionId: submissionId,
            snapshot: snapshot,
            transcript: transcript
        )
        pendingOBDSnapshots.removeAll { $0.submissionId == submissionId }
        pendingOBDSnapshots.append(item)
        save()
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
                guard let data = try? Data(contentsOf: entry.localFileURL) else {
                    continue   // file got purged
                }
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
        let snapshot = Snapshot(
            pendingAnswers: pendingAnswers,
            pendingMedia: pendingMedia,
            pendingOBDSnapshots: pendingOBDSnapshots
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: storeURL, options: .atomic)
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
