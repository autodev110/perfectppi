import SwiftUI

/// "My Profile" screen for technicians. Shows their own profile + their org
/// affiliation if any. Previously titled "Organization" but only rendered the
/// tech's own data — confusing. Now both names match what's displayed.
struct TechnicianOrgView: View {
    @State private var showingCredentialSubmission = false

    var body: some View {
        AsyncContent(
            load: { try await TechniciansAPI.me() },
            loaded: { tech in
                List {
                    Section("Profile") {
                        LabeledContent("Reviewed credentials",
                                       value: String(tech.credentials?.count ?? 0))
                        LabeledContent("Experience",
                                       value: tech.yearsOfExperience.map { "\($0) yrs" } ?? "—")
                        LabeledContent("Location",
                                       value: tech.location ?? "—")
                        LabeledContent("Available for work",
                                       value: (tech.isAvailable ?? tech.availableForWork ?? false) ? "Yes" : "No")
                    }

                    if let credentials = tech.credentials, !credentials.isEmpty {
                        Section("Credential Details") {
                            ForEach(credentials) { credential in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(credential.credentialName).font(.subheadline.weight(.semibold))
                                    Text("\(credential.typeLabel) · \(credential.issuer)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
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
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showingCredentialSubmission = true
                        } label: {
                            Label("Manage credentials", systemImage: "checkmark.shield")
                        }
                    }
                }
                .sheet(isPresented: $showingCredentialSubmission) {
                    CredentialSubmissionView()
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
    }
}

private struct CredentialSubmissionView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var records: [TechnicianCredentialRecord] = []
    @State private var type = "ase"
    @State private var name = ""
    @State private var issuer = ""
    @State private var scope = ""
    @State private var identifierLast4 = ""
    @State private var issuedOn = Date()
    @State private var expiresOn = Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date()
    @State private var includesExpiry = true
    @State private var evidence = ""
    @State private var supersedesId = ""
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Submissions") {
                    if loading {
                        ProgressView()
                    } else if records.isEmpty {
                        Text("No credentials have been submitted.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(records) { record in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(record.credentialName).font(.subheadline.weight(.semibold))
                                Text("\(record.typeLabel) · \(statusLabel(record.status))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let reason = record.reviewReason, record.status != "pending" {
                                    Text("Review note: \(reason)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Submit for Review") {
                    Picker("Credential type", selection: $type) {
                        Text("ASE credential").tag("ase")
                        Text("ASE Master credential").tag("ase_master")
                        Text("OEM training credential").tag("oem_training")
                        Text("State license").tag("state_license")
                        Text("Business registration").tag("business_registration")
                        Text("Other professional credential").tag("other")
                    }
                    TextField("Credential name", text: $name)
                    TextField("Issuer", text: $issuer)
                    TextField("Scope", text: $scope)
                    TextField("Identifier ending (2-8 characters)", text: $identifierLast4)
                        .textInputAutocapitalization(.characters)
                    DatePicker("Issued on", selection: $issuedOn, displayedComponents: .date)
                    Toggle("Credential has an expiry", isOn: $includesExpiry)
                    if includesExpiry {
                        DatePicker("Expires on", selection: $expiresOn, in: Date()..., displayedComponents: .date)
                    }
                    if !approvedRecords.isEmpty {
                        Picker("Replaces", selection: $supersedesId) {
                            Text("No existing credential").tag("")
                            ForEach(approvedRecords) { record in
                                Text(record.credentialName).tag(record.id)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Private proof or issuer lookup instructions")
                            .font(.caption.weight(.semibold))
                        TextEditor(text: $evidence)
                            .frame(minHeight: 90)
                        Text("This evidence is private and is never included in the public technician profile.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Button(saving ? "Submitting..." : "Submit credential") {
                        Task { await submit() }
                    }
                    .disabled(saving || name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || issuer.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || evidence.trimmingCharacters(in: .whitespacesAndNewlines).count < 4)
                }

                if let message {
                    Section { Text(message).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Credentials")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private var approvedRecords: [TechnicianCredentialRecord] {
        records.filter { $0.status == "approved" }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "approved": return "Reviewed and active"
        case "rejected": return "Not approved"
        case "revoked": return "Revoked"
        default: return "Awaiting review"
        }
    }

    private func dateString(_ date: Date) -> String {
        let components = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    @MainActor
    private func load() async {
        loading = true
        do {
            records = try await TechniciansAPI.credentials()
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }

    @MainActor
    private func submit() async {
        guard !saving else { return }
        saving = true
        message = nil
        defer { saving = false }
        do {
            _ = try await TechniciansAPI.submitCredential(.init(
                credentialType: type,
                credentialName: name.trimmingCharacters(in: .whitespacesAndNewlines),
                issuer: issuer.trimmingCharacters(in: .whitespacesAndNewlines),
                scope: scope.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                credentialIdentifierLast4: identifierLast4.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                issuedOn: dateString(issuedOn),
                expiresOn: includesExpiry ? dateString(expiresOn) : nil,
                evidenceReference: evidence.trimmingCharacters(in: .whitespacesAndNewlines),
                supersedesCredentialId: supersedesId.nilIfEmpty
            ))
            name = ""
            issuer = ""
            scope = ""
            identifierLast4 = ""
            evidence = ""
            supersedesId = ""
            message = "Credential submitted for Trust & Safety review."
            await load()
        } catch {
            message = error.localizedDescription
        }
    }
}
