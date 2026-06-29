import SwiftUI

struct MarketplaceView: View {
    let currentProfileId: String?

    @State private var searchText = ""
    @State private var reloadToken = UUID()
    @State private var showingMine = false

    init(currentProfileId: String? = nil) {
        self.currentProfileId = currentProfileId
    }

    var body: some View {
        AsyncContent(
            load: { try await MarketplaceAPI.list(query: searchText.isEmpty ? nil : searchText) },
            loaded: { listings in
                Group {
                    if listings.isEmpty {
                        EmptyStateCard(
                            title: "No active listings",
                            message: "Public vehicles listed for sale will appear here.",
                            systemImage: "tag"
                        )
                        .padding()
                    } else {
                        List(listings) { listing in
                            NavigationLink {
                                MarketplaceListingDetailView(
                                    listing: listing,
                                    currentProfileId: currentProfileId
                                )
                            } label: {
                                MarketplaceListingRow(listing: listing)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Marketplace")
                .searchable(text: $searchText, prompt: "Search vehicles")
                .onSubmit(of: .search) {
                    reloadToken = UUID()
                }
                .toolbar {
                    Button {
                        showingMine = true
                    } label: {
                        Image(systemName: "person.crop.rectangle.stack")
                    }
                }
                .sheet(isPresented: $showingMine) {
                    NavigationStack {
                        MyListingsView()
                    }
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
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
                Text(listing.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(vehicleSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack {
                    Text("$\((listing.askingPriceCents / 100).formatted())")
                        .font(.subheadline.weight(.semibold))
                    if let location = listing.location, !location.isEmpty {
                        Text(location)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
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

    @State private var contacting = false
    @State private var notice: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.spacing) {
                ListingThumbnail(listing: listing)
                    .frame(maxWidth: .infinity)
                    .aspectRatio(4 / 3, contentMode: .fit)
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
                            if let vin = vehicle.vin {
                                row("VIN", vin)
                            }
                        }
                    }
                }

                if let description = listing.description, !description.isEmpty {
                    section("Description") {
                        Text(description)
                            .font(.subheadline)
                    }
                }

                Button {
                    Task { await contactSeller() }
                } label: {
                    Label(contacting ? "Opening..." : "Contact Seller", systemImage: "message")
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: contacting))
                .disabled(contacting || listing.sellerId == currentProfileId)

                if listing.sellerId == currentProfileId {
                    Text("This is your listing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Listing")
        .navigationBarTitleDisplayMode(.inline)
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

    private func contactSeller() async {
        guard !contacting else { return }
        contacting = true
        defer { contacting = false }
        do {
            _ = try await MarketplaceAPI.contactSeller(listingId: listing.id)
            notice = "Conversation created. Open Messages to continue."
        } catch {
            notice = error.localizedDescription
        }
    }
}

private struct MyListingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reloadToken = UUID()
    @State private var showingCreate = false

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
                                MarketplaceListingRow(listing: listing)
                                HStack {
                                    StatusBadge(
                                        text: listing.status.rawValue.capitalized,
                                        color: statusColor(listing.status)
                                    )
                                    Spacer()
                                    Menu {
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

private struct NewListingView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var selectedVehicleId = ""
    @State private var title = ""
    @State private var description = ""
    @State private var askingPrice = ""
    @State private var location = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await VehiclesAPI.list() },
                loaded: { vehicles in
                    Form {
                        Section("Vehicle") {
                            Picker("Vehicle", selection: $selectedVehicleId) {
                                Text("Select a vehicle").tag("")
                                ForEach(vehicles) { vehicle in
                                    Text(vehicleLabel(vehicle)).tag(vehicle.id)
                                }
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

    var body: some View {
        if let url = listing.vehicle?.vehicleMedia?.first(where: { $0.isPrimary == true })?.url
            ?? listing.vehicle?.vehicleMedia?.first?.url,
           let imageURL = URL(string: url) {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
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
