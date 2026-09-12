import AVKit
import Photos
import PhotosUI
import SwiftUI

struct VehiclesListView: View {
    @State private var presentNew = false
    @State private var reloadToken = UUID()
    @State private var garageFilter: GarageFilter = .all

    var body: some View {
        AsyncContent(
            load: { try await VehiclesAPI.list() },
            loaded: { vehicles in garageList(vehicles) },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
        .navigationTitle("Garage")
        .toolbar {
            Button {
                presentNew = true
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel("Add vehicle")
        }
        .sheet(isPresented: $presentNew) {
            NewVehicleView { _ in
                reloadToken = UUID()
            }
        }
    }

    private func garageList(_ vehicles: [Vehicle]) -> some View {
        GarageList(vehicles: vehicles, filter: $garageFilter) { reloadToken = UUID() }
    }
}

/// The Garage list body. Separate from the loader so it can be rendered
/// with fixture data (previews, layout tests).
struct GarageList: View {
    let vehicles: [Vehicle]
    @Binding var filter: GarageFilter
    var onChanged: () -> Void = {}

    var body: some View {
        let filteredVehicles = vehicles.filter(matchesFilter)

        List {
            if !vehicles.isEmpty {
                // One standard menu picker row instead of a scrolling chip
                // strip: the current choice reads at a glance and the list of
                // options never runs off screen.
                Section {
                    Picker(selection: $filter) {
                        ForEach(GarageFilter.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    } label: {
                        Label("Show", systemImage: "line.3.horizontal.decrease.circle")
                    }
                    .pickerStyle(.menu)
                }
            }

            if vehicles.isEmpty {
                EmptyStateCard(
                    title: "No vehicles yet",
                    message: "Add a vehicle to start an inspection.",
                    systemImage: "car"
                )
                .listRowBackground(Color.clear)
            } else if filteredVehicles.isEmpty {
                EmptyStateCard(
                    title: "No vehicles match this filter",
                    message: "Choose All to see every vehicle in your Garage.",
                    systemImage: "line.3.horizontal.decrease.circle"
                )
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(filteredVehicles) { vehicle in
                        NavigationLink {
                            VehicleDetailView(vehicleId: vehicle.id, onDelete: onChanged)
                        } label: {
                            GarageVehicleRow(vehicle: vehicle)
                        }
                    }
                } header: {
                    Text(filter == .all
                         ? "\(filteredVehicles.count) vehicle\(filteredVehicles.count == 1 ? "" : "s")"
                         : "\(filter.label) · \(filteredVehicles.count)")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func matchesFilter(_ vehicle: Vehicle) -> Bool {
        switch filter {
        case .all: true
        case .owned: vehicle.ownershipState == nil || vehicle.ownershipState == .owned
        case .previouslyOwned: vehicle.ownershipState == .previouslyOwned
        case .considering: vehicle.ownershipState == .considering
        case .project: vehicle.ownershipState == .project
        case .listed: vehicle.marketplaceListings?.contains { $0.status.isLive } == true
        }
    }
}

enum GarageFilter: String, CaseIterable, Identifiable {
    case all
    case owned
    case previouslyOwned
    case considering
    case project
    case listed

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .owned: "Owned"
        case .previouslyOwned: "Previously owned"
        case .considering: "Shopping"
        case .project: "Projects"
        case .listed: "Listed"
        }
    }
}

struct GarageVehicleRow: View {
    let vehicle: Vehicle

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            vehiclePhoto
                .frame(width: 84, height: 68)
                .background(Theme.Palette.subtle)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                Text(vehicle.nickname?.isEmpty == false ? (vehicle.nickname ?? vehicleName) : vehicleName)
                    .font(.headline)
                    .lineLimit(1)
                if vehicle.nickname?.isEmpty == false {
                    Text(vehicleName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let mileage = vehicle.mileage {
                    Text(mileageLine(mileage))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                // Chips wrap onto a new line instead of squeezing each label
                // into two broken words.
                ChipFlow(spacing: 6) {
                    GarageChip(text: (vehicle.ownershipState ?? .owned).label, systemImage: "key.fill", tint: Theme.Palette.primary)
                    if let inspection = latestInspection {
                        GarageChip(text: inspectionLabel(inspection.status), systemImage: "checkmark.seal.fill", tint: Theme.Palette.success)
                    }
                    if vehicle.marketplaceListings?.contains(where: { $0.status.isLive }) == true {
                        GarageChip(text: "Listed", systemImage: "tag.fill", tint: Theme.Palette.warning)
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var vehiclePhoto: some View {
        if let media = primaryPhoto, let url = URL(string: media.url) {
            AsyncImage(url: url) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFill()
                } else if case .failure = phase {
                    Image(systemName: "car").foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
            .clipped()
        } else {
            Image(systemName: "car.fill")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
    }

    private var primaryPhoto: VehicleMedia? {
        let photos = vehicle.vehicleMedia?.filter { $0.mediaType == .image } ?? []
        return photos.first(where: { $0.isPrimary == true }) ?? photos.first
    }

    private var latestInspection: GarageInspectionSummary? {
        vehicle.ppiRequests?.max { $0.createdAt < $1.createdAt }
    }

    private var vehicleName: String {
        let label = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
        return label.isEmpty ? "Unnamed Vehicle" : label
    }

    private func mileageLine(_ mileage: Int) -> String {
        guard let updatedAt = vehicle.mileageUpdatedAt else { return "\(mileage.formatted()) mi" }
        return "\(mileage.formatted()) mi · updated \(updatedAt.formatted(.dateTime.month(.abbreviated).day()))"
    }

    private func inspectionLabel(_ status: PpiRequestStatus) -> String {
        switch status {
        case .submitted, .completed: "Inspected"
        case .inProgress: "Inspection in progress"
        case .needsRevision: "Needs revision"
        case .draft: "Inspection draft"
        case .pendingAssignment, .assigned, .accepted: "Inspection scheduled"
        case .archived: "Inspection archived"
        }
    }
}

/// Small tinted capsule used for Garage status chips.
struct GarageChip: View {
    let text: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage).font(.system(size: 10, weight: .semibold))
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tint.opacity(0.12))
        .foregroundStyle(tint)
        .clipShape(Capsule())
    }
}

/// Left-aligned wrapping layout for chips; rows break when the width runs out.
struct ChipFlow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return CGSize(width: width == .infinity ? maxX : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX, y: CGFloat = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

struct VehicleDetailView: View {
    private enum PassportTab: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case posts = "Posts"
        case build = "Build"
        case maintenance = "Maintenance"
        case inspections = "Inspections"
        var id: String { rawValue }
    }

    let vehicleId: String
    private let onDelete: () -> Void
    /// Preview/test injection: skips the network load.
    private let preloaded: Vehicle?

    init(vehicleId: String, onDelete: @escaping () -> Void = {}) {
        self.vehicleId = vehicleId
        self.onDelete = onDelete
        self.preloaded = nil
    }

    init(preview vehicle: Vehicle) {
        self.vehicleId = vehicle.id
        self.onDelete = {}
        self.preloaded = vehicle
        _vehicle = State(initialValue: vehicle)
        _notes = State(initialValue: vehicle.notes ?? "")
    }

    @Environment(\.dismiss) private var dismiss
    @State private var vehicle: Vehicle?
    @State private var savingVisibility = false
    @State private var showingVisibilityOptions = false
    @State private var showingSoldOptions = false
    @State private var markingSold = false
    @State private var savingNotes = false
    @State private var notes = ""
    @State private var showingEdit = false
    @State private var showingInspections = false
    @State private var showingInspectionWizard = false
    @State private var showingListing = false
    @State private var showingPost = false
    @State private var showingPhotoPicker = false
    @State private var showingCamera = false
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var uploadingMedia = false
    @State private var mediaToDelete: VehicleMedia?
    @State private var showingDeleteVehicle = false
    @State private var deletingVehicle = false
    @State private var error: Error?
    @State private var inlineAlert: String?
    @State private var selectedTab: PassportTab = .overview
    @State private var buildEntries: [VehicleBuildEntry] = []
    @State private var maintenanceEvents: [VehicleMaintenanceEvent] = []
    @State private var loadingTimeline = false
    @State private var showingBuildForm = false
    @State private var showingMaintenanceForm = false

    var body: some View {
        Group {
            if let vehicle {
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(vehicle.nickname?.isEmpty == false
                                 ? (vehicle.nickname ?? vehicleName(vehicle))
                                 : vehicleName(vehicle))
                                .font(.title2.weight(.bold))
                                .fixedSize(horizontal: false, vertical: true)
                            if vehicle.nickname?.isEmpty == false {
                                Text(vehicleName(vehicle))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            ChipFlow(spacing: 6) {
                                GarageChip(text: (vehicle.ownershipState ?? .owned).label, systemImage: "key.fill", tint: Theme.Palette.primary)
                                GarageChip(
                                    text: (vehicle.visibility ?? .private).label,
                                    systemImage: (vehicle.visibility ?? .private).systemImage,
                                    tint: .secondary
                                )
                                if vehicle.marketplaceListings?.contains(where: { $0.status.isLive }) == true {
                                    GarageChip(text: "Listed", systemImage: "tag.fill", tint: Theme.Palette.warning)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    Section {
                        Picker("Vehicle Passport section", selection: $selectedTab) {
                            ForEach(PassportTab.allCases) { tab in
                                Text(tab.rawValue).tag(tab)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    if selectedTab == .overview {
                    if let media = vehicle.vehicleMedia, !media.isEmpty {
                        Section("Photos and videos") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(spacing: 12) {
                                    ForEach(sortedMedia(media)) { item in
                                        VehicleMediaTile(item: item) {
                                            mediaToDelete = item
                                        }
                                        .frame(width: 260, height: 190)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                        }
                    }

                    Section("Details") {
                        if let vin = vehicle.vin {
                            VehicleDetailRow(
                                label: "VIN",
                                value: vin,
                                systemImage: "barcode.viewfinder",
                                monospaced: true
                            )
                        }
                        if let mileage = vehicle.mileage {
                            VehicleDetailRow(
                                label: "Mileage",
                                value: mileageDetail(mileage, updatedAt: vehicle.mileageUpdatedAt),
                                systemImage: "gauge.with.dots.needle.50percent"
                            )
                        }
                        if let engine = vehicle.engine, !engine.isEmpty {
                            VehicleDetailRow(label: "Engine", value: engine, systemImage: "engine.combustion")
                        }
                        if let drivetrain = vehicle.drivetrain, !drivetrain.isEmpty {
                            VehicleDetailRow(label: "Drivetrain", value: drivetrain, systemImage: "gearshape.2")
                        }
                        if let transmission = vehicle.transmission, !transmission.isEmpty {
                            VehicleDetailRow(label: "Transmission", value: transmission, systemImage: "gearshift.layout.sixspeed")
                        }
                        if let bodyStyle = vehicle.bodyStyle, !bodyStyle.isEmpty {
                            VehicleDetailRow(label: "Body style", value: bodyStyle, systemImage: "car.side")
                        }
                        if let soldAt = vehicle.soldAt {
                            VehicleDetailRow(
                                label: "Marked sold",
                                value: soldAt.formatted(date: .abbreviated, time: .omitted),
                                systemImage: "checkmark.circle"
                            )
                        }
                        VehicleDetailRow(
                            label: "Garage",
                            value: (vehicle.ownershipState ?? .owned).label,
                            systemImage: "key"
                        )
                        Button("Edit Vehicle", systemImage: "pencil") {
                            showingEdit = true
                        }
                    }

                    Section("Actions") {
                        Button("View Inspections and Reports", systemImage: "doc.text.magnifyingglass") {
                            showingInspections = true
                        }
                        Button("New Inspection", systemImage: "checkmark.seal") {
                            showingInspectionWizard = true
                        }
                        Button("Create Marketplace Listing", systemImage: "tag") {
                            openPublicAction(.listing)
                        }
                        Button(uploadingMedia ? "Adding Media..." : "Add Media", systemImage: "photo.on.rectangle.angled") {
                            Task { await openPhotoLibrary() }
                        }
                        .disabled(uploadingMedia)
                        Button("Take Photo", systemImage: "camera") {
                            showingCamera = true
                        }
                        .disabled(uploadingMedia)
                        Button("Share", systemImage: "square.and.arrow.up") {
                            openPublicAction(.post)
                        }
                        // Garage → Community / Marketplace hops (plan Phase 1B).
                        if vehicle.visibility == .public {
                            NavigationLink {
                                VehicleCommunityPostsView(vehicle: vehicle)
                            } label: {
                                Label("Community Posts About This Vehicle", systemImage: "text.bubble")
                            }
                        }
                        if let listing = vehicle.marketplaceListings?.first(where: { $0.status.isLive }) {
                            NavigationLink {
                                MarketplaceListingLoaderView(listingId: listing.id)
                            } label: {
                                Label("View Marketplace Listing", systemImage: "tag")
                            }
                        }
                    }

                    Section("Notes") {
                        TextEditor(text: $notes)
                            .frame(minHeight: 110)
                        Button(savingNotes ? "Saving..." : "Save Notes") {
                            Task { await saveNotes() }
                        }
                        .disabled(savingNotes || notes.count > 5000)
                        if notes.count > 4500 {
                            Text("\(notes.count)/5000")
                                .font(.caption)
                                .foregroundStyle(notes.count > 5000 ? Theme.Palette.danger : .secondary)
                        }
                    }

                    Section {
                        Button(savingVisibility ? "Updating…" : "Change Visibility",
                               systemImage: (vehicle.visibility ?? .private).systemImage) {
                            showingVisibilityOptions = true
                        }
                        .disabled(savingVisibility)
                    } header: {
                        Text("Visibility")
                    } footer: {
                        Text(vehicle.visibility == .public
                             ? "Public vehicles can be attached to posts and listings and appear on your profile."
                             : vehicle.visibility == .friends
                               ? "Accepted friends can view this Vehicle Passport. Listings and post attachments still require Public."
                               : "Only you can view this vehicle.")
                    }

                    if vehicle.ownershipState == .owned || vehicle.ownershipState == .project {
                        Section {
                            Button(markingSold ? "Updating…" : "Mark as Sold", systemImage: "checkmark.seal") {
                                showingSoldOptions = true
                            }
                            .disabled(markingSold)
                        } header: {
                            Text("Ownership History")
                        } footer: {
                            Text("This closes active listings and keeps the vehicle under your account. It never transfers private records.")
                        }
                    }

                    Section {
                        Button("Delete Vehicle", role: .destructive) {
                            showingDeleteVehicle = true
                        }
                        .font(.caption)
                        .disabled(deletingVehicle)
                    } footer: {
                        Text("Deleting this vehicle also removes its inspections, reports, listings, and uploaded media.")
                    }
                    } else if selectedTab == .posts {
                        Section("Vehicle Posts") {
                            if vehicle.visibility == .public {
                                NavigationLink {
                                    VehicleCommunityPostsView(vehicle: vehicle)
                                } label: {
                                    Label("View Posts About This Vehicle", systemImage: "text.bubble")
                                }
                                Button("Create Post", systemImage: "square.and.pencil") {
                                    showingPost = true
                                }
                            } else {
                                Text("Make this vehicle Public before attaching it to a Community post.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else if selectedTab == .build {
                        Section {
                            Button("Add Build Entry", systemImage: "plus") { showingBuildForm = true }
                        } footer: {
                            Text("Costs and private notes stay visible only to you, even when an entry is shared.")
                        }
                        if loadingTimeline {
                            Section { ProgressView().frame(maxWidth: .infinity) }
                        } else if buildEntries.isEmpty {
                            Section { Text("No build entries yet.").foregroundStyle(.secondary) }
                        } else {
                            Section("Build Journal") {
                                ForEach(buildEntries) { entry in
                                    VehicleBuildEntryRow(entry: entry)
                                        .swipeActions {
                                            Button("Delete", role: .destructive) {
                                                Task { await deleteBuildEntry(entry) }
                                            }
                                        }
                                }
                            }
                        }
                    } else if selectedTab == .maintenance {
                        Section {
                            Button("Add Maintenance Event", systemImage: "plus") { showingMaintenanceForm = true }
                        } footer: {
                            Text("Private costs and notes never appear on the public Vehicle Passport.")
                        }
                        if loadingTimeline {
                            Section { ProgressView().frame(maxWidth: .infinity) }
                        } else if maintenanceEvents.isEmpty {
                            Section { Text("No maintenance events yet.").foregroundStyle(.secondary) }
                        } else {
                            Section("Maintenance Timeline") {
                                ForEach(maintenanceEvents) { event in
                                    VehicleMaintenanceEventRow(event: event)
                                        .swipeActions {
                                            Button("Delete", role: .destructive) {
                                                Task { await deleteMaintenanceEvent(event) }
                                            }
                                        }
                                }
                            }
                        }
                    } else {
                        Section("Inspections and Reports") {
                            if let inspections = vehicle.ppiRequests, !inspections.isEmpty {
                                ForEach(inspections.sorted { $0.createdAt > $1.createdAt }) { inspection in
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(inspection.createdAt.formatted(date: .abbreviated, time: .omitted)).font(.headline)
                                        Text(inspection.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            } else {
                                Text("No inspections yet for this vehicle.").foregroundStyle(.secondary)
                            }
                            Button("View Inspections and Reports", systemImage: "doc.text.magnifyingglass") { showingInspections = true }
                            Button("New Inspection", systemImage: "checkmark.seal") { showingInspectionWizard = true }
                        }
                    }
                }
                .listSectionSpacing(18)
            } else if let error {
                ErrorView(message: error.localizedDescription) {
                    Task { await load() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(vehicle.map { $0.nickname?.isEmpty == false ? ($0.nickname ?? "Vehicle") : vehicleName($0) } ?? "Vehicle")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task(id: selectedTab) {
            if selectedTab == .build || selectedTab == .maintenance { await loadTimelines() }
        }
        .refreshable { await load() }
        .photosPicker(
            isPresented: $showingPhotoPicker,
            selection: $pickerItems,
            maxSelectionCount: 10,
            matching: .any(of: [.images, .videos])
        )
        .onChange(of: pickerItems) { _, items in
            Task { await uploadPickerItems(items) }
        }
        .fullScreenCover(isPresented: $showingCamera) {
            CameraCaptureView(
                prompt: "Add a photo of this vehicle",
                onCapture: { data in
                    showingCamera = false
                    Task { await uploadAttachments([.cameraPhoto(data)]) }
                },
                onCancel: { showingCamera = false }
            )
        }
        .sheet(isPresented: $showingEdit) {
            if let vehicle {
                EditVehicleView(vehicle: vehicle) { Task { await load() } }
            }
        }
        .sheet(isPresented: $showingInspections) {
            VehicleInspectionsView(vehicleId: vehicleId)
        }
        .sheet(isPresented: $showingInspectionWizard) {
            PpiRequestWizard(preselectedVehicleId: vehicleId)
        }
        .sheet(isPresented: $showingListing) {
            NewListingView(preselectedVehicleId: vehicleId) {}
        }
        .sheet(isPresented: $showingPost) {
            NewCommunityPostView(preselectedVehicleId: vehicleId) {}
        }
        .sheet(isPresented: $showingBuildForm) {
            VehicleBuildEntryForm(vehicleId: vehicleId) {
                showingBuildForm = false
                Task { await loadTimelines() }
            }
        }
        .sheet(isPresented: $showingMaintenanceForm) {
            VehicleMaintenanceEventForm(vehicleId: vehicleId) {
                showingMaintenanceForm = false
                Task { await loadTimelines() }
            }
        }
        .alert("Vehicle",
               isPresented: .constant(inlineAlert != nil),
               actions: { Button("OK") { inlineAlert = nil } },
               message: { Text(inlineAlert ?? "") })
        .confirmationDialog(
            "Who can view this vehicle?",
            isPresented: $showingVisibilityOptions,
            titleVisibility: .visible
        ) {
            ForEach(VehicleVisibility.allCases) { visibility in
                Button(visibility.label) { Task { await setVisibility(visibility) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Marketplace listings and vehicle post attachments require Public.")
        }
        .confirmationDialog(
            "Mark this vehicle as sold?",
            isPresented: $showingSoldOptions,
            titleVisibility: .visible
        ) {
            Button("Keep Public History") { Task { await markSold(keepPublicHistory: true) } }
            Button("Keep History Private") { Task { await markSold(keepPublicHistory: false) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Active listings will be closed. Your Garage record and private inspection data stay with your account.")
        }
        .confirmationDialog(
            "Delete this media item?",
            isPresented: Binding(
                get: { mediaToDelete != nil },
                set: { if !$0 { mediaToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete Media", role: .destructive) {
                if let mediaToDelete { Task { await deleteMedia(mediaToDelete) } }
            }
            Button("Cancel", role: .cancel) { mediaToDelete = nil }
        } message: {
            Text("This cannot be undone.")
        }
        .confirmationDialog(
            "Are you sure you want to delete this vehicle?",
            isPresented: $showingDeleteVehicle,
            titleVisibility: .visible
        ) {
            Button("Delete Vehicle", role: .destructive) { Task { await deleteVehicle() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its inspections, reports, listings, notes, and media will also be deleted. This cannot be undone.")
        }
    }

    private func load() async {
        if preloaded != nil { return }
        do {
            self.vehicle = try await VehiclesAPI.get(id: vehicleId)
            self.notes = self.vehicle?.notes ?? ""
            self.error = nil
        } catch {
            self.error = error
        }
    }

    private func setVisibility(_ visibility: VehicleVisibility) async {
        guard !savingVisibility else { return }
        guard let vehicle else { return }
        savingVisibility = true
        defer { savingVisibility = false }

        do {
            _ = try await VehiclesAPI.update(
                id: vehicle.id,
                payload: .init(
                    vin: nil,
                    year: nil,
                    make: nil,
                    model: nil,
                    trim: nil,
                    mileage: nil,
                    visibility: visibility,
                    notes: nil
                )
            )
            await load()
        } catch {
            // Surface the error inline so the user knows the toggle failed.
            // Setting `self.error` would replace the whole view with ErrorView,
            // which is too aggressive for a sub-action — use an alert instead.
            self.inlineAlert = error.localizedDescription
        }
    }

    private func loadTimelines() async {
        guard !loadingTimeline, preloaded == nil else { return }
        loadingTimeline = true
        defer { loadingTimeline = false }
        do {
            async let build = VehiclesAPI.buildEntries(id: vehicleId)
            async let maintenance = VehiclesAPI.maintenanceEvents(id: vehicleId)
            buildEntries = try await build
            maintenanceEvents = try await maintenance
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func deleteBuildEntry(_ entry: VehicleBuildEntry) async {
        do {
            _ = try await VehiclesAPI.deleteBuildEntry(vehicleId: vehicleId, entryId: entry.id)
            await loadTimelines()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func deleteMaintenanceEvent(_ event: VehicleMaintenanceEvent) async {
        do {
            _ = try await VehiclesAPI.deleteMaintenanceEvent(vehicleId: vehicleId, eventId: event.id)
            await loadTimelines()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func markSold(keepPublicHistory: Bool) async {
        guard !markingSold else { return }
        markingSold = true
        defer { markingSold = false }
        do {
            _ = try await VehiclesAPI.markSold(id: vehicleId, keepPublicHistory: keepPublicHistory)
            await load()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func sortedMedia(_ media: [VehicleMedia]) -> [VehicleMedia] {
        media.sorted {
            if $0.isPrimary != $1.isPrimary { return $0.isPrimary == true }
            if $0.sortOrder != $1.sortOrder { return ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
            return ($0.uploadedAt ?? .distantPast) < ($1.uploadedAt ?? .distantPast)
        }
    }

    private func saveNotes() async {
        guard !savingNotes, notes.count <= 5000 else { return }
        savingNotes = true
        defer { savingNotes = false }
        do {
            _ = try await VehiclesAPI.update(
                id: vehicleId,
                payload: .init(
                    vin: nil, year: nil, make: nil, model: nil, trim: nil,
                    mileage: nil, visibility: nil, notes: notes
                )
            )
            await load()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func openPhotoLibrary() async {
        let status = await AttachmentPickerSupport.requestPhotoAccess()
        if status == .authorized || status == .limited {
            showingPhotoPicker = true
        } else {
            inlineAlert = "Photo access is off. Allow full or limited access in Settings to add photos or videos."
        }
    }

    private func uploadPickerItems(_ items: [PhotosPickerItem]) async {
        defer { pickerItems = [] }
        do {
            var attachments: [PickedAttachment] = []
            for item in items {
                attachments.append(try await AttachmentPickerSupport.load(item))
            }
            await uploadAttachments(attachments)
        } catch {
            inlineAlert = "One selected media item could not be loaded."
        }
    }

    private func uploadAttachments(_ attachments: [PickedAttachment]) async {
        guard !uploadingMedia, !attachments.isEmpty else { return }
        uploadingMedia = true
        defer { uploadingMedia = false }
        do {
            for attachment in attachments {
                _ = try await VehiclesAPI.addMedia(id: vehicleId, attachment: attachment)
            }
            await load()
        } catch {
            // Earlier items in a multi-select may already have succeeded.
            await load()
            inlineAlert = error.localizedDescription
        }
    }

    private func deleteMedia(_ media: VehicleMedia) async {
        defer { mediaToDelete = nil }
        do {
            _ = try await VehiclesAPI.removeMedia(vehicleId: vehicleId, mediaId: media.id)
            await load()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private enum PublicAction { case listing, post }

    private func openPublicAction(_ action: PublicAction) {
        guard vehicle?.visibility == .public else {
            inlineAlert = "Make this vehicle public first so it can be attached to a marketplace listing or community post."
            return
        }
        switch action {
        case .listing: showingListing = true
        case .post: showingPost = true
        }
    }

    private func deleteVehicle() async {
        guard !deletingVehicle else { return }
        deletingVehicle = true
        defer { deletingVehicle = false }
        do {
            _ = try await VehiclesAPI.delete(id: vehicleId)
            onDelete()
            dismiss()
        } catch {
            inlineAlert = error.localizedDescription
        }
    }

    private func vehicleName(_ vehicle: Vehicle) -> String {
        let label = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
        return label.isEmpty ? "Unnamed Vehicle" : label
    }

    private func mileageDetail(_ mileage: Int, updatedAt: Date?) -> String {
        guard let updatedAt else { return "\(mileage.formatted()) mi" }
        return "\(mileage.formatted()) mi · Updated \(updatedAt.formatted(date: .abbreviated, time: .omitted))"
    }
}

struct VehicleDetailRow: View {
    let label: String
    let value: String
    let systemImage: String
    var monospaced = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: systemImage)
                .font(.body)
                .frame(width: 24)
                .foregroundStyle(Theme.Palette.primary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(monospaced ? .system(.callout, design: .monospaced) : .body)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

private struct VehicleMediaTile: View {
    let item: VehicleMedia
    let onDelete: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if item.mediaType == .video, let url = URL(string: item.url) {
                    VideoPlayer(player: AVPlayer(url: url))
                } else {
                    AsyncImage(url: URL(string: item.url)) { phase in
                        if case .success(let image) = phase {
                            image.resizable().scaledToFill()
                        } else if case .failure = phase {
                            Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary)
                        } else {
                            ProgressView()
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Palette.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .clipped()

            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash.fill")
                    .padding(9)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(8)
        }
    }
}

private struct VehicleBuildEntryRow: View {
    let entry: VehicleBuildEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.title).font(.headline)
                Spacer()
                Text(entry.isPublic ? "Shared" : "Private")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text("\(entry.category) · \(entry.status.label)")
                .font(.subheadline).foregroundStyle(.secondary)
            if let manufacturer = entry.manufacturer {
                Text([manufacturer, entry.partNumber].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
            }
            HStack(spacing: 10) {
                if let date = entry.installedOn { Text(date) }
                if let mileage = entry.mileage { Text("\(mileage.formatted()) mi") }
                Text(entry.fitmentConfidence.label)
            }
            .font(.caption).foregroundStyle(.secondary)
            if let notes = entry.publicNotes, !notes.isEmpty { Text(notes).font(.subheadline) }
            if let notes = entry.privateNotes, !notes.isEmpty {
                Text("Private: \(notes)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
    }
}

private struct VehicleMaintenanceEventRow: View {
    let event: VehicleMaintenanceEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(event.serviceType).font(.headline)
                Spacer()
                Text(event.isPublic ? "Shared" : "Private")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(event.servicedOn).font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                if let mileage = event.mileage { Text("\(mileage.formatted()) mi") }
                if let provider = event.provider { Text(provider) }
            }
            .font(.caption).foregroundStyle(.secondary)
            if let parts = event.partsFluids, !parts.isEmpty { Text("Parts/fluids: \(parts)").font(.subheadline) }
            if let notes = event.publicNotes, !notes.isEmpty { Text(notes).font(.subheadline) }
            if let notes = event.privateNotes, !notes.isEmpty {
                Text("Private: \(notes)").font(.caption).foregroundStyle(.secondary)
            }
            if event.nextDueOn != nil || event.nextDueMileage != nil {
                Text([event.nextDueOn.map { "Next due \($0)" }, event.nextDueMileage.map { "at \($0.formatted()) mi" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.Palette.primary)
            }
        }
        .padding(.vertical, 3)
    }
}

private struct VehicleBuildEntryForm: View {
    let vehicleId: String
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var category = ""
    @State private var manufacturer = ""
    @State private var partNumber = ""
    @State private var status: VehicleBuildStatus = .installed
    @State private var installationKind: VehicleInstallationKind = .unknown
    @State private var includeDate = true
    @State private var installedOn = Date()
    @State private var mileage = ""
    @State private var shopName = ""
    @State private var cost = ""
    @State private var publicNotes = ""
    @State private var privateNotes = ""
    @State private var isPublic = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Modification") {
                    TextField("Title", text: $title)
                    TextField("Category", text: $category)
                    TextField("Manufacturer", text: $manufacturer)
                    TextField("Part number", text: $partNumber)
                    Picker("Status", selection: $status) {
                        ForEach(VehicleBuildStatus.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Installed by", selection: $installationKind) {
                        ForEach(VehicleInstallationKind.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Include install date", isOn: $includeDate)
                    if includeDate { DatePicker("Install date", selection: $installedOn, displayedComponents: .date) }
                    TextField("Mileage", text: $mileage).keyboardType(.numberPad)
                    TextField("Shop", text: $shopName)
                    TextField("Cost in USD (private)", text: $cost).keyboardType(.decimalPad)
                }
                Section("Notes") {
                    TextField("Public notes", text: $publicNotes, axis: .vertical).lineLimit(3...8)
                    TextField("Private notes", text: $privateNotes, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    Toggle("Show on public Vehicle Passport", isOn: $isPublic)
                } footer: {
                    Text("Cost and private notes always remain private.")
                }
                if let error { Section { Text(error).foregroundStyle(Theme.Palette.danger) } }
            }
            .navigationTitle("Build Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(saving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() async {
        if !mileage.trimmed.isEmpty && Int(mileage) == nil {
            error = "Enter mileage as a whole number."
            return
        }
        if !cost.trimmed.isEmpty && garageCostCents(cost) == nil {
            error = "Enter a valid non-negative cost."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            _ = try await VehiclesAPI.addBuildEntry(id: vehicleId, payload: .init(
                category: category.trimmed, title: title.trimmed,
                manufacturer: manufacturer.nilIfBlank, partNumber: partNumber.nilIfBlank,
                installedOn: includeDate ? garageDateString(installedOn) : nil,
                mileage: Int(mileage), installationKind: installationKind,
                shopName: shopName.nilIfBlank, costCents: garageCostCents(cost),
                publicNotes: publicNotes.nilIfBlank, privateNotes: privateNotes.nilIfBlank,
                status: status, isPublic: isPublic
            ))
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct VehicleMaintenanceEventForm: View {
    let vehicleId: String
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var serviceType = ""
    @State private var servicedOn = Date()
    @State private var mileage = ""
    @State private var partsFluids = ""
    @State private var provider = ""
    @State private var cost = ""
    @State private var publicNotes = ""
    @State private var privateNotes = ""
    @State private var hasNextDueDate = false
    @State private var nextDueOn = Date()
    @State private var nextDueMileage = ""
    @State private var isPublic = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Service") {
                    TextField("Service type", text: $serviceType)
                    DatePicker("Service date", selection: $servicedOn, displayedComponents: .date)
                    TextField("Mileage", text: $mileage).keyboardType(.numberPad)
                    TextField("Provider", text: $provider)
                    TextField("Cost in USD (private)", text: $cost).keyboardType(.decimalPad)
                    TextField("Parts and fluids", text: $partsFluids, axis: .vertical).lineLimit(2...6)
                }
                Section("Next Service") {
                    Toggle("Set due date", isOn: $hasNextDueDate)
                    if hasNextDueDate { DatePicker("Due date", selection: $nextDueOn, displayedComponents: .date) }
                    TextField("Due mileage", text: $nextDueMileage).keyboardType(.numberPad)
                }
                Section("Notes") {
                    TextField("Public notes", text: $publicNotes, axis: .vertical).lineLimit(3...8)
                    TextField("Private notes", text: $privateNotes, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    Toggle("Show on public Vehicle Passport", isOn: $isPublic)
                } footer: {
                    Text("Cost and private notes always remain private.")
                }
                if let error { Section { Text(error).foregroundStyle(Theme.Palette.danger) } }
            }
            .navigationTitle("Maintenance Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(saving || serviceType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() async {
        if !mileage.trimmed.isEmpty && Int(mileage) == nil {
            error = "Enter mileage as a whole number."
            return
        }
        if !nextDueMileage.trimmed.isEmpty && Int(nextDueMileage) == nil {
            error = "Enter next due mileage as a whole number."
            return
        }
        if !cost.trimmed.isEmpty && garageCostCents(cost) == nil {
            error = "Enter a valid non-negative cost."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            _ = try await VehiclesAPI.addMaintenanceEvent(id: vehicleId, payload: .init(
                serviceType: serviceType.trimmed, servicedOn: garageDateString(servicedOn),
                mileage: Int(mileage), partsFluids: partsFluids.nilIfBlank,
                provider: provider.nilIfBlank, costCents: garageCostCents(cost),
                publicNotes: publicNotes.nilIfBlank, privateNotes: privateNotes.nilIfBlank,
                nextDueOn: hasNextDueDate ? garageDateString(nextDueOn) : nil,
                nextDueMileage: Int(nextDueMileage), isPublic: isPublic
            ))
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private func garageDateString(_ date: Date) -> String {
    let components = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
}

private func garageCostCents(_ value: String) -> Int? {
    guard let amount = Decimal(string: value.trimmed), amount >= 0 else { return nil }
    return NSDecimalNumber(decimal: amount * 100).intValue
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfBlank: String? { trimmed.isEmpty ? nil : trimmed }
}

private struct VehicleInspectionsView: View {
    @Environment(\.dismiss) private var dismiss
    let vehicleId: String
    @State private var reloadToken = UUID()
    @State private var inspectionToDelete: PpiRequest?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await PpiAPI.listRequests(vehicleId: vehicleId) },
                loaded: { inspections in
                    List {
                        if inspections.isEmpty {
                            EmptyStateCard(
                                title: "No inspections yet",
                                message: "Start an inspection to create reports for this vehicle.",
                                systemImage: "doc.text.magnifyingglass"
                            )
                            .listRowBackground(Color.clear)
                        } else {
                            ForEach(inspections) { inspection in
                                NavigationLink {
                                    ConsumerPpiDetailView(requestId: inspection.id) {
                                        reloadToken = UUID()
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(inspection.inspectionTitle).font(.headline)
                                        Text(["submitted", "completed"].contains(inspection.status.rawValue)
                                             ? "Report available"
                                             : inspection.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .swipeActions {
                                    Button("Delete", role: .destructive) { inspectionToDelete = inspection }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                },
                failure: { error, retry in ErrorView(message: error.localizedDescription, retry: retry) }
            )
            .id(reloadToken)
            .navigationTitle("Inspections & Reports")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .confirmationDialog(
                "Delete this inspection and its reports?",
                isPresented: Binding(
                    get: { inspectionToDelete != nil },
                    set: { if !$0 { inspectionToDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete Inspection", role: .destructive) {
                    if let inspectionToDelete { Task { await deleteInspection(inspectionToDelete) } }
                }
                Button("Cancel", role: .cancel) { inspectionToDelete = nil }
            } message: {
                Text("This cannot be undone.")
            }
            .alert("Couldn't delete inspection", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: { Text(error ?? "") }
        }
    }

    private func deleteInspection(_ inspection: PpiRequest) async {
        defer { inspectionToDelete = nil }
        do {
            _ = try await PpiAPI.deleteRequest(id: inspection.id)
            reloadToken = UUID()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct EditVehicleView: View {
    @Environment(\.dismiss) private var dismiss
    let vehicle: Vehicle
    let onSaved: () -> Void
    @State private var vin: String
    @State private var make: String
    @State private var model: String
    @State private var trim: String
    @State private var engine: String
    @State private var drivetrain: String
    @State private var transmission: String
    @State private var bodyStyle: String
    @State private var nickname: String
    @State private var ownershipState: VehicleOwnershipState
    @State private var visibility: VehicleVisibility
    @State private var year: String
    @State private var mileage: String
    @State private var saving = false
    @State private var error: String?

    init(vehicle: Vehicle, onSaved: @escaping () -> Void) {
        self.vehicle = vehicle
        self.onSaved = onSaved
        _vin = State(initialValue: vehicle.vin ?? "")
        _make = State(initialValue: vehicle.make ?? "")
        _model = State(initialValue: vehicle.model ?? "")
        _trim = State(initialValue: vehicle.trim ?? "")
        _engine = State(initialValue: vehicle.engine ?? "")
        _drivetrain = State(initialValue: vehicle.drivetrain ?? "")
        _transmission = State(initialValue: vehicle.transmission ?? "")
        _bodyStyle = State(initialValue: vehicle.bodyStyle ?? "")
        _nickname = State(initialValue: vehicle.nickname ?? "")
        _ownershipState = State(initialValue: vehicle.ownershipState ?? .owned)
        _visibility = State(initialValue: vehicle.visibility ?? .private)
        _year = State(initialValue: vehicle.year.map(String.init) ?? "")
        _mileage = State(initialValue: vehicle.mileage.map(String.init) ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nickname", text: $nickname)
                    .onChange(of: nickname) { _, value in
                        nickname = String(value.prefix(60))
                    }
                Picker("Garage relationship", selection: $ownershipState) {
                    ForEach(editableOwnershipStates) { state in
                        Text(state.label).tag(state)
                    }
                }
                Picker("Visibility", selection: $visibility) {
                    ForEach(VehicleVisibility.allCases) { option in
                        Label(option.label, systemImage: option.systemImage).tag(option)
                    }
                }
                TextField("VIN", text: $vin).textInputAutocapitalization(.characters)
                TextField("Make", text: $make)
                TextField("Model", text: $model)
                TextField("Trim", text: $trim)
                TextField("Engine", text: $engine)
                TextField("Drivetrain", text: $drivetrain)
                TextField("Transmission", text: $transmission)
                TextField("Body style", text: $bodyStyle)
                TextField("Year", text: $year).keyboardType(.numberPad)
                TextField("Mileage", text: $mileage).keyboardType(.numberPad)
                if let error { Text(error).foregroundStyle(Theme.Palette.danger) }
            }
            .navigationTitle("Edit Vehicle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") { Task { await save() } }
                        .disabled(
                            saving || nickname.count > 60 ||
                            make.trimmingCharacters(in: .whitespaces).isEmpty ||
                            model.trimmingCharacters(in: .whitespaces).isEmpty
                        )
                }
            }
        }
    }

    private var editableOwnershipStates: [VehicleOwnershipState] {
        vehicle.ownershipState == .previouslyOwned
            ? VehicleOwnershipState.allCases
            : VehicleOwnershipState.allCases.filter { $0 != .previouslyOwned }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await VehiclesAPI.update(
                id: vehicle.id,
                payload: .init(
                    vin: vin.trimmingCharacters(in: .whitespacesAndNewlines),
                    year: Int(year),
                    make: make.trimmingCharacters(in: .whitespacesAndNewlines),
                    model: model.trimmingCharacters(in: .whitespacesAndNewlines),
                    trim: trim.trimmingCharacters(in: .whitespacesAndNewlines),
                    mileage: Int(mileage),
                    visibility: visibility,
                    notes: nil,
                    nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                    ownershipState: ownershipState,
                    engine: engine.trimmingCharacters(in: .whitespacesAndNewlines),
                    drivetrain: drivetrain.trimmingCharacters(in: .whitespacesAndNewlines),
                    transmission: transmission.trimmingCharacters(in: .whitespacesAndNewlines),
                    bodyStyle: bodyStyle.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct NewVehicleView: View {
    @Environment(\.dismiss) private var dismiss
    private let onSave: (Vehicle) -> Void

    init(onSave: @escaping (Vehicle) -> Void = { _ in }) {
        self.onSave = onSave
    }

    @State private var vin = ""
    @State private var make = ""
    @State private var model = ""
    @State private var year = ""
    @State private var mileage = ""
    @State private var trim = ""
    @State private var engine = ""
    @State private var drivetrain = ""
    @State private var transmission = ""
    @State private var bodyStyle = ""
    @State private var nickname = ""
    @State private var ownershipState: VehicleOwnershipState = .owned
    @State private var visibility: VehicleVisibility = .private
    @State private var saving = false
    @State private var error: String?
    @State private var showVINScanner = false
    @State private var duplicateVehicle: Vehicle?

    var body: some View {
        NavigationStack {
            Form {
                Section("Garage") {
                    TextField("Nickname (optional)", text: $nickname)
                        .onChange(of: nickname) { _, value in
                            nickname = String(value.prefix(60))
                        }
                    Picker("Relationship", selection: $ownershipState) {
                        ForEach(VehicleOwnershipState.allCases) { state in
                            Text(state.label).tag(state)
                        }
                    }
                    Picker("Visibility", selection: $visibility) {
                        ForEach(VehicleVisibility.allCases) { option in
                            Label(option.label, systemImage: option.systemImage).tag(option)
                        }
                    }
                }
                Section("Vehicle") {
                    TextField("VIN", text: $vin)
                        .textInputAutocapitalization(.characters)
                        .onChange(of: vin) { _, value in
                            vin = String(value.uppercased().prefix(17))
                        }
                    Button {
                        showVINScanner = true
                    } label: {
                        Label("Scan VIN", systemImage: "camera.viewfinder")
                    }
                    TextField("Make", text: $make)
                    TextField("Model", text: $model)
                    TextField("Trim", text: $trim)
                    TextField("Year", text: $year).keyboardType(.numberPad)
                    TextField("Mileage", text: $mileage).keyboardType(.numberPad)
                }
                Section("Specifications") {
                    TextField("Engine", text: $engine)
                    TextField("Drivetrain", text: $drivetrain)
                    TextField("Transmission", text: $transmission)
                    TextField("Body style", text: $bodyStyle)
                }
                if let error {
                    Text(error).foregroundStyle(Theme.Palette.danger)
                }
                if let duplicateVehicle {
                    Section("Existing vehicle") {
                        NavigationLink {
                            VehicleDetailView(vehicleId: duplicateVehicle.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(vehicleLabel(duplicateVehicle)).font(.headline)
                                if let vin = duplicateVehicle.vin {
                                    Text(vin).font(.caption).foregroundStyle(.secondary)
                                }
                                Text("View vehicle details")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Theme.Palette.primary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Add Vehicle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving || !canSave)
                }
            }
            .fullScreenCover(isPresented: $showVINScanner) {
                VINScannerView { decoded in
                    vin = decoded.vin
                    if let decodedYear = decoded.year { year = String(decodedYear) }
                    if let decodedMake = decoded.make { make = decodedMake }
                    if let decodedModel = decoded.model { model = decodedModel }
                    if let decodedTrim = decoded.trim { trim = decodedTrim }
                }
            }
        }
    }

    private var canSave: Bool {
        let trimmedVin = vin.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedYear = year.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedMileage = mileage.trimmingCharacters(in: .whitespacesAndNewlines)

        let yearIsValid = trimmedYear.isEmpty || (Int(trimmedYear).map { (1900...2100).contains($0) } ?? false)
        let mileageIsValid = trimmedMileage.isEmpty || (Int(trimmedMileage).map { $0 >= 0 } ?? false)

        return !make.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        nickname.count <= 60 &&
        trimmedVin.count <= 17 &&
        yearIsValid &&
        mileageIsValid
    }

    private func save() async {
        guard !saving, canSave else { return }
        let trimmedVin = vin.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let trimmedMake = make.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTrim = trim.trimmingCharacters(in: .whitespacesAndNewlines)
        let parsedYear = Int(year.trimmingCharacters(in: .whitespacesAndNewlines))
        let parsedMileage = Int(mileage.trimmingCharacters(in: .whitespacesAndNewlines))

        saving = true
        error = nil
        duplicateVehicle = nil
        defer { saving = false }
        do {
            let created = try await VehiclesAPI.create(
                .init(
                    vin: trimmedVin.isEmpty ? nil : trimmedVin,
                    year: parsedYear,
                    make: trimmedMake,
                    model: trimmedModel,
                    trim: trimmedTrim.isEmpty ? nil : trimmedTrim,
                    mileage: parsedMileage,
                    nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                    ownershipState: ownershipState,
                    visibility: visibility,
                    engine: nilIfBlank(engine),
                    drivetrain: nilIfBlank(drivetrain),
                    transmission: nilIfBlank(transmission),
                    bodyStyle: nilIfBlank(bodyStyle)
                )
            )
            onSave(created)
            dismiss()
        } catch APIError.duplicateVehicle(let vehicle) {
            self.error = "It looks like you already have a vehicle with this same VIN."
            self.duplicateVehicle = vehicle
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func vehicleLabel(_ vehicle: Vehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }

    private func nilIfBlank(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
