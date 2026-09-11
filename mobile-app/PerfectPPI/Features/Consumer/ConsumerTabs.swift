import SwiftUI

struct ConsumerTabs: View {
    let profile: Profile
    @EnvironmentObject private var auth: AuthStore
    @State private var selectedTab: ConsumerTab = .inspections

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { MessagesView(currentProfileId: profile.id) }
                .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right") }
                .badge(auth.badges.unreadMessages)
                .tag(ConsumerTab.messages)

            NavigationStack { VehiclesListView() }
                .tabItem { Label("Garage", systemImage: "car") }
                .tag(ConsumerTab.garage)

            NavigationStack { ConsumerPpiListView() }
                .tabItem { Label("Inspections", systemImage: "checkmark.seal") }
                .tag(ConsumerTab.inspections)

            NavigationStack { CommunityFeedView() }
                .tabItem { Label("Community", systemImage: "text.bubble") }
                .badge(auth.badges.unreadNotifications)
                .tag(ConsumerTab.community)

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
                .badge(auth.badges.pendingFriendRequests)
                .tag(ConsumerTab.more)
        }
        .task { await auth.refreshBadges() }
    }
}

private enum ConsumerTab: Hashable {
    case messages
    case garage
    case inspections
    case community
    case more
}
