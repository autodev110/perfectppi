import SwiftUI

struct ConsumerTabs: View {
    let profile: Profile

    var body: some View {
        TabView {
            NavigationStack { ConsumerDashboardView() }
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack { VehiclesListView() }
                .tabItem { Label("Garage", systemImage: "car") }

            NavigationStack { ConsumerPpiListView() }
                .tabItem { Label("Inspections", systemImage: "checkmark.seal") }

            NavigationStack { CommunityFeedView() }
                .tabItem { Label("Community", systemImage: "text.bubble") }

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}
