import SwiftUI

struct PlatformMoreView: View {
    let profile: Profile
    @EnvironmentObject private var auth: AuthStore

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
                        .badge(auth.badges.unreadMessages)
                }

                NavigationLink {
                    FriendsView()
                } label: {
                    Label("Friends", systemImage: "person.2")
                        .badge(auth.badges.pendingFriendRequests)
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
                        .badge(auth.badges.unreadNotifications)
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
        .task { await auth.refreshBadges() }
    }
}
