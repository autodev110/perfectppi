import SwiftUI

struct ConsumerTabs: View {
    let profile: Profile

    var body: some View {
        TabView {
            NavigationStack { ConsumerDashboardView() }
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack { VehiclesListView() }
                .tabItem { Label("Vehicles", systemImage: "car") }

            NavigationStack { ConsumerPpiListView() }
                .tabItem { Label("Inspections", systemImage: "checkmark.seal") }

            NavigationStack { WarrantyListView() }
                .tabItem { Label("Warranty", systemImage: "shield") }

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}
