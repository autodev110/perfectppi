import Foundation

enum ProfilesAPI {
    static func me() async throws -> Profile {
        try await APIClient.shared.get("/api/profiles/me")
    }

    struct UpdatePayload: Encodable {
        let displayName: String?
        let username: String?
        let bio: String?
        let avatarUrl: String?
        let isPublic: Bool?
    }

    static func updateMe(_ payload: UpdatePayload) async throws -> Profile {
        try await APIClient.shared.patch("/api/profiles/me", body: payload)
    }
}
