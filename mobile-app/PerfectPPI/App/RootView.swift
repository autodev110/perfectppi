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
