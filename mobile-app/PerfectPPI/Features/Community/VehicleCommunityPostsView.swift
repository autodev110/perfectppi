import SwiftUI

/// Community posts tagged to one public vehicle — the Garage/Marketplace →
/// Community hop (plan Phase 1B cross-navigation). Visibility is applied
/// server-side per post, so a private vehicle or hidden post never appears.
struct VehicleCommunityPostsView: View {
    let vehicle: Vehicle
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.postsAboutVehicle(id: vehicle.id) },
            loaded: { posts in
                Group {
                    if posts.isEmpty {
                        EmptyStateCard(
                            title: "No posts about this vehicle yet",
                            message: vehicle.visibility == .public
                                ? "Posts that attach this vehicle appear here."
                                : "Only public vehicles can be attached to Community posts.",
                            systemImage: "text.bubble"
                        )
                        .padding()
                    } else {
                        List(posts) { post in
                            NavigationLink {
                                CommunityPostDetailView(post: post) { reloadToken = UUID() }
                            } label: {
                                CommunityPostRow(post: post) { reloadToken = UUID() }
                            }
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { reloadToken = UUID() }
                    }
                }
            },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var title: String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model].compactMap { $0 }
        return parts.isEmpty ? "Community" : parts.joined(separator: " ")
    }
}
