import SwiftUI

struct WarrantyListView: View {
    var body: some View {
        AsyncContent(
            load: { try await WarrantyAPI.warranties() },
            loaded: { entries in
                Group {
                    if entries.isEmpty {
                        EmptyStateCard(
                            title: "No warranties yet",
                            message: "Once a completed inspection qualifies your vehicle, warranty plans will appear here.",
                            systemImage: "shield"
                        )
                        .padding()
                    } else {
                        List(entries) { entry in
                            if let order = entry.order {
                                NavigationLink {
                                    WarrantyOrderDetailView(orderId: order.id)
                                } label: {
                                    WarrantyRow(entry: entry)
                                }
                            } else {
                                NavigationLink {
                                    WarrantyOptionDetailView(entry: entry)
                                } label: {
                                    WarrantyRow(entry: entry)
                                }
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Warranty")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }
}

private struct WarrantyRow: View {
    let entry: WarrantyListEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(vehicleName)
                .font(.headline)
            Text(entry.order?.status.rawValue.replacingOccurrences(of: "_", with: " ")
                 ?? entry.option.status.replacingOccurrences(of: "_", with: " "))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var vehicleName: String {
        guard let vehicle = entry.vehicle else { return "Warranty Offer" }
        return [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
    }
}

private struct WarrantyOptionDetailView: View {
    let entry: WarrantyListEntry

    @State private var selectingIndex: Int?
    @State private var createdOrderId: String?
    @State private var error: Error?

    var body: some View {
        Group {
            if let createdOrderId {
                WarrantyOrderDetailView(orderId: createdOrderId)
            } else if entry.option.plans.isEmpty {
                EmptyStateCard(
                    title: "No warranty plans available",
                    message: "This warranty offer is active, but no plan options are configured yet. Check back later or contact support.",
                    systemImage: "shield.slash"
                )
                .padding()
                .navigationTitle("Warranty Plans")
            } else {
                List(Array(entry.option.plans.enumerated()), id: \.offset) { index, plan in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(plan.name).font(.headline)
                            Spacer()
                            Text(price(plan.priceCents)).fontWeight(.bold)
                        }
                        Text("\(plan.termYears) year\(plan.termYears == 1 ? "" : "s")"
                             + (plan.termMiles.map { " / \($0) mi" } ?? ""))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Select Plan") {
                            Task { await select(index: index) }
                        }
                        .buttonStyle(PrimaryButtonStyle(isLoading: selectingIndex == index))
                        .disabled(selectingIndex != nil)
                    }
                    .padding(.vertical, 6)
                }
                .navigationTitle("Warranty Plans")
            }
        }
        .alert("Warranty Error", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error?.localizedDescription ?? "")
        }
    }

    private func select(index: Int) async {
        guard selectingIndex == nil, entry.option.plans.indices.contains(index) else { return }
        selectingIndex = index
        defer { selectingIndex = nil }
        do {
            let response = try await WarrantyAPI.createOrder(
                .init(warrantyOptionId: entry.option.id, planIndex: index)
            )
            createdOrderId = response.orderId
        } catch {
            self.error = error
        }
    }

    private func price(_ cents: Int) -> String {
        let dollars = Double(cents) / 100
        return dollars.formatted(.currency(code: "USD"))
    }
}
