import Foundation

enum PpiAPI {
    // Requests
    static func listRequests(vehicleId: String? = nil) async throws -> [PpiRequest] {
        let query = vehicleId.map { [URLQueryItem(name: "vehicle_id", value: $0)] } ?? []
        return try await APIClient.shared.get("/api/ppi/requests", query: query)
    }

    struct CreateRequestPayload: Encodable {
        let vehicleId: String
        let vin: String
        let mileage: Int
        let whoseCar: WhoseCar
        let requesterRole: RequesterRole
        let performerType: PerformerType
        let assignedTechProfileId: String?
        let inspectionScope: InspectionScope
    }

    struct CreateRequestResponse: Codable {
        let requestId: String
        let submissionId: String?
    }

    static func createRequest(_ payload: CreateRequestPayload) async throws -> CreateRequestResponse {
        try await APIClient.shared.post("/api/ppi/requests", body: payload)
    }

    static func getRequest(id: String) async throws -> PpiRequest {
        try await APIClient.shared.get("/api/ppi/requests/\(id)")
    }

    static func deleteRequest(id: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/ppi/requests/\(id)")
    }

    struct AssignPayload: Encodable {
        let techProfileId: String
    }

    static func assign(requestId: String, payload: AssignPayload) async throws -> Empty {
        try await APIClient.shared.post(
            "/api/ppi/requests/\(requestId)/assign",
            body: payload
        )
    }

    // Submissions
    struct CreateSubmissionPayload: Encodable {
        let requestId: String
    }

    struct CreateSubmissionResponse: Codable {
        let submissionId: String
    }

    static func createSubmission(_ payload: CreateSubmissionPayload) async throws -> CreateSubmissionResponse {
        try await APIClient.shared.post("/api/ppi/submissions", body: payload)
    }

    static func getSubmission(id: String) async throws -> PpiSubmission {
        try await APIClient.shared.get("/api/ppi/submissions/\(id)")
    }

    static func sections(submissionId: String) async throws -> [PpiSection] {
        try await APIClient.shared.get("/api/ppi/submissions/\(submissionId)/sections")
    }

    static func answers(submissionId: String) async throws -> [PpiAnswer] {
        try await APIClient.shared.get("/api/ppi/submissions/\(submissionId)/answers")
    }

    struct SaveAnswerPayload: Codable {
        let answerId: String
        let value: String
        let deferred: Bool?
        /// Typed observation for structured answers. `.null` clears it; nil
        /// leaves it unchanged (for example a deferral-only update).
        let observation: JSONValue?

        init(answerId: String, value: String, deferred: Bool? = nil, observation: JSONValue? = nil) {
            self.answerId = answerId
            self.value = value
            self.deferred = deferred
            self.observation = observation
        }

        enum CodingKeys: String, CodingKey {
            case answerId
            case value
            case deferred
            case observation
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            answerId = try container.decode(String.self, forKey: .answerId)
            value = try container.decode(String.self, forKey: .value)
            deferred = try container.decodeIfPresent(Bool.self, forKey: .deferred)
            // Keep an explicit null (clear) distinct from an absent key.
            observation = container.contains(.observation)
                ? try container.decode(JSONValue.self, forKey: .observation)
                : nil
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(answerId, forKey: .answerId)
            try container.encode(value, forKey: .value)
            try container.encodeIfPresent(deferred, forKey: .deferred)
            if let observation {
                try container.encode(observation, forKey: .observation)
            }
        }
    }

    struct SaveAnswersPayload: Encodable {
        let answers: [SaveAnswerPayload]
    }

    static func saveAnswer(
        submissionId: String,
        payload: SaveAnswerPayload
    ) async throws -> Empty {
        try await APIClient.shared.postCamel(
            "/api/ppi/submissions/\(submissionId)/answers",
            body: SaveAnswersPayload(answers: [payload])
        )
    }

    static func media(submissionId: String) async throws -> [PpiMedia] {
        try await APIClient.shared.get("/api/ppi/submissions/\(submissionId)/media")
    }

    static func obdSnapshots(submissionId: String) async throws -> [OBDSnapshotRecord] {
        try await APIClient.shared.get(
            "/api/ppi/submissions/\(submissionId)/obd-snapshots"
        )
    }

    struct SaveOBDSnapshotPayload: Encodable {
        let snapshot: OBDDiagnosticSnapshot
        let transcript: [OBDExchange]
    }

    static func saveOBDSnapshot(
        submissionId: String,
        snapshot: OBDDiagnosticSnapshot,
        transcript: [OBDExchange]
    ) async throws -> OBDSnapshotRecord {
        try await APIClient.shared.postCamel(
            "/api/ppi/submissions/\(submissionId)/obd-snapshots",
            body: SaveOBDSnapshotPayload(snapshot: snapshot, transcript: transcript)
        )
    }

