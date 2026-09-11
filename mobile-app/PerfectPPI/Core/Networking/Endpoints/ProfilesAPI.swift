import Foundation

enum AuthAPI {
    private struct AppleLinkPayload: Encodable {
        let authorizationCode: String
    }

    /// Best-effort custody hand-off after a native Apple sign-in.
    static func linkAppleAuthorization(code: String) async {
        do {
            let _: Empty = try await APIClient.shared.postCamel(
                "/api/auth/apple/link",
                body: AppleLinkPayload(authorizationCode: code)
            )
        } catch {
            // The server records custody failures; sign-in itself succeeded.
        }
    }
}

enum ProfilesAPI {
    static func me() async throws -> Profile {
        try await APIClient.shared.get("/api/profiles/me")
    }

    static func activityBadges() async throws -> ActivityBadges {
        try await APIClient.shared.get("/api/me/badges")
    }

    struct UpdatePayload: Encodable {
        let displayName: String?
        let bio: String?
        let avatarUrl: String?
        let isPublic: Bool?
        let defaultPostAudience: CommunityPostAudience?
        let discoverable: Bool?
        let allowExactUsernameLookup: Bool?
        var friendRequestPolicy: FriendRequestPolicy? = nil
        var allowFriendMessages: Bool? = nil
        var allowGroupMessageRequests: Bool? = nil
        var mentionPolicy: MentionPolicy? = nil
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

    struct SafetyPerson: Decodable, Identifiable {
        let id: String
        let displayName: String?
        let username: String?
    }

    struct SafetyRelationships: Decodable {
        let blocked: [SafetyPerson]
        let muted: [SafetyPerson]
    }

    private struct RelationshipPayload: Encodable {
        let profileId: String
        let kind: String
        let enabled: Bool
    }

    static func safetyRelationships() async throws -> SafetyRelationships {
        try await APIClient.shared.get("/api/social/relationships")
    }

    static func setRelationship(profileId: String, kind: String, enabled: Bool) async throws {
        let _: Empty = try await APIClient.shared.patchCamel(
            "/api/social/relationships",
            body: RelationshipPayload(profileId: profileId, kind: kind, enabled: enabled)
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
