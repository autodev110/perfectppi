import Foundation

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
        case .notAuthenticated: return "You must sign in to continue."
        case .forbidden: return "You don't have permission for that."
        case .notFound: return "We couldn't find that record."
        case .duplicateVehicle: return "It looks like you already have a vehicle with this same VIN."
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
        case .decoding: return "Couldn't read the server response."
        case .encoding: return "Couldn't build the request."
        case .unknown: return "Something went wrong. Please try again."
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
            return "Too many photo uploads are still pending from earlier attempts. Wait about \(minutes) minute\(minutes == 1 ? "" : "s") and try again, or post without photos."
        }
        if code == "rate_limited" || status == 429 {
            if let retryAfterSeconds, retryAfterSeconds > 0 {
                if retryAfterSeconds < 60 {
                    return "You're doing that too quickly. Try again in less than a minute."
                }
                let minutes = Int(ceil(Double(retryAfterSeconds) / 60.0))
                return "You're doing that too quickly. Try again in about \(minutes) minute\(minutes == 1 ? "" : "s")."
            }
            return "You're doing that too quickly. Please wait a few minutes and try again."
        }

        let knownCodes: [String: String] = [
            "validation_failed": "Please check the information and try again.",
            "unsafe_link": "That link cannot be used. Remove it or enter a standard web address.",
            "duplicate_content": "You just submitted the same content. Edit it before trying again.",
            "content_not_allowed": "This content cannot be published because it doesn't follow the Community Guidelines.",
            "invalid_media": "One of the selected files could not be used. Try a different photo.",
            "media_safety_unavailable": "Photo publishing is temporarily unavailable. You can still post text.",
            "posting_restricted": "Community posting is currently unavailable for this account.",
            "unauthorized_audience": "You cannot publish to the selected audience.",
            "posting_unavailable": "Community posting is temporarily unavailable. Please try again later.",
            "unsupported_media": "Video posts are not available yet. Please choose photos only."
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
            return "We couldn't complete that request. Check the information and try again."
        default:
            return "The service is temporarily unavailable. Please try again."
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
