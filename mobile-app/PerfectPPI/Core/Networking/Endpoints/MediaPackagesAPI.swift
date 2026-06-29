import Foundation

enum MediaPackagesAPI {
    static func list() async throws -> [MediaPackage] {
        try await APIClient.shared.get("/api/media-packages")
    }

    struct CreatePayload: Encodable {
        let title: String
        let description: String?
        let ppiSubmissionId: String?
        let items: [MediaPackageItemPayload]
    }

    struct MediaPackageItemPayload: Encodable {
        let type: String
        let url: String
        let name: String?
    }

    static func create(_ payload: CreatePayload) async throws -> CreateMediaPackageResult {
        try await APIClient.shared.postCamel("/api/media-packages", body: payload)
    }

    struct SharePayload: Encodable {
        let targetType: ShareTargetType
        let targetId: String
        let expiresAt: String?
    }

    static func createShareLink(
        targetType: ShareTargetType,
        targetId: String,
        expiresAt: String? = nil
    ) async throws -> CreateShareLinkResult {
        try await APIClient.shared.postCamel(
            "/api/share",
            body: SharePayload(
                targetType: targetType,
                targetId: targetId,
                expiresAt: expiresAt
            )
        )
    }
}
