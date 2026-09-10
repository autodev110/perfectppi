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

    @ViewBuilder
    private func garageList(_ vehicles: [Vehicle]) -> some View {
        let filteredVehicles = vehicles.filter(matchesFilter)

        List {
            if !vehicles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(GarageFilter.allCases) { filter in
                            Button(filter.label) { garageFilter = filter }
                                .buttonStyle(.bordered)
                                .buttonBorderShape(.capsule)
                                .tint(garageFilter == filter ? Theme.Palette.primary : .secondary)
                        }
                    }
                    .padding(.horizontal, 2)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
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
                ForEach(filteredVehicles) { vehicle in
                    NavigationLink {
                        VehicleDetailView(vehicleId: vehicle.id) {
                            reloadToken = UUID()
                        }
                    } label: {
                        GarageVehicleRow(vehicle: vehicle)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func matchesFilter(_ vehicle: Vehicle) -> Bool {
        switch garageFilter {
        case .all: true
        case .owned: vehicle.ownershipState == nil || vehicle.ownershipState == .owned
        case .previouslyOwned: vehicle.ownershipState == .previouslyOwned
        case .considering: vehicle.ownershipState == .considering
        case .project: vehicle.ownershipState == .project
        case .listed: vehicle.marketplaceListings?.contains { $0.status == .active } == true
        }
    }
}

private enum GarageFilter: String, CaseIterable, Identifiable {
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

private struct GarageVehicleRow: View {
    let vehicle: Vehicle

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            vehiclePhoto
                .frame(width: 82, height: 66)
                .background(Theme.Palette.subtle)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 5) {
                Text(vehicle.nickname?.isEmpty == false ? (vehicle.nickname ?? vehicleName) : vehicleName)
                    .font(.headline)
                    .lineLimit(1)
                if vehicle.nickname?.isEmpty == false {
                    Text(vehicleName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let mileage = vehicle.mileage {
                    HStack(spacing: 4) {
                        Text("\(mileage.formatted()) mi")
                        if let updatedAt = vehicle.mileageUpdatedAt {
                            Text("· Updated \(updatedAt, style: .date)")
                        }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
                HStack(spacing: 8) {
                    Label((vehicle.ownershipState ?? .owned).label, systemImage: "key")
                    if let inspection = latestInspection {
                        Label(inspectionLabel(inspection.status), systemImage: "checkmark.seal")
                    }
                    if vehicle.marketplaceListings?.contains(where: { $0.status == .active }) == true {
                        Label("Listed", systemImage: "tag")
                    }
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .padding(.vertical, 5)
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
            Image(systemName: "car").foregroundStyle(.secondary)
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

    private func inspectionLabel(_ status: PpiRequestStatus) -> String {
        switch status {
        case .submitted, .completed: "Report"
        case .inProgress: "In progress"
        case .needsRevision: "Needs revision"
        default: status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

struct VehicleDetailView: View {
    let vehicleId: String
    private let onDelete: () -> Void

    init(vehicleId: String, onDelete: @escaping () -> Void = {}) {
        self.vehicleId = vehicleId
        self.onDelete = onDelete
    }

    @Environment(\.dismiss) private var dismiss
    @State private var vehicle: Vehicle?
    @State private var savingVisibility = false
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

    var body: some View {
        Group {
            if let vehicle {
                List {
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
                            }
                            .listRowInsets(EdgeInsets())
                        }
                    }

                    Section("Details") {
                        if let nickname = vehicle.nickname {
                            LabeledContent("Nickname", value: nickname)
                        }
                        LabeledContent("Vehicle", value: vehicleName(vehicle))
                        LabeledContent("Garage relationship", value: (vehicle.ownershipState ?? .owned).label)
                        if let vin = vehicle.vin {
                            LabeledContent("VIN", value: vin)
                        }
                        if let mileage = vehicle.mileage {
                            LabeledContent {
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text("\(mileage.formatted()) mi")
                                    if let updatedAt = vehicle.mileageUpdatedAt {
                                        Text("Updated \(updatedAt, style: .date)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            } label: {
                                Text("Mileage")
                            }
                        }
                        LabeledContent("Visibility", value: vehicle.visibility?.rawValue.capitalized ?? "—")
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

                    Section("Visibility") {
                        Button(savingVisibility ? "Updating…" : nextVisibilityTitle(vehicle)) {
                            Task { await toggleVisibility() }
                        }
                        .disabled(savingVisibility)
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
                }
            } else if let error {
                ErrorView(message: error.localizedDescription) {
                    Task { await load() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Vehicle")
        .task { await load() }
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
        .alert("Vehicle",
               isPresented: .constant(inlineAlert != nil),
               actions: { Button("OK") { inlineAlert = nil } },
               message: { Text(inlineAlert ?? "") })
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
        do {
            self.vehicle = try await VehiclesAPI.get(id: vehicleId)
            self.notes = self.vehicle?.notes ?? ""
            self.error = nil
        } catch {
            self.error = error
        }
    }

    private func toggleVisibility() async {
        guard !savingVisibility else { return }
        guard let vehicle else { return }
        savingVisibility = true
        defer { savingVisibility = false }

        let next: VehicleVisibility = vehicle.visibility == .public ? .private : .public
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
                    visibility: next,
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

    private func nextVisibilityTitle(_ vehicle: Vehicle) -> String {
        vehicle.visibility == .public ? "Make Private" : "Make Public"
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
    @State private var nickname: String
    @State private var ownershipState: VehicleOwnershipState
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
        _nickname = State(initialValue: vehicle.nickname ?? "")
        _ownershipState = State(initialValue: vehicle.ownershipState ?? .owned)
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
                    ForEach(VehicleOwnershipState.allCases) { state in
                        Text(state.label).tag(state)
                    }
                }
                TextField("VIN", text: $vin).textInputAutocapitalization(.characters)
                TextField("Make", text: $make)
                TextField("Model", text: $model)
                TextField("Trim", text: $trim)
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
                    visibility: nil,
                    notes: nil,
                    nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
                    ownershipState: ownershipState
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
    @State private var nickname = ""
    @State private var ownershipState: VehicleOwnershipState = .owned
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
                    ownershipState: ownershipState
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
}
