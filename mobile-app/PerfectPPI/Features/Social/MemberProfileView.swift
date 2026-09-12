import SwiftUI

/// The social profile another member sees (plan 9.1): identity, badges,
/// mutual friends, the friendship control, and Posts / Garage / About. Every
/// section arrives already filtered by the server; a private profile that is
/// not a friend simply has empty sections with an explanation.
struct MemberProfileView: View {
    let username: String
    /// Plan 9.3 "View as Stranger": the owner's privacy preview.
    var asStranger: Bool = false

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await SocialAPI.memberProfile(username: username, asStranger: asStranger) },
            loaded: { profile in
                MemberProfileContent(profile: profile, isPreview: asStranger, reload: { reloadToken = UUID() })
            },
            failure: { error, retry in
                if let apiError = error as? APIError, case .notFound = apiError {
                    EmptyStateCard(
                        title: "Profile unavailable",
                        message: "This member is not available right now.",
                        systemImage: "person.crop.circle.badge.xmark"
                    )
                    .padding()
                } else {
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            }
        )
        .id(reloadToken)
        .navigationTitle(asStranger ? "Preview as stranger" : "@\(username)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private enum MemberProfileSection: String, CaseIterable, Identifiable {
    case posts, garage, about
    var id: String { rawValue }
    var label: String {
        switch self {
        case .posts: "Posts"
        case .garage: "Garage"
        case .about: "About"
        }
    }
}

private struct MemberProfileContent: View {
    let profile: MemberProfile
    var isPreview: Bool = false
    let reload: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var relationship: FriendRelationshipState
    @State private var section: MemberProfileSection = .posts
    @State private var confirmingBlock = false
    @State private var muted: Bool
    @State private var openConversationId: String?
    @State private var messaging = false
    @State private var error: String?

    init(profile: MemberProfile, isPreview: Bool = false, reload: @escaping () -> Void) {
        self.profile = profile
        self.isPreview = isPreview
        self.reload = reload
        _relationship = State(initialValue: profile.relationship.state)
        _muted = State(initialValue: profile.relationship.mutedByMe)
    }

    private var identity: MemberProfileIdentity { profile.profile }
    // In preview mode the owner is rendered as a stranger would see them.
    private var isMe: Bool { !isPreview && (relationship == .me || auth.profile?.id == identity.id) }
    private var name: String { identity.displayName ?? identity.username.map { "@\($0)" } ?? "PerfectPPI member" }
    private var canMessage: Bool { !isMe && relationship == .friends }

