import SwiftUI

struct CommunityGroupsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()
    @State private var showingCreate = false
    @State private var creationEnabled = false

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: {
                    let directory = try await CommunityAPI.groups()
                    creationEnabled = directory.creationEnabled ?? false
                    return directory
                },
                loaded: { directory in
                    Group {
                        if !directory.enabled {
                            EmptyStateCard(
                                title: "Groups are unavailable",
                                message: "Community groups are temporarily paused.",
                                systemImage: "person.3"
                            )
                            .padding()
                        } else if directory.groups.isEmpty {
                            EmptyStateCard(
                                title: "Groups are being prepared",
                                message: "Staff-curated vehicle communities will appear here.",
                                systemImage: "person.3"
                            )
                            .padding()
                        } else {
                            List {
                                let suggested = directory.groups.filter(\.isSuggested)
                                if !suggested.isEmpty {
                                    Section("Suggested from your Garage") {
                                        ForEach(suggested) { group in groupLink(group) }
                                    }
                                }
                                Section("All groups") {
                                    ForEach(directory.groups.filter { !$0.isSuggested }) { group in
                                        groupLink(group)
                                    }
                                }
                            }
                            .listStyle(.insetGrouped)
                        }
                    }
                },
                failure: { error, retry in
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            )
            .id(reloadToken)
            .navigationTitle("Groups")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                if creationEnabled {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showingCreate = true } label: { Image(systemName: "plus") }
                            .accessibilityLabel("Create group")
                    }
                }
            }
            .sheet(isPresented: $showingCreate) {
                NavigationStack {
                    GroupSettingsView(mode: .create) { _ in reloadToken = UUID() }
                }
            }
        }
    }

    private func groupLink(_ group: CommunityGroupSummary) -> some View {
        NavigationLink {
            CommunityGroupDetailView(slug: group.slug) { reloadToken = UUID() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: group.vehicleMake == nil ? "wrench.and.screwdriver.fill" : "car.fill")
                    .frame(width: 42, height: 42)
                    .background(Theme.Palette.primary.opacity(0.12))
                    .foregroundStyle(Theme.Palette.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(group.name).font(.headline)
                        if group.isStaffCurated == true {
                            Image(systemName: "checkmark.shield.fill")
                                .font(.caption)
                                .foregroundStyle(Theme.Palette.primary)
                                .accessibilityLabel("PerfectPPI curated")
                        }
                    }
                    Text("\(group.memberCount) member\(group.memberCount == 1 ? "" : "s")"
                         + (group.locationRegion.map { " · \($0)" } ?? ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if group.isMember {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.Palette.primary)
                        .accessibilityLabel("Joined")
                }
            }
            .padding(.vertical, 4)
        }
    }
}

