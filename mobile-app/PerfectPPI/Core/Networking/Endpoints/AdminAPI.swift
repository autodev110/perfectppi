import Foundation

/// Wrappers below match the actual server response shapes. Most admin
/// endpoints return `{ data: { <name>: [...], total }, page, perPage }`
/// (envelope-extracted to `{ <name>: [...], total }`), not bare arrays.
enum AdminAPI {

    // MARK: - Metrics

    /// `/api/admin/metrics` returns `{ totalUsers, totalTechnicians,
    /// totalOrganizations, totalVehicles }` — no inspection count, no revenue.
    /// Keep all fields optional so future server additions don't break decode.
    struct Metrics: Codable {
        let totalUsers: Int?
        let totalTechnicians: Int?
        let totalOrganizations: Int?
        let totalVehicles: Int?
    }

    static func metrics() async throws -> Metrics {
        try await APIClient.shared.get("/api/admin/metrics")
    }

    // MARK: - Users

    struct UsersResponse: Codable {
        let users: [Profile]
        let total: Int
    }

    static func users() async throws -> UsersResponse {
        try await APIClient.shared.get("/api/admin/users")
    }

    // MARK: - Technicians

    struct AdminTechnicianRow: Codable, Identifiable {
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
        let profile: Profile?
        let organization: Organization?
    }

    struct TechniciansResponse: Codable {
        let technicians: [AdminTechnicianRow]
        let total: Int
    }

    static func technicians() async throws -> TechniciansResponse {
        try await APIClient.shared.get("/api/admin/technicians")
    }

    // MARK: - Organizations

    struct OrganizationsResponse: Codable {
        let organizations: [Organization]
        let total: Int
    }

    static func organizations() async throws -> OrganizationsResponse {
        try await APIClient.shared.get("/api/admin/organizations")
    }

    // MARK: - Inspections

    struct InspectionsResponse: Codable {
        let data: [PpiRequest]
        let total: Int
    }

    static func inspections() async throws -> InspectionsResponse {
        try await APIClient.shared.get("/api/admin/inspections")
    }

    // MARK: - Vehicles

    struct VehiclesResponse: Codable {
        let vehicles: [Vehicle]
        let total: Int
    }

    static func vehicles() async throws -> VehiclesResponse {
        try await APIClient.shared.get("/api/admin/vehicles")
    }

    // MARK: - Outputs

    struct AdminOutputRow: Codable, Identifiable {
        var id: String { standardizedOutputId }
        let standardizedOutputId: String
        let vscOutputId: String?
        let submissionId: String
        let requestId: String?
        let version: Int?
        let ppiType: String?
        let vehicleLabel: String?
        let vin: String?
        let standardizedGeneratedAt: Date?
        let vscGeneratedAt: Date?
        let status: String?
    }

    struct OutputsResponse: Codable {
        let outputs: [AdminOutputRow]
        let total: Int
    }

    static func outputs() async throws -> OutputsResponse {
        try await APIClient.shared.get("/api/admin/outputs")
    }

    // MARK: - Payments (bare array under `data`)

    struct AdminPayment: Codable, Identifiable {
        let id: String
        let amountCents: Int?
        let status: PaymentStatus?
        let createdAt: Date?
    }

    static func payments() async throws -> [AdminPayment] {
        try await APIClient.shared.get("/api/admin/payments")
    }

    // MARK: - Contracts (bare array under `data`)

    struct AdminContract: Codable, Identifiable {
        let id: String
        let signedAt: Date?
        let createdAt: Date?
    }

    static func contracts() async throws -> [AdminContract] {
        try await APIClient.shared.get("/api/admin/contracts")
    }

    // MARK: - Warranties

    struct AdminWarrantyOption: Codable, Identifiable {
        let id: String
        let userId: String?
        let vehicleId: String?
        let status: String
        let offeredAt: Date?
        let viewedAt: Date?
        let createdAt: Date?
    }

    struct WarrantiesResponse: Codable {
        let options: [AdminWarrantyOption]
        let orders: [WarrantyOrder]
        let optionCount: Int?
        let orderCount: Int?
    }

    static func warranties() async throws -> WarrantiesResponse {
        try await APIClient.shared.get("/api/admin/warranties")
    }

    // MARK: - Marketplace listings

    struct ListingsResponse: Codable {
        let listings: [MarketplaceListing]
        let total: Int
    }

    static func listings() async throws -> ListingsResponse {
        try await APIClient.shared.get("/api/admin/listings")
    }

    // MARK: - Community

    struct CommunityResponse: Codable {
        let posts: [CommunityPost]
        let total: Int
    }

    static func community() async throws -> CommunityResponse {
        try await APIClient.shared.get("/api/admin/community")
    }

    // MARK: - Reviews

    struct ReviewsResponse: Codable {
        let reviews: [TechnicianReview]
        let total: Int
    }

    static func reviews() async throws -> ReviewsResponse {
        try await APIClient.shared.get("/api/admin/reviews")
    }

    // MARK: - Communications

    struct AdminCommunication: Codable, Identifiable {
        var id: String { conversationId }
        let conversationId: String
        let createdAt: Date?
        let participantCount: Int?
        let messageCount: Int?
        let lastMessageAt: Date?
        let lastMessagePreview: String?
        let rawConversationCount: Int?
    }

    static func communications() async throws -> [AdminCommunication] {
        try await APIClient.shared.get("/api/admin/communications")
    }

    // MARK: - Audit log

    struct AdminAuditEntry: Codable, Identifiable {
        let id: String
        let actorId: String?
        let action: String
        let targetType: String?
        let targetId: String?
        let createdAt: Date
    }

    struct AuditResponse: Codable {
        let logs: [AdminAuditEntry]
        let total: Int
    }

    static func audit() async throws -> AuditResponse {
        try await APIClient.shared.get("/api/admin/audit")
    }
}
