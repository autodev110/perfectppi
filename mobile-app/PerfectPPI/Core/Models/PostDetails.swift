import Foundation

/// Loosely typed JSON for structured post details (plan 14.2). The server
/// and database validate shape; the app reads what it knows and ignores the
/// rest, so newer types on the server never break decoding.
indirect enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null; return }
        if let value = try? container.decode(Bool.self) { self = .bool(value); return }
        if let value = try? container.decode(Double.self) { self = .number(value); return }
        if let value = try? container.decode(String.self) { self = .string(value); return }
        if let value = try? container.decode([JSONValue].self) { self = .array(value); return }
        if let value = try? container.decode([String: JSONValue].self) { self = .object(value); return }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    var stringValue: String? { if case .string(let value) = self { return value } else { return nil } }
    var doubleValue: Double? { if case .number(let value) = self { return value } else { return nil } }
    var boolValue: Bool? { if case .bool(let value) = self { return value } else { return nil } }
    var arrayValue: [JSONValue]? { if case .array(let value) = self { return value } else { return nil } }
    var objectValue: [String: JSONValue]? { if case .object(let value) = self { return value } else { return nil } }
    var stringList: [String] { arrayValue?.compactMap(\.stringValue) ?? [] }

    subscript(key: String) -> JSONValue? { objectValue?[key] }
}

/// Poll state for the viewer: counts only after voting or close.
struct CommunityPollView: Codable, Hashable {
    struct Option: Codable, Hashable, Identifiable {
        let key: String
        let label: String
        let votes: Int?
        var id: String { key }
    }

    let closesAt: Date?
    let closed: Bool
    let totalVotes: Int
    let viewerOptionKey: String?
    let options: [Option]

    var revealed: Bool { closed || viewerOptionKey != nil }
}

/// Redacted inspection summary on Inspection Discussion posts.
struct CommunityInspectionSummary: Codable, Hashable {
    let id: String
    let ppiType: String
    let inspectionScope: String
    let status: String
    let completedAt: Date?
}

/// Post type presentation shared by the composer and cards.
extension CommunityPostType {
    var label: String {
        switch self {
        case .general: "General"
        case .question: "Question / Troubleshooting"
        case .buildUpdate: "Build Update"
        case .maintenance: "Maintenance / Repair"
        case .beforeAfter: "Before & After"
        case .inspectionDiscussion: "Inspection Discussion"
        case .buyingAdvice: "Buying Advice"
        case .poll: "Poll"
        case .unknown: "Post"
        }
    }

    /// Card chip; nil for general posts.
    var chip: String? {
        switch self {
        case .general, .unknown: nil
        case .question: "Question"
        case .buildUpdate: "Build"
        case .maintenance: "Maintenance"
        case .beforeAfter: "Before / After"
        case .inspectionDiscussion: "Inspection"
        case .buyingAdvice: "Buying advice"
        case .poll: "Poll"
        }
    }

    var prompt: String {
        switch self {
        case .general, .unknown: "What's happening with your car?"
        case .question: "Describe the symptom, when it happens, and what you've tried."
        case .buildUpdate: "What did you change, and how does it feel?"
        case .maintenance: "What was done, and anything the next owner should know?"
        case .beforeAfter: "First photo is before, second is after. What changed?"
        case .inspectionDiscussion: "What would you like the community's take on? Findings are never shared automatically."
        case .buyingAdvice: "What are you considering, and what matters most to you?"
        case .poll: "Ask the question your options answer."
        }
    }

    static var composable: [CommunityPostType] {
        [.general, .question, .buildUpdate, .maintenance, .beforeAfter, .inspectionDiscussion, .buyingAdvice, .poll]
    }
}
