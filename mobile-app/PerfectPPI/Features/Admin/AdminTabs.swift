import SwiftUI

struct AdminTabs: View {
    let profile: Profile

    var body: some View {
        TabView {
            NavigationStack { AdminDashboardView() }
                .tabItem { Label("Metrics", systemImage: "chart.bar") }

            NavigationStack { AdminListsView() }
                .tabItem { Label("Records", systemImage: "list.bullet.rectangle") }

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}
