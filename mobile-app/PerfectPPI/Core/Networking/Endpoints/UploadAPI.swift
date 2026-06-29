import Foundation

enum UploadAPI {
    static func presignedUrl(_ payload: PresignedUploadRequest) async throws -> PresignedUploadResponse {
        try await APIClient.shared.postCamel("/api/upload/presigned-url", body: payload)
    }

    struct DirectResponse: Codable {
        let publicUrl: String
    }
}
