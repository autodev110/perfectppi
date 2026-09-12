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

private struct MarketplaceListingDetailView: View {
    let listing: MarketplaceListing
    let currentProfileId: String?
    var onChanged: () -> Void = {}

    @State private var contacting = false
    @State private var requestingInspection = false
    @State private var notice: String?
    @State private var openConversationId: String?
    @State private var inspectionRequest: MarketplaceInspectionRequestSummary?
    @State private var saved: Bool
    @State private var saving = false

    init(listing: MarketplaceListing, currentProfileId: String?, onChanged: @escaping () -> Void = {}) {
        self.listing = listing
        self.currentProfileId = currentProfileId
        self.onChanged = onChanged
        _inspectionRequest = State(initialValue: listing.inspectionRequest)
        _saved = State(initialValue: listing.savedByViewer ?? false)
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
                // Aspect ratio first, then fill the width: the reverse order
                // lets the hero size itself from the photo and overflow.
                ListingThumbnail(listing: listing)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 6) {
                    Text(listing.title)
                        .font(.title2.bold())
                    Text("$\((listing.askingPriceCents / 100).formatted())")
                        .font(.title3.weight(.semibold))
                    if let location = listing.location, !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if let vehicle = listing.vehicle {
                    section("Vehicle") {
                        VStack(alignment: .leading, spacing: 6) {
                            row("Vehicle", vehicleLabel(vehicle))
                            if let mileage = vehicle.mileage {
                                row("Mileage", "\(mileage.formatted()) mi")
                            }
                            if let transmission = vehicle.transmission, !transmission.isEmpty {
                                row("Transmission", transmission)
                            }
                            if let drivetrain = vehicle.drivetrain, !drivetrain.isEmpty {
                                row("Drivetrain", drivetrain)
                            }
                            if let bodyStyle = vehicle.bodyStyle, !bodyStyle.isEmpty {
                                row("Body style", bodyStyle)
                            }
                            if let seller = MarketplaceFilters.sellerTypeLabel(listing.sellerType) {
                                row("Seller", seller)
                            }
                        }
                    }
                }

                if let inspection = listing.inspectionSummary {
                    section("Inspection") {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(
                                inspection.scope == .dentsTires ? "Dents & Tires inspection" : "Complete inspection",
                                systemImage: "checkmark.seal.fill"
                            )
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.Palette.success)
                            Text("Inspected \(inspection.inspectedAt.formatted(date: .abbreviated, time: .omitted)) by \(inspection.performedBy).")
                                .font(.caption)
                            Text("This reflects the vehicle at that time and is not a guarantee of its current condition. Private notes, media, VIN, and the full report are not publicly shared.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let description = listing.description, !description.isEmpty {
                    section("Description") {
                        Text(description)
                            .font(.subheadline)
                    }
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

                if listing.sellerId == currentProfileId {
                    Text("This is your listing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Button {
                        Task { await toggleSaved() }
                    } label: {
                        Label(saved ? "Saved" : "Save Listing", systemImage: saved ? "bookmark.fill" : "bookmark")
                    }
                    .buttonStyle(OutlineButtonStyle())
                    .disabled(saving)
                    .accessibilityLabel(saved ? "Remove listing from saved" : "Save listing")

                    Button {
                        Task { await contactSeller() }
                    } label: {
                        Label(contacting ? "Opening..." : "Contact Seller", systemImage: "message")
                    }
                    .buttonStyle(PrimaryButtonStyle(isLoading: contacting))
                    .disabled(contacting)

                    if let inspectionRequest {
                        NavigationLink {
                            ConsumerPpiDetailView(requestId: inspectionRequest.requestId)
                        } label: {
                            Label(
                                "Inspection requested · \(inspectionRequest.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)",
                                systemImage: "checkmark.circle"
                            )
                        }
                        .buttonStyle(OutlineButtonStyle())
                    } else {
                        Button {
                            Task { await requestInspection() }
                        } label: {
                            Label(
                                requestingInspection ? "Requesting..." : "Request Inspection",
                                systemImage: "checklist"
                            )
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(requestingInspection)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Listing")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $openConversationId) { conversationId in
            MessageThreadView(
                conversationId: conversationId,
                currentProfileId: currentProfileId
            )
        }
        .alert("Marketplace",
               isPresented: .constant(notice != nil),
               actions: { Button("OK") { notice = nil } },
               message: { Text(notice ?? "") })
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
            Text(value).fontWeight(.medium)
        }
        .font(.subheadline)
    }

    private func vehicleLabel(_ vehicle: Vehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
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

private struct MyListingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()
    @State private var showingCreate = false
    @State private var editingListing: MarketplaceListing?

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
                                        text: listing.status.rawValue.capitalized,
                                        color: statusColor(listing.status)
                                    )
                                    Spacer()
                                    Menu {
                                        Button("Edit", systemImage: "pencil") {
                                            editingListing = listing
                                        }
                                        Button("Mark Active") {
                                            Task { await update(listing, status: .active) }
                                        }
                                        Button("Mark Sold") {
                                            Task { await update(listing, status: .sold) }
                                        }
                                        Button("Archive") {
                                            Task { await update(listing, status: .archived) }
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
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
    }

    private func update(_ listing: MarketplaceListing, status: ListingStatus) async {
        do {
            _ = try await MarketplaceAPI.updateStatus(id: listing.id, status: status)
            reloadToken = UUID()
        } catch {
            // Keep the list visible; refreshing on the next user action will
            // retry. Full alert plumbing here would make the manager heavier.
        }
    }

    private func statusColor(_ status: ListingStatus) -> Color {
        switch status {
        case .active: return Theme.Palette.success
        case .sold: return Theme.Palette.primary
        case .archived: return .secondary
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
