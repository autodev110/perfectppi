import Foundation
import SwiftUI

// MARK: - Profile

struct Profile: Codable, Identifiable, Hashable {
    let id: String
    let authUserId: String?
    /// Optional because embedded profile references in joined queries
    /// (e.g. `ppi_requests.requester`, `audit_logs.actor`) only select
    /// a subset of columns and omit `role`. The top-level `/api/profiles/me`
    /// response always includes it.
    let role: UserRole?
    /// Persistent developer grant. Independent of `role`, which changes as the
    /// account switches. Absent on the joined subsets described above, so a
    /// nil is read as "not a developer" rather than unknown.
    let isDeveloper: Bool?
    let email: String?
    let displayName: String?
    let username: String?
    let usernameState: String?
    let avatarUrl: String?
    let bio: String?
    let isPublic: Bool?
    let defaultPostAudience: CommunityPostAudience?
    let discoverable: Bool?
    let allowExactUsernameLookup: Bool?
    let friendRequestPolicy: FriendRequestPolicy?
    let allowFriendMessages: Bool?
    let allowGroupMessageRequests: Bool?
    var mentionPolicy: MentionPolicy? = nil
    let phone: String?
    let createdAt: Date?

    var fullName: String? { displayName }

    var canSwitchRoles: Bool { isDeveloper == true }

    var needsUsername: Bool {
        usernameState != "claimed" || username?.isEmpty != false
    }
}

// MARK: - Vehicle

struct Vehicle: Codable, Identifiable, Hashable {
    let id: String
    let ownerId: String?
    let vin: String?
    let year: Int?
    let make: String?
    let model: String?
    let trim: String?
    let engine: String?
    let drivetrain: String?
    let transmission: String?
    let bodyStyle: String?
    let nickname: String?
    let ownershipState: VehicleOwnershipState?
    let mileage: Int?
    let mileageUpdatedAt: Date?
    let notes: String?
    let visibility: VehicleVisibility?
    let soldAt: Date?
    let createdAt: Date?
    let vehicleMedia: [VehicleMedia]?
    let ppiRequests: [GarageInspectionSummary]?
    let marketplaceListings: [GarageListingSummary]?
}

struct GarageInspectionSummary: Codable, Identifiable, Hashable {
    let id: String
    let status: PpiRequestStatus
    let createdAt: Date
    let updatedAt: Date?
}

struct GarageListingSummary: Codable, Identifiable, Hashable {
    let id: String
    let status: ListingStatus
}

struct VehicleMedia: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let url: String
    let mediaType: MediaType
    let caption: String?
    let uploadedAt: Date?
    let isPrimary: Bool?
    let sortOrder: Int?
}

struct VehicleBuildEntry: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let category: String
    let title: String
    let manufacturer: String?
    let partNumber: String?
    let vehicleConfiguration: String?
    let wheelSize: String?
    let wheelWidth: Double?
    let wheelOffsetMm: Double?
    let tireSize: String?
    let suspensionDrop: String?
    let installedOn: String?
    let mileage: Int?
    let installationKind: VehicleInstallationKind
    let shopName: String?
    let costCents: Int?
    let publicNotes: String?
    let privateNotes: String?
    let status: VehicleBuildStatus
    let fitmentConfidence: VehicleFitmentConfidence
    let isPublic: Bool
    let createdAt: Date
    let updatedAt: Date
}

struct VehicleMaintenanceEvent: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let serviceType: String
    let servicedOn: String
    let mileage: Int?
    let partsFluids: String?
    let provider: String?
    let costCents: Int?
    let publicNotes: String?
    let privateNotes: String?
    let nextDueOn: String?
    let nextDueMileage: Int?
    let isPublic: Bool
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - Technician

struct TechnicianProfile: Codable, Identifiable, Hashable {
    let id: String
    let profileId: String
    let organizationId: String?
    let bio: String?
    let certificationLevel: CertificationLevel?
    let yearsOfExperience: Int?
    let specialties: [String]?
    let location: String?
    let availableForWork: Bool?
    let isFeatured: Bool?
    let isIndependent: Bool?
    let totalInspections: Int?
    let avgRating: Double?
    let totalReviews: Int?
    let reputationScore: Double?
    let serviceArea: String?
    let isAvailable: Bool?
    let isVerified: Bool?
    let profile: Profile?
    let organization: Organization?
}

// MARK: - Marketplace

struct MarketplaceListing: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let sellerId: String
    let title: String
    let description: String?
    let askingPriceCents: Int
    let location: String?
    let status: ListingStatus
    let createdAt: Date?
    let updatedAt: Date?
    let vehicle: Vehicle?
    let seller: Profile?
    let inspectionSummary: MarketplaceInspectionSummary?
    let inspectionRequest: MarketplaceInspectionRequestSummary?
    let viewerIsSeller: Bool?
    /// Private bookmark (plan 25.2 Save); sellers never see who saved.
    let savedByViewer: Bool?
    /// "member" or "technician" (plan 25.1 seller-type filter).
    let sellerType: String?
    let removedAt: Date?
    /// Listing-screen extras (plan 25.2), present on the detail endpoint only.
    let photos: [MarketplaceListingPhoto]?
    let highlights: [MarketplaceListingHighlight]?
    let sellerHistory: MarketplaceSellerHistory?
}

