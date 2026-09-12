import Foundation

enum TechniciansAPI {
    /// Public directory listing. Use `independent: true` to filter to techs
    /// not affiliated with any organization (candidates for invite).
    static func list(independent: Bool? = nil) async throws -> [TechnicianProfile] {
        var query: [URLQueryItem] = []
        if let independent {
            query.append(.init(name: "independent", value: independent ? "true" : "false"))
        }
        return try await APIClient.shared.get("/api/technicians", query: query)
    }

    static func me() async throws -> TechnicianProfile {
        try await APIClient.shared.get("/api/technicians/me")
    }

    struct UpdatePayload: Encodable {
        let specialties: [String]?
        let supportedMakes: [String]?
        let serviceArea: String?
        let isAvailable: Bool?
        let offersMobileService: Bool?
        let offersShopService: Bool?
    }

    static func updateMe(_ payload: UpdatePayload) async throws -> TechnicianProfile {
        try await APIClient.shared.patch("/api/technicians/me", body: payload)
    }

    static func queue() async throws -> [PpiRequest] {
        try await APIClient.shared.get("/api/technicians/me/queue")
    }

    static func get(id: String) async throws -> TechnicianProfile {
        try await APIClient.shared.get("/api/technicians/\(id)")
    }

    static func credentials() async throws -> [TechnicianCredentialRecord] {
        try await APIClient.shared.get("/api/technicians/me/credentials")
    }

    struct CredentialSubmission: Encodable {
        let credentialType: String
        let credentialName: String
        let issuer: String
        let scope: String?
        let credentialIdentifierLast4: String?
        let issuedOn: String?
        let expiresOn: String?
        let evidenceReference: String
        let supersedesCredentialId: String?
    }

    static func submitCredential(_ payload: CredentialSubmission) async throws -> TechnicianCredentialRecord {
        try await APIClient.shared.post("/api/technicians/me/credentials", body: payload)
    }
}
