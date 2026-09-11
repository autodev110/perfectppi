import SwiftUI

/// The one friendship control that fits the current relationship (plan 10.1).
/// The server returns the canonical state after every transition; the button
/// renders that and never claims success ahead of it.
struct FriendActionButton: View {
    let profileId: String
    @Binding var state: FriendRelationshipState
    var enabled: Bool = true
    var compact: Bool = false
    var onChange: ((FriendRelationshipState) -> Void)? = nil

    @State private var busy: FriendAction?
    @State private var confirmingRemoval = false
    @State private var error: String?

    var body: some View {
        Group {
            switch state {
            case .none, .unknown:
                actionButton("Add Friend", systemImage: "person.badge.plus", action: .request, prominent: true)
            case .outgoingRequest:
                actionButton("Request Sent", systemImage: "clock", action: .cancel, prominent: false)
            case .incomingRequest:
                HStack(spacing: 8) {
                    actionButton("Accept", systemImage: "checkmark", action: .accept, prominent: true)
                    actionButton("Decline", systemImage: "xmark", action: .decline, prominent: false)
                }
            case .friends:
                Button {
                    confirmingRemoval = true
                } label: {
                    Label(busy == .remove ? "Removing…" : "Friends", systemImage: "person.2.fill")
                        .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .disabled(busy != nil || !enabled)
            case .me, .blocked:
                EmptyView()
            }
        }
        .confirmationDialog("Remove this friend?", isPresented: $confirmingRemoval, titleVisibility: .visible) {
            Button("Remove Friend", role: .destructive) { Task { await run(.remove) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They will lose access to your friends-only posts. Nothing is sent to them.")
        }
        .alert("Friend request", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    @ViewBuilder
    private func actionButton(_ title: String, systemImage: String, action: FriendAction, prominent: Bool) -> some View {
        let label = Label(busy == action ? "Working…" : title, systemImage: systemImage)
            .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
            .lineLimit(1)
        if prominent {
            Button { Task { await run(action) } } label: { label }
                .buttonStyle(.borderedProminent)
                .tint(Theme.Palette.primary)
                .disabled(busy != nil || !enabled)
        } else {
            Button { Task { await run(action) } } label: { label }
                .buttonStyle(.bordered)
                .disabled(busy != nil || !enabled)
        }
    }

    @MainActor
    private func run(_ action: FriendAction) async {
        guard busy == nil else { return }
        busy = action
        defer { busy = nil }
        do {
            let result = try await SocialAPI.mutateFriendship(profileId: profileId, action: action)
            state = result.state
            onChange?(result.state)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Avatar + name + handle row used by search results, requests, and friends.
struct PersonRow<Trailing: View>: View {
    let person: PersonSummary
    var subtitle: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: person.label, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.label)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                if let handle = handle {
                    Text(handle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var handle: String? {
        let parts = [person.username.map { "@\($0)" }, subtitle].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
