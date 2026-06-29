import SwiftUI

struct PpiDetailView: View {
    let requestId: String

    @State private var creating = false
    @State private var submission: PpiSubmission?
    @State private var request: PpiRequest?
    @State private var error: Error?

    var body: some View {
        Group {
            if let request {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.spacing) {
                        InfoRow(label: "Type",
                                value: (request.ppiType?.rawValue ?? "-")
                                    .replacingOccurrences(of: "_", with: " ").capitalized,
                                icon: "wrench.and.screwdriver.fill")
                        InfoRow(label: "Status",
                                value: request.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                                icon: "circle.dashed",
                                valueColor: statusTint(request.status.rawValue))
                        InfoRow(label: "Whose car",
                                value: (request.whoseCar?.rawValue ?? "-").capitalized,
                                icon: "person.fill")
                        InfoRow(label: "Requester role",
                                value: (request.requesterRole?.rawValue ?? "-").capitalized,
                                icon: "person.text.rectangle.fill")

                        Spacer().frame(height: Theme.spacing)

                        if let submission {
                            NavigationLink {
                                InspectionWorkflowView(submissionId: submission.id)
                            } label: {
                                Text(submission.status == .draft || submission.status == .inProgress
                                     ? "Continue Inspection"
                                     : "Review Inspection")
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        } else {
                            Button {
                                Task { await startInspection() }
                            } label: {
                                Text("Start Inspection")
                            }
                            .buttonStyle(PrimaryButtonStyle(isLoading: creating))
                            .disabled(creating)
                        }
                    }
                    .padding()
                }
            } else if let error {
                ErrorView(message: error.localizedDescription) { Task { await load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Request")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            self.request = try await PpiAPI.getRequest(id: requestId)
            // Submission may not exist yet; tolerate 404.
            do {
                let subs: [PpiSubmission] = try await APIClient.shared.get(
                    "/api/ppi/submissions",
                    query: [URLQueryItem(name: "request_id", value: requestId)]
                )
                self.submission = subs.first
            } catch APIError.notFound {
                self.submission = nil
            }
        } catch {
            self.error = error
        }
    }

    private func startInspection() async {
        guard !creating else { return }
        creating = true
        defer { creating = false }
        do {
            let created = try await PpiAPI.createSubmission(
                .init(requestId: requestId)
            )
            self.submission = try await PpiAPI.getSubmission(id: created.submissionId)
        } catch {
            self.error = error
        }
    }
}

