import Foundation

enum MarketplaceAPI {
    static func list(
        query: String? = nil,
        make: String? = nil,
        model: String? = nil,
        minYear: Int? = nil,
        maxYear: Int? = nil,
        maxPrice: Int? = nil,
        sort: String? = nil
    ) async throws -> [MarketplaceListing] {
        var items: [URLQueryItem] = []
        if let query, !query.isEmpty { items.append(.init(name: "q", value: query)) }
        if let make, !make.isEmpty { items.append(.init(name: "make", value: make)) }
        if let model, !model.isEmpty { items.append(.init(name: "model", value: model)) }
        if let minYear { items.append(.init(name: "minYear", value: "\(minYear)")) }
        if let maxYear { items.append(.init(name: "maxYear", value: "\(maxYear)")) }
        if let maxPrice { items.append(.init(name: "maxPrice", value: "\(maxPrice)")) }
        if let sort { items.append(.init(name: "sort", value: sort)) }
        return try await APIClient.shared.get("/api/marketplace/listings", query: items)
    }

    static func mine() async throws -> [MarketplaceListing] {
        try await APIClient.shared.get("/api/marketplace/listings/me")
    }

    static func get(id: String) async throws -> MarketplaceListing {
        try await APIClient.shared.get("/api/marketplace/listings/\(id)")
    }

    struct CreatePayload: Encodable {
        let vehicleId: String
        let title: String?
        let description: String?
        let askingPrice: Double
        let location: String?
    }

    struct CreateResponse: Codable {
        let id: String
    }

    static func create(_ payload: CreatePayload) async throws -> CreateResponse {
        try await APIClient.shared.post("/api/marketplace/listings", body: payload)
    }

    struct StatusPayload: Encodable {
        let status: ListingStatus
    }

    static func updateStatus(id: String, status: ListingStatus) async throws -> Empty {
        try await APIClient.shared.patch(
            "/api/marketplace/listings/\(id)",
            body: StatusPayload(status: status)
        )
    }

    static func contactSeller(listingId: String) async throws -> CreateConversationResult {
        try await APIClient.shared.post(
            "/api/marketplace/listings/\(listingId)/contact",
            body: Empty()
        )
    }
}
