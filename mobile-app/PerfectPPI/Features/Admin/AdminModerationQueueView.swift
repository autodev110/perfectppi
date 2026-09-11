import SwiftUI

/// Photos and videos held for review (plan 18.1 / 21.2). Mirrors the web
/// "Media scans" tab: previews are fetched through the audited evidence
/// endpoint, and approve / reject go through the same capability checks and
/// specialist-safeguard gate as the web form.
struct AdminModerationQueueView: View {
    @State private var reloadToken = UUID()
    @State private var busy: String?
    @State private var notice: String?

    var body: some View {
        AsyncContent(
            load: { try await AdminAPI.moderationQueue() },
            loaded: { queue in
                Group {
                    if queue.items.isEmpty {
                        EmptyStateCard(
                            title: "Nothing to review",
                            message: "Photos and videos held by the safety checks will appear here.",
                            systemImage: "checkmark.shield"
                        )
                        .padding()
                    } else {
                        List {
                            if queue.scannerNotConfigured {
                                Section {
                                    Label {
                                        Text("The specialist image safeguard is on but no scanner is configured, so these photos cannot be approved yet. Configure CHILD_SAFETY_SCANNER_URL and CHILD_SAFETY_SCANNER_TOKEN, or turn off the specialist_image_safeguard flag for this environment in Admin → Flags on the web.")
                                            .font(.caption)
                                    } icon: {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                            .foregroundStyle(.orange)
                                    }
                                }
                            }
                            Section {
                                ForEach(queue.items) { item in
                                    row(item, canDecide: queue.canDecide)
                                }
                            } header: {
                                Text("\(queue.items.count) waiting")
                            }
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { reloadToken = UUID() }
                    }
                }
            },
            failure: { error, retry in
                if let apiError = error as? APIError, case .serverResponse(_, let code, _, _) = apiError, code == "capability_required" {
                    EmptyStateCard(
                        title: "Review access needed",
                        message: "Your admin account needs the queue_read moderation capability. Grant it under Admin → Moderation → Access on the web.",
                        systemImage: "lock.shield"
                    )
                    .padding()
                } else {
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            }
        )
        .id(reloadToken)
        .navigationTitle("Moderation Queue")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Review", isPresented: .constant(notice != nil)) {
            Button("OK") { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    private func row(_ item: AdminAPI.ModerationQueueItem, canDecide: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ModerationMediaPreview(entityId: item.entityId, isVideo: item.mediaType == "video")
            VStack(alignment: .leading, spacing: 3) {
                Text(item.authorLabel).font(.subheadline.weight(.semibold))
                Text((item.entityType == "vehicle_media" ? "Garage photo" : "Community post \(item.mediaType ?? "photo")")
                     + (item.createdAt.map { " · " + $0.formatted(.relative(presentation: .named)) } ?? ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(item.reasonCodes.map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", "))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if item.scannerNotConfigured {
                Text("Held: specialist scanner not configured.")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            if canDecide {
                HStack {
                    Button(busy == item.id ? "Working…" : "Approve") { Task { await decide(item, approve: true) } }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                    Button("Reject", role: .destructive) { Task { await decide(item, approve: false) } }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
                .disabled(busy != nil)
            } else {
                Text("You can view this item but need the content_decide capability to decide it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    @MainActor
    private func decide(_ item: AdminAPI.ModerationQueueItem, approve: Bool) async {
        busy = item.id
        defer { busy = nil }
        do {
            let result = try await AdminAPI.reviewModerationItem(id: item.id, approve: approve)
            notice = result.status == "active" ? "Approved — the post publishes once every photo is cleared." : "Rejected."
            reloadToken = UUID()
        } catch {
            notice = error.localizedDescription
        }
    }
}

/// Loads the held object through the audited moderation endpoint; never a
/// reusable URL.
private struct ModerationMediaPreview: View {
    let entityId: String
    let isVideo: Bool
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(.secondarySystemFill))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else if isVideo || failed {
                Label(isVideo ? "Video — review on the web" : "Preview unavailable", systemImage: isVideo ? "video" : "eye.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .task {
            guard !isVideo, image == nil else { return }
            do {
                let (data, _) = try await APIClient.shared.bytes("/api/moderation/media/\(entityId)")
                image = UIImage(data: data)
                failed = image == nil
            } catch {
                failed = true
            }
        }
    }
}
