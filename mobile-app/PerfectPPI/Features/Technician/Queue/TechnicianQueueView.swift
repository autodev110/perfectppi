import SwiftUI

struct TechnicianQueueView: View {
    var body: some View {
        AsyncContent(
            load: { try await TechniciansAPI.queue() },
            loaded: { items in
                Group {
                    if items.isEmpty {
                        EmptyStateCard(
                            title: "No assignments yet",
                            message: "Inspections assigned to you — whether requested by a consumer or sent from a connected dealership — show up here.",
                            systemImage: "list.clipboard"
                        )
                        .padding()
                    } else {
                        List(items) { request in
                            NavigationLink(value: request.id) {
                                QueueRow(request: request)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Assigned PPIs")
                .navigationDestination(for: String.self) { id in
                    PpiDetailView(requestId: id)
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }
}

private struct QueueRow: View {
    let request: PpiRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(request.ppiType?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized ?? "PPI")
                    .font(.headline)
                Spacer()
                StatusBadge(text: request.status.rawValue.replacingOccurrences(of: "_", with: " "),
                            color: badgeColor(for: request.status))
            }
            HStack(spacing: 8) {
                if let sourceLabel = request.sourceLabel {
                    StatusBadge(text: sourceLabel, color: Theme.Palette.primary)
                }
                if let updated = request.updatedAt {
                    Text(updated, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func badgeColor(for status: PpiRequestStatus) -> Color {
        switch status {
        case .pendingAssignment, .assigned: return Theme.Palette.warning
        case .accepted, .inProgress: return Theme.Palette.primary
        case .submitted, .completed: return Theme.Palette.success
        case .needsRevision: return Theme.Palette.danger
        default: return .gray
        }
    }
}
