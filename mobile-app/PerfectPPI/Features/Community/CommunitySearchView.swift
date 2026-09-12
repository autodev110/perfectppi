import SwiftUI

/// Unified Community search (plan 27.2): one query, a tab per result type.
/// Recent searches live in UserDefaults on this device only and can be
/// cleared; nothing about them leaves the phone.
struct CommunitySearchView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var auth: AuthStore

    @State private var query = ""
    @State private var submitted = ""
    @State private var tab: CommunityAPI.SearchTab = .posts
    @State private var page: CommunityAPI.SearchPage?
    @State private var loading = false
    @State private var error: String?
    @State private var recent: [String] = RecentSearches.load()
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Result type", selection: $tab) {
                        ForEach(CommunityAPI.SearchTab.allCases) { entry in Text(entry.label).tag(entry) }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: tab) { _, _ in
                        if !submitted.isEmpty { Task { await run(submitted) } }
                    }
                }

                if submitted.isEmpty {
                    if recent.isEmpty {
                        Section {
                            Text("Makes, models, years, and diagnostic codes are understood — try “subie 2012 p0420”.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Section {
                            ForEach(recent, id: \.self) { entry in
                                Button(entry) {
                                    query = entry
                                    Task { await run(entry) }
                                }
                            }
                            Button("Clear recent searches", role: .destructive) {
                                RecentSearches.clear()
                                recent = []
                            }
                        } header: {
                            Text("Recent")
                        } footer: {
                            Text("Recent searches stay on this device.")
                        }
                    }
                } else if loading && page == nil {
                    Section { ProgressView().frame(maxWidth: .infinity) }
                } else if let error {
                    Section { Text(error).foregroundStyle(Theme.Palette.danger) }
                } else if let page {
                    if page.results.isEmpty {
                        Section {
                            EmptyStateCard(
                                title: "No \(page.tab.label.lowercased()) match “\(page.query)”",
                                message: page.suggestions.isEmpty
                                    ? "Check the spelling, try fewer words, or another result type. Private content never appears in search."
                                    : "Did you mean \(page.suggestions.joined(separator: ", "))?",
                                systemImage: "magnifyingglass"
                            )
                            .listRowBackground(Color.clear)
                        }
                        if !page.suggestions.isEmpty {
                            Section {
                                ForEach(page.suggestions, id: \.self) { suggestion in
                                    Button("Search “\(suggestion)”") {
                                        query = suggestion
                                        Task { await run(suggestion) }
                                    }
                                }
                            }
                        }
                    } else {
                        Section {
                            resultRows(page.results)
                            if page.hasMore {
                                Button(loading ? "Loading…" : "Load more") { Task { await run(submitted, page: page.page + 1, append: true) } }
                                    .disabled(loading)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Posts, people, groups, cars, listings, technicians")
            .onSubmit(of: .search) { Task { await run(query) } }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    @ViewBuilder
    private func resultRows(_ results: CommunityAPI.SearchResults) -> some View {
        switch results {
        case .posts(let posts):
            ForEach(posts) { post in
                NavigationLink {
                    CommunityPostDetailView(post: post) { Task { await run(submitted) } }
                } label: {
                    CommunityPostRow(post: post) { Task { await run(submitted) } }
                }
            }
        case .people(let people):
            ForEach(people) { person in
                NavigationLink {
                    if let username = person.username { MemberProfileView(username: username) }
                } label: {
                    PersonRow(person: person.person, subtitle: person.mutualFriendCount > 0 ? "\(person.mutualFriendCount) mutual" : nil) { EmptyView() }
                }
                .disabled(person.username == nil)
            }
        case .groups(let groups):
            ForEach(groups) { group in
                NavigationLink {
                    CommunityGroupDetailView(slug: group.slug) {}
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(group.name).font(.headline)
                            if group.isPrivate || group.isUnlisted {
                                Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Text("\(group.memberCount) member\(group.memberCount == 1 ? "" : "s")" + (group.locationRegion.map { " · \($0)" } ?? ""))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        case .vehicles(let vehicles):
            ForEach(vehicles) { vehicle in
                if let listingId = vehicle.listingId {
                    NavigationLink {
                        MarketplaceListingLoaderView(listingId: listingId)
                    } label: {
                        vehicleRow(vehicle)
                    }
                } else {
                    // No native public-vehicle screen yet: open the canonical page.
                    Button { openURL(ShareLinks.vehicle(id: vehicle.id)) } label: { vehicleRow(vehicle) }
                        .buttonStyle(.plain)
                }
            }
        case .listings(let listings):
            ForEach(listings) { listing in
                NavigationLink {
                    MarketplaceListingLoaderView(listingId: listing.id)
                } label: {
                    HStack(spacing: 12) {
                        thumbnail(listing.photoUrl, fallback: "tag")
                        VStack(alignment: .leading, spacing: 3) {
                            Text(listing.title).font(.headline).lineLimit(2)
                            Text("\(listing.vehicleLabel) · $\((listing.askingPriceCents / 100).formatted())")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        case .technicians(let technicians):
            ForEach(technicians) { technician in
                NavigationLink {
                    if let username = technician.username { MemberProfileView(username: username) }
                } label: {
                    PersonRow(
                        person: technician.person,
                        subtitle: [technician.serviceArea, technician.specialties.prefix(2).joined(separator: ", ")].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    ) {
                        Image(systemName: "wrench.and.screwdriver").foregroundStyle(.secondary)
                    }
                }
                .disabled(technician.username == nil)
            }
        }
    }

    private func vehicleRow(_ vehicle: SearchVehicleResult) -> some View {
        HStack(spacing: 12) {
            thumbnail(vehicle.photoUrl, fallback: "car.fill")
            VStack(alignment: .leading, spacing: 3) {
                Text(vehicle.label).font(.headline)
                Text([vehicle.nickname.map { "“\($0)”" }, vehicle.owner?.label, vehicle.visibility == "friends" ? "Friends only" : nil, vehicle.listingId == nil ? nil : "For sale"]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func thumbnail(_ url: String?, fallback: String) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemFill))
            if let url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
            } else {
                Image(systemName: fallback).foregroundStyle(.secondary)
            }
        }
        .frame(width: 64, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @MainActor
    private func run(_ text: String, page nextPage: Int = 1, append: Bool = false) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return }
        searchTask?.cancel()
        submitted = trimmed
        if !append {
            RecentSearches.remember(trimmed)
            recent = RecentSearches.load()
            page = nil
        }
        loading = true
        error = nil
        defer { loading = false }
        do {
            let loaded = try await CommunityAPI.search(trimmed, tab: tab, page: nextPage)
            guard !Task.isCancelled else { return }
            if append, let existing = page {
                page = CommunityAPI.SearchPage(tab: loaded.tab, query: loaded.query, page: loaded.page, hasMore: loaded.hasMore,
                                               suggestions: loaded.suggestions, results: merge(existing.results, loaded.results))
            } else {
                page = loaded
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func merge(_ first: CommunityAPI.SearchResults, _ second: CommunityAPI.SearchResults) -> CommunityAPI.SearchResults {
        switch (first, second) {
        case (.posts(let a), .posts(let b)): .posts(a + b)
        case (.people(let a), .people(let b)): .people(a + b)
        case (.groups(let a), .groups(let b)): .groups(a + b)
        case (.vehicles(let a), .vehicles(let b)): .vehicles(a + b)
        case (.listings(let a), .listings(let b)): .listings(a + b)
        case (.technicians(let a), .technicians(let b)): .technicians(a + b)
        default: second
        }
    }
}

/// Device-local recent searches (plan 27.2). Never synced, never sent.
enum RecentSearches {
    private static let key = "community.recentSearches"
    private static let limit = 8

    static func load() -> [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }

    static func remember(_ query: String) {
        var entries = load().filter { $0.caseInsensitiveCompare(query) != .orderedSame }
        entries.insert(query, at: 0)
        UserDefaults.standard.set(Array(entries.prefix(limit)), forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