struct MarketplaceListingPhoto: Codable, Identifiable, Hashable {
    let id: String
    let url: String
}

/// Owner-published build / maintenance entry, labeled by source.
struct MarketplaceListingHighlight: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let detail: String?
    let date: String?
    let source: String

    var sourceLabel: String { source == "build_journal" ? "Build journal" : "Maintenance log" }
}

struct MarketplaceSellerHistory: Codable, Hashable {
    let activeCount: Int
    let soldCount: Int
    let firstListedAt: Date?
}

struct MarketplaceInspectionSummary: Codable, Hashable {
    let requestId: String
    let scope: InspectionScope
    let inspectedAt: Date
    let performedBy: String
}

struct MarketplaceInspectionRequestSummary: Codable, Hashable {
    let requestId: String
    let status: PpiRequestStatus
}

// MARK: - Social (plan 9, 10, 12)

/// Server-computed relationship between the viewer and another member. The
/// server owns the transitions; the app only renders the control that fits.
enum FriendRelationshipState: String, Codable {
    /// The viewer's own profile ("self" on the wire; `.self` is a metatype in Swift).
    case me = "self"
    case blocked
    case friends
    case outgoingRequest = "outgoing_request"
    case incomingRequest = "incoming_request"
    case none
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FriendRelationshipState(rawValue: raw) ?? .unknown
    }
}

enum FriendRequestPolicy: String, Codable, CaseIterable, Identifiable {
    case everyone
    case friendsOfFriends = "friends_of_friends"
    case nobody

    var id: String { rawValue }

    var label: String {
        switch self {
        case .everyone: "Everyone"
        case .friendsOfFriends: "Friends of friends"
        case .nobody: "Nobody"
        }
    }
}

enum FriendAction: String, Encodable {
    case request, accept, decline, cancel, remove
}

struct PersonSummary: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?

    var label: String { displayName ?? username.map { "@\($0)" } ?? "PerfectPPI member" }
}

struct PeopleSearchResult: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let isPublic: Bool
    let exactMatch: Bool
    let relationshipState: FriendRelationshipState
    let mutualFriendCount: Int

    var person: PersonSummary {
        PersonSummary(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl)
    }
}

struct FriendRequestSummary: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let direction: String
    let createdAt: Date?

    var person: PersonSummary {
        PersonSummary(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl)
    }
}

struct FriendSummary: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let isPublic: Bool
    let friendsSince: Date?

    var person: PersonSummary {
        PersonSummary(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl)
    }
}

struct FriendsOverview: Codable {
    let enabled: Bool
    let friends: [FriendSummary]
    let incoming: [FriendRequestSummary]
    let outgoing: [FriendRequestSummary]
}

struct MemberProfileBadge: Codable, Hashable {
    let code: String
    let label: String
    let description: String
}

struct MemberProfileIdentity: Codable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let bio: String?
    let role: String
    let isPublic: Bool
    let createdAt: Date?
    let badges: [MemberProfileBadge]
}

struct MemberProfileRelationship: Codable, Hashable {
    let state: FriendRelationshipState
    let mutualFriendCount: Int
    let friendsEnabled: Bool
    let mutedByMe: Bool
    let blockedByMe: Bool
    let canViewRestricted: Bool
}

struct MemberProfileVehicle: Codable, Identifiable, Hashable {
    struct Media: Codable, Hashable {
        let url: String
        let isPrimary: Bool
        let sortOrder: Int
    }

    let id: String
    let year: Int?
    let make: String?
    let model: String?
    let trim: String?
    let mileage: Int?
    let vehicleMedia: [Media]

