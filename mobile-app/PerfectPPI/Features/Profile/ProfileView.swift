import SwiftUI

struct ProfileView: View {
    let profile: Profile
    @EnvironmentObject private var auth: AuthStore
    @State private var currentProfile: Profile
    @AppStorage(AppAppearance.storageKey) private var appearanceRaw = AppAppearance.system.rawValue

    init(profile: Profile) {
        self.profile = profile
        _currentProfile = State(initialValue: profile)
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    AvatarView(url: currentProfile.avatarUrl,
                               initials: avatarInitials,
                               size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(currentProfile.fullName ?? currentProfile.email ?? "—")
                            .font(.headline)
                        if let username = currentProfile.username {
                            Text("@\(username)").font(.caption).foregroundStyle(.secondary)
                        }
                        Text(currentProfile.role?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized ?? "")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Account") {
                LabeledContent("Email", value: currentProfile.email ?? "—")
                if let username = currentProfile.username {
                    LabeledContent("Username", value: username)
                }
                LabeledContent("Role",
                               value: currentProfile.role?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized ?? "—")
            }

            Section("Preferences") {
                Picker(selection: $appearanceRaw) {
                    ForEach(AppAppearance.allCases) { option in
                        Label(option.label, systemImage: option.icon).tag(option.rawValue)
                    }
                } label: {
                    Label("Appearance", systemImage: "paintbrush.fill")
                }
                .pickerStyle(.menu)
            }

            Section {
                NavigationLink("Edit Profile") {
                    EditProfileView(profile: currentProfile) { updated in
                        currentProfile = updated
                    }
                }
                // Only show the Notifications shortcut for consumers — every
                // other role already has an Inbox tab in their tab bar, so
                // a duplicate here is just navigational noise.
                if currentProfile.role == .consumer {
                    NavigationLink("Notifications") {
                        NotificationsView()
                    }
                }
            }

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
        .navigationTitle("Profile")
    }

    private var avatarInitials: String {
        let source = currentProfile.fullName ?? currentProfile.email ?? "?"
        let parts = source.split(separator: " ").prefix(2)
        let initials = parts.compactMap { $0.first }.map(String.init).joined()
        return initials.isEmpty ? "?" : initials.uppercased()
    }
}

/// Renders an avatar image (from URL) or a fallback initials circle.
private struct AvatarView: View {
    let url: String?
    let initials: String
    let size: CGFloat

    var body: some View {
        Group {
            if let urlString = url, let parsed = URL(string: urlString) {
                AsyncImage(url: parsed) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    case .failure, .empty:
                        initialsView
                    @unknown default:
                        initialsView
                    }
                }
            } else {
                initialsView
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    @ViewBuilder
    private var initialsView: some View {
        ZStack {
            Circle().fill(Theme.Palette.primary.opacity(0.18))
            Text(initials)
                .font(.headline.weight(.semibold))
                .foregroundStyle(Theme.Palette.primary)
        }
    }
}

private struct EditProfileView: View {
    let profile: Profile
    let onSave: (Profile) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var displayName: String
    @State private var username: String
    @State private var bio: String
    @State private var isPublic: Bool
    @State private var saving = false
    @State private var error: String?

    init(profile: Profile, onSave: @escaping (Profile) -> Void) {
        self.profile = profile
        self.onSave = onSave
        _displayName = State(initialValue: profile.displayName ?? "")
        _username = State(initialValue: profile.username ?? "")
        _bio = State(initialValue: profile.bio ?? "")
        _isPublic = State(initialValue: profile.isPublic ?? true)
    }

    var body: some View {
        Form {
            Section("Public Profile") {
                TextField("Display name", text: $displayName)
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Bio", text: $bio, axis: .vertical)
                    .lineLimit(3...6)
                Toggle("Public profile", isOn: $isPublic)
            }

            if let error {
                Text(error).foregroundStyle(Theme.Palette.danger)
            }
        }
        .navigationTitle("Edit Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : "Save") {
                    Task { await save() }
                }
                .disabled(saving || !canSave)
            }
        }
    }

    private var canSave: Bool {
        let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedUsername.isEmpty else { return true }
        guard (3...30).contains(trimmedUsername.count) else { return false }
        return trimmedUsername.range(
            of: "^[A-Za-z0-9_-]+$",
            options: .regularExpression
        ) != nil
    }

    private func save() async {
        guard !saving, canSave else { return }
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)

        saving = true
        defer { saving = false }
        do {
            let updated = try await ProfilesAPI.updateMe(
                .init(
                    displayName: trimmedDisplayName.isEmpty ? nil : trimmedDisplayName,
                    username: trimmedUsername.isEmpty ? nil : trimmedUsername,
                    bio: trimmedBio.isEmpty ? nil : trimmedBio,
                    avatarUrl: nil,
                    isPublic: isPublic
                )
            )
            onSave(updated)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
