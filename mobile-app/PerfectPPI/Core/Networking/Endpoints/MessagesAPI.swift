import Foundation

enum MessagesAPI {
    static func conversations() async throws -> [ConversationSummary] {
        try await APIClient.shared.get("/api/messages/conversations")
    }

    static func conversation(id: String) async throws -> ConversationThread {
        try await APIClient.shared.get("/api/messages/conversations/\(id)")
    }

    static func recipients() async throws -> [MessageRecipient] {
        try await APIClient.shared.get("/api/messages/recipients")
    }

    struct CreateConversationPayload: Encodable {
        let participantId: String
    }

    static func createConversation(participantId: String) async throws -> CreateConversationResult {
        try await APIClient.shared.postCamel(
            "/api/messages/conversations",
            body: CreateConversationPayload(participantId: participantId)
        )
    }

    struct SendMessagePayload: Encodable {
        let content: String
        let attachmentUrl: String?
        let attachmentType: String?
    }

    static func sendMessage(
        conversationId: String,
        content: String,
        attachmentUrl: String? = nil,
        attachmentType: String? = nil
    ) async throws -> ConversationMessage {
        try await APIClient.shared.postCamel(
            "/api/messages/conversations/\(conversationId)/messages",
            body: SendMessagePayload(
                content: content,
                attachmentUrl: attachmentUrl,
                attachmentType: attachmentType
            )
        )
    }
}
