import SwiftUI

struct CommunityFeedView: View {
    @State private var reloadToken = UUID()
    @State private var showingComposer = false

    var body: some View {
        AsyncContent(
            load: { try await CommunityAPI.feed() },
            loaded: { posts in
                Group {
                    if posts.isEmpty {
                        EmptyStateCard(
                            title: "Community is quiet",
                            message: "Share a public vehicle, listing, or inspection thought to start the feed.",
                            systemImage: "text.bubble"
                        )
                        .padding()
                    } else {
                        List(posts) { post in
                            NavigationLink {
                                CommunityPostDetailView(post: post) {
                                    reloadToken = UUID()
                                }
                            } label: {
                                CommunityPostRow(post: post)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Community")
                .toolbar {
                    Button {
                        showingComposer = true
                    } label: {
                        Image(systemName: "plus.bubble")
                    }
                }
                .sheet(isPresented: $showingComposer) {
                    NewCommunityPostView {
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

private struct CommunityPostRow: View {
    let post: CommunityPost

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Avatar(name: authorName, size: 38)
                VStack(alignment: .leading, spacing: 1) {
                    Text(authorName)
                        .font(.subheadline.weight(.semibold))
                    if let created = post.createdAt {
                        Text(created, style: .relative)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }

            Text(post.content)
                .font(.subheadline)
                .foregroundStyle(.primary.opacity(0.9))
                .lineLimit(4)

            if let listing = post.marketplaceListing {
                Label(listing.title, systemImage: "tag.fill")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.Palette.primary)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.Palette.primary.opacity(0.1))
                    .clipShape(Capsule())
            } else if let vehicle = post.vehicle {
                Label(vehicleLabel(vehicle), systemImage: "car.fill")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.Palette.subtle)
                    .clipShape(Capsule())
            }

            if let count = post.comments?.count, count > 0 {
                Label("\(count) comment\(count == 1 ? "" : "s")", systemImage: "bubble.left")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private var authorName: String {
        post.author?.displayName ?? post.author?.username ?? "PerfectPPI member"
    }

    private func vehicleLabel(_ vehicle: Vehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

private struct CommunityPostDetailView: View {
    let post: CommunityPost
    let onChanged: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @State private var comments: [CommunityComment]
    @State private var comment = ""
    @State private var submitting = false
    @State private var error: String?

    init(post: CommunityPost, onChanged: @escaping () -> Void) {
        self.post = post
        self.onChanged = onChanged
        _comments = State(initialValue: post.comments ?? [])
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(post.author?.displayName ?? post.author?.username ?? "PerfectPPI member")
                        .font(.headline)
                    Text(post.content)
                        .font(.body)
                    if let vehicle = post.vehicle {
                        VehicleMiniCard(vehicle: vehicle)
                    }
                    if let listing = post.marketplaceListing {
                        MarketplaceListingMiniCard(listing: listing)
                    }
                }
                .padding(.vertical, 6)
            }

            Section(comments.isEmpty ? "Comments" : "Comments (\(comments.count))") {
                ForEach(comments) { comment in
                    HStack(alignment: .top, spacing: 10) {
                        Avatar(name: comment.author?.displayName ?? comment.author?.username ?? "Member", size: 32)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(comment.author?.displayName ?? comment.author?.username ?? "Member")
                                .font(.caption.weight(.semibold))
                            Text(comment.content)
                                .font(.subheadline)
                        }
                    }
                    .padding(.vertical, 4)
                }

                VStack(alignment: .leading, spacing: 8) {
                    TextField("Add a comment", text: $comment, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)
                    Button(submitting ? "Posting..." : "Post Comment") {
                        Task { await submitComment() }
                    }
                    .buttonStyle(PrimaryButtonStyle(isLoading: submitting))
                    .disabled(submitting || comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Couldn't post comment",
               isPresented: .constant(error != nil),
               actions: { Button("OK") { error = nil } },
               message: { Text(error ?? "") })
    }

    private func submitComment() async {
        let text = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !submitting else { return }
        submitting = true
        defer { submitting = false }

        // Show the comment immediately, then reconcile with the server.
        let optimistic = CommunityComment(
            id: "optimistic-\(UUID().uuidString)",
            postId: post.id,
            authorId: auth.profile?.id ?? "",
            content: text,
            status: .active,
            createdAt: Date(),
            updatedAt: nil,
            author: auth.profile
        )
        comments.append(optimistic)
        comment = ""

        do {
            _ = try await CommunityAPI.comment(postId: post.id, content: text)
            onChanged()
            // Replace the optimistic placeholder with the canonical rows so the
            // count and author details match the server.
            if let fresh = try? await CommunityAPI.feed().first(where: { $0.id == post.id }),
               let freshComments = fresh.comments {
                comments = freshComments
            }
        } catch {
            comments.removeAll { $0.id == optimistic.id }
            comment = text
            self.error = error.localizedDescription
        }
    }
}

private struct NewCommunityPostView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var content = ""
    @State private var selectedVehicleId = ""
    @State private var selectedListingId = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await CommunityAPI.options() },
                loaded: { options in
                    Form {
                        Section("Post") {
                            TextEditor(text: $content)
                                .frame(minHeight: 140)
                        }

                        Section("Attach") {
                            Picker("Vehicle", selection: $selectedVehicleId) {
                                Text("None").tag("")
                                ForEach(options.vehicles) { vehicle in
                                    Text(vehicleLabel(vehicle)).tag(vehicle.id)
                                }
                            }

                            Picker("Listing", selection: $selectedListingId) {
                                Text("None").tag("")
                                ForEach(options.listings) { listing in
                                    Text(listing.title).tag(listing.id)
                                }
                            }
                        }

                        if let error {
                            Text(error).foregroundStyle(Theme.Palette.danger)
                        }
                    }
                },
                failure: { error, retry in
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            )
            .navigationTitle("New Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Posting..." : "Post") {
                        Task { await save() }
                    }
                    .disabled(saving || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func save() async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let listingId = selectedListingId.isEmpty ? nil : selectedListingId
            let vehicleId = selectedVehicleId.isEmpty ? nil : selectedVehicleId
            _ = try await CommunityAPI.createPost(
                .init(
                    content: trimmed,
                    vehicleId: listingId == nil ? vehicleId : nil,
                    listingId: listingId
                )
            )
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func vehicleLabel(_ vehicle: CommunityPostOptionVehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

private struct VehicleMiniCard: View {
    let vehicle: Vehicle

    var body: some View {
        HStack {
            Image(systemName: "car")
                .foregroundStyle(Theme.Palette.primary)
            VStack(alignment: .leading) {
                Text(label)
                    .font(.subheadline.weight(.semibold))
                if let vin = vehicle.vin {
                    Text(vin)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var label: String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

private struct MarketplaceListingMiniCard: View {
    let listing: MarketplaceListing

    var body: some View {
        HStack {
            Image(systemName: "tag")
                .foregroundStyle(Theme.Palette.primary)
            VStack(alignment: .leading) {
                Text(listing.title)
                    .font(.subheadline.weight(.semibold))
                Text("$\((listing.askingPriceCents / 100).formatted())")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
