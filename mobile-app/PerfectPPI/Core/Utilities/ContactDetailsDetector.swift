import Foundation

/// Plan 22.3: members may share contact details in a conversation, with an
/// anti-scam caution shown before they do. Mirrors
/// `src/lib/messages/contact-warning.ts`: an email, or a phone-shaped run of
/// 10–15 digits with phone separators. Commas and currency signs break a
/// run, so prices and mileage never trigger it. Detection only decides
/// whether the caution is shown; it never blocks a message.
enum ContactDetailsDetector {
    private static let email = try! NSRegularExpression(
        pattern: #"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#,
        options: [.caseInsensitive]
    )
    private static let phoneRun = try! NSRegularExpression(
        pattern: #"\+?\(?\d[\d\s().-]{7,}\d"#
    )

    static func containsContactDetails(_ text: String) -> Bool {
        guard !text.isEmpty else { return false }
        let range = NSRange(text.startIndex..., in: text)
        if email.firstMatch(in: text, range: range) != nil { return true }
        for match in phoneRun.matches(in: text, range: range) {
            guard let runRange = Range(match.range, in: text) else { continue }
            let digits = text[runRange].filter(\.isNumber).count
            if (10...15).contains(digits) { return true }
        }
        return false
    }

    static let warning = String(
        localized: "Sharing your phone or email moves this conversation off PerfectPPI. PerfectPPI never asks for payment or a deposit through messages; do not send money to someone you have not met, and keep inspection and sale arrangements in writing."
    )
}
