import SwiftUI

struct CommunityGroupsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var showingCreate = false
    @State private var creationEnabled = false
    @State private var invitationBusy: String?
    @State private var error: String?

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
                        } else if directory.groups.isEmpty && (directory.invitations ?? []).isEmpty {
                            EmptyStateCard(
                                title: "Groups are being prepared",
                                message: "Staff-curated vehicle communities will appear here.",
                                systemImage: "person.3"
                            )
                            .padding()
                        } else {
                            List {
                                if let invitations = directory.invitations, !invitations.isEmpty {
                                    Section("You're invited") {
                                        ForEach(invitations) { invitation in
                                            invitationRow(invitation)
                                        }
                                    }
                                }
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
            .alert("Could not update invitation", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error ?? "Please try again.")
            }
        }
    }

    private func invitationRow(_ invitation: CommunityGroupInvitation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink {
                CommunityGroupDetailView(slug: invitation.slug) { reloadToken = UUID() }
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(invitation.name).font(.headline)
                    Text("\(invitation.invitedByLabel ?? "A moderator") invited you"
                         + (invitation.visibility == "public" ? "" : " · \(invitation.visibility.capitalized) group"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Button("Accept") {
                    Task { await answerInvitation(invitation, accept: true) }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                Button("Decline") {
                    Task { await answerInvitation(invitation, accept: false) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .disabled(invitationBusy == invitation.groupId)
        }
        .padding(.vertical, 4)
    }

    @MainActor
    private func answerInvitation(_ invitation: CommunityGroupInvitation, accept: Bool) async {
        invitationBusy = invitation.groupId
        defer { invitationBusy = nil }
        do {
            _ = try await CommunityAPI.setGroupMembership(
                id: invitation.groupId,
                action: accept ? .acceptInvite : .declineInvite
            )
            await auth.refreshBadges()
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func groupLink(_ group: CommunityGroupSummary) -> some View {
        NavigationLink {
            CommunityGroupDetailView(slug: group.slug) { reloadToken = UUID() }
        } label: {
            HStack(spacing: 12) {
                if let avatar = group.avatarUrl, let avatarURL = URL(string: avatar) {
                    AsyncImage(url: avatarURL) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { Color(.secondarySystemFill) }
                    }
                    .frame(width: 42, height: 42)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                } else {
                    Image(systemName: group.vehicleMake == nil ? "wrench.and.screwdriver.fill" : "car.fill")
                        .frame(width: 42, height: 42)
                        .background(Theme.Palette.primary.opacity(0.12))
                        .foregroundStyle(Theme.Palette.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(group.name).font(.headline)
                        if group.isStaffCurated == true {
                            Image(systemName: "checkmark.shield.fill")
                                .font(.caption)
                                .foregroundStyle(Theme.Palette.primary)
                                .accessibilityLabel("PerfectPPI curated")
                        }
                        if group.isPrivate || group.isUnlisted {
                            Image(systemName: group.isUnlisted ? "eye.slash" : "lock.fill")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .accessibilityLabel(group.isUnlisted ? "Unlisted group" : "Private group")
                        }
                    }
                    Text(groupSubtitle(group))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let pending = group.pendingRequestCount, pending > 0 {
                    Text("\(pending)")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Theme.Palette.primary, in: Capsule())
                        .foregroundStyle(.white)
                        .accessibilityLabel("\(pending) pending request\(pending == 1 ? "" : "s")")
                }
                if group.isMember {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.Palette.primary)
                        .accessibilityLabel("Joined")
                } else if group.hasRequested {
                    Image(systemName: "clock")
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Request sent")
                } else if group.isInvited {
                    Image(systemName: "envelope.badge")
                        .foregroundStyle(Theme.Palette.primary)
                        .accessibilityLabel("Invited")
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func groupSubtitle(_ group: CommunityGroupSummary) -> String {
        var parts = ["\(group.memberCount) member\(group.memberCount == 1 ? "" : "s")"]
        if let region = group.locationRegion { parts.append(region) }
        if group.requiresRequest { parts.append("Request to join") }
        if group.inviteOnly { parts.append("Invite only") }
        return parts.joined(separator: " · ")
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
    @State private var composingRequest = false
    @State private var requestMessage = ""
    @State private var requestGroupId: String?

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
        .alert("Request to join", isPresented: $composingRequest) {
            TextField("Optional note for the moderators", text: $requestMessage)
            Button("Send request") {
                if let id = requestGroupId { Task { await membership(id: id, action: .request, message: requestMessage) } }
            }
            Button("Cancel", role: .cancel) { requestMessage = "" }
        } message: {
            Text("A moderator reviews requests. You'll be notified either way.")
        }
    }

    @ViewBuilder
    private func content(_ detail: CommunityGroupDetail) -> some View {
        let canModerate = detail.group.moderates
        List {
            if let cover = detail.group.coverUrl, let coverURL = URL(string: cover) {
                Section {
                    AsyncImage(url: coverURL) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            Color(.secondarySystemFill)
                        }
                    }
                    .frame(height: 150)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .listRowInsets(EdgeInsets())
                }
            }
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    if let avatar = detail.group.avatarUrl, let avatarURL = URL(string: avatar) {
                        AsyncImage(url: avatarURL) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() } else { Color(.secondarySystemFill) }
                        }
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
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
                    if detail.group.isPrivate || detail.group.isUnlisted || detail.group.requiresRequest || detail.group.inviteOnly {
                        Label(policyLabel(detail.group), systemImage: detail.group.isUnlisted ? "eye.slash" : "lock")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    membershipControl(detail.group)
                }
                .padding(.vertical, 6)
            }

            Section {
                if detail.group.contentVisible {
                    NavigationLink {
                        CommunityGroupMembersView(group: detail.group)
                    } label: {
                        Label("Members", systemImage: "person.2")
                    }
                }
                if canModerate && (detail.group.requiresRequest || (detail.group.pendingRequestCount ?? 0) > 0) {
                    NavigationLink {
                        CommunityGroupJoinRequestsView(group: detail.group) {
                            reloadToken = UUID()
                            onMembershipChanged()
                        }
                    } label: {
                        Label("Join requests", systemImage: "person.badge.clock")
                            .badge(detail.group.pendingRequestCount ?? 0)
                    }
                }
                if !detail.group.rules.isEmpty {
                    DisclosureGroup("Rules") {
                        ForEach(Array(detail.group.rules.enumerated()), id: \.offset) { index, rule in
                            Text("\(index + 1). \(rule)").font(.subheadline)
                        }
                    }
                }
            }

            if !detail.group.contentVisible {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Members only", systemImage: "lock.fill")
                            .font(.subheadline.weight(.semibold))
                        Text(lockedMessage(detail.group))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }

            // Plan 13.5: search within the group (debounced, server-side).
            if detail.group.contentVisible {
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
            }

            if !detail.group.contentVisible {
                EmptyView()
            } else if let results = searchResults {
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
                if !detail.group.isUnlisted {
                    ShareLink(item: ShareLinks.group(slug: detail.group.slug)) {
                        Label("Share group", systemImage: "square.and.arrow.up")
                    }
                }
                if detail.group.isMember && (detail.group.postingPolicy != "moderators" || canModerate) {
                    Button { showingComposer = true } label: {
                        Label("Post to group", systemImage: "plus.bubble")
                    }
                }
                if detail.group.administers {
                    Menu {
                        Button("Group settings", systemImage: "gearshape") { showingSettings = true }
                        if detail.group.membershipRole == "owner" {
                            Button("Archive group", systemImage: "archivebox", role: .destructive) { showingArchive = true }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel(detail.group.membershipRole == "owner" ? "Owner tools" : "Admin tools")
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

    /// Plan 13.3 membership states: owner · member · requested · invited ·
    /// none (open / request approval / invite only).
    @ViewBuilder
    private func membershipControl(_ group: CommunityGroupSummary) -> some View {
        if group.membershipRole == "owner" {
            Button("Group owner") {}.buttonStyle(.bordered).disabled(true)
        } else if group.isMember {
            Button(membershipBusy ? "Updating..." : "Leave group") {
                Task { await membership(id: group.id, action: .leave) }
            }
            .buttonStyle(.bordered)
            .disabled(membershipBusy)
        } else if group.hasRequested {
            HStack(spacing: 12) {
                Label("Request sent", systemImage: "clock")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Button("Cancel request") {
                    Task { await membership(id: group.id, action: .cancelRequest) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(membershipBusy)
            }
        } else if group.isInvited {
            HStack(spacing: 12) {
                Button(membershipBusy ? "Joining..." : "Accept invitation") {
                    Task { await membership(id: group.id, action: .acceptInvite) }
                }
                .buttonStyle(.borderedProminent)
                Button("Decline") {
                    Task { await membership(id: group.id, action: .declineInvite) }
                }
                .buttonStyle(.bordered)
            }
            .disabled(membershipBusy)
        } else if group.requiresRequest {
            Button(membershipBusy ? "Sending..." : "Request to join") {
                requestGroupId = group.id
                requestMessage = ""
                composingRequest = true
            }
            .buttonStyle(.borderedProminent)
            .disabled(membershipBusy)
        } else if group.inviteOnly {
            Button("Invite only") {}.buttonStyle(.bordered).disabled(true)
        } else {
            Button(membershipBusy ? "Updating..." : "Join group") {
                Task { await membership(id: group.id, action: .join) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(membershipBusy)
        }
    }

    private func policyLabel(_ group: CommunityGroupSummary) -> String {
        var parts: [String] = []
        if group.isPrivate { parts.append("Private") }
        if group.isUnlisted { parts.append("Unlisted") }
        if group.requiresRequest { parts.append("moderators approve requests") }
        if group.inviteOnly { parts.append("invite only") }
        return parts.joined(separator: " · ")
    }

    private func lockedMessage(_ group: CommunityGroupSummary) -> String {
        if group.hasRequested { return "Your request is waiting for a moderator." }
        if group.isInvited { return "Accept the invitation to see what members are sharing." }
        if group.inviteOnly { return "A moderator has to invite you." }
        return "Ask to join and a moderator will review your request."
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
    private func membership(id: String, action: CommunityAPI.GroupMembershipAction, message: String? = nil) async {
        membershipBusy = true
        defer { membershipBusy = false }
        do {
            let trimmed = message?.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try await CommunityAPI.setGroupMembership(id: id, action: action, message: trimmed?.isEmpty == false ? trimmed : nil)
            requestMessage = ""
            await auth.refreshBadges()
            reloadToken = UUID()
            onMembershipChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Pending join requests for owners/moderators (plan 13.3).
private struct CommunityGroupJoinRequestsView: View {
    let group: CommunityGroupSummary
    var onChanged: () -> Void = {}
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.groupJoinRequests(slug: group.slug) },
            loaded: { page in
                Group {
                    if page.requests.isEmpty {
                        EmptyStateCard(
                            title: "No pending requests",
                            message: "New requests to join \(group.name) will appear here.",
                            systemImage: "person.badge.clock"
                        )
                        .padding()
                    } else {
                        List {
                            ForEach(page.requests) { request in row(request) }
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { reloadToken = UUID() }
                    }
                }
            },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle("Join Requests")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Could not update request", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private func row(_ request: CommunityGroupJoinRequest) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink {
                if let username = request.username { MemberProfileView(username: username) }
            } label: {
                PersonRow(person: request.person, subtitle: request.requestedAt.map { "asked " + $0.formatted(.relative(presentation: .named)) }) {
                    EmptyView()
                }
            }
            .disabled(request.username == nil)
            if let message = request.message, !message.isEmpty {
                Text("“\(message)”")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Approve") { Task { await decide(request, approve: true) } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                Button("Decline") { Task { await decide(request, approve: false) } }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            .disabled(busy == request.id)
        }
        .padding(.vertical, 4)
    }

    @MainActor
    private func decide(_ request: CommunityGroupJoinRequest, approve: Bool) async {
        busy = request.id
        defer { busy = nil }
        do {
            try await CommunityAPI.moderateGroup(
                slug: group.slug,
                action: approve ? .approveRequest : .declineRequest,
                profileId: request.id
            )
            await auth.refreshBadges()
            reloadToken = UUID()
            onChanged()
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
    @State private var composingInvite = false
    @State private var inviteUsername = ""
    @State private var inviteNotice: String?

    private var viewerRole: String? { group.membershipRole }
    private var isOwner: Bool { viewerRole == "owner" }
    private var isAdmin: Bool { viewerRole == "admin" }
    private var canModerate: Bool { group.moderates }
    /// Plan 13.4: owner acts on anyone but the owner; admins on moderators and
    /// members; moderators only on members.
    private func canAct(on member: CommunityGroupMember) -> Bool {
        guard member.role != "owner" else { return false }
        if isOwner { return true }
        if isAdmin { return member.role != "admin" }
        return member.role == "member"
    }

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.groupMembers(slug: group.slug) },
            loaded: { page in
                List {
                    if canModerate {
                        Section {
                            Button {
                                inviteUsername = ""
                                composingInvite = true
                            } label: {
                                Label("Invite a member", systemImage: "person.badge.plus")
                            }
                            if let inviteNotice {
                                Text(inviteNotice).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section {
                        ForEach(page.members) { member in
                            row(member)
                        }
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
        .alert("Invite a member", isPresented: $composingInvite) {
            TextField("@username", text: $inviteUsername)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Invite") { Task { await invite() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They get a notification and can accept from Groups.")
        }
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
                    Image(systemName: member.role == "owner" ? "crown.fill" : member.role == "admin" ? "shield.fill" : "shield.lefthalf.filled")
                        .foregroundStyle(Theme.Palette.primary)
                        .accessibilityLabel(roleLabel(member.role))
                }
            }
        }
        .disabled(member.username == nil)
        .contextMenu {
            if canModerate && !isSelf && canAct(on: member) {
                if isOwner || isAdmin {
                    Button(member.role == "member" ? "Make moderator" : "Make member", systemImage: "shield") {
                        Task { await act(member.role == "member" ? .makeModerator : .makeMember, member) }
                    }
                }
                if isOwner && member.role != "admin" {
                    Button("Make admin", systemImage: "shield.fill") {
                        Task { await act(.makeAdmin, member) }
                    }
                }
                if isOwner {
                    Button("Make owner", systemImage: "crown") { pendingTransfer = member }
                }
                Button("Remove from group", systemImage: "person.badge.minus") {
                    Task { await act(.removeMember, member) }
                }
                if isOwner || isAdmin {
                    Button("Ban", systemImage: "hand.raised", role: .destructive) { pendingBan = member }
                }
            }
        }
    }

    private func roleLabel(_ role: String) -> String {
        switch role {
        case "owner": "Owner"
        case "admin": "Admin"
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

    @MainActor
    private func invite() async {
        let handle = inviteUsername.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "@", with: "")
        guard !handle.isEmpty else { return }
        do {
            let result = try await CommunityAPI.inviteToGroup(slug: group.slug, username: handle)
            if result.status == "active" {
                inviteNotice = "@\(handle) is now a member."
                reloadToken = UUID()
            } else if result.changed == false {
                inviteNotice = "@\(handle) already has an invitation."
            } else {
                inviteNotice = "Invitation sent to @\(handle)."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
