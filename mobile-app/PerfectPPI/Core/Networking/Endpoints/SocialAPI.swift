import Foundation

/// Friends, people search, and member profiles (plan 9, 10, 12). Every call
/// goes through the authenticated API; the server applies discoverability,
/// blocks, account state, and the `friends_discovery` capability.
enum SocialAPI {
    struct PeopleSearchPage: Decodable {
        let results: [PeopleSearchResult]
        let hasMore: Bool
        let enabled: Bool
    }

    static func searchPeople(_ query: String, page: Int = 1) async throws -> PeopleSearchPage {
        try await APIClient.shared.get(
            "/api/social/people",
            query: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "page", value: String(max(page, 1)))
            ]
        )
    }

    static func friends() async throws -> FriendsOverview {
        try await APIClient.shared.get("/api/social/friends")
    }

    private struct FriendMutationPayload: Encodable {
        let profileId: String
        let action: FriendAction
    }

    struct FriendMutationResult: Decodable {
        let state: FriendRelationshipState
        let changed: Bool
    }

    /// Returns the canonical state to render; nothing is applied optimistically.
    static func mutateFriendship(profileId: String, action: FriendAction) async throws -> FriendMutationResult {
        try await APIClient.shared.postCamel(
            "/api/social/friends",
            body: FriendMutationPayload(profileId: profileId, action: action)
        )
    }

    /// `asStranger` asks for the owner's privacy preview (plan 9.3); the
    /// server ignores it for anyone else's profile.
    static func memberProfile(username: String, asStranger: Bool = false) async throws -> MemberProfile {
        let cleaned = username.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "@", with: "")
        let encoded = cleaned.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? cleaned
        return try await APIClient.shared.get(
            "/api/profiles/\(encoded)",
            query: asStranger ? [URLQueryItem(name: "view", value: "stranger")] : []
        )
    }
}