    /// Partner context for an inspection. The endpoint answers `data: null` for
    /// consumer inspections, so the optional here is meaningful rather than an
    /// error case.
    static func dealerSpaceContext(requestId: String) async throws -> PerfectPpiPartnerContext? {
        struct Envelope: Decodable { let data: PerfectPpiPartnerContext? }
        let envelope: Envelope = try await APIClient.shared.get(
            "/api/ppi/requests/\(requestId)/dealerspace"
        )
        return envelope.data
    }

    /// Queues delivery of the finished reports. The server enforces the
    /// four-artifact gate and collapses repeat presses onto one delivery.
    static func sendToDealerSpace(requestId: String) async throws -> PerfectPpiSendResult {
        struct Envelope: Decodable { let data: PerfectPpiSendResult }
        let envelope: Envelope = try await APIClient.shared.postCamel(
            "/api/ppi/requests/\(requestId)/dealerspace/send",
            body: EmptyBody()
        )
        return envelope.data
    }

    private struct EmptyBody: Encodable {}

    static func attachMedia(
        submissionId: String,
        payload: AttachMediaRequest
    ) async throws -> PpiMedia {
        try await APIClient.shared.post(
            "/api/ppi/submissions/\(submissionId)/media",
            body: payload
        )
    }

    struct Certification: Encodable {
        let accepted: Bool
        let textVersion: String
        let expectedRevision: Int
        let locale: String
    }

    private struct SubmitPayload: Encodable {
        let certification: Certification
    }

    /// The accuracy certification the inspector accepted on the review screen.
    static let certificationTextVersion = "inspection_accuracy/1"
    static let certificationText = String(localized: "I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.")

    /// Submits with the inspector's certification for the reviewed revision.
    /// The server records the signer and time and refuses a stale revision.
    static func submit(submissionId: String, expectedRevision: Int) async throws -> Empty {
        try await APIClient.shared.post(
            "/api/ppi/submissions/\(submissionId)/submit",
            body: SubmitPayload(certification: .init(
                accepted: true,
                textVersion: certificationTextVersion,
                expectedRevision: expectedRevision,
                locale: Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
            ))
        )
    }

    struct ExtractionResult: Decodable {
        let extractionId: String
        let status: String
        let candidates: [String: String?]
    }

    private struct ExtractionRequest: Encodable {
        let mediaId: String
        let target: String
    }

    /// Suggested readings from one photo; never a fact until the inspector uses them.
    static func readPhoto(submissionId: String, mediaId: String, target: String) async throws -> ExtractionResult {
        try await APIClient.shared.post(
            "/api/ppi/submissions/\(submissionId)/extractions",
            body: ExtractionRequest(mediaId: mediaId, target: target)
        )
    }

    struct AppendixStatus: Decodable {
        let status: String
        let photoCountExpected: Int?
        let photoCountRendered: Int?
        let missingCount: Int
        let error: String?
    }

    private struct AppendixRequest: Encodable { let retry: Bool }

    /// Optional, separate photo evidence appendix for a report version.
    static func appendixStatus(outputId: String) async throws -> AppendixStatus {
        try await APIClient.shared.get("/api/outputs/\(outputId)/appendix")
    }

    static func requestAppendix(outputId: String, retry: Bool = false) async throws -> AppendixStatus {
        try await APIClient.shared.post("/api/outputs/\(outputId)/appendix", body: AppendixRequest(retry: retry))
    }

    // Outputs
    static func standardizedOutput(submissionId: String) async throws -> StandardizedOutput {
        try await APIClient.shared.get(
            "/api/ppi/outputs/\(submissionId)/standardized"
        )
    }

    static func vscOutput(submissionId: String) async throws -> VscOutput {
        try await APIClient.shared.get("/api/ppi/outputs/\(submissionId)/vsc")
    }

    /// Returns image bytes for a media row, fetched through the auth-guarded
    /// proxy at /api/ppi/media/[id]. Use over raw R2 URLs to support private
    /// buckets and signed-only access.
    static func mediaBytes(mediaId: String) async throws -> Data {
        let (data, _) = try await APIClient.shared.bytes("/api/ppi/media/\(mediaId)")
        return data
    }

    struct DeleteMediaResult: Codable {
        let id: String
    }

    /// Removes a captured inspection photo. Only allowed while the submission
    /// is still a draft / in progress — the server enforces that.
    @discardableResult
    static func deleteMedia(mediaId: String) async throws -> DeleteMediaResult {
        try await APIClient.shared.delete("/api/ppi/media/\(mediaId)")
    }

    private struct DiscardPendingMediaRequest: Encodable {
        let storageReference: String
    }

    /// Removes private bytes from an upload that never reached a PPI media
    /// row. The server verifies the current owner and submission namespace.
    static func discardPendingMedia(submissionId: String, storageReference: String) async throws -> Empty {
        try await APIClient.shared.delete(
            "/api/ppi/submissions/\(submissionId)/media",
            body: DiscardPendingMediaRequest(storageReference: storageReference)
        )
    }
}
