import SwiftUI

struct MarketplaceView: View {
    let currentProfileId: String?
    /// Opens with one of the member's saved searches applied (notification
    /// deep link, plan 25.1).
    let initialSavedSearchId: String?

    @State private var searchText = ""
    @State private var filters = MarketplaceFilters()
    @State private var savedSearches: [MarketplaceSavedSearch] = []
    @State private var activeSavedSearchId: String?
    @State private var reloadToken = UUID()
    @State private var showingMine = false
    @State private var showingFilters = false
    @State private var notice: String?
    /// Pages after the first, appended by "Load more" (plan 25.1).
    @State private var morePages: [MarketplaceListing] = []
    @State private var lastPage: Int = 1
    @State private var moreAvailable: Bool?
    @State private var loadingMore = false
    @State private var loadMoreError: String?

    init(currentProfileId: String? = nil, savedSearchId: String? = nil) {
        self.currentProfileId = currentProfileId
        self.initialSavedSearchId = savedSearchId
    }

    var body: some View {
        AsyncContent(
            load: { try await MarketplaceAPI.listPage(filters: filters, page: 1) },
            loaded: { firstPage in
                let listings = firstPage.items + morePages
                let hasMore = moreAvailable ?? firstPage.hasMore
                VStack(spacing: 0) {
                    if !savedSearches.isEmpty || filters.narrowsResults {
                        filterSummaryBar
                    }
                    if listings.isEmpty {
                        EmptyStateCard(
                            title: filters.narrowsResults ? "No listings match" : "No active listings",
                            message: filters.narrowsResults
                                ? "Loosen a filter or save this search to hear about new matches."
                                : "Public vehicles listed for sale will appear here.",
                            systemImage: "tag"
                        )
                        .padding()
                        Spacer(minLength: 0)
                    } else {
                        List {
                            ForEach(listings) { listing in
                                NavigationLink {
                                    MarketplaceListingDetailView(
                                        listing: listing,
                                        currentProfileId: currentProfileId
                                    ) { refresh() }
                                } label: {
                                    MarketplaceListingRow(listing: listing)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if listing.sellerId != currentProfileId {
                                        Button {
                                            Task {
                                                _ = try? await MarketplaceAPI.setSaved(listingId: listing.id, saved: listing.savedByViewer != true)
                                                refresh()
                                            }
                                        } label: {
                                            Label(listing.savedByViewer == true ? "Unsave" : "Save",
                                                  systemImage: listing.savedByViewer == true ? "bookmark.slash" : "bookmark")
                                        }
                                        .tint(Theme.Palette.primary)
                                    }
                                }
                            }
                            Section {
                                if hasMore {
                                    Button {
                                        Task { await loadMore() }
                                    } label: {
                                        HStack {
                                            Spacer()
                                            if loadingMore {
                                                ProgressView().controlSize(.small)
                                            } else {
                                                Text(loadMoreError == nil ? "Load more" : "Retry")
                                                    .font(.subheadline.weight(.semibold))
                                            }
                                            Spacer()
                                        }
                                    }
                                    .disabled(loadingMore)
                                    .onAppear { Task { await loadMore() } }
                                    if let loadMoreError {
                                        Text(loadMoreError)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                } else {
                                    Text(firstPage.total == listings.count
                                         ? "That's every listing\(filters.narrowsResults ? " matching these filters" : "")."
                                         : "End of results.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .listRowBackground(Color.clear)
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { refresh() }
                    }
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
        .navigationTitle("Marketplace")
        .searchable(text: $searchText, prompt: "Search vehicles")
        .onSubmit(of: .search) { applySearchText() }
        .onChange(of: searchText) { _, value in
            if value.isEmpty, filters.q != nil { applySearchText() }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    showingFilters = true
                } label: {
                    Image(systemName: filters.activeCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
                .accessibilityLabel(filters.activeCount > 0 ? "Filters, \(filters.activeCount) applied" : "Filters")
                Button {
                    showingMine = true
                } label: {
                    Image(systemName: "person.crop.rectangle.stack")
                }
                .accessibilityLabel("My listings")
            }
        }
        .sheet(isPresented: $showingMine) {
            NavigationStack {
                MyListingsView()
            }
        }
        .sheet(isPresented: $showingFilters) {
            NavigationStack {
                MarketplaceFilterSheet(
                    filters: filters,
                    canSave: currentProfileId != nil && savedSearches.count < 10,
                    onApply: { updated in
                        filters = updated
                        searchText = updated.q ?? ""
                        activeSavedSearchId = nil
                        refresh()
                    },
                    onSave: { name, updated, notify in
                        try await save(name: name, filters: updated, notify: notify)
                    }
                )
            }
        }
        .task { await loadSavedSearches() }
        .alert("Saved searches",
               isPresented: .constant(notice != nil),
               actions: { Button("OK") { notice = nil } },
               message: { Text(notice ?? "") })
    }

    /// Saved-search chips plus the current filter summary. Chips re-run a
    /// saved search; a long press removes one.
    private var filterSummaryBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !savedSearches.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(savedSearches) { search in
                            Button {
                                apply(search)
                            } label: {
                                Label(search.name, systemImage: search.notify ? "bell" : "bookmark")
                                    .font(.caption.weight(.semibold))
                                    .lineLimit(1)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 7)
                                    .background(activeSavedSearchId == search.id ? Theme.Palette.primary : Theme.Palette.subtle)
                                    .foregroundStyle(activeSavedSearchId == search.id ? Color.white : Color.primary)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(search.filters.summary)
                            .contextMenu {
                                Button("Remove saved search", systemImage: "trash", role: .destructive) {
                                    Task { await remove(search) }
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            if filters.narrowsResults {
                HStack {
                    Text(filters.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Spacer()
                    Button("Clear") {
                        filters = MarketplaceFilters()
                        searchText = ""
                        activeSavedSearchId = nil
                        refresh()
                    }
                    .font(.caption.weight(.semibold))
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }

    /// Restart from page one; the appended pages belong to the old query.
    private func refresh() {
        morePages = []
        lastPage = 1
        moreAvailable = nil
        loadMoreError = nil
        reloadToken = UUID()
    }

    @MainActor
    private func loadMore() async {
        guard !loadingMore, moreAvailable != false else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let next = try await MarketplaceAPI.listPage(filters: filters, page: lastPage + 1)
            let known = Set(morePages.map(\.id))
            morePages.append(contentsOf: next.items.filter { !known.contains($0.id) })
            lastPage = next.page
            moreAvailable = next.hasMore
            loadMoreError = nil
        } catch {
            loadMoreError = error.localizedDescription
        }
    }

    private func applySearchText() {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        filters.q = trimmed.isEmpty ? nil : trimmed
        activeSavedSearchId = nil
        refresh()
    }

    private func apply(_ search: MarketplaceSavedSearch) {
        filters = search.filters
        searchText = search.filters.q ?? ""
        activeSavedSearchId = search.id
        refresh()
    }

    @MainActor
    private func loadSavedSearches() async {
        guard currentProfileId != nil else { return }
        do {
            savedSearches = try await MarketplaceAPI.savedSearches()
        } catch {
            // Browsing works without the chips; the next open retries.
            return
        }
        if let initialSavedSearchId, activeSavedSearchId == nil,
           let search = savedSearches.first(where: { $0.id == initialSavedSearchId }) {
            apply(search)
        } else if initialSavedSearchId != nil, activeSavedSearchId == nil {
            notice = "That saved search is no longer available."
        }
    }

    @MainActor
    private func save(name: String, filters updated: MarketplaceFilters, notify: Bool) async throws {
        let search = try await MarketplaceAPI.saveSearch(name: name, filters: updated, notify: notify)
        savedSearches.insert(search, at: 0)
        filters = search.filters
        searchText = search.filters.q ?? ""
        activeSavedSearchId = search.id
        refresh()
    }

    @MainActor
    private func remove(_ search: MarketplaceSavedSearch) async {
        do {
            try await MarketplaceAPI.deleteSavedSearch(id: search.id)
            savedSearches.removeAll { $0.id == search.id }
            if activeSavedSearchId == search.id { activeSavedSearchId = nil }
        } catch {
            notice = error.localizedDescription
        }
    }
}

/// Structured filters (plan 25.1). Edits a draft; nothing applies until
/// "Show results", and "Save search" keeps the draft as a named search.
private struct MarketplaceFilterSheet: View {
    @State private var draft: MarketplaceFilters
    let canSave: Bool
    let onApply: (MarketplaceFilters) -> Void
    let onSave: (String, MarketplaceFilters, Bool) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var minYearText: String
    @State private var maxYearText: String
    @State private var maxPriceText: String
    @State private var maxMileageText: String
    @State private var savingName = ""
    @State private var notify = true
    @State private var showingSave = false
    @State private var saving = false
    @State private var error: String?

    init(
        filters: MarketplaceFilters,
        canSave: Bool,
        onApply: @escaping (MarketplaceFilters) -> Void,
        onSave: @escaping (String, MarketplaceFilters, Bool) async throws -> Void
    ) {
        _draft = State(initialValue: filters)
        self.canSave = canSave
        self.onApply = onApply
        self.onSave = onSave
        _minYearText = State(initialValue: filters.minYear.map(String.init) ?? "")
        _maxYearText = State(initialValue: filters.maxYear.map(String.init) ?? "")
        _maxPriceText = State(initialValue: filters.maxPrice.map(String.init) ?? "")
        _maxMileageText = State(initialValue: filters.maxMileage.map(String.init) ?? "")
    }

    private var composed: MarketplaceFilters {
        var copy = draft
        copy.minYear = Int(minYearText.trimmingCharacters(in: .whitespaces))
        copy.maxYear = Int(maxYearText.trimmingCharacters(in: .whitespaces))
        copy.maxPrice = Int(maxPriceText.filter(\.isNumber))
        copy.maxMileage = Int(maxMileageText.filter(\.isNumber))
        return copy.cleaned
    }

    var body: some View {
        Form {
            Section("Vehicle") {
                TextField("Make", text: binding(\.make))
                    .textInputAutocapitalization(.words)
                TextField("Model", text: binding(\.model))
                    .textInputAutocapitalization(.words)
                HStack {
                    TextField("Min year", text: $minYearText).keyboardType(.numberPad)
                    Divider()
                    TextField("Max year", text: $maxYearText).keyboardType(.numberPad)
                }
                optionPicker("Transmission", selection: binding(\.transmission), options: MarketplaceFilters.transmissions.map { ($0, $0) })
                optionPicker("Drivetrain", selection: binding(\.drivetrain), options: MarketplaceFilters.drivetrains.map { ($0, $0) })
                optionPicker("Body style", selection: binding(\.bodyStyle), options: MarketplaceFilters.bodyStyles.map { ($0, $0) })
            }
            Section("Price & mileage") {
                TextField("Max price ($)", text: $maxPriceText).keyboardType(.numberPad)
                TextField("Max mileage", text: $maxMileageText).keyboardType(.numberPad)
            }
            Section {
                TextField("City or region", text: binding(\.region))
                optionPicker("Seller", selection: binding(\.sellerType), options: MarketplaceFilters.sellerTypes)
                Toggle("Inspected vehicles only", isOn: Binding(
                    get: { draft.inspected == true },
                    set: { draft.inspected = $0 ? true : nil }
                ))
            } header: {
                Text("Seller & inspection")
            } footer: {
                Text("Inspection badges show the scope and date of a PerfectPPI inspection recorded for the vehicle. They describe the vehicle at that time, not a guarantee.")
            }
            Section("Sort") {
                Picker("Sort by", selection: Binding(
                    get: { draft.sort ?? "newest" },
                    set: { draft.sort = $0 }
                )) {
                    ForEach(MarketplaceFilters.sorts, id: \.value) { option in
                        Text(option.label).tag(option.value)
                    }
                }
            }
            if canSave, composed.narrowsResults {
                Section {
                    Button {
                        savingName = composed.summary
                        showingSave = true
                    } label: {
                        Label("Save this search", systemImage: "bookmark.badge.plus")
                    }
                    .disabled(saving)
                } footer: {
                    Text("Keep up to 10 saved searches. With notices on, you get one daily notification when new listings match.")
                }
            }
        }
        .navigationTitle("Filters")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Reset") {
                    draft = MarketplaceFilters()
                    minYearText = ""; maxYearText = ""; maxPriceText = ""; maxMileageText = ""
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Show results") {
                    onApply(composed)
                    dismiss()
                }
            }
        }
        .sheet(isPresented: $showingSave) {
            NavigationStack {
                Form {
                    Section("Name") {
                        TextField("Name", text: $savingName)
                    }
                    Section {
                        Toggle("Notify me daily about new matches", isOn: $notify)
                    }
                    Section {
                        Text(composed.summary)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .navigationTitle("Save search")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showingSave = false } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(saving ? "Saving…" : "Save") { Task { await save() } }
                            .disabled(saving || savingName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .alert("Could not save", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    @MainActor
    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            try await onSave(String(savingName.trimmingCharacters(in: .whitespaces).prefix(60)), composed, notify)
            showingSave = false
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func binding(_ keyPath: WritableKeyPath<MarketplaceFilters, String?>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: keyPath] ?? "" },
            set: { draft[keyPath: keyPath] = $0.isEmpty ? nil : $0 }
        )
    }

    private func optionPicker(_ title: String, selection: Binding<String>, options: [(value: String, label: String)]) -> some View {
        Picker(title, selection: selection) {
            Text("Any").tag("")
            ForEach(options, id: \.value) { option in
                Text(option.label).tag(option.value)
            }
        }
    }
}

private struct MarketplaceListingRow: View {
    let listing: MarketplaceListing

    var body: some View {
        HStack(spacing: 12) {
            ListingThumbnail(listing: listing)
                .frame(width: 76, height: 58)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(listing.title)
                        .font(.headline)
                        .lineLimit(1)
                    if listing.savedByViewer == true {
                        Image(systemName: "bookmark.fill")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.primary)
                            .accessibilityLabel("Saved")
                    }
                }
                Text(vehicleSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Text("$\((listing.askingPriceCents / 100).formatted())")
                        .font(.subheadline.weight(.semibold))
                        .layoutPriority(1)
                    if let location = listing.location, !location.isEmpty {
                        Text(location)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                HStack(spacing: 8) {
                    if let inspection = listing.inspectionSummary {
                        // Scope and date, never an unexplained "verified" (plan 25.1).
                        Label(
                            "\(inspection.scope == .dentsTires ? "Dents & Tires" : "Complete") · \(inspection.inspectedAt.formatted(date: .abbreviated, time: .omitted))",
                            systemImage: "checkmark.seal"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.Palette.success)
                        .lineLimit(1)
                    }
                    if listing.sellerType == "technician" {
                        Label("Technician / shop", systemImage: "wrench.and.screwdriver")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
    }

    private var vehicleSubtitle: String {
        guard let vehicle = listing.vehicle else { return "Vehicle" }
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

/// The listing screen (plan 25.2), top to bottom: gallery → price & vehicle
/// → Save/Share → inspection → description & specs → highlights → seller →
/// safety → sticky actions. Owners get Manage Listing instead of contact.
private struct MarketplaceListingDetailView: View {
    let initial: MarketplaceListing
    let currentProfileId: String?
    var onChanged: () -> Void = {}

    @State private var listing: MarketplaceListing
    @State private var contacting = false
    @State private var requestingInspection = false
    @State private var notice: String?
    @State private var openConversationId: String?
    @State private var inspectionRequest: MarketplaceInspectionRequestSummary?
    @State private var saved: Bool
    @State private var saving = false
    @State private var collectionTarget: MarketplaceCollectionTarget?
    @State private var buildSubscribed = false
    @State private var updatingBuildSubscription = false
    @State private var galleryIndex = 0
    @State private var editing = false
    @State private var sharingInspection = false
    @State private var confirmingRemove = false
    @State private var managing = false
    @State private var removed = false
    @Environment(\.dismiss) private var dismiss

    init(listing: MarketplaceListing, currentProfileId: String?, onChanged: @escaping () -> Void = {}) {
        self.initial = listing
        self.currentProfileId = currentProfileId
        self.onChanged = onChanged
        _listing = State(initialValue: listing)
        _inspectionRequest = State(initialValue: listing.inspectionRequest)
        _saved = State(initialValue: listing.savedByViewer ?? false)
    }

    private var isOwner: Bool { listing.sellerId == currentProfileId }
    private var canContact: Bool { !isOwner && listing.status.isPublic }

    private var photos: [MarketplaceListingPhoto] {
        if let photos = listing.photos { return photos }
        let media = listing.vehicle?.vehicleMedia ?? []
        return media
            .sorted { ($0.isPrimary == true ? 0 : 1, $0.sortOrder ?? 0) < ($1.isPrimary == true ? 0 : 1, $1.sortOrder ?? 0) }
            .map { MarketplaceListingPhoto(id: $0.id, url: $0.url) }
    }

    /// Optimistic private save (plan 25.2); reconciled to the server answer.
    @MainActor
    private func toggleSaved() async {
        guard !saving else { return }
        let previous = saved
        saved.toggle()
        saving = true
        defer { saving = false }
        do {
            let result = try await MarketplaceAPI.setSaved(listingId: listing.id, saved: saved)
            saved = result.saved
            onChanged()
        } catch {
            saved = previous
            notice = error.localizedDescription
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.spacing) {
                if !listing.status.isPublic {
                    Label("This listing is \(listing.status.label.lowercased()) and only you can see it.", systemImage: "eye.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                gallery

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        if listing.status == .pending {
                            StatusBadge(text: "Sale pending", color: Theme.Palette.warning)
                        }
                        if let inspection = listing.inspectionSummary {
                            Label(
                                "\(inspection.scope == .dentsTires ? "Dents & Tires" : "Complete") · \(inspection.inspectedAt.formatted(date: .abbreviated, time: .omitted))",
                                systemImage: "checkmark.seal"
                            )
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Theme.Palette.success)
                        }
                    }
                    Text("$\((listing.askingPriceCents / 100).formatted())")
                        .font(.title.weight(.bold))
                        .foregroundStyle(Theme.Palette.primary)
                    Text(listing.title)
                        .font(.title3.bold())
                    if let vehicle = listing.vehicle {
                        Text(vehicleLabel(vehicle))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    HStack(spacing: 10) {
                        if let mileage = listing.vehicle?.mileage {
                            Label("\(mileage.formatted()) mi", systemImage: "gauge.with.dots.needle.33percent")
                        }
                        if let location = listing.location, !location.isEmpty {
                            Label(location, systemImage: "mappin.and.ellipse")
                        }
                        Label(
                            MarketplaceFilters.sellerTypeLabel(listing.sellerType) ?? "Private seller",
                            systemImage: listing.sellerType == "technician" ? "wrench.and.screwdriver" : "person"
                        )
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }

                // Save and Share.
                HStack(spacing: 10) {
                    if !isOwner {
                        Button {
                            Task { await toggleSaved() }
                        } label: {
                            Label(saved ? "Saved" : "Save", systemImage: saved ? "bookmark.fill" : "bookmark")
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(saving)
                        .accessibilityLabel(saved ? "Remove listing from saved" : "Save listing")
                    }
                    if currentProfileId != nil {
                        Button { collectionTarget = MarketplaceCollectionTarget(entityType: "listing", entityId: listing.id) } label: {
                            Label("Collection", systemImage: "folder.badge.plus")
                        }
                        .buttonStyle(OutlineButtonStyle())
                    }
                    if !isOwner, currentProfileId != nil {
                        Button { Task { await toggleBuildSubscription() } } label: {
                            Label(buildSubscribed ? "Build updates on" : "Build updates", systemImage: buildSubscribed ? "bell.fill" : "bell")
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(updatingBuildSubscription)
                    }
                    if listing.status.isPublic {
                        ShareLink(item: ShareLinks.listing(id: listing.id), subject: Text(listing.title)) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(OutlineButtonStyle())
                    }
                }

                section("Inspection") {
                    if isOwner {
                        Button {
                            sharingInspection = true
                        } label: {
                            Label(listing.inspectionReport == nil ? "Share an inspection" : "Manage inspection sharing", systemImage: "checkmark.seal")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    if let report = listing.inspectionReport {
                        MarketplaceInspectionReportCard(report: report, preview: false)
                        if isOwner {
                            NavigationLink {
                                ConsumerPpiDetailView(requestId: report.requestId)
                            } label: {
                                Label("Open your full private report", systemImage: "doc.text")
                                    .font(.caption.weight(.semibold))
                            }
                        }
                    } else if let inspection = listing.inspectionSummary {
                        VStack(alignment: .leading, spacing: 6) {
                            row("Scope", inspection.scope == .dentsTires ? "Dents & Tires" : "Complete inspection")
                            row("Inspected", inspection.inspectedAt.formatted(date: .abbreviated, time: .omitted))
                            row("Performed by", inspection.performedBy)
                            Text("Structured findings are temporarily unavailable. The scope, date, and performer above still describe the inspection the seller shared.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if isOwner {
                                NavigationLink {
                                    ConsumerPpiDetailView(requestId: inspection.requestId)
                                } label: {
                                    Label("Open your full report", systemImage: "doc.text")
                                        .font(.caption.weight(.semibold))
                                }
                            }
                        }
                    } else {
                        Text("No PerfectPPI inspection is on record for this vehicle.\(canContact ? " You can request an independent one below." : "")")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                section("Condition & description") {
                    VStack(alignment: .leading, spacing: 10) {
                        if let description = listing.description, !description.isEmpty {
                            Text(description).font(.subheadline)
                        } else {
                            Text("The seller has not added a description yet.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        if let vehicle = listing.vehicle {
                            Divider()
                            VStack(alignment: .leading, spacing: 6) {
                                if let year = vehicle.year { row("Year", String(year)) }
                                if let make = vehicle.make, !make.isEmpty { row("Make", make) }
                                if let model = vehicle.model, !model.isEmpty { row("Model", model) }
                                if let trim = vehicle.trim, !trim.isEmpty { row("Trim", trim) }
                                if let mileage = vehicle.mileage {
                                    row("Mileage", "\(mileage.formatted()) mi\(vehicle.mileageStatus == .notActual ? " (not actual)" : vehicle.mileageStatus == .unknown ? " (unverified)" : "")")
                                }
                                // Owner-confirmed configuration: swapped or converted
                                // parts must not read as factory equipment.
                                if let type = vehicle.configurationType, type != .stock { row("Configuration", type.label) }
                                if let engine = vehicle.engine, !engine.isEmpty { row("Engine", engine + (vehicle.engineOriginal == false ? " (swapped)" : "")) }
                                if let transmission = vehicle.transmission, !transmission.isEmpty { row("Transmission", transmission + (vehicle.transmissionOriginal == false ? " (swapped)" : "")) }
                                if let drivetrain = vehicle.drivetrain, !drivetrain.isEmpty { row("Drivetrain", drivetrain + (vehicle.drivetrainOriginal == false ? " (converted)" : "")) }
                                if let bodyStyle = vehicle.bodyStyle, !bodyStyle.isEmpty { row("Body style", bodyStyle) }
                            }
                        }
                    }
                }

                if let highlights = listing.highlights, !highlights.isEmpty {
                    section("Modifications & maintenance") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Published by the owner from this vehicle's passport. Not verified by PerfectPPI.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            ForEach(highlights) { item in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title).font(.subheadline.weight(.semibold))
                                        if let detail = item.detail, !detail.isEmpty {
                                            Text(detail).font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(item.sourceLabel)
                                            .font(.caption2.weight(.semibold))
                                            .padding(.horizontal, 8).padding(.vertical, 3)
                                            .background(Theme.Palette.card)
                                            .clipShape(Capsule())
                                        if let date = item.date {
                                            Text(date).font(.caption2).foregroundStyle(.secondary)
                                        }
                                        if item.source == "build_journal", currentProfileId != nil {
                                            Button {
                                                collectionTarget = MarketplaceCollectionTarget(entityType: "build", entityId: item.id)
                                            } label: {
                                                Image(systemName: "folder.badge.plus")
                                            }
                                            .buttonStyle(.borderless)
                                            .accessibilityLabel("Add build entry to collection")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                sellerCard

                section("Buy safely") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("• Keep conversations in PerfectPPI Messages; never send deposits, gift cards, or wire transfers to hold a car.")
                        Text("• See the vehicle and the title in person, and match the VIN on the car to the title before paying.")
                        Text("• An inspection describes a date in the past. Request a new independent one if the last is old or limited in scope.")
                        Text("• PerfectPPI never asks for payment through messages. Report anything that feels off from the seller's profile.")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                // Garage ↔ Community cross-navigation (plan Phase 1B).
                if let vehicle = listing.vehicle {
                    NavigationLink {
                        VehicleCommunityPostsView(vehicle: vehicle)
                    } label: {
                        Label("Community posts about this vehicle", systemImage: "text.bubble")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(OutlineButtonStyle())
                }
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) { stickyActions }
        .navigationTitle("Listing")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .navigationDestination(item: $openConversationId) { conversationId in
            MessageThreadView(
                conversationId: conversationId,
                currentProfileId: currentProfileId
            )
        }
        .sheet(isPresented: $editing) {
            EditListingView(listing: listing) {
                onChanged()
                Task { await refresh() }
            }
        }
        .sheet(isPresented: $sharingInspection) {
            NavigationStack {
                MarketplaceInspectionSharingView(listingId: listing.id) {
                    onChanged()
                    Task { await refresh() }
                }
            }
        }
        .sheet(item: $collectionTarget) { target in
            NavigationStack { SavedCollectionPickerView(entityType: target.entityType, entityId: target.entityId) }
        }
        .confirmationDialog(
            "Remove this listing?",
            isPresented: $confirmingRemove,
            titleVisibility: .visible
        ) {
            Button("Remove listing", role: .destructive) { Task { await remove() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Members who saved it or requested an inspection will see it as no longer available. This cannot be undone.")
        }
        .alert("Marketplace",
               isPresented: .constant(notice != nil),
               actions: { Button("OK") { notice = nil } },
               message: { Text(notice ?? "") })
    }

    // MARK: Sections

    /// Swipeable full-width gallery with a count (plan 25.2 §1).
    @ViewBuilder
    private var gallery: some View {
        let items = photos
        ZStack(alignment: .bottomTrailing) {
            if items.isEmpty {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Theme.Palette.subtle)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .overlay {
                        VStack(spacing: 6) {
                            Image(systemName: "car.fill").font(.largeTitle)
                            Text("No photos yet").font(.caption.weight(.semibold))
                        }
                        .foregroundStyle(.secondary)
                    }
            } else {
                TabView(selection: $galleryIndex) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, photo in
                        Color.clear
                            .overlay {
                                AsyncImage(url: URL(string: photo.url)) { phase in
                                    switch phase {
                                    case .success(let image): image.resizable().scaledToFill()
                                    case .failure: Image(systemName: "photo").foregroundStyle(.secondary)
                                    default: ProgressView()
                                    }
                                }
                            }
                            .clipped()
                            .tag(index)
                            .accessibilityLabel("Photo \(index + 1) of \(items.count)")
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .aspectRatio(4 / 3, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                Text("\(min(galleryIndex + 1, items.count)) / \(items.count)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.black.opacity(0.6))
                    .clipShape(Capsule())
                    .padding(10)
            }
        }
    }

    /// Seller card (plan 25.2 §7): permitted public profile + aggregate history.
    private var sellerCard: some View {
        section("Seller") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    if let avatar = listing.seller?.avatarUrl, let url = URL(string: avatar) {
                        AsyncImage(url: url) { phase in
                            if case .success(let image) = phase {
                                image.resizable().scaledToFill()
                            } else {
                                Avatar(name: listing.seller?.displayName ?? listing.seller?.username ?? "S", size: 40)
                            }
                        }
                        .frame(width: 40, height: 40)
                        .clipShape(Circle())
                    } else {
                        Avatar(name: listing.seller?.displayName ?? listing.seller?.username ?? "S", size: 40)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(listing.seller?.displayName ?? listing.seller?.username ?? "PerfectPPI member")
                            .font(.subheadline.weight(.semibold))
                        Text(MarketplaceFilters.sellerTypeLabel(listing.sellerType) ?? "Private seller")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if let history = listing.sellerHistory {
                    Text("\(history.activeCount) active listing\(history.activeCount == 1 ? "" : "s") · \(history.soldCount) sold on PerfectPPI\(history.firstListedAt.map { " · selling since \($0.formatted(date: .abbreviated, time: .omitted))" } ?? "")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if listing.seller?.isPublic == true, let username = listing.seller?.username, !username.isEmpty {
                    NavigationLink {
                        MemberProfileView(username: username)
                    } label: {
                        Label("View profile", systemImage: "person.crop.circle")
                            .font(.caption.weight(.semibold))
                    }
                } else {
                    Text("This member's profile is private.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    /// Sticky Message Seller / Request Inspection (plan 25.2 §9); owners see
    /// Manage Listing, never a button to contact themselves.
    @ViewBuilder
    private var stickyActions: some View {
        if isOwner {
            if !removed {
                HStack(spacing: 10) {
                    Button {
                        editing = true
                    } label: {
                        Label("Edit details", systemImage: "pencil")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(listing.status == .removed)
                    if !listing.status.manageActions.isEmpty {
                        manageMenu
                            .buttonStyle(OutlineButtonStyle())
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(.bar)
            }
        } else if canContact {
            HStack(spacing: 10) {
                Button {
                    Task { await contactSeller() }
                } label: {
                    Label(contacting ? "Opening..." : "Message Seller", systemImage: "message")
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: contacting))
                .disabled(contacting)

                if let inspectionRequest {
                    NavigationLink {
                        ConsumerPpiDetailView(requestId: inspectionRequest.requestId)
                    } label: {
                        Label(
                            inspectionRequest.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                            systemImage: "checkmark.circle"
                        )
                        .lineLimit(1)
                    }
                    .buttonStyle(OutlineButtonStyle())
                } else if listing.status == .active {
                    Button {
                        Task { await requestInspection() }
                    } label: {
                        Label(requestingInspection ? "Requesting..." : "Request Inspection", systemImage: "checklist")
                            .lineLimit(1)
                    }
                    .buttonStyle(OutlineButtonStyle())
                    .disabled(requestingInspection)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
            .background(.bar)
        } else if !listing.status.isPublic {
            Text("This listing is no longer accepting inquiries.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(.bar)
        }
    }

    private var manageMenu: some View {
        Menu {
            ForEach(listing.status.manageActions) { action in
                if action == .remove {
                    Button(action.label, systemImage: "trash", role: .destructive) { confirmingRemove = true }
                } else if let target = action.target {
                    Button(action.label) { Task { await setStatus(target) } }
                }
            }
        } label: {
            Label(managing ? "Updating…" : "Manage", systemImage: "slider.horizontal.3")
        }
        .disabled(managing)
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium).multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }

    private func vehicleLabel(_ vehicle: Vehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }

    // MARK: Actions

    /// Fills in the listing-screen extras (gallery order, highlights, seller
    /// history) that the browse rows do not carry.
    @MainActor
    private func refresh() async {
        guard !removed else { return }
        if let fresh = try? await MarketplaceAPI.get(id: listing.id) {
            listing = fresh
            inspectionRequest = fresh.inspectionRequest
            saved = fresh.savedByViewer ?? saved
        }
        if !isOwner, currentProfileId != nil,
           let subscription = try? await VehiclesAPI.buildSubscription(id: listing.vehicleId) {
            buildSubscribed = subscription.subscribed
        }
    }

    @MainActor
    private func toggleBuildSubscription() async {
        guard !updatingBuildSubscription else { return }
        let previous = buildSubscribed
        buildSubscribed.toggle()
        updatingBuildSubscription = true
        defer { updatingBuildSubscription = false }
        do {
            let result = try await VehiclesAPI.setBuildSubscription(id: listing.vehicleId, subscribed: buildSubscribed)
            buildSubscribed = result.subscribed
        } catch {
            buildSubscribed = previous
            notice = error.localizedDescription
        }
    }

    @MainActor
    private func setStatus(_ status: ListingStatus) async {
        guard !managing else { return }
        managing = true
        defer { managing = false }
        do {
            _ = try await MarketplaceAPI.updateStatus(id: listing.id, status: status)
            onChanged()
            await refresh()
        } catch {
            notice = error.localizedDescription
        }
    }

    @MainActor
    private func remove() async {
        guard !managing else { return }
        managing = true
        defer { managing = false }
        do {
            let result = try await MarketplaceAPI.remove(id: listing.id)
            removed = true
            onChanged()
            notice = result.mode == "hard"
                ? "The listing was removed."
                : "The listing was removed. It stays on record for members who saved it or requested an inspection."
            dismiss()
        } catch {
            notice = error.localizedDescription
        }
    }

    /// The API creates the thread when there isn't one and returns the existing
    /// one when there is, so either way this pushes straight into the
    /// conversation rather than telling the buyer to go find it in Messages.
    private func contactSeller() async {
        guard !contacting else { return }
        contacting = true
        defer { contacting = false }
        do {
            let result = try await MarketplaceAPI.contactSeller(listingId: listing.id)
            openConversationId = result.conversationId
        } catch {
            notice = error.localizedDescription
        }
    }

    private func requestInspection() async {
        guard !requestingInspection else { return }
        requestingInspection = true
        defer { requestingInspection = false }
        do {
            let result = try await MarketplaceAPI.requestInspection(listingId: listing.id)
            inspectionRequest = .init(requestId: result.requestId, status: result.status)
            notice = result.created
                ? "Your inspection request was sent."
                : "You already have an active inspection request for this listing."
        } catch {
            notice = error.localizedDescription
        }
    }
}

private struct MarketplaceCollectionTarget: Identifiable {
    let entityType: String
    let entityId: String
    var id: String { "\(entityType):\(entityId)" }
}

/// Seller-facing redaction preview and attach/detach controls (plan 25.3).
private struct MarketplaceInspectionSharingView: View {
    let listingId: String
    var onChanged: () -> Void

    @State private var options: [MarketplaceAttachableInspection] = []
    @State private var selectedRequestId: String?
    @State private var attachedRequestId: String?
    @State private var report: MarketplaceInspectionReport?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var notice: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.spacing) {
                Text("Choose an inspection you requested for this vehicle. The preview below is exactly what buyers can see.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if loading {
                    ProgressView("Loading inspections…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 36)
                } else if options.isEmpty {
                    EmptyStateCard(
                        title: "No inspection to share",
                        message: "A submitted or completed inspection you requested for this vehicle will appear here.",
                        systemImage: "checklist"
                    )
                } else {
                    VStack(spacing: 8) {
                        ForEach(options) { option in
                            Button {
                                Task { await select(option) }
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: selectedRequestId == option.requestId ? "largecircle.fill.circle" : "circle")
                                        .foregroundStyle(selectedRequestId == option.requestId ? Theme.Palette.primary : .secondary)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(scopeLabel(option.scope))
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        Text("\(option.inspectedAt.formatted(date: .abbreviated, time: .omitted)) · \(option.performedBy)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        if option.attached {
                                            Text("Currently shared")
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(Theme.Palette.success)
                                        }
                                    }
                                    Spacer()
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.Palette.subtle)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    HStack(spacing: 10) {
                        Button {
                            Task { await publish() }
                        } label: {
                            Text(saving ? "Updating…" : "Publish selection")
                        }
                        .buttonStyle(PrimaryButtonStyle(isLoading: saving))
                        .disabled(selectedRequestId == nil || saving)

                        if attachedRequestId != nil {
                            Button("Stop sharing", role: .destructive) {
                                Task { await stopSharing() }
                            }
                            .buttonStyle(OutlineButtonStyle())
                            .disabled(saving)
                        }
                    }

                    if let report {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("What buyers will see")
                                .font(.headline)
                            Text(selectedRequestId == attachedRequestId
                                 ? "This inspection is currently shared on the listing."
                                 : "Nothing changes until you publish this selection.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            MarketplaceInspectionReportCard(report: report, preview: true)
                        }
                    }
                }

                if let error {
                    Text(error)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                        .accessibilityLabel("Error: \(error)")
                }
                if let notice {
                    Text(notice)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.Palette.success)
                }
            }
            .padding()
        }
        .navigationTitle("Inspection sharing")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
        .task { await load() }
    }

    @MainActor
    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let data = try await MarketplaceAPI.inspectionSharing(listingId: listingId)
            options = data.options
            attachedRequestId = data.attachedInspectionId
            let initialSelection = data.attachedInspectionId ?? data.options.first?.requestId
            selectedRequestId = initialSelection
            if data.attachedInspectionId == nil, let initialSelection {
                report = try await MarketplaceAPI.inspectionSharing(
                    listingId: listingId,
                    previewRequestId: initialSelection
                ).report
            } else {
                report = data.report
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func select(_ option: MarketplaceAttachableInspection) async {
        selectedRequestId = option.requestId
        error = nil
        do {
            report = try await MarketplaceAPI.inspectionSharing(
                listingId: listingId,
                previewRequestId: option.requestId
            ).report
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func publish() async {
        guard let selectedRequestId, !saving else { return }
        saving = true
        error = nil
        notice = nil
        defer { saving = false }
        do {
            let result = try await MarketplaceAPI.attachInspection(
                listingId: listingId,
                requestId: selectedRequestId
            )
            attachedRequestId = result.attachedInspectionId
            options = options.map { option in
                MarketplaceAttachableInspection(
                    requestId: option.requestId,
                    scope: option.scope,
                    inspectedAt: option.inspectedAt,
                    performerType: option.performerType,
                    performedBy: option.performedBy,
                    requestStatus: option.requestStatus,
                    attached: option.requestId == result.attachedInspectionId
                )
            }
            notice = "Inspection sharing updated."
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func stopSharing() async {
        guard !saving else { return }
        saving = true
        error = nil
        notice = nil
        defer { saving = false }
        do {
            _ = try await MarketplaceAPI.attachInspection(listingId: listingId, requestId: nil)
            attachedRequestId = nil
            options = options.map { option in
                MarketplaceAttachableInspection(
                    requestId: option.requestId,
                    scope: option.scope,
                    inspectedAt: option.inspectedAt,
                    performerType: option.performerType,
                    performedBy: option.performedBy,
                    requestStatus: option.requestStatus,
                    attached: false
                )
            }
            notice = "The inspection is no longer shared."
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func scopeLabel(_ scope: InspectionScope) -> String {
        scope == .dentsTires ? "Dents & Tires (limited scope)" : "Complete inspection"
    }
}

/// Buyer-safe inspection projection. It intentionally never computes a score
/// or pass/fail and names withheld prompts without showing their values.
private struct MarketplaceInspectionReportCard: View {
    let report: MarketplaceInspectionReport
    let preview: Bool

    private var stale: Bool {
        report.inspectedAt < (Calendar.current.date(byAdding: .month, value: -12, to: Date()) ?? Date())
    }

    private var ageLabel: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: report.inspectedAt, relativeTo: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                reportRow("Scope", report.scope == .dentsTires ? "Dents & Tires (limited)" : "Complete inspection")
                reportRow("Inspected", "\(report.inspectedAt.formatted(date: .abbreviated, time: .omitted)) · \(ageLabel)")
                reportRow("Performed by", report.performedBy)
            }

            if stale || report.scope == .dentsTires {
                Label(caveat, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(Theme.Palette.warning)
            } else {
                Text(caveat)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(report.sections) { section in
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        if section.items.isEmpty {
                            Text("No structured findings were recorded in this section.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(section.items) { item in
                                reportRow(item.prompt, answer(item))
                            }
                        }
                        if !section.withheld.isEmpty {
                            Label("\(preview ? "Withheld from buyers" : "Not shared"): \(section.withheld.joined(separator: "; "))", systemImage: "eye.slash")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if section.notesWithheld {
                            Label("Section notes are \(preview ? "withheld from buyers" : "not shared").", systemImage: "eye.slash")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if section.mediaCount > 0 {
                            Label("\(section.mediaCount) photo\(section.mediaCount == 1 ? "" : "s") \(preview ? "stay private" : "not shared").", systemImage: "photo.badge.exclamationmark")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(sectionLabel(section.sectionType))
                            .font(.subheadline.weight(.semibold))
                        Text("\(section.completionState == "completed" ? "" : "Not completed · ")\(section.items.count) finding\(section.items.count == 1 ? "" : "s")")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Divider()
            }

            Text("\(report.withheldCount) item\(report.withheldCount == 1 ? "" : "s") and \(report.mediaCount) photo\(report.mediaCount == 1 ? "" : "s") are withheld. Free-text notes, private media, VIN, addresses, and documents stay private. PerfectPPI does not turn an inspection into a score or pass/fail.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var caveat: String {
        var parts: [String] = []
        if report.scope == .dentsTires {
            parts.append("This inspection covered dents, body damage, wheels, and tires only.")
        }
        if stale {
            parts.append("This inspection is over a year old, so the vehicle's condition may have changed.")
        }
        parts.append("Findings describe the vehicle on that date and are not a guarantee of its condition now.")
        return parts.joined(separator: " ")
    }

    private func reportRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value).fontWeight(.medium).multilineTextAlignment(.trailing)
        }
        .font(.caption)
    }

    private func answer(_ item: MarketplaceInspectionReportItem) -> String {
        guard item.answerType == "yes_no" else { return item.value }
        switch item.value.lowercased() {
        case "yes", "true", "1": return "Yes"
        case "no", "false", "0": return "No"
        default: return item.value
        }
    }

    private func sectionLabel(_ raw: String) -> String {
        let labels = [
            "vehicle_basics": "Vehicle Basics", "dashboard_warnings": "Dashboard & Warnings",
            "exterior": "Exterior", "interior": "Interior", "engine_bay": "Engine Bay",
            "tires_brakes": "Tires & Brakes", "suspension_steering": "Suspension & Steering",
            "fluids": "Fluids", "electrical_controls": "Electrical & Controls",
            "underbody": "Underbody", "road_test": "Road Test", "modifications": "Modifications",
            "wheels_tires": "Wheels & Tires", "body_damage": "Body Damage"
        ]
        return labels[raw] ?? raw.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

private struct MyListingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()
    @State private var showingCreate = false
    @State private var editingListing: MarketplaceListing?
    @State private var removing: MarketplaceListing?
    @State private var error: String?

    var body: some View {
        AsyncContent(
            load: { try await MarketplaceAPI.mine() },
            loaded: { listings in
                Group {
                    if listings.isEmpty {
                        EmptyStateCard(
                            title: "No listings",
                            message: "Create a listing from one of your public vehicles.",
                            systemImage: "tag"
                        )
                        .padding()
                    } else {
                        List(listings) { listing in
                            VStack(alignment: .leading, spacing: 8) {
                                NavigationLink {
                                    MarketplaceListingDetailView(
                                        listing: listing,
                                        currentProfileId: listing.sellerId
                                    )
                                } label: {
                                    MarketplaceListingRow(listing: listing)
                                }
                                HStack {
                                    StatusBadge(
                                        text: listing.status.label,
                                        color: statusColor(listing.status)
                                    )
                                    Spacer()
                                    Menu {
                                        if listing.status != .removed {
                                            Button("Edit", systemImage: "pencil") {
                                                editingListing = listing
                                            }
                                        }
                                        ForEach(listing.status.manageActions) { action in
                                            if action == .remove {
                                                Button(action.label, systemImage: "trash", role: .destructive) {
                                                    removing = listing
                                                }
                                            } else if let target = action.target {
                                                Button(action.label) {
                                                    Task { await update(listing, status: target) }
                                                }
                                            }
                                        }
                                    } label: {
                                        Image(systemName: "ellipsis.circle")
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("My Listings")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button { showingCreate = true } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
                .sheet(isPresented: $showingCreate) {
                    NewListingView {
                        reloadToken = UUID()
                    }
                }
                .sheet(item: $editingListing) { listing in
                    EditListingView(listing: listing) {
                        reloadToken = UUID()
                    }
                }
                .confirmationDialog(
                    "Remove this listing?",
                    isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                    titleVisibility: .visible
                ) {
                    Button("Remove listing", role: .destructive) {
                        if let listing = removing { Task { await remove(listing) } }
                    }
                    Button("Cancel", role: .cancel) { removing = nil }
                } message: {
                    Text("Members who saved it or requested an inspection will see it as no longer available. This cannot be undone.")
                }
                .alert("Could not update", isPresented: .constant(error != nil)) {
                    Button("OK") { error = nil }
                } message: {
                    Text(error ?? "")
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
    }

    @MainActor
    private func update(_ listing: MarketplaceListing, status: ListingStatus) async {
        do {
            _ = try await MarketplaceAPI.updateStatus(id: listing.id, status: status)
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func remove(_ listing: MarketplaceListing) async {
        defer { removing = nil }
        do {
            _ = try await MarketplaceAPI.remove(id: listing.id)
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func statusColor(_ status: ListingStatus) -> Color {
        switch status {
        case .active: return Theme.Palette.success
        case .pending: return Theme.Palette.warning
        case .sold: return Theme.Palette.primary
        case .removed: return Theme.Palette.danger
        case .paused, .archived, .unknown: return .secondary
        }
    }
}

private struct EditListingView: View {
    @Environment(\.dismiss) private var dismiss
    let listing: MarketplaceListing
    let onSaved: () -> Void

    @State private var title: String
    @State private var description: String
    @State private var askingPrice: String
    @State private var location: String
    @State private var saving = false
    @State private var error: String?

    init(listing: MarketplaceListing, onSaved: @escaping () -> Void) {
        self.listing = listing
        self.onSaved = onSaved
        _title = State(initialValue: listing.title)
        _description = State(initialValue: listing.description ?? "")
        _askingPrice = State(initialValue: String(format: "%.0f", Double(listing.askingPriceCents) / 100))
        _location = State(initialValue: listing.location ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Listing") {
                    TextField("Title", text: $title)
                    TextField("Asking price", text: $askingPrice)
                        .keyboardType(.decimalPad)
                    TextField("Location", text: $location)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3...8)
                }
                if let error {
                    Text(error).foregroundStyle(Theme.Palette.danger)
                }
            }
            .navigationTitle("Edit Listing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving || Double(askingPrice) == nil || trimmedTitle.isEmpty)
                }
            }
        }
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func save() async {
        guard !saving, !trimmedTitle.isEmpty, let price = Double(askingPrice), price > 0 else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await MarketplaceAPI.update(
                id: listing.id,
                payload: .init(
                    title: trimmedTitle,
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    askingPrice: price,
                    location: location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                )
            )
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct NewListingView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var selectedVehicleId = ""
    @State private var title = ""
    @State private var description = ""
    @State private var askingPrice = ""
    @State private var location = ""
    @State private var saving = false
    @State private var error: String?

    init(preselectedVehicleId: String? = nil, onCreated: @escaping () -> Void) {
        self.onCreated = onCreated
        _selectedVehicleId = State(initialValue: preselectedVehicleId ?? "")
    }

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await VehiclesAPI.list() },
                loaded: { vehicles in
                    let publicVehicles = vehicles.filter { $0.visibility == .public }
                    Form {
                        Section("Vehicle") {
                            Picker("Vehicle", selection: $selectedVehicleId) {
                                Text("Select a vehicle").tag("")
                                ForEach(publicVehicles) { vehicle in
                                    Text(vehicleLabel(vehicle)).tag(vehicle.id)
                                }
                            }
                            if publicVehicles.isEmpty {
                                Text("Make a vehicle public before creating a marketplace listing.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Section("Listing") {
                            TextField("Title", text: $title)
                            TextField("Asking price", text: $askingPrice)
                                .keyboardType(.decimalPad)
                            TextField("Location", text: $location)
                            TextField("Description", text: $description, axis: .vertical)
                                .lineLimit(3...6)
                        }

                        if let error {
                            Text(error).foregroundStyle(Theme.Palette.danger)
                        }
                    }
                    .onAppear {
                        if title.isEmpty,
                           let vehicle = publicVehicles.first(where: { $0.id == selectedVehicleId }) {
                            title = vehicleLabel(vehicle)
                        }
                    }
                },
                failure: { error, retry in
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            )
            .navigationTitle("New Listing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave || saving)
                }
            }
        }
    }

    private var canSave: Bool {
        !selectedVehicleId.isEmpty && Double(askingPrice) != nil
    }

    private func save() async {
        guard canSave, !saving, let price = Double(askingPrice) else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await MarketplaceAPI.create(
                .init(
                    vehicleId: selectedVehicleId,
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    askingPrice: price,
                    location: location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                )
            )
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func vehicleLabel(_ vehicle: Vehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

private struct ListingThumbnail: View {
    let listing: MarketplaceListing

    /// `Color.clear` is fully flexible, so this view adopts exactly the frame
    /// its caller sets and never reports the photo's own size. The image rides
    /// in an overlay (which does not participate in layout) and is clipped, so
    /// a large or oddly-proportioned listing photo can no longer push the row
    /// wider than the screen and get cut off.
    var body: some View {
        Color.clear
            .overlay { content }
            .clipped()
    }

    @ViewBuilder
    private var content: some View {
        if let url = listing.vehicle?.vehicleMedia?.first(where: { $0.isPrimary == true })?.url
            ?? listing.vehicle?.vehicleMedia?.first?.url,
           let imageURL = URL(string: url) {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    placeholder
                default:
                    ZStack { Theme.Palette.subtle; ProgressView() }
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Theme.Palette.subtle
            Image(systemName: "car")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
    }
}


/// Public wrapper so other features (Garage) can push the listing detail.
struct MarketplaceListingSummaryView: View {
    let listing: MarketplaceListing
    let currentProfileId: String?

    var body: some View {
        MarketplaceListingDetailView(listing: listing, currentProfileId: currentProfileId)
    }
}

/// Loads one listing by id (deep links, Garage hop) and shows the detail.
struct MarketplaceListingLoaderView: View {
    let listingId: String
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        AsyncContent(
            load: { try await MarketplaceAPI.get(id: listingId) },
            loaded: { listing in MarketplaceListingSummaryView(listing: listing, currentProfileId: auth.profile?.id) },
            failure: { error, retry in
                if let apiError = error as? APIError, case .notFound = apiError {
                    EmptyStateCard(
                        title: "Listing unavailable",
                        message: "This listing is no longer available.",
                        systemImage: "tag.slash"
                    )
                    .padding()
                } else {
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            }
        )
    }
}
