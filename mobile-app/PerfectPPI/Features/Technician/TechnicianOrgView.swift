import SwiftUI

/// "My Profile" screen for technicians. Shows their own profile + their org
/// affiliation if any. Previously titled "Organization" but only rendered the
/// tech's own data — confusing. Now both names match what's displayed.
struct TechnicianOrgView: View {
    var body: some View {
        AsyncContent(
            load: { try await TechniciansAPI.me() },
            loaded: { tech in
                List {
                    Section("Profile") {
                        LabeledContent("Certification",
                                       value: tech.certificationLevel?.rawValue.capitalized.replacingOccurrences(of: "_", with: " ") ?? "—")
                        LabeledContent("Experience",
                                       value: tech.yearsOfExperience.map { "\($0) yrs" } ?? "—")
                        LabeledContent("Location",
                                       value: tech.location ?? "—")
                        LabeledContent("Available for work",
                                       value: (tech.availableForWork ?? false) ? "Yes" : "No")
                    }

                    if let bio = tech.bio, !bio.isEmpty {
                        Section("Bio") {
                            Text(bio).font(.subheadline)
                        }
                    }

                    Section("Organization") {
                        if tech.isIndependent == true || tech.organizationId == nil {
                            VStack(alignment: .leading, spacing: 6) {
                                Label("Independent technician", systemImage: "person")
                                    .font(.subheadline.weight(.medium))
                                Text("You're not affiliated with any organization. An org manager can invite you through the technician directory.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        } else {
                            VStack(alignment: .leading, spacing: 6) {
                                Label("In an organization", systemImage: "building.2")
                                    .font(.subheadline.weight(.medium))
                                if let orgId = tech.organizationId {
                                    Text("Org ID: \(orgId.prefix(8))…")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                .navigationTitle("My Profile")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }
}
