import SwiftUI

struct OrgTechniciansView: View {
    @State private var presentInvite = false
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await OrganizationsAPI.technicians() },
            loaded: { techs in
                Group {
                    if techs.isEmpty {
                        EmptyStateCard(
                            title: "No technicians yet",
                            message: "Invite an independent technician to join your team.",
                            systemImage: "person.3"
                        )
                        .padding()
                    } else {
                        List(techs) { t in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(t.profile?.displayName
                                     ?? t.profile?.username
                                     ?? t.location
                                     ?? "Technician").font(.headline)
                                HStack {
                                    Text(t.certificationLevel?.rawValue.capitalized ?? "—")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if t.availableForWork ?? false {
                                        StatusBadge(text: "Available", color: Theme.Palette.success)
                                    } else {
                                        StatusBadge(text: "Busy", color: Theme.Palette.warning)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Technicians")
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            presentInvite = true
                        } label: {
                            Image(systemName: "person.badge.plus")
                        }
                    }
                }
                .sheet(isPresented: $presentInvite) {
                    InviteTechnicianSheet {
                        // Refetch on dismissal after a successful invite.
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
}

/// Modal sheet listing every independent technician — i.e. one not yet
/// affiliated with any org. Tapping one calls the invite endpoint and dismisses.
private struct InviteTechnicianSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onInvited: () -> Void = {}

    @State private var loading = true
    @State private var techs: [TechnicianProfile] = []
    @State private var loadError: String?
    @State private var inviteError: String?
    @State private var invitingId: String?
    @State private var successMessage: String?
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Invite Technician")
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $searchText, prompt: "Search technicians")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                }
                .task { await load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let loadError {
            ErrorView(message: loadError) { Task { await load() } }
        } else {
            List {
                if let successMessage {
                    Section {
                        Label(successMessage, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Theme.Palette.success)
                    }
                }
                if let inviteError {
                    Section {
                        Label(inviteError, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.Palette.danger)
                    }
                }
                Section {
                    Text("Only public independent technicians can be invited. Technicians already assigned to another organization will not appear here.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    if techs.isEmpty {
                        EmptyStateCard(
                            title: "No technicians available",
                            message: "There are no independent technicians right now. Check back later.",
                            systemImage: "person.crop.circle.badge.questionmark"
                        )
                        .listRowBackground(Color.clear)
                    } else if filteredTechs.isEmpty {
                        EmptyStateCard(
                            title: "No matching technicians",
                            message: "Try a different name, username, certification, or location.",
                            systemImage: "magnifyingglass"
                        )
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(filteredTechs) { tech in
                            row(for: tech)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private func row(for tech: TechnicianProfile) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(tech.profile?.displayName
                     ?? tech.profile?.username
                     ?? tech.location
                     ?? "Technician")
                    .font(.headline)
                Text(tech.certificationLevel?.rawValue.capitalized ?? "—")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if invitingId == tech.id {
                ProgressView()
            } else {
                Button("Invite") {
                    Task { await invite(tech) }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(invitingId != nil)
            }
        }
        .padding(.vertical, 4)
    }

    private var filteredTechs: [TechnicianProfile] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return techs }
        return techs.filter { tech in
            [
                tech.profile?.displayName,
                tech.profile?.username,
                tech.location,
                tech.certificationLevel?.rawValue,
            ]
            .compactMap { $0?.lowercased() }
            .contains { $0.contains(query) }
        }
    }

    private func load() async {
        loading = true
        loadError = nil
        inviteError = nil
        do {
            techs = try await TechniciansAPI.list(independent: true)
        } catch {
            self.loadError = error.localizedDescription
        }
        loading = false
    }

    private func invite(_ tech: TechnicianProfile) async {
        invitingId = tech.id
        inviteError = nil
        defer { invitingId = nil }
        do {
            _ = try await OrganizationsAPI.inviteTechnician(technicianProfileId: tech.id)
            successMessage = "Added \(tech.profile?.displayName ?? "technician") to your team."
            // Remove the invited tech from the local list since they're no
            // longer independent.
            techs.removeAll { $0.id == tech.id }
            onInvited()
        } catch {
            self.inviteError = error.localizedDescription
        }
    }
}
