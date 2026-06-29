import Foundation

enum OrganizationsAPI {
    static func me() async throws -> Organization {
        try await APIClient.shared.get("/api/organizations/me")
    }

    struct UpdatePayload: Encodable {
        let name: String?
        let slug: String?
        let logoUrl: String?
    }

    static func updateMe(_ payload: UpdatePayload) async throws -> Organization {
        try await APIClient.shared.patch("/api/organizations/me", body: payload)
    }

    static func technicians() async throws -> [TechnicianProfile] {
        try await APIClient.shared.get("/api/organizations/me/technicians")
    }

    /// Org-wide inspections list (returns every submission performed by any
    /// technician in the manager's organization). Backed by
    /// `GET /api/organizations/me/inspections`.
    static func inspections() async throws -> [OrgInspection] {
        try await APIClient.shared.get("/api/organizations/me/inspections")
    }

    struct InvitePayload: Encodable {
        let technicianProfileId: String
    }

    static func inviteTechnician(technicianProfileId: String) async throws -> Empty {
        // postCamel keeps the field as `technicianProfileId` to match the
        // backend zod schema. `post` would convert it to `technician_profile_id`
        // and the zod parse would fail with "Required".
        try await APIClient.shared.postCamel(
            "/api/organizations/me/technicians/invite",
            body: InvitePayload(technicianProfileId: technicianProfileId)
        )
    }
}

