import Foundation

enum NotificationsAPI {
    static func list(unreadOnly: Bool = false, limit: Int = 50) async throws -> [NotificationItem] {
        var q: [URLQueryItem] = [URLQueryItem(name: "limit", value: "\(limit)")]
        if unreadOnly { q.append(URLQueryItem(name: "unread", value: "1")) }
        return try await APIClient.shared.get("/api/notifications", query: q)
    }

    struct MarkReadPayload: Encodable { let read: Bool }
    struct OkBody: Codable { let ok: Bool }

    static func markRead(id: String, read: Bool) async throws -> OkBody {
        try await APIClient.shared.patch(
            "/api/notifications/\(id)",
            body: MarkReadPayload(read: read)
        )
    }

    struct MarkAllResult: Decodable {
        let ok: Bool
        let marked: Int
    }

    /// Plan 22.2 "Mark All as Read".
    static func markAllRead() async throws -> MarkAllResult {
        try await APIClient.shared.patch("/api/notifications", body: MarkReadPayload(read: true))
    }

    /// Marks the notice read and returns its permission-checked destination.
    static func destination(id: String) async throws -> NotificationDestination {
        try await APIClient.shared.post("/api/notifications/\(id)/destination", body: Empty())
    }

    static func preferences() async throws -> [NotificationPreference] {
        try await APIClient.shared.get("/api/notifications/preferences")
    }

    private struct PreferencePayload: Encodable {
        let category: String
        let inApp: Bool
        let push: Bool
    }

    static func setPreference(category: String, inApp: Bool, push: Bool) async throws {
        let _: Empty = try await APIClient.shared.patchCamel(
            "/api/notifications/preferences",
            body: PreferencePayload(category: category, inApp: inApp, push: push)
        )
    }

    struct RegisterDevicePayload: Encodable {
        let token: String
        let platform: String
        let env: String
        let appVersion: String?
    }

    static func registerDevice(_ payload: RegisterDevicePayload) async throws -> OkBody {
        try await APIClient.shared.post("/api/notifications/devices", body: payload)
    }

    struct DeleteDevicePayload: Encodable { let token: String }

    static func unregisterDevice(token: String) async throws -> OkBody {
        try await APIClient.shared.delete(
            "/api/notifications/devices",
            body: DeleteDevicePayload(token: token)
        )
    }
}
