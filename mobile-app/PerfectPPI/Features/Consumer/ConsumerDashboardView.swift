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
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Theme.Palette.primary.opacity(0.12))
                    .frame(width: 46, height: 46)
                Image(systemName: "car.side.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.Palette.primary)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(vehicleLabel)
                    .font(.headline)
                    .lineLimit(1)
                Text(request.ppiType?.rawValue
                        .replacingOccurrences(of: "_", with: " ")
                        .capitalized
                     ?? "PPI")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                StatusBadge(text: request.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                            color: statusTint(request.status.rawValue))
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .cardSurface()
    }

    private var vehicleLabel: String {
        guard let v = request.vehicle else { return "Inspection" }
        let parts = [v.year.map(String.init), v.make, v.model, v.trim].compactMap { $0 }
        return parts.isEmpty ? "Inspection" : parts.joined(separator: " ")
    }
}
