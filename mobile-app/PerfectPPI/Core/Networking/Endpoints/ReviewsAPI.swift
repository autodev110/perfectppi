import Foundation

enum ReviewsAPI {
    static func technicianReviews(
        technicianProfileId: String,
        limit: Int = 20
    ) async throws -> TechnicianReviewsResponse {
        try await APIClient.shared.get(
            "/api/technicians/\(technicianProfileId)/reviews",
            query: [URLQueryItem(name: "limit", value: "\(limit)")]
        )
    }

    static func requestReviewEligibility(requestId: String) async throws -> ReviewEligibilityResponse {
        try await APIClient.shared.get("/api/ppi/requests/\(requestId)/review")
    }

    struct UpsertPayload: Encodable {
        let rating: Int
        let title: String?
        let content: String?
    }

    struct ReviewMutationResult: Codable {
        let id: String
    }

    static func upsertReview(
        requestId: String,
        rating: Int,
        title: String?,
        content: String?
    ) async throws -> ReviewMutationResult {
        try await APIClient.shared.post(
            "/api/ppi/requests/\(requestId)/review",
            body: UpsertPayload(rating: rating, title: title, content: content)
        )
    }
}
