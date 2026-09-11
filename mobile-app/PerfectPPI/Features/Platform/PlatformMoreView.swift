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
                    TechnicianDirectoryView()
                } label: {
                    Label("Technicians", systemImage: "wrench.and.screwdriver")
                }
            }

            Section("Your vehicles") {
                NavigationLink {
                    WarrantyListView()
                } label: {
                    Label("Warranty", systemImage: "shield")
                }
            }

            Section("Work") {
                NavigationLink {
                    MessagesView(currentProfileId: profile.id)
                } label: {
                    Label("Messages", systemImage: "bubble.left.and.bubble.right")
                }

                NavigationLink {
                    FriendsView()
                } label: {
                    Label("Friends", systemImage: "person.2")
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
