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
        case .profileUnavailable:
            ContentUnavailableView {
                Label("Account temporarily unavailable", systemImage: "wifi.exclamationmark")
            } description: {
                Text("Your session is still secure. Check your connection and try loading your account again.")
            } actions: {
                Button("Try Again") { Task { await auth.retryProfileLoad() } }
                Button("Sign Out", role: .destructive) { Task { await auth.signOut() } }
            }
        case .signedIn(let profile):
            SignedInContainer(profile: profile)
        }
    }
}

private struct SignedInContainer: View {
    @EnvironmentObject private var auth: AuthStore
    let profile: Profile
    @State private var hasAcceptedCurrentTerms: Bool?
    @State private var termsError: String?

    var body: some View {
        Group {
            if profile.needsUsername {
                UsernameCompletionView()
            } else if hasAcceptedCurrentTerms == true {
                roleContent
            } else if hasAcceptedCurrentTerms == false {
                LegalAcceptanceView {
                    hasAcceptedCurrentTerms = true
                }
            } else if let termsError {
                ContentUnavailableView {
                    Label("Terms unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(termsError)
                } actions: {
                    Button("Try Again") { Task { await checkTerms() } }
                    Button("Sign Out", role: .destructive) { Task { await auth.signOut() } }
                }
            } else {
                ProgressView("Checking account terms…")
            }
        }
        .task(id: profile.usernameState) {
            if !profile.needsUsername {
                await checkTerms()
            }
        }
    }

    @ViewBuilder
    private var roleContent: some View {
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
            DeveloperRoleTree()
        case .none:
            MissingRoleView()
        }
    }

    private func checkTerms() async {
        termsError = nil
        hasAcceptedCurrentTerms = nil
        do {
            let status: LegalAcceptanceStatus = try await APIClient.shared.get("/api/legal/accept")
            hasAcceptedCurrentTerms = status.accepted
            if status.accepted {
                await PushService.shared.requestAuthorizationAndRegister()
            }
        } catch {
            termsError = error.localizedDescription
        }
    }
}

private struct UsernameCompletionView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var username = ""
    @State private var availability: Availability = .idle
    @State private var saving = false
    @State private var error: String?

    private enum Availability {
        case idle, checking, available, unavailable
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Image(systemName: "at.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(Theme.Palette.primary)
                    Text("Choose your username")
                        .font(.largeTitle.bold())
                    Text("This is how other PerfectPPI members will recognize you. We never create it from your email or legal name.")
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        Text("@").font(.headline).foregroundStyle(.secondary)
                        TextField("driver_name", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.username)
                            .accessibilityLabel("Username")
                        if availability == .checking { ProgressView().controlSize(.small) }
                        if availability == .available {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        }
                    }
                    .padding(16)
                    .background(Theme.Palette.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))

                    Text("4–16 characters. Letters, numbers, and underscores only. Usernames cannot be changed yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if usernameIsValid && availability == .unavailable {
                        Text("Username is unavailable.")
                            .font(.callout)
                            .foregroundStyle(Theme.Palette.danger)
                    }
                    if let error {
                        Text(error).foregroundStyle(Theme.Palette.danger)
                    }

                    Button(saving ? "Saving…" : "Continue") {
                        Task { await save() }
                    }
                    .buttonStyle(PrimaryButtonStyle(isLoading: saving))
                    .disabled(saving || !usernameIsValid)

                    Button("Sign Out", role: .destructive) {
                        Task { await auth.signOut() }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(28)
            }
            .task(id: username) { await checkAvailability() }
        }
    }

    private var usernameIsValid: Bool {
        let value = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (4...16).contains(value.count) else { return false }
        return value.range(of: "^[A-Za-z0-9_]+$", options: .regularExpression) != nil
    }

    private func checkAvailability() async {
        availability = .idle
        guard usernameIsValid else { return }
        do {
            try await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            availability = .checking
            let result = try await ProfilesAPI.usernameAvailability(
                username.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            availability = result.available ? .available : .unavailable
        } catch is CancellationError {
            return
        } catch {
            availability = .idle
        }
    }

    private func save() async {
        guard !saving, usernameIsValid else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let profile = try await ProfilesAPI.claimUsername(
                username.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            auth.applyProfile(profile)
        } catch {
            self.error = error.localizedDescription
            availability = .unavailable
        }
    }
}

struct LegalAcceptanceStatus: Decodable {
    let accepted: Bool
    let version: String
}

private struct LegalAcceptanceBody: Encodable {
    let accepted = true
    let source = "reauth"
}

private struct LegalAcceptanceView: View {
    let onAccepted: () -> Void
    @State private var accepting = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 44))
                        .foregroundStyle(Theme.Palette.primary)
                    Text("Review the current Terms")
                        .font(.largeTitle.bold())
                    Text("You must review and accept the current Terms of Service before continuing. The Privacy Policy explains how PerfectPPI handles information and is not a separate consent.")
                        .foregroundStyle(.secondary)
                    Link("Terms of Service", destination: legalURL("terms"))
                    Link("Privacy Policy", destination: legalURL("privacy"))
                    Link("Notice at Collection", destination: legalURL("notice-at-collection"))
                    if let error {
                        Text(error).foregroundStyle(Theme.Palette.danger)
                    }
                    Button(accepting ? "Accepting…" : "I Agree to the Terms") {
                        Task { await accept() }
                    }
                    .buttonStyle(PrimaryButtonStyle(isLoading: accepting))
                    .disabled(accepting)
                    Text("Acceptance is recorded with the Terms version and time.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(28)
            }
        }
    }

    private func accept() async {
        accepting = true
        error = nil
        defer { accepting = false }
        do {
            let _: LegalAcceptanceStatus = try await APIClient.shared.postCamel(
                "/api/legal/accept",
                body: LegalAcceptanceBody()
            )
            onAccepted()
            await PushService.shared.requestAuthorizationAndRegister()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

func legalURL(_ path: String) -> URL {
    URL(string: "https://\(AppConfig.universalLinkHost)/\(path)")!
}

/// The developer role has no tab bar of its own, so the switcher stands in for
/// one. Picking a role here swaps this whole tree for that role's tabs — the
/// same one-tap behaviour as the web settings card, with no reopen step.
private struct DeveloperRoleTree: View {
    var body: some View {
        NavigationStack {
            RoleSwitcherView(showsStandaloneHeader: true)
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
