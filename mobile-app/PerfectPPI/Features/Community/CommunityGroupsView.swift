import SwiftUI

struct CommunityGroupsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await CommunityAPI.groups() },
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
                    Text(group.name).font(.headline)
                    Text("\(group.memberCount) member\(group.memberCount == 1 ? "" : "s")")
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

private struct CommunityGroupDetailView: View {
    let slug: String
    let onMembershipChanged: () -> Void
    @State private var reloadToken = UUID()
    @State private var showingComposer = false
    @State private var membershipBusy = false
    @State private var error: String?

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.group(slug: slug) },
            loaded: { detail in
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(detail.group.description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Label("\(detail.group.memberCount) members", systemImage: "person.3")
                                .font(.caption)
                                .foregroundStyle(.secondary)
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

                    if !detail.group.rules.isEmpty {
                        Section("Rules") {
                            ForEach(Array(detail.group.rules.enumerated()), id: \.offset) { index, rule in
                                Text("\(index + 1). \(rule)")
                            }
                        }
                    }

                    Section("Posts") {
                        if detail.posts.isEmpty {
                            Text("No posts in this group yet.").foregroundStyle(.secondary)
                        } else {
                            ForEach(detail.posts) { post in
                                NavigationLink {
                                    CommunityPostDetailView(post: post) { reloadToken = UUID() }
                                } label: {
                                    CommunityPostRow(post: post) { reloadToken = UUID() }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .navigationTitle(detail.group.name)
                .toolbar {
                    if detail.group.isMember {
                        Button { showingComposer = true } label: {
                            Label("Post to group", systemImage: "plus.bubble")
                        }
                    }
                }
                .sheet(isPresented: $showingComposer) {
                    NewCommunityPostView(preselectedGroupId: detail.group.id) {
                        reloadToken = UUID()
                    }
                }
            },
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

    private func membershipTitle(_ group: CommunityGroupSummary) -> String {
        if group.membershipRole == "owner" { return "Group owner" }
        if membershipBusy { return "Updating..." }
        return group.isMember ? "Leave group" : "Join group"
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
