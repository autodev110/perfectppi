import SwiftUI

/// Top-level switchboard — picks a screen tree based on the auth state and
/// the user's role.
struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        switch auth.state {
        case .loading, .lockedBiometric:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemBackground).ignoresSafeArea())
        case .signedOut:
            LoginView()
        case .signedIn(let profile):
            SignedInContainer(profile: profile)
        }
    }
}

private struct SignedInContainer: View {
    @EnvironmentObject private var auth: AuthStore
    let profile: Profile

    var body: some View {
        Group {
            // Each role gets its own tab bar / nav stack. If role is missing
            // (shouldn't happen for /api/profiles/me but guard anyway), drop
            // the user to sign-in to avoid an empty screen.
            switch profile.role {
            case .consumer:
                ConsumerTabs(profile: profile)
            case .technician:
                TechnicianTabs(profile: profile)
            case .orgManager:
                OrganizationTabs(profile: profile)
            case .admin:
                AdminTabs(profile: profile)
            case .developer:
                DeveloperRoleView()
            case .none:
                MissingRoleView()
            }
        }
        .task {
            // Register for push after first sign-in. The user is prompted
            // once and the result is sent to /api/notifications/devices.
            await PushService.shared.requestAuthorizationAndRegister()
        }
    }
}

/// The developer role is a parking spot on the web role switcher, not a portal.
/// There is nothing to show until the account picks a real role, which happens
/// in web settings — so say that rather than dropping the user on a blank tab
/// bar or an error that reads like a failure.
private struct DeveloperRoleView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "hammer")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("This account is on the developer role.")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Switch to a consumer, technician, organization or admin role in web settings, then reopen the app.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .frame(maxWidth: 220)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MissingRoleView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Couldn't load your account role.")
                .multilineTextAlignment(.center)
            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .frame(maxWidth: 220)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
