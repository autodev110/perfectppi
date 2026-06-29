import Foundation
import Security

/// Minimal Keychain wrapper. Used only for the Supabase refresh token, so we
/// keep the surface area small. Access control is `.afterFirstUnlockThisDeviceOnly`
/// so the token survives a reboot but never leaves the device.
enum KeychainStore {
    enum KeychainError: Error { case unhandled(OSStatus) }

    static let refreshTokenKey = "perfectppi.supabase.refresh_token"

    static func save(_ value: String, for key: String) throws {
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data,
        ]

        // Update if exists, otherwise add.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        if updateStatus == errSecItemNotFound {
            let addStatus = SecItemAdd(attributes as CFDictionary, nil)
            if addStatus != errSecSuccess {
                throw KeychainError.unhandled(addStatus)
            }
            return
        }
        throw KeychainError.unhandled(updateStatus)
    }

    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else { return nil }
        return str
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
