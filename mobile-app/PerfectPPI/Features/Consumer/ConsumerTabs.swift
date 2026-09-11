import SwiftUI

struct ConsumerTabs: View {
    let profile: Profile
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        TabView {
            NavigationStack { ConsumerDashboardView() }
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack { VehiclesListView() }
                .tabItem { Label("Garage", systemImage: "car") }

            NavigationStack { ConsumerPpiListView() }
                .tabItem { Label("Inspections", systemImage: "checkmark.seal") }

            // Plan 7.1: badges instead of extra tabs. Community carries the
            // notification bell; More carries messages and friend requests.
            NavigationStack { CommunityFeedView() }
                .tabItem { Label("Community", systemImage: "text.bubble") }
                .badge(auth.badges.unreadNotifications)

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
                .badge(auth.badges.unreadMessages + auth.badges.pendingFriendRequests)
        }
        .task { await auth.refreshBadges() }
    }
}
