import SwiftUI

struct ConsumerPpiListView: View {
    @State private var presentWizard = false
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await PpiAPI.listRequests() },
            loaded: { items in
                Group {
                    if items.isEmpty {
                        EmptyStateCard(
                            title: "No inspections yet",
                            message: "Tap + to start a Pre-Purchase Inspection.",
                            systemImage: "checkmark.seal"
                        )
                        .padding()
                    } else {
                        List(items) { req in
                            NavigationLink {
                                ConsumerPpiDetailView(requestId: req.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(req.ppiType?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
                                         ?? "PPI")
                                        .font(.headline)
                                    Text(req.status.rawValue.replacingOccurrences(of: "_", with: " "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Inspections")
                .toolbar {
                    Button { presentWizard = true } label: {
                        Image(systemName: "plus")
                    }
                }
                .sheet(isPresented: $presentWizard) {
                    PpiRequestWizard {
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
