import SwiftUI

struct ConsumerDashboardView: View {
    var body: some View {
        AsyncContent(
            load: { try await PpiAPI.listRequests() },
            loaded: { requests in
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.spacing) {
                        Text("Recent inspections")
                            .font(.title3.bold())

                        if requests.isEmpty {
                            EmptyStateCard(
                                title: "No inspections yet",
                                message: "Create a PPI request from the Inspections tab to get started.",
                                systemImage: "magnifyingglass"
                            )
                        } else {
                            ForEach(requests.prefix(5)) { req in
                                NavigationLink {
                                    ConsumerPpiDetailView(requestId: req.id)
                                } label: {
                                    RequestCard(request: req)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding()
                }
                .navigationTitle("Home")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }
}

private struct RequestCard: View {
    let request: PpiRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(vehicleLabel).font(.headline)
                Spacer()
                StatusBadge(text: request.status.rawValue.replacingOccurrences(of: "_", with: " "),
                            color: Theme.Palette.primary)
            }
            Text(request.ppiType?.rawValue
                    .replacingOccurrences(of: "_", with: " ")
                    .capitalized
                 ?? "PPI")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            if let updated = request.updatedAt {
                Text(updated, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }

    private var vehicleLabel: String {
        guard let v = request.vehicle else { return "Inspection" }
        let parts = [v.year.map(String.init), v.make, v.model, v.trim].compactMap { $0 }
        return parts.isEmpty ? "Inspection" : parts.joined(separator: " ")
    }
}
