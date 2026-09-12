import Foundation

/// Structured discovery filters (plan 25.1). Mirrors
/// `src/lib/marketplace/filters.ts`: the same shape is the query string on
/// `/api/marketplace/listings` and the JSON stored in a saved search.
struct MarketplaceFilters: Codable, Hashable {
    var q: String?
    var make: String?
    var model: String?
    var minYear: Int?
    var maxYear: Int?
    /// Dollars.
    var maxPrice: Int?
    var maxMileage: Int?
    var transmission: String?
    var drivetrain: String?
    var bodyStyle: String?
    var region: String?
    var inspected: Bool?
    var sellerType: String?
    var sort: String?

    static let sorts: [(value: String, label: String)] = [
        ("newest", "Newest"), ("oldest", "Oldest"), ("price_asc", "Price: low to high"),
        ("price_desc", "Price: high to low"), ("mileage_asc", "Mileage: low to high"),
        ("recently_inspected", "Recently inspected"),
    ]
    static let transmissions = ["Automatic", "Manual", "CVT"]
    static let drivetrains = ["AWD", "4WD", "RWD", "FWD"]
    static let bodyStyles = ["Sedan", "Coupe", "Hatchback", "Wagon", "SUV", "Truck", "Convertible", "Van"]
    static let sellerTypes: [(value: String, label: String)] = [("member", "Private seller"), ("technician", "Technician / shop")]

    static func sellerTypeLabel(_ value: String?) -> String? {
        sellerTypes.first { $0.value == value }?.label
    }

    /// Blank text and the default sort dropped, so equality and "is anything
    /// applied" behave like the server's `cleanFilters`.
    var cleaned: MarketplaceFilters {
        func text(_ value: String?) -> String? {
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? nil : trimmed
        }
        var copy = self
        copy.q = text(q); copy.make = text(make); copy.model = text(model)
        copy.transmission = text(transmission); copy.drivetrain = text(drivetrain)
        copy.bodyStyle = text(bodyStyle); copy.region = text(region); copy.sellerType = text(sellerType)
        copy.inspected = inspected == true ? true : nil
        copy.sort = sort == "newest" ? nil : text(sort)
        return copy
    }

    /// Whether anything narrows the results (sort alone does not).
    var narrowsResults: Bool {
        let c = cleaned
        return c.q != nil || c.make != nil || c.model != nil || c.minYear != nil || c.maxYear != nil
            || c.maxPrice != nil || c.maxMileage != nil || c.transmission != nil || c.drivetrain != nil
            || c.bodyStyle != nil || c.region != nil || c.inspected == true || c.sellerType != nil
    }

    /// Count shown on the filter button; the search box's own text is excluded.
    var activeCount: Int {
        let c = cleaned
        return [c.make, c.model, c.transmission, c.drivetrain, c.bodyStyle, c.region, c.sellerType, c.sort]
            .filter { $0 != nil }.count
            + [c.minYear, c.maxYear, c.maxPrice, c.maxMileage].filter { $0 != nil }.count
            + (c.inspected == true ? 1 : 0)
    }

    var queryItems: [URLQueryItem] {
        let c = cleaned
        var items: [URLQueryItem] = []
        func add(_ name: String, _ value: String?) { if let value { items.append(.init(name: name, value: value)) } }
        add("q", c.q); add("make", c.make); add("model", c.model)
        add("minYear", c.minYear.map(String.init)); add("maxYear", c.maxYear.map(String.init))
        add("maxPrice", c.maxPrice.map(String.init)); add("maxMileage", c.maxMileage.map(String.init))
        add("transmission", c.transmission); add("drivetrain", c.drivetrain); add("bodyStyle", c.bodyStyle)
        add("region", c.region); add("inspected", c.inspected == true ? "true" : nil)
        add("sellerType", c.sellerType); add("sort", c.sort)
        return items
    }

    /// Short summary for chips and the default saved-search name.
    var summary: String {
        let c = cleaned
        var bits: [String] = []
        if let q = c.q { bits.append("“\(q)”") }
        let vehicle = [c.make, c.model].compactMap { $0 }.joined(separator: " ")
        if !vehicle.isEmpty { bits.append(vehicle) }
        if c.minYear != nil || c.maxYear != nil { bits.append("\(c.minYear.map(String.init) ?? "…")–\(c.maxYear.map(String.init) ?? "…")") }
        if let price = c.maxPrice { bits.append("≤ $\(price.formatted())") }
        if let miles = c.maxMileage { bits.append("≤ \(miles.formatted()) mi") }
        bits.append(contentsOf: [c.transmission, c.drivetrain, c.bodyStyle, c.region].compactMap { $0 })
        if c.inspected == true { bits.append("Inspected") }
        if let seller = Self.sellerTypeLabel(c.sellerType) { bits.append(seller) }
        return bits.isEmpty ? "All listings" : bits.joined(separator: " · ")
    }
}

