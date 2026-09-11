import SwiftUI
import AVKit
import Photos
import PhotosUI
import UniformTypeIdentifiers

struct MessagesView: View {
    let currentProfileId: String?

    @State private var reloadToken = UUID()
    @State private var showingComposer = false
    @State private var selectedBox = 0

    private struct MessageBoxes {
        let inbox: [ConversationSummary]
        let requests: [ConversationSummary]
    }

    init(currentProfileId: String? = nil) {
        self.currentProfileId = currentProfileId
    }

    var body: some View {
        AsyncContent(
            load: {
                async let inbox = MessagesAPI.conversations()
                async let requests = MessagesAPI.requests()
                return try await MessageBoxes(inbox: inbox, requests: requests)
            },
            loaded: { boxes in
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 12) {
                            Image(systemName: selectedBox == 0 ? "bubble.left.and.bubble.right.fill" : "person.crop.circle.badge.clock")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .background(Theme.brandGradient)
                                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(selectedBox == 0 ? "Your conversations" : "Message requests")
                                    .font(.headline)
                                Text(selectedBox == 0
                                     ? "Friends and marketplace conversations"
                                     : "Review new conversations before replying")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Picker("Mailbox", selection: $selectedBox) {
                            Text("Inbox").tag(0)
                            Text(boxes.requests.isEmpty ? "Requests" : "Requests \(boxes.requests.count)").tag(1)
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(16)
                    .background(Theme.Palette.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                            .stroke(Theme.Palette.hairline, lineWidth: 1)
                    )
                    .padding(.horizontal, 16)
                    .padding(.top, 10)

                    let conversations = selectedBox == 0 ? boxes.inbox : boxes.requests
                    if conversations.isEmpty {
                        EmptyStateCard(
                            title: selectedBox == 0 ? "No messages yet" : "No message requests",
                            message: selectedBox == 0
                                ? "Accepted conversations and marketplace inquiries will appear here."
                                : "Eligible group-member introductions wait here until you accept or decline them.",
                            systemImage: "bubble.left.and.bubble.right"
                        )
                        .padding()
                        Spacer(minLength: 0)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(conversations) { conversation in
                                    NavigationLink {
                                        MessageThreadView(
                                            conversationId: conversation.id,
                                            currentProfileId: currentProfileId
                                        )
                                        .onDisappear { reloadToken = UUID() }
                                    } label: {
                                        ConversationRow(
                                            conversation: conversation,
                                            currentProfileId: currentProfileId,
                                            isRequest: selectedBox == 1
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(16)
                        }
                    }
                }
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Messages")
                .toolbar {
                    Button {
                        showingComposer = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                }
                .sheet(isPresented: $showingComposer) {
                    NewConversationView {
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

private struct ConversationRow: View {
    let conversation: ConversationSummary
    let currentProfileId: String?
    let isRequest: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .topTrailing) {
                Avatar(name: title, size: 46)
                if conversation.unreadCount > 0 {
                    Circle()
                        .fill(Theme.Palette.primary)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Theme.Palette.card, lineWidth: 2))
                        .offset(x: 2, y: -2)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    if let date = conversation.lastMessage?.createdAt ?? conversation.createdAt {
                        Text(date, style: .relative)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }

                if let car = conversation.listingContext?.carLabel {
                    Label(car, systemImage: "car.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.Palette.primary)
                        .lineLimit(1)
                }

                Text(preview)
                    .font(.subheadline)
                    .foregroundStyle(conversation.unreadCount > 0 ? .primary : .secondary)
                    .fontWeight(conversation.unreadCount > 0 ? .medium : .regular)
                    .lineLimit(2)

                if isRequest {
                    Label("Review request", systemImage: "person.crop.circle.badge.questionmark")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.Palette.warning)
                }
            }

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
                .padding(.top, 5)
        }
        .padding(14)
        .background(Theme.Palette.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .stroke(conversation.unreadCount > 0 ? Theme.Palette.primary.opacity(0.22) : Theme.Palette.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    /// Car name lives on its own line below, so the title is people only.
    private var title: String {
        let people = ConversationTitle.peopleLabel(
            participants: conversation.participants,
            myProfileId: currentProfileId
        )
        return people.isEmpty ? "Conversation" : people
    }

    private var preview: String {
        if let content = conversation.lastMessage?.content, !content.isEmpty { return content }
        if conversation.lastMessage?.hasAttachment == true { return "Sent an attachment" }
        return isRequest ? "Open to accept or decline this request." : "No messages yet"
    }
}

struct MessageThreadView: View {
    let conversationId: String
    let currentProfileId: String?

    @Environment(\.dismiss) private var dismiss
    @State private var thread: ConversationThread?
    @State private var error: Error?
    @State private var draft = ""
    @State private var sending = false
    @State private var attachment: PickedAttachment?
    @State private var pickerItem: PhotosPickerItem?
    @State private var showingPhotoPicker = false
    @State private var showingCamera = false
    @State private var showingFilePicker = false
    @State private var composerError: String?
    @State private var photoAccessBlocked = false
    @StateObject private var uploadProgress = UploadProgressModel()

    private var incomingRequest: Bool {
        thread?.requestStatus == "pending" && thread?.requestedBy != currentProfileId
    }

    private var outgoingRequest: Bool {
        thread?.requestStatus == "pending" && thread?.requestedBy == currentProfileId
    }

    private var canCompose: Bool {
        (thread?.canSend ?? true)
            && (thread?.requestStatus != "pending" || (outgoingRequest && thread?.messages.isEmpty == true))
    }

    var body: some View {
        Group {
            if let thread {
                VStack(spacing: 0) {
                    if incomingRequest {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Message request").font(.headline)
                            Text("Opening this request does not send a read receipt. Accept it before replying.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            HStack {
                                Button("Accept") { Task { await decideRequest(accept: true) } }
                                    .buttonStyle(.borderedProminent)
                                Button("Decline", role: .destructive) { Task { await decideRequest(accept: false) } }
                                    .buttonStyle(.bordered)
                            }
                            .disabled(sending)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color.orange.opacity(0.1))
                    } else if outgoingRequest {
                        Text(thread.messages.isEmpty
                             ? "Send one introduction. You can continue after this member accepts."
                             : "Message request sent. Waiting for this member to accept.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(Theme.Palette.subtle)
                    }

                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 10) {
                                ForEach(thread.messages) { message in
                                    MessageBubble(
                                        message: message,
                                        isMine: message.senderId == currentProfileId
                                    )
                                    .id(message.id)
                                }
                            }
                            .padding()
                        }
                        .onChange(of: thread.messages.count) {
                            if let last = thread.messages.last {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }

                    Divider()
                    if canCompose {
                    VStack(spacing: 8) {
                        if let attachment {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Image(systemName: attachment.kind == .video ? "video.fill" : attachment.kind == .image ? "photo.fill" : "doc.fill")
                                        .foregroundStyle(Theme.Palette.primary)
                                    Text(attachment.filename)
                                        .font(.caption)
                                        .lineLimit(1)
                                    Spacer()
                                    if !uploadProgress.isUploading {
                                        Button {
                                            self.attachment = nil
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                if let label = uploadProgress.label {
                                    ProgressView(value: uploadProgress.fraction ?? 0) {
                                        Text(label).font(.caption2)
                                    }
                                    .tint(Theme.Palette.primary)
                                }
                            }
                            .padding(8)
                            .background(Theme.Palette.subtle)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        HStack(spacing: 10) {
                            Menu {
                                Button("Take Photo", systemImage: "camera") {
                                    showingCamera = true
                                }
                                Button("Photo or Video", systemImage: "photo.on.rectangle") {
                                    Task { await openPhotoLibrary() }
                                }
                                Button("Choose File", systemImage: "doc") {
                                    showingFilePicker = true
                                }
                            } label: {
                                Image(systemName: "paperclip")
                                    .frame(width: 32, height: 32)
                            }
                            .disabled(sending)

                            TextField("Message", text: $draft, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(1...4)
                            Button {
                                Task { await send() }
                            } label: {
                                Image(systemName: sending ? "hourglass" : "paperplane.fill")
                            }
                            .disabled(sending || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachment == nil))
                        }

                        if let composerError {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(composerError)
                                    .font(.caption)
                                    .foregroundStyle(Theme.Palette.danger)
                                if photoAccessBlocked {
                                    Button("Open Settings") {
                                        AttachmentPickerSupport.openSystemSettings()
                                    }
                                    .font(.caption.weight(.semibold))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding()
                    } else {
                        Text(thread.sendUnavailableReason
                             ?? (incomingRequest ? "Accept this request to reply." : "Waiting for this member to accept your request."))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                }
            } else if let error {
                ErrorView(message: error.localizedDescription) { Task { await load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(threadTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .photosPicker(
            isPresented: $showingPhotoPicker,
            selection: $pickerItem,
            matching: .any(of: [.images, .videos])
        )
        .onChange(of: pickerItem) { _, item in
            Task { await loadPickerItem(item) }
        }
        .fileImporter(
            isPresented: $showingFilePicker,
            allowedContentTypes: AttachmentPickerSupport.supportedFileTypes,
            allowsMultipleSelection: false
        ) { result in
            do {
                guard let url = try result.get().first else { return }
                attachment = try AttachmentPickerSupport.loadFile(url)
                composerError = nil
                photoAccessBlocked = false
            } catch {
                composerError = "That file could not be attached."
                photoAccessBlocked = false
            }
        }
        .fullScreenCover(isPresented: $showingCamera) {
            CameraCaptureView(
                prompt: "Attach a photo",
                onCapture: { data in
                    attachment = .cameraPhoto(data)
                    showingCamera = false
                },
                onCancel: { showingCamera = false }
            )
        }
    }

    private var threadTitle: String {
        guard let thread else { return "Conversation" }
        return ConversationTitle.full(
            participants: thread.participants,
            myProfileId: currentProfileId,
            listing: thread.listingContext
        )
    }

    private func load() async {
        do {
            self.thread = try await MessagesAPI.conversation(id: conversationId)
            self.error = nil
        } catch {
            self.error = error
        }
    }

    private func send() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedAttachment = attachment
        guard (!content.isEmpty || selectedAttachment != nil), !sending else { return }
        sending = true
        defer { sending = false }
        do {
            var attachmentUrl: String?
            if let selectedAttachment {
                uploadProgress.begin(total: 1)
                defer { uploadProgress.reset() }
                attachmentUrl = try await R2Uploader.upload(
                    data: selectedAttachment.data,
                    filename: selectedAttachment.filename,
                    contentType: selectedAttachment.contentType,
                    entity: "message_attachment",
                    recordId: conversationId,
                    onProgress: uploadProgress.handler()
                )
            }
            _ = try await MessagesAPI.sendMessage(
                conversationId: conversationId,
                content: content,
                attachmentUrl: attachmentUrl,
                attachmentType: selectedAttachment?.contentType
            )
            draft = ""
            attachment = nil
            composerError = nil
            photoAccessBlocked = false
            await load()
        } catch {
            composerError = error.localizedDescription
            photoAccessBlocked = false
        }
    }

    private func decideRequest(accept: Bool) async {
        guard !sending else { return }
        sending = true
        defer { sending = false }
        do {
            try await MessagesAPI.decideRequest(conversationId: conversationId, accept: accept)
            if accept {
                await load()
            } else {
                dismiss()
            }
        } catch {
            composerError = error.localizedDescription
        }
    }

    private func openPhotoLibrary() async {
        let status = await AttachmentPickerSupport.requestPhotoAccess()
        if status == .authorized || status == .limited {
            photoAccessBlocked = false
            showingPhotoPicker = true
        } else {
            composerError = "Photo access is off. Allow full or limited access to attach photos."
            photoAccessBlocked = true
        }
    }

    private func loadPickerItem(_ item: PhotosPickerItem?) async {
        defer { pickerItem = nil }
        guard let item else { return }
        do {
            attachment = try await AttachmentPickerSupport.load(item)
            composerError = nil
            photoAccessBlocked = false
        } catch {
            composerError = "That photo or video could not be attached."
            photoAccessBlocked = false
        }
    }
}

private struct MessageBubble: View {
    let message: ConversationMessage
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 44) }
            VStack(alignment: .leading, spacing: 4) {
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.subheadline)
                }
                if let urlString = message.attachmentUrl,
                   let url = URL(string: urlString) {
                    MessageAttachmentView(url: url, contentType: message.attachmentType)
                }
                if let created = message.createdAt {
                    Text(created, style: .time)
                        .font(.caption2)
                        .foregroundStyle(isMine ? .white.opacity(0.75) : .secondary)
                }
            }
            .padding(10)
            .foregroundStyle(isMine ? .white : .primary)
            .background(isMine ? Theme.Palette.primary : Theme.Palette.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            if !isMine { Spacer(minLength: 44) }
        }
    }
}

private struct MessageAttachmentView: View {
    let url: URL
    let contentType: String?

    var body: some View {
        Group {
            if contentType?.hasPrefix("image/") == true {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFit()
                    case .failure: Label("Image unavailable", systemImage: "photo")
                    default: ProgressView()
                    }
                }
                .frame(maxWidth: 260, maxHeight: 280)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if contentType?.hasPrefix("video/") == true {
                RemoteVideoPlayer(url: url)
                    .frame(width: 250, height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Link(destination: url) {
                    Label("Open attachment", systemImage: "doc.fill")
                        .font(.caption.weight(.semibold))
                }
            }
        }
    }
}

private struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var selectedRecipient: MessageRecipient?
    @State private var creating = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            AsyncContent(
                load: { try await MessagesAPI.recipients() },
                loaded: { recipients in
                    List(recipients) { recipient in
                        Button {
                            selectedRecipient = recipient
                            Task { await create() }
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(recipient.displayName ?? recipient.username ?? "PerfectPPI member")
                                        .font(.headline)
                                    Text(recipient.role?.rawValue.replacingOccurrences(of: "_", with: " ") ?? "member")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if recipient.contactMode == "request" {
                                        Text("Request via \(recipient.sharedGroupName ?? "shared group")")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if creating && selectedRecipient?.id == recipient.id {
                                    ProgressView()
                                }
                            }
                        }
                    }
                    .overlay {
                        if recipients.isEmpty {
                            EmptyStateCard(
                                title: "No recipients",
                                message: "There are no other members available to message yet.",
                                systemImage: "person.crop.circle.badge.questionmark"
                            )
                            .padding()
                        }
                    }
                },
                failure: { error, retry in
                    ErrorView(message: error.localizedDescription, retry: retry)
                }
            )
            .navigationTitle("New Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Couldn't start conversation",
                   isPresented: .constant(error != nil),
                   actions: { Button("OK") { error = nil } },
                   message: { Text(error ?? "") })
        }
    }

    private func create() async {
        guard let selectedRecipient, !creating else { return }
        creating = true
        defer { creating = false }
        do {
            _ = try await MessagesAPI.createConversation(participantId: selectedRecipient.id)
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
