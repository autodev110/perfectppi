import Foundation

enum ProfilesAPI {
    static func me() async throws -> Profile {
        try await APIClient.shared.get("/api/profiles/me")
    }

    struct UpdatePayload: Encodable {
        let displayName: String?
        let bio: String?
        let avatarUrl: String?
        let isPublic: Bool?
    }

    static func updateMe(_ payload: UpdatePayload) async throws -> Profile {
        try await APIClient.shared.patch("/api/profiles/me", body: payload)
    }

    struct UsernameAvailability: Decodable {
        let available: Bool
        let error: String?
    }

    static func usernameAvailability(_ username: String) async throws -> UsernameAvailability {
        try await APIClient.shared.get(
            "/api/profiles/username",
            query: [URLQueryItem(name: "username", value: username)]
        )
    }

    private struct UsernamePayload: Encodable {
        let username: String
    }

    static func claimUsername(_ username: String) async throws -> Profile {
        try await APIClient.shared.post(
            "/api/profiles/username",
            body: UsernamePayload(username: username)
        )
    }

    private struct SwitchRolePayload: Encodable {
        let role: String
    }

    /// Developer-only. Returns the updated profile so callers can refresh
    /// session state without a second round trip. The server re-checks the
    /// developer grant, so a non-developer gets a 403 here.
    static func switchRole(_ role: UserRole) async throws -> Profile {
        try await APIClient.shared.post(
            "/api/profiles/role",
            body: SwitchRolePayload(role: role.rawValue)
        )
    }
}
