import SwiftUI

struct PlatformMoreView: View {
    let profile: Profile

    var body: some View {
        List {
            Section("Explore") {
                NavigationLink {
                    MarketplaceView(currentProfileId: profile.id)
                } label: {
                    Label("Marketplace", systemImage: "tag")
                }

                NavigationLink {
                    CommunityFeedView()
                } label: {
                    Label("Community", systemImage: "text.bubble")
                }

                NavigationLink {
                    TechnicianDirectoryView()
                } label: {
                    Label("Technicians", systemImage: "wrench.and.screwdriver")
                }
            }

            Section("Work") {
                NavigationLink {
                    MessagesView(currentProfileId: profile.id)
                } label: {
                    Label("Messages", systemImage: "bubble.left.and.bubble.right")
                }

                NavigationLink {
                    MediaPackagesView()
                } label: {
                    Label("Media Packages", systemImage: "photo.on.rectangle")
                }

                NavigationLink {
                    NotificationsView()
                } label: {
                    Label("Notifications", systemImage: "bell")
                }
            }

            Section("Account") {
                NavigationLink {
                    ProfileView(profile: profile)
                } label: {
                    Label("Profile", systemImage: "person.crop.circle")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("More")
    }
}
