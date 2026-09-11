import SwiftUI

/// Private saved items (plan 7.4 "Saved Items", Phase 1B): posts and
/// marketplace listings. The server returns only posts the viewer can still
/// see; saved listings keep their sold/removed status so the outcome shows.
struct SavedPostsView: View {
    private enum Kind: String, CaseIterable, Identifiable {
        case posts, listings
        var id: String { rawValue }
        var label: String { self == .posts ? "Posts" : "Listings" }
    }

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var kind: Kind = .posts
    @State private var reloadToken = UUID()

    var body: some View {
        VStack(spacing: 0) {
            Picker("Saved items", selection: $kind) {
                ForEach(Kind.allCases) { item in Text(item.label).tag(item) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 10)

            switch kind {
            case .posts:
                AsyncContent(
                    load: { try await CommunityAPI.saved() },
                    loaded: { posts in postsContent(posts) },
                    failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
                )
                .id("posts-\(reloadToken)")
            case .listings:
                AsyncContent(
                    load: { try await MarketplaceAPI.saved() },
                    loaded: { listings in listingsContent(listings) },
                    failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
                )
                .id("listings-\(reloadToken)")
            }
        }
        .navigationTitle("Saved Items")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func postsContent(_ posts: [CommunityPost]) -> some View {
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

    @ViewBuilder
    private func listingsContent(_ listings: [MarketplaceListing]) -> some View {
        if listings.isEmpty {
            VStack {
                EmptyStateCard(
                    title: "No saved listings",
                    message: "Save a listing from the Marketplace to follow it here. You are told when its price changes or it sells.",
                    systemImage: "tag"
                )
                .padding()
                Spacer()
            }
        } else {
            List(listings) { listing in
                NavigationLink {
                    MarketplaceListingSummaryView(listing: listing, currentProfileId: auth.profile?.id)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "car.fill")
                            .frame(width: 44, height: 44)
                            .background(Theme.Palette.subtle)
                            .foregroundStyle(.secondary)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(listing.title).font(.headline).lineLimit(1)
                            Text("$\((listing.askingPriceCents / 100).formatted())" + (listing.status == .active ? "" : listing.status == .sold ? " · Sold" : " · No longer available"))
                                .font(.caption)
                                .foregroundStyle(listing.status == .active ? .secondary : Theme.Palette.warning)
                        }
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        Task {
                            _ = try? await MarketplaceAPI.setSaved(listingId: listing.id, saved: false)
                            reloadToken = UUID()
                        }
                    } label: {
                        Label("Unsave", systemImage: "bookmark.slash")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { reloadToken = UUID() }
        }
    }
}