    var label: String {
        let parts = [year.map(String.init), make, model, trim].compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

struct MemberProfileListing: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let askingPriceCents: Int
    let location: String?
    let vehicleId: String
}

/// The social profile as another member sees it (plan 9.1).
struct MemberProfile: Codable {
    let profile: MemberProfileIdentity
    let relationship: MemberProfileRelationship
    let vehicles: [MemberProfileVehicle]
    let listings: [MemberProfileListing]
    let posts: [CommunityPost]
}

// MARK: - Community

struct CommunityPost: Codable, Identifiable, Hashable {
    let id: String
    let authorId: String
    let vehicleId: String?
    let marketplaceListingId: String?
    let groupId: String?
    let content: String
    let audience: CommunityPostAudience
    let postType: CommunityPostType?
    /// Structured fields for the type (plan 14.2); absent on old servers.
    var details: JSONValue? = nil
    var poll: CommunityPollView? = nil
    var inspection: CommunityInspectionSummary? = nil
    let acceptedAnswerCommentId: String?
    var questionOutcome: CommunityQuestionOutcome? = nil
    var questionOutcomeUpdatedAt: Date? = nil
    let status: CommunityContentStatus
    let moderationStatus: String?
    let moderationReason: String?
    let createdAt: Date?
    let updatedAt: Date?
    let author: Profile?
    let vehicle: Vehicle?
    let marketplaceListing: MarketplaceListing?
    let group: CommunityPostGroup?
    let media: [CommunityPostMedia]?
    let comments: [CommunityComment]?
    var mentions: [CommunityMention]? = nil
    let reportContext: String?
    /// Plan 15.5: server-computed label for high-consequence repair topics.
    /// Absent on endpoints that return raw rows (My Posts) and on old servers.
    let safetyNotice: CommunitySafetyNotice?
    /// Server-computed: group posts require active membership to comment.
    let canInteract: Bool?
    let canLike: Bool?
    /// Server-computed; the API still verifies this on every selection.
    let canManageAcceptedAnswer: Bool?
    let likeCount: Int?
    let likedByViewer: Bool?
    /// Private bookmark state for the viewer (plan Phase 1B).
    let savedByViewer: Bool?
    /// Plan 13.5: pinned by a group moderator.
    let groupPinned: Bool?
    /// Viewer is owner or moderator of this post's group (plan 13.4).
    let canModerateGroup: Bool?
}

/// Counts behind navigation badges (plan 7.1 / 22.2), from /api/me/badges.
struct ActivityBadges: Codable, Equatable {
    let unreadNotifications: Int
    let pendingFriendRequests: Int
    let unreadMessages: Int
    /// Join requests waiting in groups this member moderates (plan 13.3).
    var pendingGroupRequests: Int? = 0
    /// Open invitations to join groups.
    var groupInvitations: Int? = 0

    static let none = ActivityBadges(unreadNotifications: 0, pendingFriendRequests: 0, unreadMessages: 0)

    var total: Int { unreadNotifications + pendingFriendRequests + unreadMessages }
    /// Everything waiting inside Groups: requests to review plus invitations.
    var groupsTotal: Int { (pendingGroupRequests ?? 0) + (groupInvitations ?? 0) }
}

struct CommunityPostGroup: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let avatarUrl: String?
}

/// The server owns the wording so it can change without an app release;
/// `topics` are stable codes (brakes, airbags, lifting, fuel_system,
/// high_voltage) that may be used for iconography.
struct CommunitySafetyNotice: Codable, Hashable {
    let topics: [String]
    let message: String
}

struct CommunityPostMedia: Codable, Identifiable, Hashable {
    let id: String
    let postId: String
    let uploaderId: String?
    let url: String
    let mediaType: String
    let contentType: String
    let sortOrder: Int
    let moderationStatus: String?
    let moderationReason: String?
    let createdAt: Date?
}

extension CommunityPostMedia {
    /// The server compacts `sort_order` after a delete; this mirrors that
    /// locally so the list keeps matching what the feed renders.
    func withSortOrder(_ value: Int) -> CommunityPostMedia {
        CommunityPostMedia(
            id: id,
            postId: postId,
            uploaderId: uploaderId,
            url: url,
            mediaType: mediaType,
            contentType: contentType,
            sortOrder: value,
            moderationStatus: moderationStatus,
            moderationReason: moderationReason,
            createdAt: createdAt
        )
    }
}

struct CommunityComment: Codable, Identifiable, Hashable {
    let id: String
    let postId: String
    let authorId: String
    let content: String
    let status: CommunityContentStatus
    let moderationStatus: String?
    let moderationReason: String?
    let createdAt: Date?
    let updatedAt: Date?
    let author: Profile?
    let reportContext: String?
    var mentions: [CommunityMention]? = nil
    var helpfulCount: Int? = nil
    var helpfulByViewer: Bool? = nil
    var canMarkHelpful: Bool? = nil
}

struct CommunityMention: Codable, Identifiable, Hashable {
    let id: String
    let mentionedProfileId: String
    let renderedUsername: String
    let profile: Profile?
}

// MARK: - Capabilities

/// Read-only launch capabilities from `/api/capabilities` (plan 30.2). The
/// app uses these to hide or explain unavailable UI; every server mutation
/// re-checks the flag itself, so this is never treated as authorization.
struct ClientCapabilities: Codable, Hashable {
    struct Capabilities: Codable, Hashable {
        let socialProfiles: Bool
        let friendsDiscovery: Bool
        let groups: Bool
        let groupCreation: Bool
        let communityTextPosts: Bool
        let communityPhotoUploads: Bool
        let communityVideoUploads: Bool
        let events: Bool
    }

