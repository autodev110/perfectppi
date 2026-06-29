import Foundation

enum CommunityAPI {
    static func feed() async throws -> [CommunityPost] {
        try await APIClient.shared.get("/api/community/posts")
    }

    static func mine(status: CommunityContentStatus = .active) async throws -> [CommunityPost] {
        try await APIClient.shared.get(
            "/api/community/posts/me",
            query: [URLQueryItem(name: "status", value: status.rawValue)]
        )
    }

    static func options() async throws -> CommunityPostOptions {
        try await APIClient.shared.get("/api/community/posts/options")
    }

    struct CreatePostPayload: Encodable {
        let content: String
        let vehicleId: String?
        let listingId: String?
    }

    static func createPost(_ payload: CreatePostPayload) async throws -> Empty {
        try await APIClient.shared.postCamel("/api/community/posts", body: payload)
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

    /// The server responds with only `{ id }` for a created comment, so we
    /// don't try to decode a full `CommunityComment` here (that mismatch is
    /// what made commenting surface "couldn't read the server response" even
    /// though the insert succeeded). Callers reload the feed to pick up the new
    /// comment with its full shape.
    static func comment(postId: String, content: String) async throws -> Empty {
        try await APIClient.shared.post(
            "/api/community/posts/\(postId)/comments",
            body: CommentPayload(content: content)
        )
    }
}
