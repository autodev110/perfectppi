import SwiftUI

struct OrgDashboardView: View {
    var body: some View {
        AsyncContent(
            load: {
                async let org = OrganizationsAPI.me()
                async let techs = OrganizationsAPI.technicians()
                // Tolerate the inspections fetch failing — dashboard still
                // renders the headline metrics even if there are no insp's.
                async let inspections = (try? OrganizationsAPI.inspections()) ?? []
                return try await (org, techs, inspections)
            },
            loaded: { (org: Organization, techs: [TechnicianProfile], inspections: [OrgInspection]) in
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.spacing) {
                        Text(org.name).font(.title2.bold())

                        // Metrics grid
                        HStack(spacing: Theme.spacing) {
                            metric(value: "\(techs.count)", label: "Technicians")
                            metric(value: "\(techs.filter { $0.availableForWork ?? false }.count)",
                                   label: "Available")
                        }
                        HStack(spacing: Theme.spacing) {
                            metric(value: "\(inspections.count)", label: "Inspections")
                            metric(value: "\(inspections.filter { $0.status == .completed }.count)",
                                   label: "Completed")
                        }

                        // Recent inspections
                        Text("Recent inspections")
                            .font(.headline)
                            .padding(.top, 8)

                        if inspections.isEmpty {
                            EmptyStateCard(
                                title: "No inspections yet",
                                message: "Once your technicians submit their first inspection, you'll see it here.",
                                systemImage: "checkmark.seal"
                            )
                        } else {
                            ForEach(inspections.prefix(5)) { inspection in
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
                                    inspectionRow(inspection)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding()
                }
                .navigationTitle("Organization")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }

    private func metric(value: String, label: String) -> some View {
        VStack(alignment: .leading) {
            Text(value).font(.largeTitle.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func inspectionRow(_ inspection: OrgInspection) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(vehicleLabel(inspection))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                StatusBadge(
                    text: inspection.status.rawValue.replacingOccurrences(of: "_", with: " "),
                    color: badgeColor(inspection.status)
                )
            }
            if let performer = inspection.performer?.displayName ?? inspection.performer?.username {
                Text(performer).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func vehicleLabel(_ inspection: OrgInspection) -> String {
        let v = inspection.ppiRequest?.vehicle
        let parts = [v?.year.map(String.init), v?.make, v?.model].compactMap { $0 }
        return parts.isEmpty ? "Inspection" : parts.joined(separator: " ")
    }

    private func badgeColor(_ status: PpiSubmissionStatus) -> Color {
        switch status {
        case .completed: return Theme.Palette.success
        case .submitted: return Theme.Palette.primary
        case .inProgress: return Theme.Palette.warning
        case .draft: return Theme.Palette.subtle
        }
    }
}