    let version: Int
    let environment: String
    let refreshAfterSeconds: Int
    let capabilities: Capabilities

    /// Safe presentation defaults before the first successful fetch: creation
    /// paths hidden, video always off.
    static let conservative = ClientCapabilities(
        version: 0,
        environment: "unknown",
        refreshAfterSeconds: 30,
        capabilities: .init(
            socialProfiles: true,
            friendsDiscovery: false,
            groups: false,
            groupCreation: false,
            communityTextPosts: true,
            communityPhotoUploads: true,
            communityVideoUploads: false,
            events: false
        )
    )
}

struct CommunityPostOptions: Codable, Hashable {
    let vehicles: [CommunityPostOptionVehicle]
    let listings: [CommunityPostOptionListing]
    let groups: [CommunityPostOptionGroup]
    /// The author's submitted/completed inspections of attachable vehicles.
    var inspections: [CommunityPostOptionInspection]? = nil
    let defaultAudience: CommunityPostAudience
    let canPostPublic: Bool
}

struct CommunityPostOptionInspection: Codable, Identifiable, Hashable {
    let id: String
    let vehicleId: String
    let ppiType: String
    let inspectionScope: String
    let status: String
    let updatedAt: Date?

    var label: String {
        let scope = inspectionScope == "dents_tires" ? "Dents & tires" : "Complete"
        let when = updatedAt.map { " · " + $0.formatted(date: .abbreviated, time: .omitted) } ?? ""
        return "\(scope) · \(status.capitalized)\(when)"
    }
}

struct CommunityPostOptionGroup: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let avatarUrl: String?
}

struct CommunityGroupSummary: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let category: String
    let rules: [String]
    let avatarUrl: String?
    let coverUrl: String?
    let vehicleMake: String?
    let vehicleModel: String?
    let yearStart: Int?
    let yearEnd: Int?
    let memberCount: Int
    let isMember: Bool
    let membershipRole: String?
    let isSuggested: Bool
    /// Directory badge for PerfectPPI-curated groups (plan 13.6).
    let isStaffCurated: Bool?
    let locationRegion: String?
    /// "members" or "moderators" (announcement group).
    let postingPolicy: String?
    /// "public", "private", or "unlisted" (plan 13.3); absent on old servers.
    let visibility: String?
    /// "open", "request_approval", or "invite_only".
    let joinPolicy: String?
    /// "active", "requested", "invited", or nil.
    let membershipStatus: String?
    /// Posts and members are readable (public group, or an active member).
    let canViewContent: Bool?
    /// Pending join requests; only populated for owners/moderators.
    let pendingRequestCount: Int?

    var isPrivate: Bool { visibility == "private" }
    var isUnlisted: Bool { visibility == "unlisted" }
    var requiresRequest: Bool { joinPolicy == "request_approval" }
    var inviteOnly: Bool { joinPolicy == "invite_only" }
    var hasRequested: Bool { membershipStatus == "requested" }
    var isInvited: Bool { membershipStatus == "invited" }
    var contentVisible: Bool { canViewContent ?? true }
    var moderates: Bool { membershipRole == "owner" || membershipRole == "admin" || membershipRole == "moderator" }
    /// Owner or admin: group settings, roles, bans (plan 13.4).
    var administers: Bool { membershipRole == "owner" || membershipRole == "admin" }
}

struct CommunityGroupInvitation: Codable, Identifiable, Hashable {
    let groupId: String
    let slug: String
    let name: String
    let description: String
    let visibility: String
    let invitedByLabel: String?
    let invitedAt: Date?

    var id: String { groupId }
}

struct CommunityGroupDirectory: Codable, Hashable {
    let enabled: Bool
    /// Whether this member may create groups (server flag `group_creation`).
    let creationEnabled: Bool?
    let groups: [CommunityGroupSummary]
    /// Open invitations for the viewer (plan 13.3); absent on old servers.
    let invitations: [CommunityGroupInvitation]?
}

/// A pending join request as seen by a moderator (plan 13.3).
struct CommunityGroupJoinRequest: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let requestedAt: Date?
    let message: String?

    var person: PersonSummary {
        PersonSummary(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl)
    }
}

struct CommunityGroupJoinRequestsPage: Codable {
    let requests: [CommunityGroupJoinRequest]
}

/// Editable group settings (plan 13.2). Slug only applies on create.
struct CommunityGroupSettingsPayload: Encodable {
    var slug: String?
    var name: String
    var description: String
    var category: String
    var rules: [String]
    var vehicleMake: String
    var vehicleModel: String
    var yearStart: Int?
    var yearEnd: Int?
    var locationRegion: String
    var postingPolicy: String
    var visibility: String = "public"
    var joinPolicy: String = "open"
}

struct CommunityGroupDetail: Codable, Hashable {
    let group: CommunityGroupSummary
    /// Moderator-pinned posts (plan 13.5); absent on old servers.
    let pinned: [CommunityPost]?
    let posts: [CommunityPost]
    let page: Int
    let hasMore: Bool
}

