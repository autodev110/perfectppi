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

    struct FeedMute: Decodable, Identifiable {
        struct Group: Decodable { let name: String }
        let id: String
        let scope: String
        let groupId: String?
        let postType: CommunityPostType?
        let vehicleMake: String?
        let vehicleModel: String?
        let group: Group?
    }

    private struct FeedMutePayload: Encodable {
        let scope: String
        let muted: Bool
        var groupId: String? = nil
        var postType: CommunityPostType? = nil
        var vehicleMake: String? = nil
        var vehicleModel: String? = nil
    }

    static func feedMutes() async throws -> [FeedMute] {
        try await APIClient.shared.get("/api/community/feed-mutes")
    }

    static func setGroupFeedMuted(_ groupId: String, muted: Bool) async throws {
        let _: Empty = try await APIClient.shared.patchCamel(
            "/api/community/feed-mutes",
            body: FeedMutePayload(scope: "group", muted: muted, groupId: groupId)
        )
    }

    static func setPostTypeFeedMuted(_ postType: CommunityPostType, muted: Bool) async throws {
        let _: Empty = try await APIClient.shared.patchCamel(
            "/api/community/feed-mutes",
            body: FeedMutePayload(scope: "post_type", muted: muted, postType: postType)
        )
    }

    static func setVehicleTopicFeedMuted(make: String, model: String?, muted: Bool) async throws {
        let _: Empty = try await APIClient.shared.patchCamel(
            "/api/community/feed-mutes",
            body: FeedMutePayload(
                scope: "vehicle_topic",
                muted: muted,
                vehicleMake: make,
                vehicleModel: model
            )
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
        /// Structured fields for the type (plan 14.2).
        var details: JSONValue? = nil
        let expectedMediaCount: Int
        let creationToken: String?
        var eventId: String? = nil
    }

    private struct PollVotePayload: Encodable { let optionKey: String }

    /// One vote per member, changeable until the poll closes (plan 14.2).
    static func votePoll(postId: String, optionKey: String) async throws -> CommunityPollView {
        try await APIClient.shared.postCamel("/api/community/posts/\(postId)/vote", body: PollVotePayload(optionKey: optionKey))
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

    struct HelpfulPayload: Encodable { let helpful: Bool }
    struct HelpfulResult: Decodable {
        let commentId: String
        let helpful: Bool
        let helpfulCount: Int
    }

    static func setHelpful(commentId: String, helpful: Bool) async throws -> HelpfulResult {
        try await APIClient.shared.post(
            "/api/community/comments/\(commentId)/helpful",
            body: HelpfulPayload(helpful: helpful)
        )
    }

    struct QuestionOutcomePayload: Encodable { let outcome: CommunityQuestionOutcome? }
    struct QuestionOutcomeResult: Decodable {
        let postId: String
        let outcome: CommunityQuestionOutcome?
        let changed: Bool
    }

    static func setQuestionOutcome(
        postId: String,
        outcome: CommunityQuestionOutcome?
    ) async throws -> QuestionOutcomeResult {
        try await APIClient.shared.patch(
            "/api/community/posts/\(postId)/outcome",
            body: QuestionOutcomePayload(outcome: outcome)
        )
    }

    static func questionOutcomeHistory(postId: String) async throws -> [CommunityQuestionOutcomeEvent] {
        try await APIClient.shared.get("/api/community/posts/\(postId)/outcome")
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

    private struct CollectionNamePayload: Encodable { let name: String }
    private struct CollectionItemPayload: Encodable {
        let entityType: String
        let entityId: String
        let saved: Bool
    }
    private struct RemoveCollectionItemPayload: Encodable { let itemId: String }

    static func savedCollections() async throws -> [SavedCollection] {
        try await APIClient.shared.get("/api/saved/collections")
    }

    static func createSavedCollection(name: String) async throws -> SavedCollection {
        try await APIClient.shared.postCamel("/api/saved/collections", body: CollectionNamePayload(name: name))
    }

    static func renameSavedCollection(id: String, name: String) async throws -> Empty {
        try await APIClient.shared.patchCamel("/api/saved/collections/\(id)", body: CollectionNamePayload(name: name))
    }

    static func deleteSavedCollection(id: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/saved/collections/\(id)")
    }

    static func savedCollectionItems(id: String) async throws -> [SavedCollectionItem] {
        try await APIClient.shared.get("/api/saved/collections/\(id)/items")
    }

    static func addToSavedCollection(collectionId: String, entityType: String, entityId: String) async throws -> Empty {
        try await APIClient.shared.postCamel(
            "/api/saved/collections/\(collectionId)/items",
            body: CollectionItemPayload(entityType: entityType, entityId: entityId, saved: true)
        )
    }

    static func removeFromSavedCollection(collectionId: String, itemId: String) async throws -> Empty {
        try await APIClient.shared.delete(
            "/api/saved/collections/\(collectionId)/items",
            body: RemoveCollectionItemPayload(itemId: itemId)
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

    enum SearchTab: String, CaseIterable, Identifiable {
        case posts, people, groups, vehicles, listings, technicians, events
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    /// Decoded per tab so each result type keeps its own model.
    enum SearchResults {
        case posts([CommunityPost])
        case people([PeopleSearchResult])
        case groups([CommunityGroupSummary])
        case vehicles([SearchVehicleResult])
        case listings([SearchListingResult])
        case technicians([SearchTechnicianResult])
        case events([CommunityEventSummary])

        var isEmpty: Bool {
            switch self {
            case .posts(let items): items.isEmpty
            case .people(let items): items.isEmpty
            case .groups(let items): items.isEmpty
            case .vehicles(let items): items.isEmpty
            case .listings(let items): items.isEmpty
            case .technicians(let items): items.isEmpty
            case .events(let items): items.isEmpty
            }
        }
    }

    struct SearchPage {
        let tab: SearchTab
        let query: String
        let page: Int
        let hasMore: Bool
        let suggestions: [String]
        let results: SearchResults
    }

    private struct SearchEnvelope<Item: Decodable>: Decodable {
        let query: String
        let page: Int
        let hasMore: Bool
        let suggestions: [String]
        let items: [Item]
    }

    /// Unified search (plan 27.2); the server applies visibility before
    /// returning anything.
    @MainActor
    static func search(_ query: String, tab: SearchTab, page: Int = 1) async throws -> SearchPage {
        let params = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "tab", value: tab.rawValue),
            URLQueryItem(name: "page", value: String(max(page, 1))),
        ]
        @MainActor
        func load<Item: Decodable>(_: Item.Type, wrap: ([Item]) -> SearchResults) async throws -> SearchPage {
            let envelope: SearchEnvelope<Item> = try await APIClient.shared.get("/api/community/search", query: params)
            return SearchPage(tab: tab, query: envelope.query, page: envelope.page, hasMore: envelope.hasMore,
                              suggestions: envelope.suggestions, results: wrap(envelope.items))
        }
        switch tab {
        case .posts: return try await load(CommunityPost.self) { .posts($0) }
        case .people: return try await load(PeopleSearchResult.self) { .people($0) }
        case .groups: return try await load(CommunityGroupSummary.self) { .groups($0) }
        case .vehicles: return try await load(SearchVehicleResult.self) { .vehicles($0) }
        case .listings: return try await load(SearchListingResult.self) { .listings($0) }
        case .technicians: return try await load(SearchTechnicianResult.self) { .technicians($0) }
        case .events: return try await load(CommunityEventSummary.self) { .events($0) }
        }
    }

    static func groups() async throws -> CommunityGroupDirectory {
        try await APIClient.shared.get("/api/community/groups")
    }

    static func events(includePast: Bool = false) async throws -> CommunityEventDirectory {
        try await APIClient.shared.get(
            "/api/community/events",
            query: [URLQueryItem(name: "includePast", value: includePast ? "true" : "false")]
        )
    }

    static func event(id: String) async throws -> CommunityEventDetail {
        try await APIClient.shared.get("/api/community/events/\(id)")
    }

    static func createEvent(_ payload: CommunityEventCreatePayload) async throws -> CommunityEventCreateResult {
        try await APIClient.shared.postCamel("/api/community/events", body: payload)
    }

    private struct EventRsvpPayload: Encodable { let status: String }

    static func setEventRsvp(id: String, status: String) async throws -> CommunityEventRsvpResult {
        try await APIClient.shared.postCamel(
            "/api/community/events/\(id)/rsvp",
            body: EventRsvpPayload(status: status)
        )
    }

    private struct EventCancelPayload: Encodable { let reason: String }
    struct EventCancelResult: Decodable { let cancelled: Bool }

    static func cancelEvent(id: String, reason: String) async throws -> EventCancelResult {
        try await APIClient.shared.postCamel(
            "/api/community/events/\(id)/cancel",
            body: EventCancelPayload(reason: reason)
        )
    }

    private struct EventUpdatePayload: Encodable { let content: String }
    struct EventUpdateResult: Decodable {
        let id: String
        let commentId: String
        let moderationStatus: String
    }

    static func addEventUpdate(id: String, content: String) async throws -> EventUpdateResult {
        try await APIClient.shared.postCamel(
            "/api/community/events/\(id)/updates",
            body: EventUpdatePayload(content: content)
        )
    }

    static func group(slug: String, page: Int = 1) async throws -> CommunityGroupDetail {
        try await APIClient.shared.get(
            "/api/community/groups/\(slug)",
            query: [URLQueryItem(name: "page", value: String(page))]
        )
    }

    /// Membership moves (plan 13.3). `join` also accepts an invitation;
    /// `leave` also cancels a pending request or declines an invitation.
    enum GroupMembershipAction: String, Encodable {
        case join, leave, request
        case cancelRequest = "cancel_request"
        case acceptInvite = "accept_invite"
        case declineInvite = "decline_invite"
    }

    private struct GroupMembershipPayload: Encodable {
        let action: GroupMembershipAction
        let message: String?
    }

    struct GroupMembershipResult: Decodable {
        /// "active", "requested", or "none".
        let status: String
        let joined: Bool
        let changed: Bool
    }

    static func setGroupMembership(id: String, joined: Bool) async throws -> GroupMembershipResult {
        try await setGroupMembership(id: id, action: joined ? .join : .leave)
    }

    static func setGroupMembership(
        id: String,
        action: GroupMembershipAction,
        message: String? = nil
    ) async throws -> GroupMembershipResult {
        try await APIClient.shared.post(
            "/api/community/groups/\(id)/membership",
            body: GroupMembershipPayload(action: action, message: message)
        )
    }

    /// Pending join requests; the server returns 403 for non-moderators.
    static func groupJoinRequests(slug: String) async throws -> CommunityGroupJoinRequestsPage {
        try await APIClient.shared.get("/api/community/groups/\(slug)/requests")
    }

    struct GroupSlugResult: Decodable {
        let id: String
        let slug: String
    }

    /// Member-created group (plan 13.2, 13.3); the server applies
    /// account-age, enforcement, rate limits, and the visibility table.
    static func createGroup(_ payload: CommunityGroupSettingsPayload) async throws -> GroupSlugResult {
        try await APIClient.shared.postCamel("/api/community/groups", body: payload)
    }

    /// Owner-only settings update; the slug is never changed.
    static func updateGroupSettings(slug: String, _ payload: CommunityGroupSettingsPayload) async throws -> GroupSlugResult {
        try await APIClient.shared.patchCamel("/api/community/groups/\(slug)", body: payload)
    }

    private struct GroupImagePayload: Encodable {
        let kind: String
        let url: String
        let contentType: String
    }

    struct GroupImageResult: Decodable {
        let kind: String
        let url: String?
    }

    /// Group avatar / cover (plan 13.5): quarantine upload, then the server
    /// runs the safety gate and applies the image. Owner or admin only.
    static func setGroupImage(groupId: String, slug: String, kind: String, attachment: PickedAttachment) async throws -> GroupImageResult {
        let url = try await R2Uploader.upload(
            data: attachment.data,
            filename: attachment.filename,
            contentType: attachment.contentType,
            entity: "community_group",
            recordId: groupId
        )
        return try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/images",
            body: GroupImagePayload(kind: kind, url: url, contentType: attachment.contentType)
        )
    }

    static func removeGroupImage(slug: String, kind: String) async throws -> GroupImageResult {
        try await APIClient.shared.delete("/api/community/groups/\(slug)/images", query: [URLQueryItem(name: "kind", value: kind)])
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
        case makeAdmin = "make_admin"
        case makeModerator = "make_moderator"
        case makeMember = "make_member"
        case transferOwnership = "transfer_ownership"
        case archive
        case approveRequest = "approve_request"
        case declineRequest = "decline_request"
        case invite
        case setSlowMode = "set_slow_mode"
        case restrictPosting = "restrict_posting"
        case restorePosting = "restore_posting"
    }

    private struct GroupModerationPayload: Encodable {
        let action: GroupModerationAction
        let postId: String?
        let profileId: String?
        let username: String?
        let reason: String?
        let seconds: Int?
        let durationSeconds: Int?
    }

    struct GroupInviteResult: Decodable {
        /// "invited" (sent), "active" (crossed request → member), or unchanged.
        let status: String?
        let changed: Bool?
    }

    /// Invite a member by username (plan 13.3); the server resolves the
    /// handle and applies block / availability and daily-limit rules.
    static func inviteToGroup(slug: String, username: String) async throws -> GroupInviteResult {
        try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/moderation",
            body: GroupModerationPayload(action: .invite, postId: nil, profileId: nil, username: username, reason: nil, seconds: nil, durationSeconds: nil)
        )
    }

    /// Owner/moderator tools (plan 13.4 / 13.7). The server decides what the
    /// caller may do; a 403 means the role does not allow it.
    static func moderateGroup(
        slug: String,
        action: GroupModerationAction,
        postId: String? = nil,
        profileId: String? = nil,
        reason: String? = nil,
        seconds: Int? = nil,
        durationSeconds: Int? = nil
    ) async throws {
        let _: Empty = try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/moderation",
            body: GroupModerationPayload(action: action, postId: postId, profileId: profileId, username: nil, reason: reason, seconds: seconds, durationSeconds: durationSeconds)
        )
    }

    static func acknowledgeGroupRules(slug: String) async throws {
        let _: Empty = try await APIClient.shared.post(
            "/api/community/groups/\(slug)/rules",
            body: Empty()
        )
    }

    static func groupFAQ(slug: String, query: String = "", page: Int = 1) async throws -> CommunityGroupFAQPage {
        try await APIClient.shared.get(
            "/api/community/groups/\(slug)/faq",
            query: [URLQueryItem(name: "q", value: query), URLQueryItem(name: "page", value: String(max(page, 1)))]
        )
    }

    private struct GroupFAQPayload: Encodable {
        let question: String?
        let answer: String?
        let sourcePostId: String?
    }

    static func addGroupFAQ(slug: String, question: String, answer: String) async throws -> CommunityGroupFAQEntry {
        try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/faq",
            body: GroupFAQPayload(question: question, answer: answer, sourcePostId: nil)
        )
    }

    static func addAcceptedAnswerToGroupFAQ(slug: String, postId: String) async throws -> CommunityGroupFAQEntry {
        try await APIClient.shared.postCamel(
            "/api/community/groups/\(slug)/faq",
            body: GroupFAQPayload(question: nil, answer: nil, sourcePostId: postId)
        )
    }

    static func deleteGroupFAQ(slug: String, entryId: String) async throws {
        let _: Empty = try await APIClient.shared.delete(
            "/api/community/groups/\(slug)/faq",
            query: [URLQueryItem(name: "entry", value: entryId)]
        )
    }
}
