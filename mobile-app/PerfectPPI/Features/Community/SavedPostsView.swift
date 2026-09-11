import SwiftUI

/// Private saved posts (plan 7.4 "Saved Items", Phase 1B). The server returns
/// only posts the viewer can still see; unsaving here removes the row.
struct SavedPostsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.saved() },
            loaded: { posts in content(posts) },
            failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
        )
        .id(reloadToken)
        .navigationTitle("Saved Items")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func content(_ posts: [CommunityPost]) -> some View {
        if posts.isEmpty {
            VStack {
                EmptyStateCard(
                    title: "Nothing saved yet",
                    message: "Tap the bookmark on any post to keep it here. Only you can see this list, and posts that become unavailable drop out on their own.",
                    systemImage: "bookmark"
                )
                .padding()
                Spacer()
            }
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
}
