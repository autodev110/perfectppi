import SwiftUI
import UniformTypeIdentifiers

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
                NavigationLink {
                    PrivacyCenterView()
                } label: {
                    Label("Privacy & Account", systemImage: "hand.raised.fill")
                }
            }

            // Plan 4 / 31.4: Community Guidelines and a monitored Help & Safety
            // path must be reachable inside the app, not only on the website.
            Section {
                ForEach(PolicyPage.allCases) { page in
                    PolicyLinkRow(page: page)
                }
            } header: {
                Text("Help & Safety")
            } footer: {
                Text("PerfectPPI is not an emergency service. For immediate danger, contact local emergency services.")
            }

            // Mirrors the web switcher, which appears in every portal's
            // settings page. Hidden entirely for ordinary accounts.
            if currentProfile.canSwitchRoles {
                Section {
                    NavigationLink {
                        RoleSwitcherView()
                    } label: {
                        Label("Switch Role", systemImage: "hammer.fill")
                    }
                } header: {
                    Text("Developer")
                } footer: {
                    Text("Switch this account into any role to see the app as that role.")
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

private enum PrivacyRequestType: String, CaseIterable, Identifiable {
    case access, correction, optOut = "opt_out", appeal

    var id: String { rawValue }
    var label: String {
        switch self {
        case .access: "Access my data"
        case .correction: "Correct my data"
        case .optOut: "Privacy opt-out"
        case .appeal: "Appeal a decision"
        }
    }
}

private struct PrivacyRequestRecord: Decodable, Identifiable {
    let id: String
    let requestType: String
    let status: String
}

private struct PrivacyRequestBody: Encodable {
    let requestType: String
    let details: String?
    let deletionConfirmation: String?
}

private struct ConnectedIdentity: Decodable, Identifiable {
    let id: String
    let provider: String
}

private struct DisconnectIdentityBody: Encodable {
    let provider = "google"
}

private struct DisconnectResult: Decodable {
    let disconnected: Bool
}

private struct PrivacyCenterView: View {
    @State private var requestType = PrivacyRequestType.access
    @State private var details = ""
    @State private var deletionConfirmation = ""
    @State private var requests: [PrivacyRequestRecord] = []
    @State private var identities: [ConnectedIdentity] = []
    @State private var safetyRelationships = ProfilesAPI.SafetyRelationships(blocked: [], muted: [])
    @State private var working = false
    @State private var message: String?
    @State private var exportDocument: PrivacyExportDocument?
    @State private var showingExporter = false

    var body: some View {
        Form {
            Section("Legal") {
                Link("Privacy Policy", destination: legalURL("privacy"))
                Link("Terms of Service", destination: legalURL("terms"))
                Link("Notice at Collection", destination: legalURL("notice-at-collection"))
                Link("Privacy Choices", destination: legalURL("privacy-choices"))
                Link("AI Disclosure", destination: legalURL("ai-disclosure"))
            }

            Section {
                Button("Download My Data", systemImage: "square.and.arrow.down") {
                    Task { await downloadExport() }
                }
                .disabled(working)
            } header: {
                Text("Account Export")
            } footer: {
                Text("Downloads a JSON copy of your account, inspections, vehicles, posts, messages, and related records.")
            }

            Section {
                Picker("Request", selection: $requestType) {
                    ForEach(PrivacyRequestType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
                TextField("Details (optional)", text: $details, axis: .vertical)
                    .lineLimit(2...5)
                Button("Submit Privacy Request") {
                    Task { await submit(type: requestType.rawValue) }
                }
                .disabled(working)
            } header: {
                Text("Privacy Requests")
            } footer: {
                Text("We may verify your identity before completing a request.")
            }

            if !requests.isEmpty {
                Section("Recent Requests") {
                    ForEach(requests.prefix(5)) { request in
                        LabeledContent(
                            request.requestType.replacingOccurrences(of: "_", with: " ").capitalized,
                            value: request.status.replacingOccurrences(of: "_", with: " ").capitalized
                        )
                    }
                }
            }

            if identities.contains(where: { $0.provider == "google" }) {
                Section {
                    Button("Disconnect Google") {
                        Task { await disconnectGoogle() }
                    }
                    .disabled(working)
                } header: {
                    Text("Connected Sign-In")
                } footer: {
                    Text("Another sign-in method is required before Google can be disconnected.")
                }
            }

            Section("Blocked Accounts") {
                if safetyRelationships.blocked.isEmpty {
                    Text("No blocked accounts").foregroundStyle(.secondary)
                } else {
                    ForEach(safetyRelationships.blocked) { person in
                        HStack {
                            Text(person.displayName ?? person.username.map { "@\($0)" } ?? "PerfectPPI member")
                            Spacer()
                            Button("Unblock") { Task { await removeSafetySetting(person.id, kind: "block") } }
                                .disabled(working)
                        }
                    }
                }
            }

            Section("Muted Accounts") {
                if safetyRelationships.muted.isEmpty {
                    Text("No muted accounts").foregroundStyle(.secondary)
                } else {
                    ForEach(safetyRelationships.muted) { person in
                        HStack {
                            Text(person.displayName ?? person.username.map { "@\($0)" } ?? "PerfectPPI member")
                            Spacer()
                            Button("Unmute") { Task { await removeSafetySetting(person.id, kind: "mute") } }
                                .disabled(working)
                        }
                    }
                }
            }

            Section {
                TextField("Type DELETE to confirm", text: $deletionConfirmation)
                    .textInputAutocapitalization(.characters)
                Button("Request Account Deletion", role: .destructive) {
                    Task { await submit(type: "deletion", confirmation: deletionConfirmation) }
                }
                .disabled(working || deletionConfirmation != "DELETE")
            } header: {
                Text("Delete Account")
            } footer: {
                Text("This schedules permanent deletion, normally beginning within 24 hours. Processing pauses only where a documented legal preservation hold applies. Removing the app does not delete your account.")
            }

            if let message {
                Section { Text(message) }
            }
        }
        .navigationTitle("Privacy & Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .fileExporter(
            isPresented: $showingExporter,
            document: exportDocument,
            contentType: .json,
            defaultFilename: "perfectppi-account-data"
        ) { result in
            if case let .failure(error) = result {
                message = error.localizedDescription
            }
            exportDocument = nil
        }
    }

    private func load() async {
        do {
            async let requestLoad: [PrivacyRequestRecord] = APIClient.shared.get("/api/privacy/requests")
            async let identityLoad: [ConnectedIdentity] = APIClient.shared.get("/api/account/identities")
            async let safetyLoad = ProfilesAPI.safetyRelationships()
            requests = try await requestLoad
            identities = try await identityLoad
            safetyRelationships = try await safetyLoad
        } catch {
            message = error.localizedDescription
        }
    }

    private func removeSafetySetting(_ profileId: String, kind: String) async {
        working = true
        defer { working = false }
        do {
            try await ProfilesAPI.setRelationship(profileId: profileId, kind: kind, enabled: false)
            safetyRelationships = try await ProfilesAPI.safetyRelationships()
        } catch {
            message = error.localizedDescription
        }
    }

    private func submit(type: String, confirmation: String? = nil) async {
        working = true
        message = nil
        defer { working = false }
        do {
            let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
            let _: PrivacyRequestRecord = try await APIClient.shared.postCamel(
                "/api/privacy/requests",
                body: PrivacyRequestBody(
                    requestType: type,
                    details: trimmed.isEmpty ? nil : trimmed,
                    deletionConfirmation: confirmation
                )
            )
            details = ""
            deletionConfirmation = ""
            message = type == "deletion"
                ? "Account deletion is scheduled and normally begins within 24 hours."
                : "Request submitted. We will contact you if verification is needed."
            await load()
        } catch {
            message = error.localizedDescription
        }
    }

    private func downloadExport() async {
        working = true
        message = nil
        defer { working = false }
        do {
            let (data, _) = try await APIClient.shared.bytes("/api/privacy/export")
            exportDocument = PrivacyExportDocument(data: data)
            showingExporter = true
        } catch {
            message = error.localizedDescription
        }
    }

    private func disconnectGoogle() async {
        working = true
        message = nil
        defer { working = false }
        do {
            let _: DisconnectResult = try await APIClient.shared.delete(
                "/api/account/identities",
                body: DisconnectIdentityBody()
            )
            message = "Google was disconnected."
            await load()
        } catch {
            message = error.localizedDescription
        }
    }
}

private struct PrivacyExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
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
    @State private var bio: String
    @State private var isPublic: Bool
    @State private var defaultAudience: CommunityPostAudience
    @State private var discoverable: Bool
    @State private var allowExactUsernameLookup: Bool
    @State private var friendRequestPolicy: FriendRequestPolicy
    @State private var showingAdvanced = false
    @State private var saving = false
    @State private var error: String?

    init(profile: Profile, onSave: @escaping (Profile) -> Void) {
        self.profile = profile
        self.onSave = onSave
        _displayName = State(initialValue: profile.displayName ?? "")
        _bio = State(initialValue: profile.bio ?? "")
        _isPublic = State(initialValue: profile.isPublic ?? true)
        _defaultAudience = State(initialValue: profile.defaultPostAudience ?? .friends)
        _discoverable = State(initialValue: profile.discoverable ?? true)
        _allowExactUsernameLookup = State(initialValue: profile.allowExactUsernameLookup ?? true)
        _friendRequestPolicy = State(initialValue: profile.friendRequestPolicy ?? .everyone)
    }

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Display name", text: $displayName)
                if let username = profile.username {
                    LabeledContent("Username", value: "@\(username)")
                    Text("Usernames cannot be changed yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                TextField("Bio", text: $bio, axis: .vertical)
                    .lineLimit(3...6)
            }

            // Plan 9.3: privacy and the default audience first; granular
            // choices under Advanced Privacy with their defaults spelled out.
            Section {
                Toggle("Public inside PerfectPPI", isOn: $isPublic)
                Picker("Default post audience", selection: $defaultAudience) {
                    Text("Friends").tag(CommunityPostAudience.friends)
                    if isPublic { Text("Public inside PerfectPPI").tag(CommunityPostAudience.public) }
                }
                if let username = profile.username {
                    NavigationLink {
                        MemberProfileView(username: username, asStranger: true)
                    } label: {
                        Label("View as stranger", systemImage: "eye")
                    }
                }
            } header: {
                Text("Privacy")
            } footer: {
                Text("Turning your profile private immediately changes Public profile posts to Friends. Nothing is published to the open web.")
            }
            .onChange(of: isPublic) { _, value in
                if !value { defaultAudience = .friends }
            }

            Section {
                DisclosureGroup("Advanced privacy", isExpanded: $showingAdvanced) {
                    Toggle("Appear in discovery", isOn: $discoverable)
                    Toggle("Allow exact username lookup", isOn: $allowExactUsernameLookup)
                    Picker("Friend requests from", selection: $friendRequestPolicy) {
                        ForEach(FriendRequestPolicy.allCases) { policy in
                            Text(policy.label).tag(policy)
                        }
                    }
                    Text("Defaults: discovery on, exact lookup on, requests from everyone. Blocked members can never send you a request.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func save() async {
        guard !saving, canSave else { return }
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)

        saving = true
        defer { saving = false }
        do {
            let updated = try await ProfilesAPI.updateMe(
                .init(
                    displayName: trimmedDisplayName.isEmpty ? nil : trimmedDisplayName,
                    bio: trimmedBio.isEmpty ? nil : trimmedBio,
                    avatarUrl: nil,
                    isPublic: isPublic,
                    defaultPostAudience: isPublic ? defaultAudience : .friends,
                    discoverable: discoverable,
                    allowExactUsernameLookup: allowExactUsernameLookup,
                    friendRequestPolicy: friendRequestPolicy
                )
            )
            onSave(updated)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