struct CommunityGroupMember: Codable, Identifiable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let role: String
    let joinedAt: Date?

    var person: PersonSummary {
        PersonSummary(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl)
    }
}

struct CommunityGroupMembersPage: Codable {
    let members: [CommunityGroupMember]
    let page: Int
    let hasMore: Bool
}

struct CommunityGroupSearchPage: Codable {
    let query: String
    let posts: [CommunityPost]
    let page: Int
    let hasMore: Bool
}

struct CommunityPostOptionVehicle: Codable, Identifiable, Hashable {
    let id: String
    let year: Int?
    let make: String?
    let model: String?
    let trim: String?
    let vin: String?
}

struct CommunityPostOptionListing: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let vehicleId: String
    let askingPriceCents: Int
    let vehicle: CommunityPostOptionVehicle?
}

// MARK: - Messages

struct ConversationProfile: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String?
    let username: String?
    let avatarUrl: String?
    let role: UserRole?
}

struct ConversationLastMessage: Codable, Identifiable, Hashable {
    let id: String
    let senderId: String
    let content: String
    let status: String?
    let createdAt: Date?
    let hasAttachment: Bool?
}

/// The marketplace listing a thread is about, when it was started from
/// "Contact Seller". Absent for ordinary direct messages.
struct ConversationListingContext: Codable, Hashable {
    let listingId: String
    let title: String?
    let vehicleId: String?
    let vehicleLabel: String?

    /// Car name for a conversation title, e.g. "2019 Toyota Supra".
    var carLabel: String? {
        if let vehicleLabel, !vehicleLabel.isEmpty { return vehicleLabel }
        if let title, !title.isEmpty { return title }
        return nil
    }
}

struct ConversationSummary: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let participants: [ConversationProfile]
    let otherParticipants: [ConversationProfile]
    let listingContext: ConversationListingContext?
    let lastMessage: ConversationLastMessage?
    let unreadCount: Int
    let requestStatus: String?
    let requestedBy: String?
}

struct ConversationMessage: Codable, Identifiable, Hashable {
    let id: String
    let conversationId: String
    let senderId: String
    let content: String
    let status: String?
    let hasAttachment: Bool?
    let attachmentUrl: String?
    let attachmentType: String?
    let createdAt: Date?
}

struct ConversationThread: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let participants: [ConversationProfile]
    let listingContext: ConversationListingContext?
    let messages: [ConversationMessage]
    let requestStatus: String?
    let requestedBy: String?
    let canSend: Bool?
    let sendUnavailableReason: String?
}

struct MessageRecipient: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String?
    let username: String?
    let role: UserRole?
    let contactMode: String?
    let sharedGroupName: String?
}

struct CreateConversationResult: Codable, Hashable {
    let conversationId: String
    let existing: Bool
    let listingChanged: Bool?
    let requestStatus: String?
}

// MARK: - Reviews

struct TechnicianReview: Codable, Identifiable, Hashable {
    let id: String
    let technicianProfileId: String
    let reviewerId: String
    let ppiRequestId: String
    let rating: Int
    let title: String?
    let content: String?
    let status: ReviewStatus
    let createdAt: Date?
    let updatedAt: Date?
    let reviewer: Profile?
    let ppiRequest: ReviewPpiRequest?
}

struct ReviewPpiRequest: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let status: PpiRequestStatus?
    let vehicle: CommunityPostOptionVehicle?
}

struct ReviewSummary: Codable, Hashable {
    let avgRating: Double
    let totalReviews: Int
    let reputationScore: Double
}

struct TechnicianReviewsResponse: Codable, Hashable {
    let summary: ReviewSummary?
    let reviews: [TechnicianReview]
}

struct ReviewEligibility: Codable, Hashable {
    let request: ReviewPpiRequest?
    let technicianProfileId: String?
    let existingReview: TechnicianReview?
    let canReview: Bool
}

struct ReviewEligibilityResponse: Codable, Hashable {
    let eligibility: ReviewEligibility?
    let review: TechnicianReview?
}

// MARK: - PPI Request

struct PpiRequest: Codable, Identifiable, Hashable {
    let id: String
    /// Nil for organization-requested inspections: a dealership sends these
    /// through the partner API, so there is no consumer requester to point at.
    let requesterId: String?
    let vehicleId: String?
    let assignedTechId: String?
    let ppiType: PpiType?
    let status: PpiRequestStatus
    let whoseCar: WhoseCar?
    let requesterRole: RequesterRole?
    let performerType: PerformerType?
    let inspectionScope: InspectionScope?
    let createdAt: Date?
    let updatedAt: Date?
    /// "perfectppi" for consumer inspections, "dealerspace" for ones pushed in
    /// by a connected dealership management system. Optional so older builds
    /// and trimmed embeds keep decoding.
    let sourceSystem: String?
    let vehicle: Vehicle?
    let requester: Profile?
    let assignedTech: Profile?

