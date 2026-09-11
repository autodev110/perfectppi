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
        case profileUnavailable
        case signedOut
        case signedIn(Profile)
    }

    @Published private(set) var state: State = .loading

    /// Server-authoritative launch capabilities (plan 30.2). Refreshed after
    /// sign-in, on foreground, and after `refreshAfterSeconds`.
    @Published private(set) var capabilities: ClientCapabilities = .conservative
    private var capabilitiesFetchedAt: Date?

    /// Navigation badge counts (plan 7.1 / 22.2). Refreshed with
    /// capabilities and whenever a screen that changes them asks.
    @Published private(set) var badges: ActivityBadges = .none

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

    func signUpWithEmail(_ email: String, password: String, username: String) async throws {
        let availability = try await ProfilesAPI.usernameAvailability(username)
        guard availability.available else { throw AuthError.usernameUnavailable }

        let response: AuthResponse
        do {
            response = try await client.auth.signUp(
                email: email,
                password: password,
                data: ["username": .string(username)]
            )
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("username") || message.contains("database error saving new user") {
                throw AuthError.usernameUnavailable
            }
            throw error
        }
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
        case usernameUnavailable

        var errorDescription: String? {
            switch self {
            case .emailConfirmationRequired:
                return "Check your email to confirm your account, then sign in."
            case .usernameUnavailable:
                return "That username was just taken. Try another one."
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

    /// Completes a native Sign in with Apple. The username completion gate
    /// applies exactly as it does for Google: the profile is created pending
    /// and RootView holds the user on the username screen.
    func signInWithApple(_ result: AppleSignIn.Result) async throws {
        _ = try await client.auth.signInWithIdToken(
            credentials: OpenIDConnectCredentials(
                provider: .apple,
                idToken: result.identityToken,
                nonce: result.rawNonce
            )
        )
        await loadProfile()

        // Apple shares the name only once; persist it if the profile has none.
        if let name = result.fullName, let current = profile,
           (current.displayName ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
            if let updated: Profile = try? await ProfilesAPI.updateMe(
                .init(displayName: name, bio: nil, avatarUrl: nil, isPublic: nil,
                      defaultPostAudience: nil, discoverable: nil, allowExactUsernameLookup: nil)
            ) {
                state = .signedIn(updated)
            }
        }

        // Hand the single-use authorization code to the server so the Apple
        // refresh token can be revoked at account deletion (App Store
        // 5.1.1(v)). Best-effort: a custody failure must not block sign-in.
        if let code = result.authorizationCode {
            await AuthAPI.linkAppleAuthorization(code: code)
        }
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

    /// Adopts a profile the caller already has in hand — used after a developer
    /// role switch, where the API returns the updated row. Republishing `state`
    /// is what swaps the tab bar over to the new role's screens.
    func applyProfile(_ profile: Profile) {
        state = .signedIn(profile)
        Task { await refreshCapabilities(force: true) }
    }

    func retryProfileLoad() async {
        state = .loading
        await loadProfile()
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

    /// Fetches capabilities when stale. Failures keep the last known value:
    /// the server enforces every flag on write, so presentation may lag.
    func refreshCapabilities(force: Bool = false) async {
        guard profile != nil, profile?.needsUsername == false else { return }
        if !force, let fetchedAt = capabilitiesFetchedAt,
           Date().timeIntervalSince(fetchedAt) < Double(capabilities.refreshAfterSeconds) {
            return
        }
        do {
            capabilities = try await CapabilitiesAPI.fetch()
            capabilitiesFetchedAt = Date()
        } catch {
            // Keep the previous snapshot.
        }
        await refreshBadges()
    }

    /// Best-effort badge refresh; a failure keeps the last counts rather than
    /// flashing zeros.
    func refreshBadges() async {
        guard profile != nil, profile?.needsUsername == false else {
            badges = .none
            return
        }
        if let fresh = try? await ProfilesAPI.activityBadges() {
            badges = fresh
        }
    }

    private func loadProfile() async {
        do {
            let profile: Profile = try await APIClient.shared.get("/api/profiles/me")
            state = .signedIn(profile)
            await refreshCapabilities(force: true)
        } catch {
            // Preserve the keychain session during transient API/network failures.
            // Let the user retry without creating a second authentication session.
            if case .signedIn = state { return }
            state = .profileUnavailable
        }
    }
}
