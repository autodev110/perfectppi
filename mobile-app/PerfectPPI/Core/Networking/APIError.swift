import Foundation

// User-facing wording is resolved through the string catalog (plan 32.2);
// server `code` values stay machine codes and the catalog supplies the copy.
enum APIError: LocalizedError {
    case notAuthenticated
    case forbidden
    case notFound
    case duplicateVehicle(Vehicle)
    case server(status: Int, message: String?)
    case serverResponse(status: Int, code: String?, message: String?, retryAfterSeconds: Int?)
    case transport(URLError)
    case decoding(DecodingError)
    case encoding(EncodingError)
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return String(localized: "You must sign in to continue.")
        case .forbidden: return String(localized: "You don't have permission for that.")
        case .notFound: return String(localized: "We couldn't find that record.")
        case .duplicateVehicle: return String(localized: "It looks like you already have a vehicle with this same VIN.")
        case .server(let status, let message):
            return Self.userFacingServerMessage(status: status, serverMessage: message)
        case .serverResponse(let status, let code, let message, let retryAfterSeconds):
            return Self.userFacingServerMessage(
                status: status,
                code: code,
                serverMessage: message,
                retryAfterSeconds: retryAfterSeconds
            )
        case .transport(let e): return e.localizedDescription
        case .decoding: return String(localized: "Couldn't read the server response.")
        case .encoding: return String(localized: "Couldn't build the request.")
        case .unknown: return String(localized: "Something went wrong. Please try again.")
        }
    }

    static func userFacingServerMessage(
        status: Int,
        code: String? = nil,
        serverMessage: String? = nil,
        retryAfterSeconds: Int? = nil
    ) -> String {
        // Specific server explanations win over the generic 429 wording, so a
        // pending-upload backlog is not mistaken for the posting rate limit.
        if code == "upload_backlog" {
            let minutes = max(1, Int(ceil(Double(retryAfterSeconds ?? 600) / 60.0)))
            return minutes == 1
                ? String(localized: "Too many photo uploads are still pending from earlier attempts. Wait about a minute and try again, or post without photos.")
                : String(localized: "Too many photo uploads are still pending from earlier attempts. Wait about \(minutes) minutes and try again, or post without photos.")
        }
        if code == "rate_limited" || status == 429 {
            if let retryAfterSeconds, retryAfterSeconds > 0 {
                if retryAfterSeconds < 60 {
                    return String(localized: "You're doing that too quickly. Try again in less than a minute.")
                }
                let minutes = Int(ceil(Double(retryAfterSeconds) / 60.0))
                return minutes == 1
                    ? String(localized: "You're doing that too quickly. Try again in about a minute.")
                    : String(localized: "You're doing that too quickly. Try again in about \(minutes) minutes.")
            }
            return String(localized: "You're doing that too quickly. Please wait a few minutes and try again.")
        }

        let knownCodes: [String: String] = [
            "validation_failed": String(localized: "Please check the information and try again."),
            "unsafe_link": String(localized: "That link cannot be used. Remove it or enter a standard web address."),
            "duplicate_content": String(localized: "You just submitted the same content. Edit it before trying again."),
            "content_not_allowed": String(localized: "This content cannot be published because it doesn't follow the Community Guidelines."),
            "invalid_media": String(localized: "One of the selected files could not be used. Try a different photo."),
            "media_safety_unavailable": String(localized: "Photo publishing is temporarily unavailable. You can still post text."),
            "posting_restricted": String(localized: "Community posting is currently unavailable for this account."),
            "unauthorized_audience": String(localized: "You cannot publish to the selected audience."),
            "posting_unavailable": String(localized: "Community posting is temporarily unavailable. Please try again later."),
            "unsupported_media": String(localized: "Video posts are not available yet. Please choose photos only."),
            "app_update_required": String(localized: "Update the PerfectPPI app to open and submit this inspection."),
            "certification_required": String(localized: "Confirm the accuracy certification to submit."),
            "stale_revision": String(localized: "This inspection changed after you reviewed it. Review it again before certifying.")
        ]
        if let code, let message = knownCodes[code] { return message }

        if let serverMessage {
            let message = serverMessage.trimmingCharacters(in: .whitespacesAndNewlines)
            if !message.isEmpty && !Self.looksTechnical(message) && status < 500 {
                return message
            }
        }

        switch status {
        case 400..<500:
            return String(localized: "We couldn't complete that request. Check the information and try again.")
        default:
            return String(localized: "The service is temporarily unavailable. Please try again.")
        }
    }

    private static func looksTechnical(_ message: String) -> Bool {
        let lowercased = message.lowercased()
        if lowercased.contains("constraint")
            || lowercased.contains("sqlstate")
            || lowercased.contains("duplicate key")
            || lowercased.contains("pgrst")
            || lowercased.contains("stack trace") {
            return true
        }
        return message.range(
            of: #"^[a-z0-9]+(?:_[a-z0-9]+)+$"#,
            options: .regularExpression
        ) != nil
    }
}

struct ServerErrorBody: Decodable {
    let error: String?
    let code: String?
    let existingVehicle: Vehicle?
    let retryAfterSeconds: Int?
}