    /// True when this inspection arrived from a partner system.
    var isExternalSource: Bool {
        guard let sourceSystem else { return false }
        return sourceSystem != "perfectppi"
    }

    /// Short label for the source badge.
    var sourceLabel: String? {
        switch sourceSystem {
        case "dealerspace": return "DealerSpace"
        case "perfectppi", nil: return nil
        default: return sourceSystem?.capitalized
        }
    }

    var inspectionTitle: String {
        var vehicleParts: [String] = []
        if let year = vehicle?.year {
            vehicleParts.append(String(year))
        }
        if let make = vehicle?.make?.trimmingCharacters(in: .whitespacesAndNewlines),
           !make.isEmpty {
            vehicleParts.append(make)
        }
        if let model = vehicle?.model?.trimmingCharacters(in: .whitespacesAndNewlines),
           !model.isEmpty {
            vehicleParts.append(model)
        }
        let typeLabel = ppiType?.rawValue
            .replacingOccurrences(of: "_", with: " ")
            .capitalized ?? "Inspection"
        let dateLabel: String? = createdAt.map {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "M/d/yyyy"
            return formatter.string(from: $0)
        }
        return (vehicleParts + [typeLabel, dateLabel].compactMap { $0 }).joined(separator: " ")
    }
}

// MARK: - PPI Submission

struct PpiSubmission: Codable, Identifiable, Hashable {
    let id: String
    let ppiRequestId: String
    let performerId: String?
    let version: Int?
    let isCurrent: Bool?
    let status: PpiSubmissionStatus
    let submittedAt: Date?
    let completedAt: Date?
    let createdAt: Date?
    /// Denormalized from the parent request so the workflow needs one fetch.
    let inspectionScope: InspectionScope?
}

/// Org-wide inspection row returned by `GET /api/organizations/me/inspections`.
/// Flattened denormalization of a submission with its parent request, vehicle,
/// requester, and performer — designed for list rendering.
struct OrgInspection: Codable, Identifiable, Hashable {
    let id: String
    let status: PpiSubmissionStatus
    let version: Int?
    let submittedAt: Date?
    let ppiRequest: NestedRequest?
    let performer: Profile?

    struct NestedRequest: Codable, Hashable {
        let id: String
        let ppiType: PpiType?
        let vehicle: NestedVehicle?
        let requester: Profile?
    }

    struct NestedVehicle: Codable, Hashable {
        let year: Int?
        let make: String?
        let model: String?
    }
}

struct PpiSection: Codable, Identifiable, Hashable {
    let id: String
    let ppiSubmissionId: String
    let sectionType: SectionType
    let completionState: CompletionState
    let notes: String?
    let sortOrder: Int?
}

struct PpiAnswer: Codable, Identifiable, Hashable {
    let id: String
    let ppiSectionId: String
    let prompt: String
    let answerType: AnswerType
    let answerValue: String?
    let deferredAt: Date?
    let options: [String]?
    let isRequired: Bool?
    let requiresPhoto: Bool?
    let photoPrompt: String?
    let sortOrder: Int?
}

struct PpiMedia: Codable, Identifiable, Hashable {
    let id: String
    let ppiSectionId: String
    let ppiAnswerId: String?
    let url: String
    let mediaType: String
    let caption: String?
    let capturedAt: Date?
    let uploadedAt: Date?
}

struct OBDSnapshotRecord: Codable, Identifiable, Hashable {
    let id: String
    let ppiSubmissionId: String
    let capturedBy: String
    let vin: String?
    let adapterName: String?
    let milOn: Bool?
    let storedDtcCount: Int?
    let storedDtcs: [String]
    let pendingDtcs: [String]
    let supportedPids: [String]
    let liveReadings: [OBDLiveReading]
    let rawPayload: OBDDiagnosticSnapshot
    let rawTranscript: [OBDExchange]
    let startedAt: Date?
    let completedAt: Date?
    let isCurrent: Bool?
    let createdAt: Date?

    var summaryLine: String {
        let mil = milOn.map { $0 ? "MIL On" : "MIL Off" } ?? "MIL Unknown"
        let stored = storedDtcs.isEmpty ? "No stored DTCs" : storedDtcs.joined(separator: ", ")
        let pending = pendingDtcs.isEmpty ? "No pending DTCs" : pendingDtcs.joined(separator: ", ")
        return "\(mil) - \(stored) - \(pending)"
    }
}

// MARK: - Outputs

struct StandardizedOutput: Codable, Identifiable, Hashable {
    let id: String
    let ppiSubmissionId: String
    /// The rendered PDF URL. Null until the background output worker finishes
    /// uploading to R2 — render `structuredContent` natively meanwhile.
    let documentUrl: String?
    /// JSON report content produced by Gemini in Stage 1 of generation. Always
    /// populated once the entity exists; doesn't depend on R2.
    let structuredContent: StandardizedContent?
    let createdAt: Date?
}

