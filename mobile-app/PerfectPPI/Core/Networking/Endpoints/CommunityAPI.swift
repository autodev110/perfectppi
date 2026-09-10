import Foundation

enum CommunityAPI {
    static func feed() async throws -> [CommunityPost] {
        try await APIClient.shared.get("/api/community/posts")
    }

    static func mine(status: String = "active") async throws -> [CommunityPost] {
        try await APIClient.shared.get(
            "/api/community/posts/me",
            query: [URLQueryItem(name: "status", value: status)]
        )
    }

    static func options() async throws -> CommunityPostOptions {
        try await APIClient.shared.get("/api/community/posts/options")
    }

    struct CreatePostPayload: Encodable {
        let content: String
        let audience: CommunityPostAudience
        let vehicleId: String?
        let listingId: String?
    }

    struct CreatePostResponse: Decodable {
        let id: String
        let moderationStatus: String?
        let moderationMessage: String?
    }

    static func createPost(_ payload: CreatePostPayload) async throws -> CreatePostResponse {
        try await APIClient.shared.postCamel("/api/community/posts", body: payload)
    }

    struct MediaItemPayload: Encodable {
        let url: String
        let mediaType: String
        let contentType: String
        let sortOrder: Int
    }

    struct AddMediaPayload: Encodable {
        let items: [MediaItemPayload]
    }

    static func addMedia(postId: String, items: [MediaItemPayload]) async throws -> [CommunityPostMedia] {
        try await APIClient.shared.postCamel(
            "/api/community/posts/\(postId)/media",
            body: AddMediaPayload(items: items)
        )
    }

    static func removeMedia(postId: String, mediaId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/community/posts/\(postId)/media/\(mediaId)")
    }

    struct StatusPayload: Encodable {
        let status: CommunityContentStatus
    }

    static func updatePostStatus(id: String, status: CommunityContentStatus) async throws -> Empty {
        try await APIClient.shared.patch(
            "/api/community/posts/\(id)",
            body: StatusPayload(status: status)
        )
    }

    static func deletePost(id: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/community/posts/\(id)")
    }

    struct CommentPayload: Encodable {
        let content: String
    }

    struct CommentResponse: Decodable {
        let id: String
        let moderationStatus: String?
        let moderationMessage: String?
    }

    static func comment(postId: String, content: String) async throws -> CommentResponse {
        try await APIClient.shared.post(
            "/api/community/posts/\(postId)/comments",
            body: CommentPayload(content: content)
        )
    }

    struct ReportPayload: Encodable {
        let entityType: String
        let entityId: String
        let reasonCode: String
        let details: String?
        let contextToken: String
    }

    static func report(
        entityType: String,
        entityId: String,
        reasonCode: String,
        details: String?,
        contextToken: String
    ) async throws -> Empty {
        try await APIClient.shared.postCamel(
            "/api/community/reports",
            body: ReportPayload(
                entityType: entityType,
                entityId: entityId,
                reasonCode: reasonCode,
                details: details,
                contextToken: contextToken
            )
        )
    }

    struct AppealPayload: Encodable {
        let entityId: String
        let statement: String
    }

    static func appeal(entityId: String, statement: String) async throws -> Empty {
        try await APIClient.shared.postCamel(
            "/api/community/appeals",
            body: AppealPayload(entityId: entityId, statement: statement)
        )
    }

    struct EnforcementNotice: Decodable, Identifiable {
        let id: String
        let actionType: String
        let reasonCode: String
        let startsAt: Date
        let endsAt: Date?
        let createdAt: Date
    }

    static func notices() async throws -> [EnforcementNotice] {
        try await APIClient.shared.get("/api/community/moderation/notices")
    }
}
