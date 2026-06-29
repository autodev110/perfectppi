import SwiftUI

struct MessagesView: View {
    let currentProfileId: String?

    @State private var reloadToken = UUID()
    @State private var showingComposer = false

    init(currentProfileId: String? = nil) {
        self.currentProfileId = currentProfileId
    }

    var body: some View {
        AsyncContent(
            load: { try await MessagesAPI.conversations() },
            loaded: { conversations in
                Group {
                    if conversations.isEmpty {
                        EmptyStateCard(
                            title: "No messages yet",
                            message: "Conversations with sellers, buyers, technicians, and shops will appear here.",
                            systemImage: "bubble.left.and.bubble.right"
                        )
                        .padding()
                    } else {
                        List(conversations) { conversation in
                            NavigationLink {
                                MessageThreadView(
                                    conversationId: conversation.id,
                                    currentProfileId: currentProfileId
                                )
                            } label: {
                                ConversationRow(conversation: conversation)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
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

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
                if conversation.unreadCount > 0 {
                    StatusBadge(text: "\(conversation.unreadCount)", color: Theme.Palette.primary)
                }
            }
            if let content = conversation.lastMessage?.content, !content.isEmpty {
                Text(content)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            } else {
                Text("No messages yet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let date = conversation.lastMessage?.createdAt ?? conversation.createdAt {
                Text(date, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private var title: String {
        let names = conversation.otherParticipants
            .map { $0.displayName ?? $0.username ?? $0.id.prefix(8).uppercased() }
        return names.isEmpty ? "Conversation" : names.joined(separator: ", ")
    }
}

struct MessageThreadView: View {
    let conversationId: String
    let currentProfileId: String?

    @State private var thread: ConversationThread?
    @State private var error: Error?
    @State private var draft = ""
    @State private var sending = false

    var body: some View {
        Group {
            if let thread {
                VStack(spacing: 0) {
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
                    HStack(spacing: 10) {
                        TextField("Message", text: $draft, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(1...4)
                        Button {
                            Task { await send() }
                        } label: {
                            Image(systemName: sending ? "hourglass" : "paperplane.fill")
                        }
                        .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding()
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
    }

    private var threadTitle: String {
        guard let thread else { return "Conversation" }
        let names = thread.participants.map { $0.displayName ?? $0.username ?? "Member" }
        return names.isEmpty ? "Conversation" : names.joined(separator: ", ")
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
        guard !content.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            _ = try await MessagesAPI.sendMessage(conversationId: conversationId, content: content)
            draft = ""
            await load()
        } catch {
            self.error = error
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
                Text(message.content)
                    .font(.subheadline)
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