struct CommunityGroupDetailView: View {
    let slug: String
    var onMembershipChanged: () -> Void = {}
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var showingComposer = false
    @State private var membershipBusy = false
    @State private var showingArchive = false
    @State private var showingSettings = false
    @State private var searchQuery = ""
    @State private var searchResults: [CommunityPost]?
    @State private var searching = false
    @State private var searchTask: Task<Void, Never>?
    @State private var error: String?

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.group(slug: slug) },
            loaded: { detail in content(detail) },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
        .alert("Could not update group", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "Please try again.")
        }
    }

    @ViewBuilder
    private func content(_ detail: CommunityGroupDetail) -> some View {
        let canModerate = detail.group.membershipRole == "owner" || detail.group.membershipRole == "moderator"
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(detail.group.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Label("\(detail.group.memberCount) members", systemImage: "person.3")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if detail.group.postingPolicy == "moderators" {
                        Label("Announcements only — members can comment", systemImage: "megaphone")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if detail.group.isStaffCurated == true {
                        Label("PerfectPPI curated", systemImage: "checkmark.shield")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.primary)
                    }
                    if detail.group.isMember {
                        Button(membershipTitle(detail.group)) {
                            Task { await updateMembership(detail.group) }
                        }
                        .buttonStyle(.bordered)
                        .disabled(membershipBusy || detail.group.membershipRole == "owner")
                    } else {
                        Button(membershipTitle(detail.group)) {
                            Task { await updateMembership(detail.group) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(membershipBusy)
                    }
                }
                .padding(.vertical, 6)
            }

            Section {
                NavigationLink {
                    CommunityGroupMembersView(group: detail.group)
                } label: {
                    Label("Members", systemImage: "person.2")
                }
                if !detail.group.rules.isEmpty {
                    DisclosureGroup("Rules") {
                        ForEach(Array(detail.group.rules.enumerated()), id: \.offset) { index, rule in
                            Text("\(index + 1). \(rule)").font(.subheadline)
                        }
                    }
                }
            }

            // Plan 13.5: search within the group (debounced, server-side).
            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Search this group", text: $searchQuery)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: searchQuery) { _, _ in scheduleSearch() }
                    if searching { ProgressView().controlSize(.small) }
                    else if !searchQuery.isEmpty {
                        Button { searchQuery = ""; searchResults = nil } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear search")
                    }
                }
            }

            if let results = searchResults {
                Section(results.isEmpty ? "No matching posts" : "Results") {
                    ForEach(results) { post in
                        postLink(post, slug: detail.group.slug, canModerate: canModerate)
                    }
                }
            } else {
                if let pinned = detail.pinned, !pinned.isEmpty {
                    Section {
                        ForEach(pinned) { post in
                            postLink(post, slug: detail.group.slug, canModerate: canModerate, pinnedBadge: true)
                        }
                    } header: {
                        Label("Pinned", systemImage: "pin.fill")
                    }
                }

                Section("Posts") {
                    if detail.posts.isEmpty {
                        Text("No posts in this group yet.").foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.posts) { post in
                            postLink(post, slug: detail.group.slug, canModerate: canModerate)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(detail.group.name)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if detail.group.isMember && (detail.group.postingPolicy != "moderators" || canModerate) {
                    Button { showingComposer = true } label: {
                        Label("Post to group", systemImage: "plus.bubble")
                    }
                }
                if detail.group.membershipRole == "owner" {
                    Menu {
                        Button("Group settings", systemImage: "gearshape") { showingSettings = true }
                        Button("Archive group", systemImage: "archivebox", role: .destructive) { showingArchive = true }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Owner tools")
                }
            }
        }
        .sheet(isPresented: $showingComposer) {
            NewCommunityPostView(preselectedGroupId: detail.group.id) {
                reloadToken = UUID()
            }
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                GroupSettingsView(mode: .edit(slug: detail.group.slug), initial: detail.group) { _ in
                    reloadToken = UUID()
                    onMembershipChanged()
                }
            }
        }
        .confirmationDialog("Archive this group?", isPresented: $showingArchive, titleVisibility: .visible) {
            Button("Archive group", role: .destructive) {
                Task { await moderate(slug: detail.group.slug, action: .archive) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Posts are preserved for members' records, but nobody can post or comment, and the group leaves the directory. This cannot be undone here.")
        }
    }

    private func postLink(_ post: CommunityPost, slug: String, canModerate: Bool, pinnedBadge: Bool = false) -> some View {
        NavigationLink {
            CommunityPostDetailView(post: post) { reloadToken = UUID() }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                if pinnedBadge {
                    Label("Pinned", systemImage: "pin.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.Palette.primary)
                }
                CommunityPostRow(post: post) { reloadToken = UUID() }
            }
        }
        .contextMenu {
            if canModerate || post.canModerateGroup == true {
                Button(post.groupPinned == true ? "Unpin" : "Pin to group", systemImage: "pin") {
                    Task { await moderate(slug: slug, action: post.groupPinned == true ? .unpin : .pin, postId: post.id) }
                }
                Button("Remove from group", systemImage: "minus.circle", role: .destructive) {
                    Task { await moderate(slug: slug, action: .removePost, postId: post.id) }
                }
            }
        }
    }

    private func membershipTitle(_ group: CommunityGroupSummary) -> String {
        if group.membershipRole == "owner" { return "Group owner" }
        if membershipBusy { return "Updating..." }
        return group.isMember ? "Leave group" : "Join group"
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let term = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.count >= 2 else {
            searchResults = nil
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await runSearch(term)
        }
    }

    @MainActor
    private func runSearch(_ term: String) async {
        searching = true
        defer { searching = false }
        do {
            let page = try await CommunityAPI.searchGroupPosts(slug: slug, query: term)
            guard term == searchQuery.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            searchResults = page.posts
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func moderate(slug: String, action: CommunityAPI.GroupModerationAction, postId: String? = nil) async {
        do {
            try await CommunityAPI.moderateGroup(slug: slug, action: action, postId: postId)
            if action == .archive {
                onMembershipChanged()
            }
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func updateMembership(_ group: CommunityGroupSummary) async {
        membershipBusy = true
        defer { membershipBusy = false }
        do {
            _ = try await CommunityAPI.setGroupMembership(id: group.id, joined: !group.isMember)
            reloadToken = UUID()
            onMembershipChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Member list with owner/moderator actions (plan 13.4). Roles first; the
/// server hides blocked and unavailable members from the viewer.
private struct CommunityGroupMembersView: View {
    let group: CommunityGroupSummary
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var pendingTransfer: CommunityGroupMember?
    @State private var pendingBan: CommunityGroupMember?
    @State private var error: String?

    private var viewerRole: String? { group.membershipRole }
    private var isOwner: Bool { viewerRole == "owner" }
    private var canModerate: Bool { isOwner || viewerRole == "moderator" }

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.groupMembers(slug: group.slug) },
            loaded: { page in
                List {
                    ForEach(page.members) { member in
                        row(member)
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { reloadToken = UUID() }
            },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Transfer ownership?", isPresented: .constant(pendingTransfer != nil), titleVisibility: .visible) {
            Button("Make owner", role: .destructive) {
                if let member = pendingTransfer { Task { await act(.transferOwnership, member) } }
                pendingTransfer = nil
            }
            Button("Cancel", role: .cancel) { pendingTransfer = nil }
        } message: {
            Text("\(pendingTransfer?.person.label ?? "This member") becomes the owner and you become a moderator.")
        }
        .confirmationDialog("Ban this member?", isPresented: .constant(pendingBan != nil), titleVisibility: .visible) {
            Button("Ban", role: .destructive) {
                if let member = pendingBan { Task { await act(.banMember, member) } }
                pendingBan = nil
            }
            Button("Cancel", role: .cancel) { pendingBan = nil }
        } message: {
            Text("They will not be able to rejoin until you lift the ban.")
        }
        .alert("Could not update member", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    @ViewBuilder
    private func row(_ member: CommunityGroupMember) -> some View {
        let isSelf = member.id == auth.profile?.id
        NavigationLink {
            if let username = member.username { MemberProfileView(username: username) }
        } label: {
            PersonRow(person: member.person, subtitle: roleLabel(member.role)) {
                if member.role != "member" {
                    Image(systemName: member.role == "owner" ? "crown.fill" : "shield.lefthalf.filled")
                        .foregroundStyle(Theme.Palette.primary)
                        .accessibilityLabel(roleLabel(member.role))
                }
            }
        }
        .disabled(member.username == nil)
        .contextMenu {
            if canModerate && !isSelf && member.role != "owner" && (isOwner || member.role == "member") {
                if isOwner {
                    Button(member.role == "moderator" ? "Make member" : "Make moderator", systemImage: "shield") {
                        Task { await act(member.role == "moderator" ? .makeMember : .makeModerator, member) }
                    }
                    Button("Make owner", systemImage: "crown") { pendingTransfer = member }
                }
                Button("Remove from group", systemImage: "person.badge.minus") {
                    Task { await act(.removeMember, member) }
                }
                if isOwner {
                    Button("Ban", systemImage: "hand.raised", role: .destructive) { pendingBan = member }
                }
            }
        }
    }

    private func roleLabel(_ role: String) -> String {
        switch role {
        case "owner": "Owner"
        case "moderator": "Moderator"
        default: "Member"
        }
    }

    @MainActor
    private func act(_ action: CommunityAPI.GroupModerationAction, _ member: CommunityGroupMember) async {
        do {
            try await CommunityAPI.moderateGroup(slug: group.slug, action: action, profileId: member.id)
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
