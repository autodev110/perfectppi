import SwiftUI

struct ReviewComposerView: View {
    let requestId: String
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var eligibility: ReviewEligibilityResponse?
    @State private var rating = 5
    @State private var title = ""
    @State private var content = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let eligibility {
                    if eligibility.eligibility?.canReview == true {
                        form(existing: eligibility.review ?? eligibility.eligibility?.existingReview)
                    } else {
                        EmptyStateCard(
                            title: "Review unavailable",
                            message: "Only completed technician-performed inspections can be reviewed.",
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

    private func form(existing: TechnicianReview?) -> some View {
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
        }
        .onAppear {
            if let existing {
                rating = existing.rating
                title = existing.title ?? ""
                content = existing.content ?? ""
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
}
