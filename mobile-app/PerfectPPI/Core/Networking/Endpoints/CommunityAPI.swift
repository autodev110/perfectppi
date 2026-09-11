import Foundation

enum CapabilitiesAPI {
    static func fetch() async throws -> ClientCapabilities {
        try await APIClient.shared.get("/api/capabilities")
    }
}

enum CommunityAPI {
    static func feed(filter: CommunityFeedFilter = .all, page: Int = 1) async throws -> [CommunityPost] {
        try await APIClient.shared.get(
            "/api/community/posts",
            query: [
                URLQueryItem(name: "filter", value: filter.rawValue),
                URLQueryItem(name: "page", value: String(max(page, 1)))
            ]
        )
    }

    /// Visible posts tagged to one public vehicle (Garage ↔ Community).
    static func postsAboutVehicle(id: String) async throws -> [CommunityPost] {
        try await APIClient.shared.get(
            "/api/community/posts",
            query: [URLQueryItem(name: "vehicle", value: id)]
        )
    }

    /// One visible post by id (deep links); 404 when hidden or out of audience.
    static func post(id: String) async throws -> CommunityPost {
        try await APIClient.shared.get("/api/community/posts/\(id)")
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
        let groupId: String?
        let postType: CommunityPostType
        let expectedMediaCount: Int
        let creationToken: String?
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
        let creationToken: String?
    }

    static func addMedia(
        postId: String,
        items: [MediaItemPayload],
        creationToken: String? = nil
    ) async throws -> [CommunityPostMedia] {
        try await APIClient.shared.postCamel(
            "/api/community/posts/\(postId)/media",
            body: AddMediaPayload(items: items, creationToken: creationToken)
        )
    }

    struct FinalizePostResponse: Decodable {
        let id: String
        let published: Bool
        let moderationStatus: String
        let moderationMessage: String?
    }
    private struct FinalizePostPayload: Encodable {}

    static func finalizePost(postId: String) async throws -> FinalizePostResponse {
        try await APIClient.shared.post(
            "/api/community/posts/\(postId)/finalize",
            body: FinalizePostPayload()
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

    struct AcceptedAnswerPayload: Encodable { let commentId: String? }
    struct AcceptedAnswerResult: Decodable {
        let postId: String
        let acceptedAnswerCommentId: String?
        let changed: Bool
    }

    static func setAcceptedAnswer(postId: String, commentId: String?) async throws -> AcceptedAnswerResult {
        try await APIClient.shared.patch(
            "/api/community/posts/\(postId)/accepted-answer",
            body: AcceptedAnswerPayload(commentId: commentId)
        )
    }

    struct LikePayload: Encodable { let liked: Bool }
    struct LikeResult: Decodable {
        let postId: String
        let liked: Bool
        let likeCount: Int
    }

    static func setLike(postId: String, liked: Bool) async throws -> LikeResult {
        try await APIClient.shared.post(
            "/api/community/posts/\(postId)/like",
            body: LikePayload(liked: liked)
        )
    }

    struct SavePayload: Encodable { let saved: Bool }
    struct SaveResult: Decodable {
        let postId: String
        let saved: Bool
    }

    /// Private bookmark (plan Phase 1B); the author is never told.
    static func setSaved(postId: String, saved: Bool) async throws -> SaveResult {
        try await APIClient.shared.post(
            "/api/community/posts/\(postId)/save",
            body: SavePayload(saved: saved)
        )
    }

    static func saved(page: Int = 1) async throws -> [CommunityPost] {
        try await APIClient.shared.get(
            "/api/community/saved",
            query: [URLQueryItem(name: "page", value: String(max(page, 1)))]
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

    static func groups() async throws -> CommunityGroupDirectory {
        try await APIClient.shared.get("/api/community/groups")
    }

    static func group(slug: String, page: Int = 1) async throws -> CommunityGroupDetail {
        try await APIClient.shared.get(
            "/api/community/groups/\(slug)",
            query: [URLQueryItem(name: "page", value: String(page))]
        )
    }

    struct GroupMembershipPayload: Encodable { let joined: Bool }
    struct GroupMembershipResult: Decodable { let joined: Bool; let changed: Bool }

    static func setGroupMembership(id: String, joined: Bool) async throws -> GroupMembershipResult {
        try await APIClient.shared.post(
            "/api/community/groups/\(id)/membership",
            body: GroupMembershipPayload(joined: joined)
        )
    }

    struct GroupSlugResult: Decodable {
        let id: String
        let slug: String
    }

    /// Member-created Public/Open group (plan 13.2); the server applies
    /// account-age, enforcement, and rate limits.
    static func createGroup(_ payload: CommunityGroupSettingsPayload) async throws -> GroupSlugResult {
        try await APIClient.shared.postCamel("/api/community/groups", body: payload)
    }

    /// Owner-only settings update; the slug is never changed.
    static func updateGroupSettings(slug: String, _ payload: CommunityGroupSettingsPayload) async throws -> GroupSlugResult {
        try await APIClient.shared.patchCamel("/api/community/groups/\(slug)", body: payload)
    }

    static func groupMembers(slug: String, page: Int = 1) async throws -> CommunityGroupMembersPage {
        try await APIClient.shared.get(
            "/api/community/groups/\(slug)/members",
            query: [URLQueryItem(name: "page", value: String(max(page, 1)))]
        )
    }

    static func searchGroupPosts(slug: String, query: String, page: Int = 1) async throws -> CommunityGroupSearchPage {
        try await APIClient.shared.get(
            "/api/community/groups/\(slug)/search",
            query: [URLQueryItem(name: "q", value: query), URLQueryItem(name: "page", value: String(max(page, 1)))]
        )
    }

    enum GroupModerationAction: String, Encodable {
        case pin, unpin
        case removePost = "remove_post"
        case restorePost = "restore_post"
        case removeMember = "remove_member"
        case banMember = "ban_member"
        case unbanMember = "unban_member"
        case makeModerator = "make_moderator"
        case makeMember = "make_member"
        case transferOwnership = "transfer_ownership"
        case archive
    }

    private struct GroupModerationPayload: Encodable {
        let action: GroupModerationAction
        let postId: String?
        let profileId: String?
        let reason: String?
    }

    /// Owner/moderator tools (plan 13.4 / 13.7). The server decides what the
    /// caller may do; a 403 means the role does not allow it.
    static func moderateGroup(
        slug: String,
        action: GroupModerationAction,
        postId: String? = nil,
        profileId: String? = nil,
        reason: String? = nil
    ) async throws {
        let _: Empty = try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/moderation",
            body: GroupModerationPayload(action: action, postId: postId, profileId: profileId, reason: reason)
        )
    }
}
