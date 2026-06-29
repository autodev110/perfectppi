import SwiftUI

/// Mirrors the web's multi-step PPI request wizard:
///   1. Select vehicle
///   2. Confirm VIN + mileage
///   3. Whose car / requester role
///   4. Choose self or technician
///   5. Select technician when needed
///   6. Review + submit
struct PpiRequestWizard: View {
    @Environment(\.dismiss) private var dismiss
    private let onComplete: () -> Void

    init(onComplete: @escaping () -> Void = {}) {
        self.onComplete = onComplete
    }

    @State private var step: Int = 0
    @State private var vehicles: [Vehicle] = []
    @State private var technicians: [TechnicianProfile] = []

    @State private var selectedVehicleId: String?
    @State private var selectedTechId: String?
    @State private var vin: String = ""
    @State private var mileage: String = ""
    @State private var whoseCar: WhoseCar = .own
    @State private var requesterRole: RequesterRole = .buying
    @State private var performerType: PerformerType = .technician

    @State private var submitting = false
    @State private var error: String?
    /// Set to true once `loadInitial()` has completed (success OR failure) so
    /// the UI can distinguish "haven't fetched yet" from "fetched and empty".
    @State private var didLoad = false
    @State private var loadError: String?
    @State private var techLoadError: String?
    @State private var presentNewVehicle = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ProgressView(value: Double(step) / Double(maxStep))
                    .tint(Theme.Palette.primary)
                    .padding()

                Group {
                    switch step {
                    case 0: vehicleStep
                    case 1: vehicleInfoStep
                    case 2: roleStep
                    case 3: performerStep
                    case 4:
                        if performerType == .technician { technicianStep } else { reviewStep }
                    default: reviewStep
                    }
                }
                .padding(.horizontal)

                Spacer()

