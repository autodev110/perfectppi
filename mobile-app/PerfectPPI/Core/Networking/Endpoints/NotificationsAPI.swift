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
