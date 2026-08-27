import SwiftUI

/// Developer-only role switcher, the iOS counterpart of the card that appears
/// on every portal's settings page on the web.
///
/// Switching rewrites the account's role for real, so the whole app — tab bar,
/// permissions, data — becomes that role's. Publishing the returned profile
/// back into AuthStore is what swaps the screens over; there is no reopen step.
struct RoleSwitcherView: View {
    @EnvironmentObject private var auth: AuthStore

    /// Shown above the list when the switcher is standing in for a portal
    /// (the developer role has no tabs of its own).
    var showsStandaloneHeader: Bool = false

    @State private var pending: UserRole?
    @State private var errorMessage: String?

    private var currentRole: UserRole? { auth.profile?.role }

    var body: some View {
        List {
            if showsStandaloneHeader {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("This account is on the developer role.")
                            .font(.headline)
                        Text("Pick a role below to use the app as that role. Everything — navigation, permissions and data — becomes exactly what a normal account of that role sees.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                ForEach(UserRole.switchable, id: \.self) { role in
                    Button {
                        switchTo(role)
                    } label: {
                        RoleRow(
                            role: role,
                            isCurrent: role == currentRole,
                            isLoading: pending == role
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(pending != nil || role == currentRole)
                }
            } header: {
                Text("Switch role")
            } footer: {
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else {
                    Text("Switching to Technician or Organization Manager provisions the supporting records once, then reuses them.")
                }
            }

            if showsStandaloneHeader {
                Section {
                    Button(role: .destructive) {
                        Task {
                            await PushService.shared.unregister()
                            await auth.signOut()
                        }
                    } label: {
                        Text("Sign Out")
                    }
                }
            }
        }
        .navigationTitle("Developer")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func switchTo(_ role: UserRole) {
        guard pending == nil else { return }
        pending = role
        errorMessage = nil

        Task {
            do {
                let updated = try await ProfilesAPI.switchRole(role)
                // Republishing the profile re-renders RootView, which swaps in
                // the new role's tab bar.
                auth.applyProfile(updated)
            } catch {
                errorMessage = (error as? APIError)?.localizedDescription
                    ?? error.localizedDescription
            }
            pending = nil
        }
    }
}

private struct RoleRow: View {
    let role: UserRole
    let isCurrent: Bool
    let isLoading: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: role.icon)
                .frame(width: 26)
                .foregroundStyle(isCurrent ? Color.accentColor : .secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(role.label)
                    .font(.body.weight(isCurrent ? .semibold : .regular))
                    .foregroundStyle(.primary)
                Text(role.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if isLoading {
                ProgressView()
            } else if isCurrent {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.accentColor)
            }
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }
}
