import SwiftUI

struct ReviewComposerView: View {
    private struct DisputeReason: Identifiable {
        let id: String
        let label: String
    }

    let requestId: String
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var eligibility: ReviewEligibilityResponse?
    @State private var rating = 5
    @State private var title = ""
    @State private var content = ""
    @State private var saving = false
    @State private var error: String?
    @State private var showingConcern = false
    @State private var reasonCode = "quality_concern"
    @State private var concernDetails = ""

    private let disputeReasons = [
        DisputeReason(id: "quality_concern", label: "Inspection quality concern"),
        DisputeReason(id: "incomplete_inspection", label: "Inspection appears incomplete"),
        DisputeReason(id: "incorrect_information", label: "Report contains incorrect information"),
        DisputeReason(id: "professional_conduct", label: "Professional conduct concern"),
        DisputeReason(id: "billing_or_scope", label: "Billing or agreed scope concern"),
        DisputeReason(id: "other", label: "Other inspection concern")
    ]

    var body: some View {
        NavigationStack {
            Group {
                if let eligibility {
                    if let dispute = eligibility.eligibility?.activeDispute {
                        activeDispute(dispute)
                    } else if eligibility.eligibility?.canReview == true {
                        form(eligibility: eligibility.eligibility, existing: eligibility.review ?? eligibility.eligibility?.existingReview)
                    } else {
                        EmptyStateCard(
                            title: "Review unavailable",
                            message: eligibility.eligibility?.unavailableReason ?? "Only completed technician-performed inspections can be reviewed.",
                            systemImage: "star.slash"
                        )
                        .padding()
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Review Technician")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
            .alert("Couldn't save review",
                   isPresented: .constant(error != nil),
                   actions: { Button("OK") { error = nil } },
                   message: { Text(error ?? "") })
        }
    }

    private func form(eligibility: ReviewEligibility?, existing: TechnicianReview?) -> some View {
        Form {
            Section("Rating") {
                Stepper(value: $rating, in: 1...5) {
                    HStack {
                        Text("\(rating)")
                        Image(systemName: "star.fill")
                            .foregroundStyle(Theme.Palette.warning)
                    }
                }
            }

            Section("Review") {
                TextField("Title", text: $title)
                TextField("Details", text: $content, axis: .vertical)
                    .lineLimit(4...8)
            }

            Section {
                Button(saving ? "Saving..." : existing == nil ? "Submit Review" : "Update Review") {
                    Task { await save() }
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: saving))
                .disabled(saving)
            }
            if let dispute = eligibility?.serviceDispute, dispute.status != "open" {
                Section("Private dispute outcome") {
                    Text(dispute.resolutionNote ?? "This inspection dispute is closed.")
                    Text("Outcome: \((dispute.outcome ?? "closed").replacingOccurrences(of: "_", with: " ").capitalized)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if eligibility?.canOpenDispute == true {
                Section("Inspection concern") {
                    Text("A dispute is private and temporarily hides an existing review while support investigates.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if showingConcern {
                        Picker("Reason", selection: $reasonCode) {
                            ForEach(disputeReasons) { reason in
                                Text(reason.label).tag(reason.id)
                            }
                        }
                        TextField("Describe what happened", text: $concernDetails, axis: .vertical)
                            .lineLimit(4...8)
                        Button("Submit private concern") { Task { await openDispute() } }
                            .disabled(saving || concernDetails.trimmingCharacters(in: .whitespacesAndNewlines).count < 20)
                    } else {
                        Button("Report an inspection concern") { showingConcern = true }
                    }
                }
            }
        }
        .onAppear {
            if let existing {
                rating = existing.rating
                title = existing.title ?? ""
                content = existing.content ?? ""
            }
        }
    }

    private func activeDispute(_ dispute: PpiServiceDispute) -> some View {
        Form {
            Section("Concern under review") {
                Label("Creating or editing a public review is paused while support reviews this inspection.", systemImage: "lock.shield")
                Text(dispute.details)
                Text(dispute.openedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section {
                Button("Withdraw dispute", role: .destructive) { Task { await withdrawDispute(dispute.id) } }
                    .disabled(saving)
            }
        }
    }

    private func load() async {
        do {
            eligibility = try await ReviewsAPI.requestReviewEligibility(requestId: requestId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await ReviewsAPI.upsertReview(
                requestId: requestId,
                rating: rating,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                content: content.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            )
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func openDispute() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await ReviewsAPI.openDispute(
                requestId: requestId,
                reasonCode: reasonCode,
                details: concernDetails.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func withdrawDispute(_ disputeId: String) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await ReviewsAPI.withdrawDispute(requestId: requestId, disputeId: disputeId)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
