import Foundation
import Supabase
import Combine

/// Single source of truth for the authenticated user. Wraps the Supabase
/// Swift SDK and exposes the access token + profile to the rest of the app.
///
/// Lifecycle:
///   - `bootstrap()` runs at app start. If a session exists (Supabase SDK
///     persists it to its own keychain on iOS), we optionally require a
///     biometric unlock and then fetch the profile.
///   - `signInWithOAuth(provider:)` triggers the OAuth flow; the callback
///     URL is handled by `URLRouter` and routed back here.
///   - `signOut()` clears the session and any device-token registration.
@MainActor
final class AuthStore: ObservableObject {
    enum State: Equatable {
        case loading
        case lockedBiometric
        case signedOut
        case signedIn(Profile)
    }

    @Published private(set) var state: State = .loading

    /// The signed-in profile, if any. Convenience for views that need the
    /// current user (e.g. optimistic UI) without switching on `state`.
    var profile: Profile? {
        if case .signedIn(let p) = state { return p }
        return nil
    }

    let client: SupabaseClient

    private var sessionTask: Task<Void, Never>?

    init() {
        self.client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey
        )

        // Wire the APIClient to ask us for the latest access token.
        APIClient.shared.tokenProvider = { [weak self] in
            await self?.currentAccessToken()
        }
        APIClient.shared.onUnauthorized = { [weak self] in
            await self?.signOut()
        }
    }

    deinit {
        sessionTask?.cancel()
    }

    func bootstrap() async {
        do {
            let session = try await client.auth.session
            _ = session
            // Optional biometric unlock when a session exists.
            if BiometricGate.shared.isAvailable {
                state = .lockedBiometric
                let ok = await BiometricGate.shared.authenticate()
                if !ok {
                    state = .signedOut
                    return
                }
            }
            await loadProfile()
        } catch {
            state = .signedOut
        }

        sessionTask = Task { [weak self] in
            guard let self else { return }
            for await change in self.client.auth.authStateChanges {
                switch change.event {
                case .signedIn, .tokenRefreshed:
                    await self.loadProfile()
                case .signedOut, .userDeleted:
                    self.state = .signedOut
                default:
                    break
                }
            }
        }
    }

    func signInWithEmail(_ email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
        await loadProfile()
    }

    func signUpWithEmail(_ email: String, password: String) async throws {
        let response = try await client.auth.signUp(email: email, password: password)
        // If Supabase has email confirmation enabled, signUp returns a user
        // but no session — there's nothing to load yet. Surface this so the
        // UI can show "check your email" instead of cycling through a
        // confusing signed-in → loadProfile-fails → signed-out loop.
        if response.session == nil {
            self.state = .signedOut
            throw AuthError.emailConfirmationRequired
        }
        await loadProfile()
    }

    enum AuthError: LocalizedError {
        case emailConfirmationRequired

        var errorDescription: String? {
            switch self {
            case .emailConfirmationRequired:
                return "Check your email to confirm your account, then sign in."
            }
        }
    }

    /// Start the OAuth flow. The Supabase SDK opens an ASWebAuthenticationSession,
    /// and the redirect lands on `perfectppi://callback?code=...` which our
    /// `URLRouter` then forwards back to `exchangeCode(from:)`.
    func signInWithOAuth(_ provider: Provider) async throws {
        try await client.auth.signInWithOAuth(
            provider: provider,
            redirectTo: URL(string: "\(AppConfig.customURLScheme)://callback")
        )
        await loadProfile()
    }

    func exchangeCode(from url: URL) async {
        do {
            try await client.auth.session(from: url)
            await loadProfile()
        } catch {
            // Fall back to signed-out; user can retry.
            state = .signedOut
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
        state = .signedOut
    }

    /// Returns the freshest access token, refreshing if necessary.
    func currentAccessToken() async -> String? {
        do {
            let session = try await client.auth.session
            return session.accessToken
        } catch {
            return nil
        }
    }

    private func loadProfile() async {
        do {
            let profile: Profile = try await APIClient.shared.get("/api/profiles/me")
            state = .signedIn(profile)
        } catch {
            // If we can't load a profile after auth, log out to recover.
            try? await client.auth.signOut()
            state = .signedOut
        }
    }
}
