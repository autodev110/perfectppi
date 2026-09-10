import AuthenticationServices
import CryptoKit
import Foundation

/// Native Sign in with Apple support (plan 8.2 / 36.1).
///
/// The raw nonce is sent to Supabase and its SHA-256 to Apple, so the identity
/// token Apple returns is bound to this sign-in attempt and cannot be replayed.
/// Apple only reveals the user's name on the very first authorization, so the
/// credential's `fullName` is captured before it is gone for good.
enum AppleSignIn {
    struct Result {
        let identityToken: String
        let authorizationCode: String?
        let rawNonce: String
        let fullName: String?
    }

    enum SignInError: LocalizedError {
        case missingIdentityToken

        var errorDescription: String? {
            "Apple did not return a sign-in token. Please try again."
        }
    }

    static func makeRawNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "Unable to generate a secure nonce")
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(bytes.map { alphabet[Int($0) % alphabet.count] })
    }

    static func sha256Hex(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func result(from authorization: ASAuthorization, rawNonce: String) throws -> Result {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            throw SignInError.missingIdentityToken
        }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let fullName = credential.fullName.flatMap { components -> String? in
            let formatter = PersonNameComponentsFormatter()
            let name = formatter.string(from: components).trimmingCharacters(in: .whitespaces)
            return name.isEmpty ? nil : name
        }
        return Result(identityToken: identityToken, authorizationCode: code, rawNonce: rawNonce, fullName: fullName)
    }
}