struct StandardizedContent: Codable, Hashable {
    let vehicle: ReportVehicle?
    let inspectionMetadata: InspectionMetadata?
    let performer: ReportPerformer?
    let sections: [StandardizedSection]?
    let diagnostics: StandardizedDiagnostics?
    let overallSummary: String?
    let notableFindings: [String]?

    struct ReportVehicle: Codable, Hashable {
        let year: Int?
        let make: String?
        let model: String?
        let trim: String?
        let vin: String?
        let mileage: Int?
    }

    struct InspectionMetadata: Codable, Hashable {
        let ppiType: String?
        let inspectionScope: InspectionScope?
        let performerType: String?
        let submittedAt: String?
        let version: Int?
    }

    struct ReportPerformer: Codable, Hashable {
        let displayName: String?
        let role: String?
    }
}

struct StandardizedDiagnostics: Codable, Hashable {
    let obdSnapshotPresent: Bool
    let vin: String?
    let adapterName: String?
    let milOn: Bool?
    let storedDtcCount: Int?
    let storedDtcs: [String]
    let pendingDtcs: [String]
    let liveReadings: [DiagnosticLiveReading]
    let summary: String
}

struct DiagnosticLiveReading: Codable, Hashable, Identifiable {
    var id: String { pid }
    let pid: String
    let name: String
    let value: Double
    let unit: String
}

struct StandardizedSection: Codable, Hashable, Identifiable {
    var id: String { sectionType ?? sectionLabel ?? UUID().uuidString }
    let sectionType: String?
    let sectionLabel: String?
    let summary: String?
    let conditionRating: String?
    let findings: [StandardizedFinding]?
    let notes: String?
}

struct StandardizedFinding: Codable, Hashable, Identifiable {
    var id: String { "\(prompt ?? "")|\(answer ?? "")" }
    let prompt: String?
    let answer: String?
    let severity: String?
}

struct VscOutput: Codable, Identifiable, Hashable {
    let id: String
    let ppiSubmissionId: String
    let summary: String?
    let createdAt: Date?
}

// MARK: - Warranty

struct WarrantyOption: Codable, Identifiable, Hashable {
    let id: String
    let vscOutputId: String
    let vehicleId: String
    let userId: String
    let plans: [WarrantyPlan]
    let status: String
    let offeredAt: Date?
    let viewedAt: Date?
    let createdAt: Date?
    let updatedAt: Date?
}

struct WarrantyPlan: Codable, Identifiable, Hashable {
    var id: String { "\(name)-\(termYears)-\(priceCents)" }
    let name: String
    let termYears: Int
    let termMiles: Int?
    let priceCents: Int
    let inclusions: [String]
    let exclusions: [String]
    let deductibleCents: Int
}

struct WarrantyOrder: Codable, Identifiable, Hashable {
    let id: String
    let warrantyOptionId: String
    let planName: String
    let termYears: Int
    let termMiles: Int?
    let priceCents: Int
    let status: WarrantyOrderStatus
    let selectedAt: Date?
    let updatedAt: Date?
    let contract: WarrantyContract?
    let payment: WarrantyPayment?
}

struct WarrantyContract: Codable, Identifiable, Hashable {
    let id: String
    let warrantyOrderId: String
    let documentUrl: String?
    let docusealId: String?
    let docusealSubmitterSlug: String?
    let presentedAt: Date?
    let signedAt: Date?
    let signerId: String?
    let createdAt: Date?
}

struct WarrantyPayment: Codable, Identifiable, Hashable {
    let id: String
    let contractId: String
    let userId: String
    let amountCents: Int
    let method: String?
    let stripePaymentId: String?
    let status: PaymentStatus
    let receiptUrl: String?
    let paidAt: Date?
    let createdAt: Date?
}

struct WarrantyListEntry: Codable, Identifiable, Hashable {
    var id: String { option.id }
    let option: WarrantyOption
    let order: WarrantyOrder?
    let vehicle: Vehicle?
}

struct WarrantyContractSignURL: Codable {
    let embedSrc: String
}

struct WarrantyCheckoutURL: Codable {
    let checkoutUrl: String
}

// MARK: - Organization

struct Organization: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String?
    let logoUrl: String?
    let createdAt: Date?
}

// MARK: - Notifications

struct NotificationItem: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let type: NotificationType
    let title: String
    let body: String
    let readAt: Date?
    let createdAt: Date
}

/// Where a notification opens, after the server re-checked permissions
/// (plan 22.1). `available == false` means show the neutral screen.
struct NotificationDestination: Codable, Hashable {
    let kind: String
    let id: String?
    let secondaryId: String?
    let available: Bool
    let message: String?
}

