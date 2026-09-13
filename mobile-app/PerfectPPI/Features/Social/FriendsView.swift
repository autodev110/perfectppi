import SwiftUI
import Contacts
import CryptoKit

/// The owner's friend list and pending requests (plan 10.4). Other members
/// never see this list; a profile only shows mutual friends.
struct FriendsView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var selectedUsername: String?
    @State private var friendQuery = ""

    var body: some View {
        AsyncContent(
            load: { try await SocialAPI.friends() },
            loaded: { overview in content(overview) },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle("Friends")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                NavigationLink {
                    ContactDiscoveryView()
                } label: {
                    Image(systemName: "person.crop.circle.badge.plus")
                }
                .accessibilityLabel("Find and invite contacts")
                .disabled(!auth.capabilities.capabilities.friendsDiscovery)
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
        .searchable(text: $friendQuery, prompt: "Search your friends")
    }

    @ViewBuilder
    private func content(_ overview: FriendsOverview) -> some View {
        let visibleFriends = overview.friends.filter { friend in
            let term = friendQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return term.isEmpty || friend.displayName?.lowercased().contains(term) == true || friend.username?.lowercased().contains(term) == true
        }
        List {
            Section {
                NavigationLink {
                    PeopleSearchView()
                } label: {
                    Label("Search all PerfectPPI members", systemImage: "magnifyingglass")
                }
                NavigationLink {
                    ContactDiscoveryView()
                } label: {
                    Label("Find friends from contacts", systemImage: "person.crop.circle.badge.plus")
                }
            }
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

            Section(overview.friends.isEmpty ? "Friends" : "Friends (\(visibleFriends.count))") {
                if overview.friends.isEmpty {
                    EmptyStateCard(
                        title: "No friends yet",
                        message: "Search for people you know and send a request. Friends can see your friends-only posts.",
                        systemImage: "person.2"
                    )
                    .listRowBackground(Color.clear)
                } else {
                    if visibleFriends.isEmpty && !friendQuery.isEmpty {
                        Text("No friends match your search.").foregroundStyle(.secondary)
                    }
                    ForEach(visibleFriends) { friend in
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

private struct ContactCandidate: Identifiable {
    let id: String
    let name: String
    let hashes: [String]
}

struct ContactDiscoveryView: View {
    @State private var contacts: [ContactCandidate] = []
    @State private var matches: [ContactDiscoveryResult] = []
    @State private var states: [String: FriendRelationshipState] = [:]
    @State private var loading = false
    @State private var permissionDenied = false
    @State private var error: String?

    private let inviteURL = URL(string: "https://perfectppi.com/signup")!
    private var matchedHashes: Set<String> { Set(matches.map(\.contactHash)) }
    private var inviteContacts: [ContactCandidate] {
        contacts.filter { Set($0.hashes).isDisjoint(with: matchedHashes) }
    }

    var body: some View {
        List {
            Section {
                Text("PerfectPPI compares one-way hashes of the contacts you allow. Names and unmatched email addresses or phone numbers stay on this iPhone.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button(contacts.isEmpty ? "Choose Contacts" : "Refresh Suggestions", systemImage: "person.crop.circle.badge.checkmark") {
                    Task { await loadContacts() }
                }
                .disabled(loading)
                if loading { ProgressView("Checking contacts…") }
                if permissionDenied {
                    Text("Contact access is off or no contacts were selected. You can allow full or limited access in Settings.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(Theme.Palette.danger) }
            }

            if !matches.isEmpty {
                Section("On PerfectPPI") {
                    ForEach(matches) { match in
                        NavigationLink {
                            if let username = match.username { MemberProfileView(username: username) }
                        } label: {
                            PersonRow(person: match.person, subtitle: match.mutualFriendCount > 0 ? "\(match.mutualFriendCount) mutual friend\(match.mutualFriendCount == 1 ? "" : "s")" : "From your contacts") {
                                FriendActionButton(profileId: match.id, state: binding(for: match), enabled: true, compact: true)
                            }
                        }
                        .disabled(match.username == nil)
                    }
                }
            }

            if !inviteContacts.isEmpty {
                Section("Invite to PerfectPPI") {
                    ForEach(inviteContacts) { contact in
                        HStack {
                            Text(contact.name).lineLimit(1)
                            Spacer()
                            ShareLink(
                                item: inviteURL,
                                subject: Text("Join me on PerfectPPI"),
                                message: Text("Join me on PerfectPPI to share vehicles, builds, and inspections.")
                            ) { Text("Invite") }
                        }
                    }
                }
            }

            if contacts.isEmpty {
                Section {
                    ShareLink(item: inviteURL, subject: Text("Join me on PerfectPPI"), message: Text("Join me on PerfectPPI to share vehicles, builds, and inspections.")) {
                        Label("Share an invite", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .navigationTitle("Contacts")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func binding(for result: ContactDiscoveryResult) -> Binding<FriendRelationshipState> {
        Binding(get: { states[result.id] ?? result.relationshipState }, set: { states[result.id] = $0 })
    }

    @MainActor
    private func loadContacts() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let store = CNContactStore()
            let status = CNContactStore.authorizationStatus(for: .contacts)
            if status == .notDetermined {
                guard try await store.requestAccess(for: .contacts) else {
                    permissionDenied = true
                    return
                }
            } else if status == .denied || status == .restricted {
                permissionDenied = true
                return
            }

            let keys = [CNContactIdentifierKey, CNContactGivenNameKey, CNContactFamilyNameKey, CNContactEmailAddressesKey, CNContactPhoneNumbersKey] as [CNKeyDescriptor]
            let request = CNContactFetchRequest(keysToFetch: keys)
            var loaded: [ContactCandidate] = []
            try store.enumerateContacts(with: request) { contact, _ in
                let values = contact.emailAddresses.map { String($0.value).trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                    + contact.phoneNumbers.flatMap { Self.phoneVariants($0.value.stringValue) }
                let hashes = Array(Set(values.filter { !$0.isEmpty }.map(Self.digest)))
                guard !hashes.isEmpty else { return }
                let name = [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")
                loaded.append(ContactCandidate(id: contact.identifier, name: name.isEmpty ? "Contact" : name, hashes: hashes))
            }
            // The server takes 500 hashes per call and a handful of calls per
            // minute, so a large address book is checked in batches. Contacts
            // that could not be checked are left out rather than shown as
            // "not on PerfectPPI".
            let allHashes = Array(Set(loaded.flatMap(\.hashes)))
            let batches = stride(from: 0, to: allHashes.count, by: 500).map { Array(allHashes[$0..<min($0 + 500, allHashes.count)]) }
            var found: [ContactDiscoveryResult] = []
            var checked = Set<String>()
            for batch in batches.prefix(8) {
                found += try await SocialAPI.discoverContacts(hashes: batch)
                checked.formUnion(batch)
            }
            var seen = Set<String>()
            matches = found.filter { seen.insert($0.id).inserted }
            contacts = loaded.filter { !Set($0.hashes).isDisjoint(with: checked) }
            permissionDenied = false
        } catch {
            self.error = error.localizedDescription
        }
    }

    private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Digits only, matching the server's normalization of verified phone
    /// numbers (E.164 without the plus). A 10-digit number typed without a
    /// country code is also tried with the device region's code so
    /// "(555) 010-0100" can match "+1 555 010 0100".
    private static func phoneVariants(_ raw: String) -> [String] {
        let digits = raw.filter(\.isNumber)
        guard digits.count >= 7 else { return [] }
        var variants = [digits]
        if digits.count == 10, let code = regionCallingCode() {
            variants.append(code + digits)
        }
        return variants
    }

    private static func regionCallingCode() -> String? {
        switch Locale.current.region?.identifier {
        case "US", "CA": "1"
        case "GB": "44"
        case "AU": "61"
        case "DE": "49"
        case "FR": "33"
        default: nil
        }
    }
}
