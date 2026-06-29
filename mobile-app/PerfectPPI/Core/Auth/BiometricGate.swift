import Foundation
import LocalAuthentication

/// Face ID / Touch ID gate. Called on cold-start when a refresh token exists
/// in Keychain — if biometrics succeed, we let the session resume; if they
/// fail or the user cancels, we drop them to the login screen.
@MainActor
final class BiometricGate {
    static let shared = BiometricGate()

    var isAvailable: Bool {
        var error: NSError?
        let ctx = LAContext()
        return ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    func authenticate(reason: String = "Unlock PerfectPPI") async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
            return false
        }
        do {
            return try await ctx.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }
}