struct NotificationPreference: Codable, Identifiable, Hashable {
    let category: String
    let label: String
    let description: String
    let inApp: Bool
    let push: Bool
    let locked: Bool

    var id: String { category }
}

// MARK: - Media Packages & Sharing

struct MediaPackageItem: Codable, Identifiable, Hashable {
    var id: String { url }
    let type: String
    let url: String
    let name: String?
}

struct MediaPackageShareLink: Codable, Identifiable, Hashable {
    let id: String
    let token: String
    let expiresAt: Date?
    let createdAt: Date?
}

struct MediaPackage: Codable, Identifiable, Hashable {
    let id: String
    let creatorId: String
    let title: String
    let description: String?
    let ppiSubmissionId: String?
    let items: [MediaPackageItem]
    let createdAt: Date?
    let shareLinks: [MediaPackageShareLink]?
}

struct CreateMediaPackageResult: Codable, Hashable {
    let mediaPackageId: String
}

struct CreateShareLinkResult: Codable, Identifiable, Hashable {
    let id: String
    let token: String
    let url: String
}

// MARK: - Upload

struct PresignedUploadResponse: Codable {
    let uploadUrl: String
    let publicUrl: String
}

struct PresignedUploadRequest: Codable {
    let filename: String
    let contentType: String
    let size: Int
    let entity: String
    let recordId: String

    enum CodingKeys: String, CodingKey {
        case filename
        case contentType
        case size
        case entity
        case recordId
    }
}

struct AttachMediaRequest: Codable {
    let ppiSectionId: String
    let ppiAnswerId: String?
    let url: String
    let mediaType: String
    let capturedAt: Date
}


// MARK: - DealerSpace partner context

/// Partner context for one inspection, from GET /api/ppi/requests/:id/dealerspace.
/// Nil for ordinary consumer inspections — the endpoint returns `data: null`.
struct PerfectPpiPartnerContext: Codable, Hashable {
    let refId: String
    let sourceLabel: String?
    let partnerName: String
    let connectionActive: Bool
    let integrationStatus: String
    let deliveryStatus: String
    let deliverablesReady: Bool
    let vehicleSnapshot: PartnerVehicleSnapshot?
    let externalReconCaseId: String?
    let canSend: Bool

    struct PartnerVehicleSnapshot: Codable, Hashable {
        let vin: String?
        let stockNumber: String?
        let exteriorColor: String?
        let engine: String?
    }

    /// True while a delivery is queued or in flight, so the button can rest.
    var deliveryInFlight: Bool {
        deliveryStatus == "queued" || deliveryStatus == "delivering"
    }

    var integrationStatusLabel: String {
        switch integrationStatus {
        case "created": return "Received"
        case "assigned": return "Assigned"
        case "accepted": return "Accepted"
        case "in_progress": return "In progress"
        case "submitted": return "Submitted"
        case "outputs_generating": return "Generating reports"
        case "deliverables_ready": return "Reports ready"
        case "outputs_failed": return "Report generation failed"
        case "needs_revision": return "Needs revision"
        case "cancelled": return "Cancelled"
        default: return integrationStatus
        }
    }

    var deliveryStatusLabel: String {
        switch deliveryStatus {
        case "not_requested": return "Not sent"
        case "queued": return "Queued"
        case "delivering": return "Sending"
        case "delivered": return "Delivered"
        case "failed": return "Delivery failed"
        default: return deliveryStatus
        }
    }

    var deliveryTint: Color {
        switch deliveryStatus {
        case "delivered": return Theme.Palette.success
        case "failed": return Theme.Palette.danger
        case "queued", "delivering": return Theme.Palette.warning
        default: return .gray
        }
    }
}

struct PerfectPpiSendResult: Codable, Hashable {
    let eventId: String
    let deliveryStatus: String
    let outputVersion: Int
    let alreadyQueued: Bool
}

// MARK: - Unified search (plan 27.2)

struct SearchVehicleResult: Codable, Identifiable, Hashable {
    let id: String
    let year: Int?
    let make: String?
    let model: String?
    let trim: String?
    let nickname: String?
    let visibility: String
    let owner: PersonSummary?
    let photoUrl: String?
    let listingId: String?

    var label: String { [year.map(String.init), make, model, trim].compactMap { $0 }.joined(separator: " ") }
}

struct SearchListingResult: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let askingPriceCents: Int
    let location: String?
    let vehicleId: String
    let vehicleLabel: String
    let photoUrl: String?
}

struct SearchTechnicianResult: Codable, Identifiable, Hashable {
    let id: String
    let profileId: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let specialties: [String]
    let serviceArea: String?
    let certificationLevel: String
    let totalInspections: Int
    let avgRating: Double

    var person: PersonSummary { PersonSummary(id: profileId, username: username, displayName: displayName, avatarUrl: avatarUrl) }
}
