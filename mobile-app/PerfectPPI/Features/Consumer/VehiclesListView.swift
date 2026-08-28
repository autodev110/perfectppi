import SwiftUI

struct VehiclesListView: View {
    @State private var presentNew = false
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await VehiclesAPI.list() },
            loaded: { vehicles in
                List {
                    if vehicles.isEmpty {
                        EmptyStateCard(
                            title: "No vehicles yet",
                            message: "Add a vehicle to start an inspection.",
                            systemImage: "car"
                        )
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(vehicles) { v in
                            NavigationLink {
                                VehicleDetailView(vehicleId: v.id)
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(vehicleName(v))
                                        .font(.headline)
                                    if let vin = v.vin {
                                        Text(vin).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .navigationTitle("Vehicles")
                .toolbar {
                    Button {
                        presentNew = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
                .sheet(isPresented: $presentNew) {
                    NewVehicleView { _ in
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

    private func vehicleName(_ vehicle: Vehicle) -> String {
        let label = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
        return label.isEmpty ? "Unnamed Vehicle" : label
    }
}

struct VehicleDetailView: View {
    let vehicleId: String

    @State private var vehicle: Vehicle?
    @State private var savingVisibility = false
    @State private var error: Error?
    @State private var inlineAlert: String?

    var body: some View {
        Group {
            if let vehicle {
                List {
                    if let primary = primaryMedia(for: vehicle) {
                        Section {
                            // The fill-mode image has no intrinsic bound, so it
                            // needs a definite 4:3 box to live in — otherwise a
                            // large photo sizes the row itself and the card runs
                            // off the edge of the screen.
                            Color.clear
                                .aspectRatio(4 / 3, contentMode: .fit)
                                .overlay {
                                    AsyncImage(url: URL(string: primary.url)) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image
                                                .resizable()
                                                .scaledToFill()
                                        case .failure:
                                            Image(systemName: "photo")
                                                .font(.largeTitle)
                                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                                .foregroundStyle(.secondary)
                                        default:
                                            ProgressView()
                                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                        }
                                    }
                                }
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }

                    Section("Details") {
                        LabeledContent("Vehicle", value: vehicleName(vehicle))
                        if let vin = vehicle.vin {
                            LabeledContent("VIN", value: vin)
                        }
                        if let mileage = vehicle.mileage {
                            LabeledContent("Mileage", value: "\(mileage) mi")
                        }
                        LabeledContent("Visibility", value: vehicle.visibility?.rawValue.capitalized ?? "—")
                    }

                    Section("Visibility") {
                        Button(savingVisibility ? "Updating…" : nextVisibilityTitle(vehicle)) {
                            Task { await toggleVisibility() }
                        }
                        .disabled(savingVisibility)
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
        .alert("Couldn't update visibility",
               isPresented: .constant(inlineAlert != nil),
               actions: { Button("OK") { inlineAlert = nil } },
               message: { Text(inlineAlert ?? "") })
    }

    private func load() async {
        do {
            self.vehicle = try await VehiclesAPI.get(id: vehicleId)
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
            self.vehicle = try await VehiclesAPI.update(
                id: vehicle.id,
                payload: .init(
                    vin: nil,
                    year: nil,
                    make: nil,
                    model: nil,
                    trim: nil,
                    mileage: nil,
                    visibility: next
                )
            )
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

    private func primaryMedia(for vehicle: Vehicle) -> VehicleMedia? {
        vehicle.vehicleMedia?.first(where: { $0.isPrimary == true }) ?? vehicle.vehicleMedia?.first
    }

    private func vehicleName(_ vehicle: Vehicle) -> String {
        let label = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
        return label.isEmpty ? "Unnamed Vehicle" : label
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
    @State private var saving = false
    @State private var error: String?
    @State private var showVINScanner = false

    var body: some View {
        NavigationStack {
            Form {
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
        defer { saving = false }
        do {
            let created = try await VehiclesAPI.create(
                .init(
                    vin: trimmedVin.isEmpty ? nil : trimmedVin,
                    year: parsedYear,
                    make: trimmedMake,
                    model: trimmedModel,
                    trim: trimmedTrim.isEmpty ? nil : trimmedTrim,
                    mileage: parsedMileage
                )
            )
            onSave(created)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
