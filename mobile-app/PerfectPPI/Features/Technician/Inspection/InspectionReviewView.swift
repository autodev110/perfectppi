import SwiftUI

/// Final review before submission: everything still missing in one place,
/// each item jumps back to its step, and the inspector's accuracy
/// certification (unchecked by default). Mirrors the web review screen.
struct InspectionReviewView: View {
    @ObservedObject var model: InspectionWorkflowModel
    let submissionId: String
    var onJump: (String) -> Void
    var onSubmitted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var certified = false
    @State private var submitting = false
    @State private var errorMessage: String?

    private var issues: [(answer: PpiAnswer, message: String)] {
        model.answers.compactMap { answer in
            if model.isComplete(answer) { return nil }
            let message = model.needsPhoto(answer)
                ? String(localized: "Add a photo, or record why it could not be taken.")
                : String(localized: "Needs an answer or an “Unable to assess” reason.")
            return (answer, message)
        }
    }

    var body: some View {
        List {
            Section {
                if issues.isEmpty {
                    Label("Every required check has an answer and its photos.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Theme.Palette.success)
                } else {
                    ForEach(issues, id: \.answer.id) { issue in
                        Button {
                            onJump(issue.answer.id)
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(Theme.Palette.warning)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(issue.answer.prompt).font(.subheadline.weight(.medium))
                                    Text(issue.message).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            } header: {
                Text("Still needed")
            }

            Section {
                Toggle(isOn: $certified) {
                    Text(PpiAPI.certificationText)
                        .font(.subheadline)
                }
                .toggleStyle(CheckboxToggleStyle())
            } header: {
                Text("Certification")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.Palette.danger)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    Text(submitting ? "Submitting…" : "Certify and submit inspection")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: submitting))
                .disabled(!certified || !issues.isEmpty || submitting)
                .listRowBackground(Color.clear)
            }
        }
        .navigationTitle("Review & submit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Continue editing") { dismiss() }
            }
        }
    }

    private func submit() async {
        guard certified, issues.isEmpty, !submitting else { return }
        submitting = true
        defer { submitting = false }
        errorMessage = nil
        do {
            _ = try await PpiAPI.submit(submissionId: submissionId, expectedRevision: model.reviewedRevision ?? 0)
            onSubmitted()
        } catch let error as APIError {
            if case .serverResponse(_, let code, _, _) = error, code == "stale_revision" {
                // Something changed after review (for example a late photo
                // sync). Reload and ask for a fresh certification.
                try? await model.prepareReview()
                certified = false
            }
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// A square checkbox; the certification must be an explicit tap.
private struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundStyle(configuration.isOn ? Theme.Palette.primary : .secondary)
                configuration.label
                    .foregroundStyle(.primary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
    }
}
