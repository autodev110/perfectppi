import Foundation
import UIKit
import UserNotifications

/// Owns APNs registration. Called from `AppDelegate.didFinishLaunching` and
/// after sign-in. Token registration is sent to the server via
/// `/api/notifications/devices`.
@MainActor
final class PushService: NSObject {
    static let shared = PushService()

    private(set) var apnsToken: String?

    func requestAuthorizationAndRegister() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            guard granted else { return }
            UIApplication.shared.registerForRemoteNotifications()
        } catch {
            // Authorization can fail in restricted environments; nothing to
            // do but log.
            #if DEBUG
            print("[Push] authorization failed:", error)
            #endif
        }
    }

    func didRegister(deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        self.apnsToken = hex
        Task { await sendToServer(hex) }
    }

    func didFailToRegister(error: Error) {
        #if DEBUG
        print("[Push] registration failed:", error)
        #endif
    }

    private func sendToServer(_ token: String) async {
        do {
            #if DEBUG
            let env = "sandbox"
            #else
            let env = "prod"
            #endif
            _ = try await NotificationsAPI.registerDevice(
                .init(
                    token: token,
                    platform: "ios",
                    env: env,
                    appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
                )
            )
        } catch {
            #if DEBUG
            print("[Push] could not register with server:", error)
            #endif
        }
    }

    func unregister() async {
        guard let token = apnsToken else { return }
        _ = try? await NotificationsAPI.unregisterDevice(token: token)
        apnsToken = nil
    }
}
