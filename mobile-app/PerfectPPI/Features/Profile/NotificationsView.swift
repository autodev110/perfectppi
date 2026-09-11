import SwiftUI

/// The global Notifications inbox (plan 22.1 / 22.2): grouped by day, every
/// item deep-links through the server's permission check, Mark All as Read,
/// and per-category preferences behind the gear.
struct NotificationsView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var reloadToken = UUID()
    @State private var opening: String?
    @State private var route: NotificationRoute?
    @State private var unavailableMessage: String?
    @State private var error: String?
    @State private var markingAll = false

    var body: some View {
        AsyncContent(
            load: { try await NotificationsAPI.list() },
            loaded: { items in content(items) },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
        .navigationTitle("Notifications")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task { await markAllRead() }
                } label: {
                    Image(systemName: "checkmark.circle")
                }
                .accessibilityLabel("Mark all as read")
                .disabled(markingAll || auth.badges.unreadNotifications == 0)

                NavigationLink {
                    NotificationPreferencesView()
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Notification settings")
            }
        }
        .navigationDestination(item: $route) { route in
            NotificationRouteView(route: route, currentProfileId: auth.profile?.id) {
                reloadToken = UUID()
            }
        }
        .alert("Not available", isPresented: .constant(unavailableMessage != nil)) {
            Button("OK") { unavailableMessage = nil }
        } message: {
            Text(unavailableMessage ?? "")
        }
        .alert("Something went wrong", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    @ViewBuilder
    private func content(_ items: [NotificationItem]) -> some View {
        if items.isEmpty {
            EmptyStateCard(
                title: "Inbox is empty",
                message: "Friend requests, comments, likes, inspections, and safety notices appear here.",
                systemImage: "bell"
            )
            .padding()
        } else {
            List {
                ForEach(daySections(items), id: \.title) { section in
                    Section(section.title) {
                        ForEach(section.items) { item in
                            Button {
                                Task { await open(item) }
                            } label: {
                                NotificationRow(item: item, opening: opening == item.id)
                            }
                            .buttonStyle(.plain)
                            .disabled(opening != nil)
                            .swipeActions {
                                if item.readAt == nil {
                                    Button("Mark Read") {
                                        Task {
                                            _ = try? await NotificationsAPI.markRead(id: item.id, read: true)
                                            await auth.refreshBadges()
                                            reloadToken = UUID()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable {
                await auth.refreshBadges()
                reloadToken = UUID()
            }
        }
    }

    /// Plan 22.2: group by day. Calendar-relative labels keep it scannable.
    private func daySections(_ items: [NotificationItem]) -> [(title: String, items: [NotificationItem])] {
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        var order: [Date] = []
        var buckets: [Date: [NotificationItem]] = [:]
        for item in items {
            let day = calendar.startOfDay(for: item.createdAt)
            if buckets[day] == nil { order.append(day) }
            buckets[day, default: []].append(item)
        }
        return order.map { day in
            let title = calendar.isDateInToday(day) ? "Today"
                : calendar.isDateInYesterday(day) ? "Yesterday"
                : formatter.string(from: day)
            return (title, buckets[day] ?? [])
        }
    }

    @MainActor
    private func open(_ item: NotificationItem) async {
        guard opening == nil else { return }
        opening = item.id
        defer { opening = nil }
        do {
            let destination = try await NotificationsAPI.destination(id: item.id)
            await auth.refreshBadges()
            if let target = NotificationRoute(destination: destination) {
                route = target
            } else {
                unavailableMessage = destination.message ?? "This content is no longer available."
                reloadToken = UUID()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func markAllRead() async {
        guard !markingAll else { return }
        markingAll = true
        defer { markingAll = false }
        do {
            _ = try await NotificationsAPI.markAllRead()
            await auth.refreshBadges()
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct NotificationRow: View {
    let item: NotificationItem
    let opening: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(Theme.Palette.primary)
                .frame(width: 28, height: 28)
                .background(Theme.Palette.primary.opacity(0.1))
                .clipShape(Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(item.title)
                        .font(item.readAt == nil ? .subheadline.weight(.bold) : .subheadline.weight(.semibold))
                    if item.readAt == nil {
                        Circle().fill(Theme.Palette.primary).frame(width: 8, height: 8)
                            .accessibilityLabel("Unread")
                    }
                }
                Text(item.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(item.createdAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
            if opening {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var icon: String {
        switch item.type {
        case .friendRequest, .friendRequestAccepted: "person.2"
        case .postComment, .postMention: "bubble.left"
        case .groupPostRemoved, .groupRoleChanged, .groupJoinRequest, .groupJoinDecision: "person.3"
        case .groupInvitation: "envelope.badge.person.crop"
        case .postLikes: "heart"
        case .answerAccepted, .acceptedAnswerUnavailable: "checkmark.circle"
        case .messageReceived: "envelope"
        case .listingInspectionRequested, .inspectionSubmitted, .inspectionUpdated, .techRequestNew, .techRequestAccepted: "checkmark.seal"
        case .savedListingUpdated: "tag"
        case .moderationDecision, .moderationCase, .reportReceived: "shield"
        case .warrantyAvailable, .paymentCompleted: "creditcard"
        case .unknown: "bell"
        }
    }
}

/// A resolved destination the app can present natively.
enum NotificationRoute: Hashable, Identifiable {
    case post(id: String)
    case profile(username: String)
    case friends
    case conversation(id: String)
    case inspectionRequest(id: String)
    case myPosts
    case group(slug: String)
    case listing(id: String)

    var id: String {
        switch self {
        case .post(let id): "post:\(id)"
        case .profile(let username): "profile:\(username)"
        case .friends: "friends"
        case .conversation(let id): "conversation:\(id)"
        case .inspectionRequest(let id): "inspection:\(id)"
        case .myPosts: "my_posts"
        case .group(let slug): "group:\(slug)"
        case .listing(let id): "listing:\(id)"
        }
    }

    /// Nil when the server said the destination is unavailable, or when this
    /// build has no native screen for it (web-only destinations).
    init?(destination: NotificationDestination) {
        guard destination.available else { return nil }
        switch (destination.kind, destination.id) {
        case ("post", let id?): self = .post(id: id)
        case ("profile", let username?): self = .profile(username: username)
        case ("friends", _): self = .friends
        case ("conversation", let id?): self = .conversation(id: id)
        case ("inspection_request", let id?): self = .inspectionRequest(id: id)
        case ("my_posts", _): self = .myPosts
        case ("group", let slug?): self = .group(slug: slug)
        case ("listing_vehicle", _):
            guard let listingId = destination.secondaryId else { return nil }
            self = .listing(id: listingId)
        default: return nil
        }
    }
}

struct NotificationRouteView: View {
    let route: NotificationRoute
    let currentProfileId: String?
    let onChanged: () -> Void

    var body: some View {
        switch route {
        case .post(let id):
            AsyncContent(
                load: { try await CommunityAPI.post(id: id) },
                loaded: { post in CommunityPostDetailView(post: post, onChanged: onChanged) },
                failure: { _, _ in
                    EmptyStateCard(
                        title: "Post unavailable",
                        message: "This post is no longer available.",
                        systemImage: "text.bubble"
                    )
                    .padding()
                }
            )
        case .profile(let username):
            MemberProfileView(username: username)
        case .friends:
            FriendsView()
        case .conversation(let id):
            MessageThreadView(conversationId: id, currentProfileId: currentProfileId)
        case .inspectionRequest(let id):
            ConsumerPpiDetailView(requestId: id)
        case .myPosts:
            ModeratedPostsView(onChanged: onChanged)
        case .group(let slug):
            CommunityGroupDetailView(slug: slug)
        case .listing(let id):
            MarketplaceListingLoaderView(listingId: id)
        }
    }
}

/// Per-category in-app/push switches (plan 22.1). Locked categories are
/// always on and explain why.
struct NotificationPreferencesView: View {
    @State private var rows: [NotificationPreference] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else {
                ForEach(rows) { row in
                    Section {
                        Toggle("In-app", isOn: binding(for: row, field: .inApp))
                            .disabled(row.locked)
                        Toggle("Push", isOn: binding(for: row, field: .push))
                            .disabled(row.locked)
                    } header: {
                        Text(row.label)
                    } footer: {
                        Text(row.description)
                    }
                }
                Section {
                    Text("Safety, moderation, and account notices are always delivered so you never miss a decision about your content or your account.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Notification Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert("Could not save", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    private enum Field { case inApp, push }

    private func binding(for row: NotificationPreference, field: Field) -> Binding<Bool> {
        Binding(
            get: { field == .inApp ? row.inApp : row.push },
            set: { value in
                let updated = NotificationPreference(
                    category: row.category,
                    label: row.label,
                    description: row.description,
                    inApp: field == .inApp ? value : row.inApp,
                    push: field == .push ? value : row.push,
                    locked: row.locked
                )
                Task { await save(updated, previous: row) }
            }
        )
    }

    @MainActor
    private func load() async {
        do {
            rows = try await NotificationsAPI.preferences()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    @MainActor
    private func save(_ updated: NotificationPreference, previous: NotificationPreference) async {
        replace(updated)
        do {
            try await NotificationsAPI.setPreference(category: updated.category, inApp: updated.inApp, push: updated.push)
        } catch {
            replace(previous)
            self.error = error.localizedDescription
        }
    }

    private func replace(_ row: NotificationPreference) {
        if let index = rows.firstIndex(where: { $0.category == row.category }) {
            rows[index] = row
        }
    }
}

/// Opens one notification from a push tap or universal link: resolves the
/// permission-checked destination, then presents it or the neutral screen.
struct NotificationLinkView: View {
    let notificationId: String
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AsyncContent(
            load: {
                let destination = try await NotificationsAPI.destination(id: notificationId)
                await auth.refreshBadges()
                return destination
            },
            loaded: { destination in
                if let route = NotificationRoute(destination: destination) {
                    NotificationRouteView(route: route, currentProfileId: auth.profile?.id) {}
                } else {
                    EmptyStateCard(
                        title: "This content is no longer available",
                        message: destination.message ?? "It may have been removed, made private, or is not accessible to your account.",
                        systemImage: "bell.slash"
                    )
                    .padding()
                }
            },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}
