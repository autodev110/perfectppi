import Foundation

// MARK: - Profile

struct Profile: Codable, Identifiable, Hashable {
    let id: String
    let authUserId: String?
    /// Optional because embedded profile references in joined queries
    /// (e.g. `ppi_requests.requester`, `audit_logs.actor`) only select
    /// a subset of columns and omit `role`. The top-level `/api/profiles/me`
    /// response always includes it.
    let role: UserRole?
    let email: String?
    let displayName: String?
    let username: String?
    let avatarUrl: String?
    let bio: String?
    let isPublic: Bool?
    let phone: String?
    let createdAt: Date?

    var fullName: String? { displayName }
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
    let mileage: Int?
    let visibility: VehicleVisibility?
    let createdAt: Date?
    let vehicleMedia: [VehicleMedia]?
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
}

// MARK: - Community

struct CommunityPost: Codable, Identifiable, Hashable {
    let id: String
    let authorId: String
    let vehicleId: String?
    let marketplaceListingId: String?
    let content: String
    let status: CommunityContentStatus
    let createdAt: Date?
    let updatedAt: Date?
    let author: Profile?
    let vehicle: Vehicle?
    let marketplaceListing: MarketplaceListing?
    let comments: [CommunityComment]?
}

struct CommunityComment: Codable, Identifiable, Hashable {
    let id: String
    let postId: String
    let authorId: String
    let content: String
    let status: CommunityContentStatus
    let createdAt: Date?
    let updatedAt: Date?
    let author: Profile?
}

struct CommunityPostOptions: Codable, Hashable {
    let vehicles: [CommunityPostOptionVehicle]
    let listings: [CommunityPostOptionListing]
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

struct ConversationSummary: Codable, Identifiable, Hashable {
    let id: String
    let createdAt: Date?
    let participants: [ConversationProfile]
    let otherParticipants: [ConversationProfile]
    let lastMessage: ConversationLastMessage?
    let unreadCount: Int
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
    let messages: [ConversationMessage]
}

struct MessageRecipient: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String?
    let username: String?
    let role: UserRole?
}

struct CreateConversationResult: Codable, Hashable {
    let conversationId: String
    let existing: Bool
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
    let requesterId: String?
    let vehicleId: String?
    let assignedTechId: String?
    let ppiType: PpiType?
    let status: PpiRequestStatus
    let whoseCar: WhoseCar?
    let requesterRole: RequesterRole?
    let performerType: PerformerType?
    let createdAt: Date?
    let updatedAt: Date?
    let vehicle: Vehicle?
    let requester: Profile?
    let assignedTech: Profile?
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
    let options: [String]?
    let isRequired: Bool?
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
    let entity: String
    let recordId: String

    enum CodingKeys: String, CodingKey {
        case filename
        case contentType
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
