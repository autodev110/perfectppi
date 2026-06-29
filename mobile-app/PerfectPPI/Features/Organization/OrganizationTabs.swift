import SwiftUI

struct OrganizationTabs: View {
    let profile: Profile

    var body: some View {
        TabView {
            NavigationStack { OrgDashboardView() }
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack { OrgTechniciansView() }
                .tabItem { Label("Technicians", systemImage: "person.3") }

            NavigationStack { OrgInspectionsView() }
                .tabItem { Label("Inspections", systemImage: "checkmark.seal") }

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}
