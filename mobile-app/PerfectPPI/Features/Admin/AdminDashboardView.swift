import SwiftUI

struct AdminDashboardView: View {
    var body: some View {
        AsyncContent(
            load: { try await AdminAPI.metrics() },
            loaded: { m in
                ScrollView {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                              spacing: Theme.spacing) {
                        metric("Users", value: m.totalUsers ?? 0)
                        metric("Technicians", value: m.totalTechnicians ?? 0)
                        metric("Organizations", value: m.totalOrganizations ?? 0)
                        metric("Vehicles", value: m.totalVehicles ?? 0)
                    }
                    .padding()
                }
                .navigationTitle("Admin")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }

    private func metric(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading) {
            Text("\(value)")
                .font(.system(size: 32, weight: .bold, design: .rounded))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}