/// A member's saved search (plan 25.1): up to ten, with an optional daily
/// notice when new listings match.
struct MarketplaceSavedSearch: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let filters: MarketplaceFilters
    let notify: Bool
}

/// One page of browse results (plan 25.1).
struct MarketplaceListingPage: Decodable {
    let items: [MarketplaceListing]
    let page: Int
    let total: Int
    let hasMore: Bool
}

enum MarketplaceAPI {
    static func list(filters: MarketplaceFilters = MarketplaceFilters()) async throws -> [MarketplaceListing] {
        try await APIClient.shared.get("/api/marketplace/listings", query: filters.queryItems)
    }

    static func listPage(filters: MarketplaceFilters, page: Int) async throws -> MarketplaceListingPage {
        try await APIClient.shared.get(
            "/api/marketplace/listings",
            query: filters.queryItems + [URLQueryItem(name: "page", value: String(max(page, 1)))]
        )
    }

    static func list(query: String?) async throws -> [MarketplaceListing] {
        try await list(filters: MarketplaceFilters(q: query))
    }

    private struct SavedSearchesResponse: Decodable { let searches: [MarketplaceSavedSearch] }

    static func savedSearches() async throws -> [MarketplaceSavedSearch] {
        let response: SavedSearchesResponse = try await APIClient.shared.get("/api/marketplace/saved-searches")
        return response.searches
    }

    private struct SaveSearchPayload: Encodable {
        let id: String?
        let name: String
        let filters: MarketplaceFilters
        let notify: Bool
    }

    /// Create (`id` nil) or replace a saved search. Filter keys are camelCase
    /// on the wire, hence `postCamel`.
    static func saveSearch(id: String? = nil, name: String, filters: MarketplaceFilters, notify: Bool) async throws -> MarketplaceSavedSearch {
        try await APIClient.shared.postCamel(
            "/api/marketplace/saved-searches",
            body: SaveSearchPayload(id: id, name: name, filters: filters.cleaned, notify: notify)
        )
    }

    static func deleteSavedSearch(id: String) async throws {
        let _: Empty = try await APIClient.shared.delete("/api/marketplace/saved-searches/\(id)")
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

    struct RemoveResult: Decodable {
        let id: String
        /// "soft" keeps the row for savers / inspection requests; "hard" deleted it.
        let mode: String
    }

    /// Owner remove (plan 25.2). Soft while anything references the listing.
    static func remove(id: String) async throws -> RemoveResult {
        try await APIClient.shared.delete("/api/marketplace/listings/\(id)")
    }

    struct UpdatePayload: Encodable {
        /// Required: the server refuses an update that would blank the title.
        let title: String
        let description: String?
        let askingPrice: Double
        let location: String?
    }

    static func update(id: String, payload: UpdatePayload) async throws -> Empty {
        try await APIClient.shared.patch(
            "/api/marketplace/listings/\(id)",
            body: payload
        )
    }

    static func contactSeller(listingId: String) async throws -> CreateConversationResult {
        try await APIClient.shared.post(
            "/api/marketplace/listings/\(listingId)/contact",
            body: Empty()
        )
    }

    struct RequestInspectionPayload: Encodable {
        let scope: InspectionScope
    }

    struct RequestInspectionResponse: Codable {
        let requestId: String
        let status: PpiRequestStatus
        let created: Bool
    }

    static func requestInspection(
        listingId: String,
        scope: InspectionScope = .complete
    ) async throws -> RequestInspectionResponse {
        try await APIClient.shared.post(
            "/api/marketplace/listings/\(listingId)/request-inspection",
            body: RequestInspectionPayload(scope: scope)
        )
    }

    struct SavePayload: Encodable { let saved: Bool }
    struct SaveResult: Decodable {
        let listingId: String
        let saved: Bool
    }

    /// Private Save/Unsave (plan 25.2). Saving needs a visible listing.
    static func setSaved(listingId: String, saved: Bool) async throws -> SaveResult {
        try await APIClient.shared.post(
            "/api/marketplace/listings/\(listingId)/save",
            body: SavePayload(saved: saved)
        )
    }

    /// Saved listings in save order; sold or removed ones stay with their status.
    static func saved(page: Int = 1) async throws -> [MarketplaceListing] {
        try await APIClient.shared.get(
            "/api/marketplace/saved",
            query: [URLQueryItem(name: "page", value: String(max(page, 1)))]
        )
    }
}
