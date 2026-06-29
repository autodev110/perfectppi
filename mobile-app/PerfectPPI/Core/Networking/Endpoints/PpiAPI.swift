import Foundation

enum PpiAPI {
    // Requests
    static func listRequests() async throws -> [PpiRequest] {
        try await APIClient.shared.get("/api/ppi/requests")
    }

    struct CreateRequestPayload: Encodable {
        let vehicleId: String
        let vin: String
        let mileage: Int
        let whoseCar: WhoseCar
        let requesterRole: RequesterRole
        let performerType: PerformerType
        let assignedTechProfileId: String?
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

        enum CodingKeys: String, CodingKey {
            case answerId
            case value
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

    static func attachMedia(
        submissionId: String,
        payload: AttachMediaRequest
    ) async throws -> PpiMedia {
        try await APIClient.shared.post(
            "/api/ppi/submissions/\(submissionId)/media",
            body: payload
        )
    }

    static func submit(submissionId: String) async throws -> Empty {
        try await APIClient.shared.post(
            "/api/ppi/submissions/\(submissionId)/submit",
            body: Empty()
        )
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
}
