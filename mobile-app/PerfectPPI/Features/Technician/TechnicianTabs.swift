import SwiftUI

struct TechnicianTabs: View {
    let profile: Profile

    var body: some View {
        TabView {
            NavigationStack { TechnicianQueueView() }
                .tabItem { Label("Queue", systemImage: "list.clipboard") }

            NavigationStack { OBDScannerView() }
                .tabItem { Label("Scanner", systemImage: "antenna.radiowaves.left.and.right") }

            NavigationStack { TechnicianOrgView() }
                .tabItem { Label("Status", systemImage: "wrench.and.screwdriver") }

            NavigationStack { PlatformMoreView(profile: profile) }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}
