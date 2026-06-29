import SwiftUI

/// Org-manager view of every inspection performed by any technician in their
/// organization. Backed by `GET /api/organizations/me/inspections`, which is
/// org-scoped — the consumer-only `/api/ppi/requests` endpoint was previously
/// returning 403 here.
struct OrgInspectionsView: View {
    var body: some View {
        AsyncContent(
            load: { try await OrganizationsAPI.inspections() },
            loaded: { (items: [OrgInspection]) in
                Group {
                    if items.isEmpty {
                        EmptyStateCard(
                            title: "No inspections yet",
                            message: "Submissions from your team's technicians will appear here once they finish their first inspection.",
                            systemImage: "checkmark.seal"
                        )
                        .padding()
                    } else {
                        List(items) { inspection in
                            NavigationLink {
                                if let requestId = inspection.ppiRequest?.id {
                                    StandardizedReportView(requestId: requestId)
                                } else {
                                    EmptyStateCard(
                                        title: "Report unavailable",
                                        message: "This inspection record is missing its linked request, so there is no report to open yet.",
                                        systemImage: "doc.questionmark"
                                    )
                                    .padding()
                                }
                            } label: {
                                row(for: inspection)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Inspections")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }

    @ViewBuilder
    private func row(for inspection: OrgInspection) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(vehicleLabel(inspection))
                    .font(.headline)
                Spacer()
                StatusBadge(
                    text: inspection.status.rawValue.replacingOccurrences(of: "_", with: " "),
                    color: badgeColor(for: inspection.status)
                )
            }
            if let performer = inspection.performer?.displayName ?? inspection.performer?.username {
                Text("Tech: \(performer)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let submittedAt = inspection.submittedAt {
                Text(submittedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func vehicleLabel(_ inspection: OrgInspection) -> String {
        let v = inspection.ppiRequest?.vehicle
        let parts = [v?.year.map(String.init), v?.make, v?.model].compactMap { $0 }
        return parts.isEmpty ? "Inspection" : parts.joined(separator: " ")
    }

    private func badgeColor(for status: PpiSubmissionStatus) -> Color {
        switch status {
        case .completed: return Theme.Palette.success
        case .submitted: return Theme.Palette.primary
        case .inProgress: return Theme.Palette.warning
        case .draft: return Theme.Palette.subtle
        }
    }
}