    var body: some View {
        List {
            if isPreview {
                Section {
                    Label(
                        "This is what a signed-in member who is not your friend sees. Friends see anything you mark Friends; nobody outside PerfectPPI sees your profile.",
                        systemImage: "eye"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
            }

            Section {
                header
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))

            Section {
                Picker("Section", selection: $section) {
                    ForEach(MemberProfileSection.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            }

            switch section {
            case .posts: postsSection
            case .garage: garageSection
            case .about: aboutSection
            }
        }
        .listStyle(.insetGrouped)
        .toolbar {
            if !isPreview, let handle = identity.username {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: ShareLinks.profile(username: handle)) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share profile")
                }
            }
            if !isMe && !isPreview {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(muted ? "Unmute Member" : "Mute Member", systemImage: muted ? "speaker.wave.2" : "speaker.slash") {
                            Task { await setRelationship(kind: "mute", enabled: !muted) }
                        }
                        Button("Block Member", systemImage: "hand.raised", role: .destructive) {
                            confirmingBlock = true
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Member options")
                }
            }
        }
        .confirmationDialog("Block this member?", isPresented: $confirmingBlock, titleVisibility: .visible) {
            Button("Block Member", role: .destructive) { Task { await setRelationship(kind: "block", enabled: true) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will no longer see or be able to contact each other. Any pending friend request is cancelled.")
        }
        .navigationDestination(item: $openConversationId) { conversationId in
            MessageThreadView(conversationId: conversationId, currentProfileId: auth.profile?.id)
        }
        .alert("Something went wrong", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Avatar(name: name, size: 64)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.title3.weight(.bold))
                    if let username = identity.username {
                        Text("@\(username)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if !isMe && profile.relationship.mutualFriendCount > 0 {
                        Label(
                            "\(profile.relationship.mutualFriendCount) mutual friend\(profile.relationship.mutualFriendCount == 1 ? "" : "s")",
                            systemImage: "person.2"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    if !identity.isPublic && !isMe {
                        Label("Private profile", systemImage: "lock")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }

            if !identity.badges.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(identity.badges, id: \.code) { badge in
                            Label(badge.label, systemImage: "wrench.and.screwdriver")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Theme.Palette.primary.opacity(0.12))
                                .foregroundStyle(Theme.Palette.primary)
                                .clipShape(Capsule())
                                .accessibilityLabel("\(badge.label): \(badge.description)")
                        }
                    }
                }
            }

            if let bio = identity.bio, !bio.isEmpty {
                Text(bio)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
            }

            if isPreview {
                // Inert controls: they show the affordance a stranger gets.
                HStack(spacing: 10) {
                    Label("Add Friend", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Theme.Palette.primary.opacity(0.12))
                        .foregroundStyle(Theme.Palette.primary)
                        .clipShape(Capsule())
                }
                .accessibilityLabel("Strangers can send you a friend request")
            } else if !isMe {
                HStack(spacing: 10) {
                    FriendActionButton(
                        profileId: identity.id,
                        state: $relationship,
                        enabled: profile.relationship.friendsEnabled
                    ) { _ in reload() }
                    if canMessage {
                        Button {
                            Task { await message() }
                        } label: {
                            Label(messaging ? "Opening…" : "Message", systemImage: "message")
                                .font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.bordered)
                        .disabled(messaging)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var postsSection: some View {
        if profile.posts.isEmpty {
            Section {
                EmptyStateCard(
                    title: profile.relationship.canViewRestricted || identity.isPublic ? "No posts yet" : "Posts are for friends",
                    message: profile.relationship.canViewRestricted || identity.isPublic
                        ? "Posts \(isMe ? "you" : name) publish to the Community will appear here."
                        : "This profile is private. Send a friend request to see their posts.",
                    systemImage: "text.bubble"
                )
                .listRowBackground(Color.clear)
            }
        } else {
            Section {
                ForEach(profile.posts) { post in
                    NavigationLink {
                        CommunityPostDetailView(post: post) { reload() }
                    } label: {
                        CommunityPostRow(post: post) { reload() }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var garageSection: some View {
        if profile.vehicles.isEmpty {
            Section {
                EmptyStateCard(
                    title: "No public vehicles",
                    message: identity.isPublic || profile.relationship.canViewRestricted
                        ? "Vehicles this member makes public will appear here."
                        : "This profile is private. Vehicles are shared with friends only.",
                    systemImage: "car"
                )
                .listRowBackground(Color.clear)
            }
        } else {
            Section("Garage") {
                ForEach(profile.vehicles) { vehicle in
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10).fill(Theme.Palette.subtle)
                            if let media = vehicle.vehicleMedia.first, let url = URL(string: media.url) {
                                AsyncImage(url: url) { image in
                                    image.resizable().scaledToFill()
                                } placeholder: {
                                    Image(systemName: "car").foregroundStyle(.secondary)
                                }
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            } else {
                                Image(systemName: "car").foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 64, height: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(vehicle.label).font(.subheadline.weight(.semibold))
                            if let mileage = vehicle.mileage {
                                Text("\(mileage.formatted()) mi").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            if !profile.listings.isEmpty {
                Section("For sale") {
                    ForEach(profile.listings) { listing in
                        HStack {
                            Image(systemName: "tag").foregroundStyle(Theme.Palette.primary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(listing.title).font(.subheadline.weight(.semibold))
                                Text("$\((listing.askingPriceCents / 100).formatted())" + (listing.location.map { " · \($0)" } ?? ""))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var aboutSection: some View {
        Section("About") {
            if let joined = identity.createdAt {
                LabeledContent("Member since", value: joined.formatted(date: .abbreviated, time: .omitted))
            }
            LabeledContent("Profile", value: identity.isPublic ? "Public inside PerfectPPI" : "Private")
            if let contributions = profile.contributions, contributions.hasContributions {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Community contributions").font(.subheadline.weight(.semibold))
                    Text("Current facts from active contributions visible to you, not a popularity score.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    contributionRow("Accepted answers", value: contributions.acceptedAnswers)
                    contributionRow("Helpful marks", value: contributions.helpfulMarks)
                    contributionRow("Issues fixed", value: contributions.fixedIssues)
                    contributionRow("Issues helped", value: contributions.helpedIssues)
                    contributionRow("Inspections completed", value: contributions.completedInspections)
                }
                .padding(.vertical, 4)
            }
            ForEach(identity.badges, id: \.code) { badge in
                VStack(alignment: .leading, spacing: 2) {
                    Text(badge.label).font(.subheadline.weight(.semibold))
                    Text(badge.description).font(.caption).foregroundStyle(.secondary)
                }
            }
            if identity.bio == nil && !isMe && !profile.relationship.canViewRestricted && !identity.isPublic {
                Text("Bio and activity are shared with friends only.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func contributionRow(_ label: String, value: Int) -> some View {
        if value > 0 {
            LabeledContent(label, value: value.formatted())
                .font(.caption)
        }
    }

    @MainActor
    private func message() async {
        guard !messaging else { return }
        messaging = true
        defer { messaging = false }
        do {
            let result = try await MessagesAPI.createConversation(participantId: identity.id)
            openConversationId = result.conversationId
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func setRelationship(kind: String, enabled: Bool) async {
        do {
            try await ProfilesAPI.setRelationship(profileId: identity.id, kind: kind, enabled: enabled)
            if kind == "mute" {
                muted = enabled
            } else {
                // Blocking makes the profile unavailable to both sides.
                dismiss()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
