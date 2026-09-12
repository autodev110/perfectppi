import SwiftUI

/// Private saved items (plan 7.4 "Saved Items", Phase 1B): posts and
/// marketplace listings, plus private named collections across content types.
struct SavedPostsView: View {
    private enum Kind: String, CaseIterable, Identifiable {
        case posts, listings, collections
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
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
            case .collections:
                SavedCollectionsList()
                    .id("collections-\(reloadToken)")
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

private struct SavedCollectionsList: View {
    @State private var collections: [SavedCollection] = []
    @State private var loading = true
    @State private var showingCreate = false
    @State private var newName = ""
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Button {
                    newName = ""
                    showingCreate = true
                } label: {
                    Label("New Collection", systemImage: "folder.badge.plus")
                }
            } footer: {
                Text("Collections are private. Authors, sellers, and vehicle owners cannot see them.")
            }

            Section("Your Collections") {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if collections.isEmpty {
                    Text("Create a collection to organize posts, listings, vehicles, and builds.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(collections) { collection in
                        NavigationLink {
                            SavedCollectionDetailView(collection: collection)
                        } label: {
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(collection.name).font(.headline)
                                    Text("\(collection.itemCount) item\(collection.itemCount == 1 ? "" : "s")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: "folder.fill").foregroundStyle(Theme.Palette.primary)
                            }
                        }
                        .swipeActions {
                            Button(role: .destructive) { Task { await delete(collection) } } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .task { await load() }
        .refreshable { await load() }
        .alert("New Collection", isPresented: $showingCreate) {
            TextField("Collection name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Create") { Task { await create() } }
                .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: {
            Text("Use a short name such as Dream Builds or Track Cars.")
        }
        .alert("Could not update collections", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "Please try again.") }
    }

    @MainActor private func load() async {
        loading = true
        defer { loading = false }
        do { collections = try await CommunityAPI.savedCollections() }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func create() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let collection = try await CommunityAPI.createSavedCollection(name: name)
            collections.insert(collection, at: 0)
        } catch { self.error = error.localizedDescription }
    }

    @MainActor private func delete(_ collection: SavedCollection) async {
        do {
            let _: Empty = try await CommunityAPI.deleteSavedCollection(id: collection.id)
            collections.removeAll { $0.id == collection.id }
        } catch { self.error = error.localizedDescription }
    }
}

private struct SavedCollectionDetailView: View {
    @State private var collection: SavedCollection
    @State private var items: [SavedCollectionItem] = []
    @State private var loading = true
    @State private var showingRename = false
    @State private var editedName = ""
    @State private var error: String?

    init(collection: SavedCollection) { _collection = State(initialValue: collection) }

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if items.isEmpty {
                EmptyStateCard(
                    title: "Collection is empty",
                    message: "Use Add to Collection on a post or listing. Vehicles and shared builds can also be added from PerfectPPI on the web.",
                    systemImage: "folder"
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(items) { item in
                    collectionItem(item)
                        .swipeActions {
                            Button(role: .destructive) { Task { await remove(item) } } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(collection.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button { editedName = collection.name; showingRename = true } label: {
                Image(systemName: "pencil")
            }
            .accessibilityLabel("Rename collection")
        }
        .task { await load() }
        .refreshable { await load() }
        .alert("Rename Collection", isPresented: $showingRename) {
            TextField("Collection name", text: $editedName)
            Button("Cancel", role: .cancel) {}
            Button("Save") { Task { await rename() } }
        }
        .alert("Could not update collection", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "Please try again.") }
    }

    @ViewBuilder private func collectionItem(_ item: SavedCollectionItem) -> some View {
        if item.available, let href = item.href, let url = URL(string: href, relativeTo: AppConfig.apiBaseURL)?.absoluteURL {
            Link(destination: url) { itemLabel(item) }
        } else {
            itemLabel(item).foregroundStyle(.secondary)
        }
    }

    private func itemLabel(_ item: SavedCollectionItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon(for: item.entityType))
                .frame(width: 36, height: 36)
                .background(Theme.Palette.subtle)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.headline).lineLimit(2)
                if let subtitle = item.subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
    }

    private func icon(for type: String) -> String {
        switch type { case "post": "text.bubble"; case "listing": "tag"; case "vehicle": "car"; case "build": "wrench.adjustable"; default: "bookmark" }
    }

    @MainActor private func load() async {
        loading = true; defer { loading = false }
        do { items = try await CommunityAPI.savedCollectionItems(id: collection.id) }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func rename() async {
        let name = editedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let _: Empty = try await CommunityAPI.renameSavedCollection(id: collection.id, name: name)
            collection = SavedCollection(id: collection.id, name: name, itemCount: collection.itemCount, createdAt: collection.createdAt, updatedAt: Date())
        } catch { self.error = error.localizedDescription }
    }

    @MainActor private func remove(_ item: SavedCollectionItem) async {
        do {
            let _: Empty = try await CommunityAPI.removeFromSavedCollection(collectionId: collection.id, itemId: item.id)
            items.removeAll { $0.id == item.id }
        } catch { self.error = error.localizedDescription }
    }
}

struct SavedCollectionPickerView: View {
    let entityType: String
    let entityId: String
    @Environment(\.dismiss) private var dismiss
    @State private var collections: [SavedCollection] = []
    @State private var loading = true
    @State private var showingCreate = false
    @State private var newName = ""
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Button { showingCreate = true } label: { Label("New Collection", systemImage: "folder.badge.plus") }
            }
            Section("Choose a Collection") {
                if loading { HStack { Spacer(); ProgressView(); Spacer() } }
                ForEach(collections) { collection in
                    Button { Task { await add(to: collection) } } label: {
                        HStack { Label(collection.name, systemImage: "folder"); Spacer(); Text("\(collection.itemCount)").foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .navigationTitle("Add to Collection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .task {
            do { collections = try await CommunityAPI.savedCollections() }
            catch { self.error = error.localizedDescription }
            loading = false
        }
        .alert("New Collection", isPresented: $showingCreate) {
            TextField("Collection name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Create and Add") { Task { await createAndAdd() } }
        }
        .alert("Could not save item", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "Please try again.") }
    }

    @MainActor private func add(to collection: SavedCollection) async {
        do {
            let _: Empty = try await CommunityAPI.addToSavedCollection(collectionId: collection.id, entityType: entityType, entityId: entityId)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }

    @MainActor private func createAndAdd() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let collection = try await CommunityAPI.createSavedCollection(name: name)
            await add(to: collection)
        } catch { self.error = error.localizedDescription }
    }
}
