import SwiftUI
import AVKit
import Photos
import PhotosUI

struct CommunityFeedView: View {
    @State private var reloadToken = UUID()
    @State private var showingComposer = false
    @State private var showingMyPosts = false

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
                    Menu {
                        Button {
                            showingComposer = true
                        } label: {
                            Label("New Post", systemImage: "plus.bubble")
                        }
                        Button {
                            showingMyPosts = true
                        } label: {
                            Label("My Posts and Reviews", systemImage: "person.crop.rectangle.stack")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                .sheet(isPresented: $showingComposer) {
                    NewCommunityPostView {
                        reloadToken = UUID()
                    }
                }
                .sheet(isPresented: $showingMyPosts) {
                    ModeratedPostsView {
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

private struct ModeratedPostsView: View {
    let onChanged: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var posts: [CommunityPost] = []
    @State private var notices: [CommunityAPI.EnforcementNotice] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if !notices.isEmpty {
                    Section("Account notices") {
                        ForEach(notices) { notice in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(notice.actionType.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.subheadline.weight(.semibold))
                                Text(notice.reasonCode.replacingOccurrences(of: "_", with: " "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let end = notice.endsAt {
                                    Text("Ends \(end, style: .date)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("In review") {
                    if loading {
                        ProgressView("Loading...")
                    } else if posts.isEmpty {
                        Text("No posts are awaiting moderation.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(posts) { post in
                            ModeratedPostRow(post: post) {
                                await load()
                                onChanged()
                            }
                        }
                    }
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(Theme.Palette.danger)
                    }
                }
            }
            .navigationTitle("My Posts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            async let postRequest = CommunityAPI.mine(status: "review")
            async let noticeRequest = CommunityAPI.notices()
            (posts, notices) = try await (postRequest, noticeRequest)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct ModeratedPostRow: View {
    let post: CommunityPost
    let onAppealed: () async -> Void
    @State private var statement = ""
    @State private var submitting = false
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text((post.moderationStatus ?? "pending_review").replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(post.moderationStatus == "rejected" ? Theme.Palette.danger : .secondary)
                Spacer()
                if let created = post.createdAt {
                    Text(created, style: .date).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Text(post.content).font(.subheadline)
            if post.moderationStatus == "rejected" {
                TextField("Explain why this should be reviewed again", text: $statement, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                Button(submitting ? "Submitting..." : "Submit Appeal") {
                    Task { await submitAppeal() }
                }
                .disabled(submitting || statement.trimmingCharacters(in: .whitespacesAndNewlines).count < 10)
            }
            if let message {
                Text(message).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    @MainActor
    private func submitAppeal() async {
        submitting = true
        defer { submitting = false }
        do {
            _ = try await CommunityAPI.appeal(
                entityId: post.id,
                statement: statement.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            message = "Appeal submitted for review."
            await onAppealed()
        } catch {
            message = error.localizedDescription
        }
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

            if let media = post.media, !media.isEmpty {
                CommunityMediaCarousel(media: media)
                    .frame(height: 230)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

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
    @State private var media: [CommunityPostMedia]
    @State private var comment = ""
    @State private var submitting = false
    @State private var error: String?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showingPhotoPicker = false
    @State private var removingMediaId: String?
    @StateObject private var uploadProgress = UploadProgressModel()
    @State private var reportSubmitted = false

    init(post: CommunityPost, onChanged: @escaping () -> Void) {
        self.post = post
        self.onChanged = onChanged
        _comments = State(initialValue: post.comments ?? [])
        _media = State(initialValue: (post.media ?? []).sorted { $0.sortOrder < $1.sortOrder })
    }

    private var isMyPost: Bool {
        auth.profile?.id == post.authorId
    }

    private var authorName: String {
        post.author?.displayName ?? post.author?.username ?? "PerfectPPI member"
    }

    var body: some View {
        List {
            postSection

            if isMyPost {
                mediaManagementSection
            }

            commentsSection
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .photosPicker(
            isPresented: $showingPhotoPicker,
            selection: $pickerItems,
            maxSelectionCount: max(1, 10 - media.count),
            matching: .any(of: [.images, .videos])
        )
        .onChange(of: pickerItems) { _, items in
            Task { await addMedia(items) }
        }
        .alert("Something went wrong",
               isPresented: .constant(error != nil),
               actions: { Button("OK") { error = nil } },
               message: { Text(error ?? "") })
        .alert("Report submitted", isPresented: $reportSubmitted) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Thank you. The moderation team will review this content.")
        }
    }

    private var postSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text(authorName)
                    .font(.headline)
                Text(post.content)
                    .font(.body)
                ReportMenu { reasonCode in
                    Task { await report(entityType: "community_post", entityId: post.id, reasonCode: reasonCode) }
                }
                if !media.isEmpty {
                    CommunityMediaCarousel(media: media)
                        .frame(height: 320)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if let vehicle = post.vehicle {
                    VehicleMiniCard(vehicle: vehicle)
                }
                if let listing = post.marketplaceListing {
                    MarketplaceListingMiniCard(listing: listing)
                }
            }
            .padding(.vertical, 6)
        }
    }

    private var mediaManagementSection: some View {
        Section("Photos and videos (\(media.count)/10)") {
            ForEach(media) { item in
                HStack {
                    Image(systemName: item.mediaType == "video" ? "video.fill" : "photo.fill")
                        .foregroundStyle(Theme.Palette.primary)
                    Text("Item \(item.sortOrder + 1)")
                        .font(.subheadline)
                    Spacer()
                    Button(role: .destructive) {
                        Task { await removeMedia(item) }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .disabled(removingMediaId != nil || uploadProgress.isUploading)
                }
            }

            Button {
                Task { await openPhotoLibrary() }
            } label: {
                Label(media.isEmpty ? "Add Photos or Videos" : "Add More", systemImage: "photo.on.rectangle.angled")
            }
            .disabled(media.count >= 10 || uploadProgress.isUploading || removingMediaId != nil)

            if let label = uploadProgress.label {
                ProgressView(value: uploadProgress.fraction ?? 0) {
                    Text(label).font(.caption)
                }
                .tint(Theme.Palette.primary)
            }
        }
    }

    private var commentsSection: some View {
        Section(comments.isEmpty ? "Comments" : "Comments (\(comments.count))") {
            ForEach(comments) { item in
                let commentAuthor = item.author?.displayName ?? item.author?.username ?? "Member"
                HStack(alignment: .top, spacing: 10) {
                    Avatar(name: commentAuthor, size: 32)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(commentAuthor)
                            .font(.caption.weight(.semibold))
                        Text(item.content)
                            .font(.subheadline)
                    }
                    Spacer()
                    ReportMenu { reasonCode in
                        Task { await report(entityType: "community_comment", entityId: item.id, reasonCode: reasonCode) }
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

    private func openPhotoLibrary() async {
        let status = await AttachmentPickerSupport.requestPhotoAccess()
        if status == .authorized || status == .limited {
            showingPhotoPicker = true
        } else {
            error = "Photo access is off. Allow full or limited access in Settings to add photos."
        }
    }

    private func addMedia(_ items: [PhotosPickerItem]) async {
        defer { pickerItems = [] }
        let room = max(0, 10 - media.count)
        let selected = Array(items.prefix(room))
        guard !selected.isEmpty else { return }

        uploadProgress.begin(total: selected.count)
        defer { uploadProgress.reset() }

        do {
            var payload: [CommunityAPI.MediaItemPayload] = []
            for (index, item) in selected.enumerated() {
                let picked = try await AttachmentPickerSupport.load(item)
                let url = try await R2Uploader.upload(
                    data: picked.data,
                    filename: picked.filename,
                    contentType: picked.contentType,
                    entity: "community_post",
                    recordId: post.id,
                    onProgress: uploadProgress.handler()
                )
                uploadProgress.finishItem()
                payload.append(.init(
                    url: url,
                    mediaType: picked.kind == .video ? "video" : "image",
                    contentType: picked.contentType,
                    sortOrder: index
                ))
            }
            let created = try await CommunityAPI.addMedia(postId: post.id, items: payload)
            let approved = created.filter { $0.moderationStatus == "active" }
            media = (media + approved).sorted { $0.sortOrder < $1.sortOrder }
            if approved.count != created.count {
                self.error = "Some media is being reviewed and is not public yet."
            }
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func removeMedia(_ item: CommunityPostMedia) async {
        guard removingMediaId == nil else { return }
        removingMediaId = item.id
        defer { removingMediaId = nil }
        do {
            _ = try await CommunityAPI.removeMedia(postId: post.id, mediaId: item.id)
            // The server compacts sort_order after a delete — mirror that so the
            // remaining rows keep matching what the feed will render.
            media = media
                .filter { $0.id != item.id }
                .enumerated()
                .map { index, remaining in remaining.withSortOrder(index) }
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
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
            moderationStatus: "active",
            moderationReason: nil,
            createdAt: Date(),
            updatedAt: nil,
            author: auth.profile
        )
        comments.append(optimistic)
        comment = ""

        do {
            let response = try await CommunityAPI.comment(postId: post.id, content: text)
            if response.moderationStatus != "active" {
                comments.removeAll { $0.id == optimistic.id }
                self.error = response.moderationMessage ?? "Your comment is being reviewed and is not public yet."
                return
            }
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

    private func report(entityType: String, entityId: String, reasonCode: String) async {
        do {
            _ = try await CommunityAPI.report(entityType: entityType, entityId: entityId, reasonCode: reasonCode)
            reportSubmitted = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct ReportMenu: View {
    let onReport: (String) -> Void

    var body: some View {
        Menu {
            Button("Spam") { onReport("spam") }
            Button("Harassment") { onReport("harassment") }
            Button("Hate or abuse") { onReport("hate") }
            Button("Violence") { onReport("violence") }
            Button("Sexual content") { onReport("sexual_content") }
            Button("Personal information") { onReport("personal_information") }
            Button("Fraud or scam") { onReport("fraud") }
            Button("Illegal content", role: .destructive) { onReport("illegal_content") }
            Button("Other") { onReport("other") }
        } label: {
            Label("Report", systemImage: "flag")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct NewCommunityPostView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var content = ""
    @State private var selectedVehicleId = ""
    @State private var selectedListingId = ""
    @State private var saving = false
    @State private var error: String?
    @State private var media: [PickedAttachment] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showingPhotoPicker = false
    @State private var showingCamera = false
    @State private var photoAccessBlocked = false
    @StateObject private var uploadProgress = UploadProgressModel()
    @State private var submittedForReview = false
    /// A failed media upload leaves the post already created — a retry has to
    /// attach to that post instead of publishing a second one.
    @State private var createdPostId: String?
    @State private var createdModerationStatus = "active"

    init(preselectedVehicleId: String? = nil, onCreated: @escaping () -> Void) {
        self.onCreated = onCreated
        _selectedVehicleId = State(initialValue: preselectedVehicleId ?? "")
    }

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

                        Section("Photos and videos (\(media.count)/10)") {
                            Button {
                                Task { await openPhotoLibrary() }
                            } label: {
                                Label("Choose Photos or Videos", systemImage: "photo.on.rectangle.angled")
                            }
                            .disabled(media.count >= 10)

                            Button {
                                showingCamera = true
                            } label: {
                                Label("Take Photo", systemImage: "camera")
                            }
                            .disabled(media.count >= 10)

                            ForEach(media) { item in
                                HStack {
                                    Image(systemName: item.kind == .video ? "video.fill" : "photo.fill")
                                        .foregroundStyle(Theme.Palette.primary)
                                    Text(item.filename).lineLimit(1)
                                    Spacer()
                                    Button(role: .destructive) {
                                        media.removeAll { $0.id == item.id }
                                    } label: {
                                        Image(systemName: "trash")
                                    }
                                }
                            }
                        }

                        if let label = uploadProgress.label {
                            ProgressView(value: uploadProgress.fraction ?? 0) {
                                Text(label).font(.caption)
                            }
                            .tint(Theme.Palette.primary)
                        }

                        if let error {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(error).foregroundStyle(Theme.Palette.danger)
                                if photoAccessBlocked {
                                    Button("Open Settings") {
                                        AttachmentPickerSupport.openSystemSettings()
                                    }
                                    .font(.caption.weight(.semibold))
                                }
                            }
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
            .photosPicker(
                isPresented: $showingPhotoPicker,
                selection: $pickerItems,
                maxSelectionCount: max(1, 10 - media.count),
                matching: .any(of: [.images, .videos])
            )
            .onChange(of: pickerItems) { _, items in
                Task { await loadPickerItems(items) }
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraCaptureView(
                    prompt: "Add a photo to your post",
                    onCapture: { data in
                        media.append(.cameraPhoto(data))
                        showingCamera = false
                    },
                    onCancel: { showingCamera = false }
                )
            }
            .alert("Submitted for review", isPresented: $submittedForReview) {
                Button("OK") { dismiss() }
            } message: {
                Text("Content that needs review will remain private until it is approved.")
            }
        }
    }

    private func openPhotoLibrary() async {
        let status = await AttachmentPickerSupport.requestPhotoAccess()
        if status == .authorized || status == .limited {
            photoAccessBlocked = false
            showingPhotoPicker = true
        } else {
            error = "Photo access is off. Allow full or limited access to add photos."
            photoAccessBlocked = true
        }
    }

    private func loadPickerItems(_ items: [PhotosPickerItem]) async {
        defer { pickerItems = [] }
        for item in items.prefix(max(0, 10 - media.count)) {
            do {
                media.append(try await AttachmentPickerSupport.load(item))
                photoAccessBlocked = false
            } catch {
                self.error = "One selected item could not be loaded."
                photoAccessBlocked = false
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
            let postId: String
            var moderationStatus = "active"
            var hasPendingMedia = false
            if let createdPostId {
                postId = createdPostId
                moderationStatus = createdModerationStatus
            } else {
                let response = try await CommunityAPI.createPost(
                    .init(
                        content: trimmed,
                        vehicleId: listingId == nil ? vehicleId : nil,
                        listingId: listingId
                    )
                )
                postId = response.id
                moderationStatus = response.moderationStatus ?? "pending_review"
                createdPostId = postId
                createdModerationStatus = moderationStatus
            }
            if !media.isEmpty {
                uploadProgress.begin(total: media.count)
                defer { uploadProgress.reset() }
                var uploaded: [CommunityAPI.MediaItemPayload] = []
                for (index, item) in media.enumerated() {
                    let url = try await R2Uploader.upload(
                        data: item.data,
                        filename: item.filename,
                        contentType: item.contentType,
                        entity: "community_post",
                        recordId: postId,
                        onProgress: uploadProgress.handler()
                    )
                    uploadProgress.finishItem()
                    uploaded.append(.init(
                        url: url,
                        mediaType: item.kind == .video ? "video" : "image",
                        contentType: item.contentType,
                        sortOrder: index
                    ))
                }
                let created = try await CommunityAPI.addMedia(postId: postId, items: uploaded)
                hasPendingMedia = created.contains { $0.moderationStatus != "active" }
            }
            onCreated()
            if moderationStatus == "active" && !hasPendingMedia {
                dismiss()
            } else {
                submittedForReview = true
            }
        } catch {
            self.error = error.localizedDescription
            photoAccessBlocked = false
        }
    }

    private func vehicleLabel(_ vehicle: CommunityPostOptionVehicle) -> String {
        let parts = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
        return parts.isEmpty ? "Vehicle" : parts.joined(separator: " ")
    }
}

private struct CommunityMediaCarousel: View {
    let media: [CommunityPostMedia]

    var body: some View {
        TabView {
            ForEach(media.sorted(by: { $0.sortOrder < $1.sortOrder })) { item in
                ZStack(alignment: .topTrailing) {
                    Color.black
                    if item.mediaType == "video", let url = URL(string: item.url) {
                        RemoteVideoPlayer(url: url)
                    } else if let url = URL(string: item.url) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image): image.resizable().scaledToFit()
                            case .failure: Image(systemName: "photo").foregroundStyle(.white.opacity(0.6))
                            default: ProgressView().tint(.white)
                            }
                        }
                    }
                }
            }
        }
        .tabViewStyle(.page(indexDisplayMode: media.count > 1 ? .always : .never))
        .background(.black)
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
