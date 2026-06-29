import SwiftUI

struct NotificationsView: View {
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await NotificationsAPI.list() },
            loaded: { items in
                Group {
                    if items.isEmpty {
                        EmptyStateCard(
                            title: "Inbox is empty",
                            message: "You'll see updates here when there's activity on your inspections or organization.",
                            systemImage: "bell"
                        )
                        .padding()
                    } else {
                        List(items) { n in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(n.title).font(.headline)
                                    if n.readAt == nil {
                                        Circle()
                                            .fill(Theme.Palette.primary)
                                            .frame(width: 8, height: 8)
                                    }
                                }
                                Text(n.body)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Text(n.createdAt, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 4)
                            .swipeActions {
                                if n.readAt == nil {
                                    Button("Mark Read") {
                                        Task {
                                            try? await NotificationsAPI.markRead(id: n.id, read: true)
                                            reloadToken = UUID()
                                        }
                                    }
                                }
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Inbox")
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
    }
}
