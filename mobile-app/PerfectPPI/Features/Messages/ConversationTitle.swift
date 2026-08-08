import Foundation

/// Conversation title formatting, shared by the inbox list and the open thread
/// so both name a conversation the same way. Mirrors
/// `src/features/messages/format.ts` on the web.
enum ConversationTitle {
    private static let maxNamesInTitle = 3

    static func displayName(_ participant: ConversationProfile) -> String {
        if let name = participant.displayName?.trimmed, !name.isEmpty { return name }
        if let username = participant.username?.trimmed, !username.isEmpty { return "@\(username)" }
        return String(participant.id.prefix(8)).uppercased()
    }

    /// Names everyone in the thread, counterparty first so the name you scan
    /// for leads. Empty when there are no participants.
    static func peopleLabel(
        participants: [ConversationProfile],
        myProfileId: String?
    ) -> String {
        let others = participants.filter { $0.id != myProfileId }
        let me = myProfileId == nil ? [] : participants.filter { $0.id == myProfileId }
        let ordered = others + me

        guard !ordered.isEmpty else { return "" }

        let names = ordered.map(displayName)
        if names.count <= maxNamesInTitle { return names.joined(separator: " & ") }

        let shown = names.prefix(maxNamesInTitle - 1)
        return "\(shown.joined(separator: " & ")) & \(names.count - shown.count) others"
    }

    /// Full title: both people, plus the car when the thread came from a
    /// marketplace listing — "Ana Rossi & Ben Cole · 2019 Toyota Supra".
    static func full(
        participants: [ConversationProfile],
        myProfileId: String?,
        listing: ConversationListingContext?
    ) -> String {
        let people = peopleLabel(participants: participants, myProfileId: myProfileId)
        let base = people.isEmpty ? "Conversation" : people
        guard let car = listing?.carLabel else { return base }
        return "\(base) · \(car)"
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
