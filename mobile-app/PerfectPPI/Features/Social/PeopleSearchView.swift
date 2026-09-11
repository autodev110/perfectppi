import SwiftUI

/// People search (plan 12): debounced, paginated, with clear loading, empty,
/// and error states. Results carry the current relationship so the action
/// button is right on first render.
struct PeopleSearchView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var query = ""
    @State private var results: [PeopleSearchResult] = []
    @State private var states: [String: FriendRelationshipState] = [:]
    @State private var page = 1
    @State private var hasMore = false
    @State private var loading = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?
    @State private var selectedUsername: String?

    private var enabled: Bool { auth.capabilities.capabilities.friendsDiscovery }
    private var trimmed: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "@", with: "")
    }

    var body: some View {
        List {
            if !enabled {
                EmptyStateCard(
                    title: "People search is not available yet",
                    message: "Friend requests and people search are switched off in this release.",
                    systemImage: "person.2.slash"
                )
                .listRowBackground(Color.clear)
            } else if trimmed.count < 2 {
                EmptyStateCard(
                    title: "Search for someone you know",
                    message: "Enter at least two characters of a name or @username. Members who turned off discovery appear only for their complete username.",
                    systemImage: "magnifyingglass"
                )
                .listRowBackground(Color.clear)
            } else if loading && results.isEmpty {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowBackground(Color.clear)
            } else if let error {
                ErrorView(message: error) { Task { await search(reset: true) } }
                    .listRowBackground(Color.clear)
            } else if results.isEmpty {
                EmptyStateCard(
                    title: "No members found",
                    message: "Check the spelling, or ask for their complete username.",
                    systemImage: "person.crop.circle.badge.questionmark"
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(results) { result in
                    Button {
                        selectedUsername = result.username
                    } label: {
                        PersonRow(person: result.person, subtitle: subtitle(for: result)) {
                            FriendActionButton(
                                profileId: result.id,
                                state: binding(for: result),
                                enabled: enabled,
                                compact: true
                            )
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(result.username == nil)
                }
                if hasMore {
                    Button {
                        Task { await search(reset: false) }
                    } label: {
                        HStack { Spacer(); Text(loading ? "Loading…" : "Load more"); Spacer() }
                    }
                    .disabled(loading)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Find People")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or @username")
        .disableAutocorrection(true)
        .textInputAutocapitalization(.never)
        .onChange(of: query) { _, _ in scheduleSearch() }
        .navigationDestination(item: $selectedUsername) { username in
            MemberProfileView(username: username)
        }
    }

    private func subtitle(for result: PeopleSearchResult) -> String? {
        var parts: [String] = []
        if result.mutualFriendCount > 0 {
            parts.append("\(result.mutualFriendCount) mutual friend\(result.mutualFriendCount == 1 ? "" : "s")")
        }
        if result.exactMatch { parts.append("exact match") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func binding(for result: PeopleSearchResult) -> Binding<FriendRelationshipState> {
        Binding(
            get: { states[result.id] ?? result.relationshipState },
            set: { states[result.id] = $0 }
        )
    }

    /// Debounce keystrokes so a typed name is one request, not one per letter.
    private func scheduleSearch() {
        searchTask?.cancel()
        guard trimmed.count >= 2 else {
            results = []
            error = nil
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await search(reset: true)
        }
    }

    @MainActor
    private func search(reset: Bool) async {
        guard enabled, trimmed.count >= 2 else { return }
        let nextPage = reset ? 1 : page + 1
        let term = trimmed
        loading = true
        defer { loading = false }
        do {
            let response = try await SocialAPI.searchPeople(term, page: nextPage)
            guard term == trimmed else { return } // a newer query superseded this one
            results = reset ? response.results : results + response.results
            page = nextPage
            hasMore = response.hasMore
            error = nil
        } catch {
            if reset { results = [] }
            self.error = error.localizedDescription
        }
    }
}