                navBar
            }
            .navigationTitle("New Inspection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await loadInitial() }
        }
    }

    // MARK: - Steps

    private var maxStep: Int { performerType == .technician ? 5 : 4 }

    @ViewBuilder
    private var vehicleStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Choose a vehicle").font(.headline)

            if !didLoad {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical)
            } else if let loadError {
                VStack(spacing: 10) {
                    Text(loadError)
                        .font(.subheadline)
                        .foregroundStyle(Theme.Palette.danger)
                    Button("Retry") {
                        Task { await loadInitial() }
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Theme.Palette.subtle)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if vehicles.isEmpty {
                EmptyStateCard(
                    title: "No vehicles yet",
                    message: "Add a vehicle to start an inspection — you can edit details on the next step.",
                    systemImage: "car"
                )
                Button {
                    presentNewVehicle = true
                } label: {
                    Label("Add a vehicle", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
            } else {
                ForEach(vehicles) { v in
                    Button {
                        selectedVehicleId = v.id
                        vin = v.vin ?? ""
                        mileage = v.mileage.map(String.init) ?? ""
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(v.year.map { "\($0) " } ?? "")\(v.make ?? "") \(v.model ?? "")")
                                    .font(.headline)
                                if let vin = v.vin {
                                    Text(vin).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if selectedVehicleId == v.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Theme.Palette.primary)
                            }
                        }
                        .padding()
                        .background(Theme.Palette.subtle)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(isPresented: $presentNewVehicle) {
            NewVehicleView {
                // Re-fetch the vehicle list once a new one is saved.
                Task { await loadInitial() }
            }
        }
    }

    @ViewBuilder
    private var vehicleInfoStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Confirm vehicle details").font(.headline)
            Text("The report needs the current VIN and mileage before the inspection starts.")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextField("VIN", text: $vin)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .onChange(of: vin) { _, value in
                    vin = String(value.uppercased().prefix(17))
                }

            TextField("Mileage", text: $mileage)
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)
        }
    }

    @ViewBuilder
    private var roleStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tell us about you").font(.headline)
            Picker("Whose car", selection: $whoseCar) {
                Text("My car").tag(WhoseCar.own)
                Text("Someone else's").tag(WhoseCar.other)
            }
            .pickerStyle(.segmented)

            Picker("I am", selection: $requesterRole) {
                Text("Buying").tag(RequesterRole.buying)
                Text("Selling").tag(RequesterRole.selling)
                Text("Documenting").tag(RequesterRole.documenting)
            }
            .pickerStyle(.segmented)
        }
    }

    @ViewBuilder
    private var performerStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Who will inspect it?").font(.headline)
            Picker("Performer", selection: $performerType) {
                Text("Myself").tag(PerformerType.selfInspection)
                Text("Technician").tag(PerformerType.technician)
            }
            .pickerStyle(.segmented)
            Text(performerType == .selfInspection
                 ? "Personal PPI starts immediately on this device."
                 : "Technician inspections are sent to the selected technician.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var technicianStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Choose a technician").font(.headline)
            if !didLoad {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical)
            } else if let techLoadError {
                VStack(spacing: 10) {
                    Label("Couldn't load technicians", systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.Palette.danger)
                    Text(techLoadError)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Use Self-Inspection instead") {
                        performerType = .selfInspection
                        step = 4
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Theme.Palette.subtle)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if technicians.isEmpty {
                EmptyStateCard(
                    title: "No technicians available",
                    message: "There are no inspectors signed up in your area yet. Try Self-Inspection or check back later.",
                    systemImage: "person.crop.circle.badge.questionmark"
                )
                Button("Use Self-Inspection instead") {
                    performerType = .selfInspection
                    step = 4
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(technicians) { tech in
                            Button {
                                selectedTechId = tech.id
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(tech.location ?? "Technician")
                                            .font(.headline)
                                        Text(tech.certificationLevel?.rawValue.capitalized ?? "—")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if selectedTechId == tech.id {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(Theme.Palette.primary)
                                    }
                                }
                                .padding()
                                .background(Theme.Palette.subtle)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Review").font(.headline)
            Group {
                Row(label: "Vehicle",
                    value: vehicles.first(where: { $0.id == selectedVehicleId })
                        .map { "\($0.year.map { "\($0) " } ?? "")\($0.make ?? "") \($0.model ?? "")" }
                        ?? "—")
                Row(label: "VIN", value: vin.isEmpty ? "—" : vin)
                Row(label: "Mileage", value: mileage.isEmpty ? "—" : "\(mileage) mi")
                Row(label: "Whose car", value: whoseCar.rawValue.capitalized)
                Row(label: "Role", value: requesterRole.rawValue.capitalized)
                Row(label: "Performer", value: performerType == .selfInspection ? "Myself" : "Technician")
                Row(label: "Technician",
                    value: performerType == .technician
                        ? technicians.first(where: { $0.id == selectedTechId })?.location ?? "—"
                        : "Not needed")
            }
            if let error {
                Text(error).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    @ViewBuilder
    private var navBar: some View {
        HStack {
            if step > 0 {
                Button("Back") { step -= 1 }
            }
            Spacer()
            if step < maxStep {
                Button("Next") {
                    step += 1
                }
                .buttonStyle(PrimaryButtonStyle())
                .frame(maxWidth: 160)
                .disabled(!canAdvance)
            } else {
                Button(submitting ? "Submitting…" : "Submit") {
                    Task { await submit() }
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: submitting))
                .frame(maxWidth: 160)
                .disabled(submitting || !canSubmit)
            }
        }
        .padding()
    }

    private var canAdvance: Bool {
        switch step {
        case 0: return selectedVehicleId != nil
        case 1: return hasValidVehicleInfo
        case 4: return performerType == .selfInspection || selectedTechId != nil
        default: return true
        }
    }

    private var canSubmit: Bool {
        return selectedVehicleId != nil &&
        hasValidVehicleInfo &&
        (performerType == .selfInspection || selectedTechId != nil)
    }

    private var hasValidVehicleInfo: Bool {
        let trimmedVin = vin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedVin.isEmpty, trimmedVin.count <= 17 else { return false }
        guard let parsedMileage = Int(mileage.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return parsedMileage >= 0
    }

    // MARK: - Data + submit

    private func loadInitial() async {
        loadError = nil
        techLoadError = nil
        // Don't swallow errors — show them so the user knows whether the list
        // is empty because they truly have no vehicles, or because the fetch
        // failed (offline, server down, 401).
        do {
            self.vehicles = try await VehiclesAPI.list()
        } catch {
            self.loadError = "Couldn't load your vehicles: \(error.localizedDescription)"
        }
        // Technician fetch is non-critical — if it fails we still let the user
        // pick Self-Inspection, but show why the technician picker is empty.
        do {
            let techs = try await TechniciansAPI.list()
            self.technicians = techs
        } catch {
            self.technicians = []
            self.techLoadError = error.localizedDescription
        }
        self.didLoad = true
    }

    private func submit() async {
        guard !submitting, canSubmit else { return }
        guard let vehicleId = selectedVehicleId,
              let parsedMileage = Int(mileage.trimmingCharacters(in: .whitespacesAndNewlines)),
              performerType == .selfInspection || selectedTechId != nil else { return }
        submitting = true
        defer { submitting = false }
        do {
            _ = try await PpiAPI.createRequest(
                .init(
                    vehicleId: vehicleId,
                    vin: vin.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(),
                    mileage: parsedMileage,
                    whoseCar: whoseCar,
                    requesterRole: requesterRole,
                    performerType: performerType,
                    assignedTechProfileId: performerType == .technician ? selectedTechId : nil
                )
            )
            onComplete()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct Row: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
