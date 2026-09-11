import SwiftUI

/// The owner's friend list and pending requests (plan 10.4). Other members
/// never see this list; a profile only shows mutual friends.
struct FriendsView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var selectedUsername: String?

    var body: some View {
        AsyncContent(
            load: { try await SocialAPI.friends() },
            loaded: { overview in content(overview) },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle("Friends")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    PeopleSearchView()
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .accessibilityLabel("Find people")
                .disabled(!auth.capabilities.capabilities.friendsDiscovery)
            }
        }
        .navigationDestination(item: $selectedUsername) { username in
            MemberProfileView(username: username)
        }
    }

    @ViewBuilder
    private func content(_ overview: FriendsOverview) -> some View {
        List {
            if !overview.enabled {
                Section {
                    Text("Friend requests are switched off in this release. Existing friendships still apply to what you can see.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Requests for you") {
                if overview.incoming.isEmpty {
                    Text("No pending requests.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(overview.incoming) { request in
                        requestRow(request, state: .incomingRequest, enabled: overview.enabled)
                    }
                }
            }

            if !overview.outgoing.isEmpty {
                Section("Sent by you") {
                    ForEach(overview.outgoing) { request in
                        requestRow(request, state: .outgoingRequest, enabled: overview.enabled)
                    }
                }
            }

            Section(overview.friends.isEmpty ? "Friends" : "Friends (\(overview.friends.count))") {
                if overview.friends.isEmpty {
                    EmptyStateCard(
                        title: "No friends yet",
                        message: "Search for people you know and send a request. Friends can see your friends-only posts.",
                        systemImage: "person.2"
                    )
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(overview.friends) { friend in
                        Button {
                            selectedUsername = friend.username
                        } label: {
                            PersonRow(person: friend.person, subtitle: friend.friendsSince.map { "Friends since \($0.formatted(date: .abbreviated, time: .omitted))" }) {
                                FriendActionButton(
                                    profileId: friend.id,
                                    state: .constant(.friends),
                                    enabled: overview.enabled,
                                    compact: true
                                ) { _ in reloadToken = UUID() }
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(friend.username == nil)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { reloadToken = UUID() }
    }

    private func requestRow(_ request: FriendRequestSummary, state: FriendRelationshipState, enabled: Bool) -> some View {
        Button {
            selectedUsername = request.username
        } label: {
            PersonRow(person: request.person, subtitle: request.createdAt.map { "Sent \($0.formatted(date: .abbreviated, time: .omitted))" }) {
                FriendActionButton(
                    profileId: request.id,
                    state: .constant(state),
                    enabled: enabled,
                    compact: true
                ) { _ in reloadToken = UUID() }
            }
        }
        .buttonStyle(.plain)
        .disabled(request.username == nil)
    }
}
