import Foundation

// Typed inspection observations (catalog 2), mirroring
// src/features/ppi/inspection-schema.ts. The server validates every
// observation authoritatively; these helpers drive the editors, grouping and
// the local completeness checks so the app never shows a missing or
// unavailable check as complete.

// Observations use the app's shared `JSONValue` (Core/Models/PostDetails.swift).
// String-keyed dictionaries bypass the API client's snake/camel key strategies,
// so observation keys such as `none_observed` round-trip exactly.

enum InspectionCorner: String, CaseIterable, Sendable {
    case frontLeft = "front_left"
    case frontRight = "front_right"
    case rearLeft = "rear_left"
    case rearRight = "rear_right"

    /// Vehicle left/right, from the driver's seat.
    var label: String {
        switch self {
        case .frontLeft: return String(localized: "Front left")
        case .frontRight: return String(localized: "Front right")
        case .rearLeft: return String(localized: "Rear left")
        case .rearRight: return String(localized: "Rear right")
        }
    }

    /// The physical walk-around order used for capture.
    static let captureOrder: [InspectionCorner] = [.frontLeft, .rearLeft, .rearRight, .frontRight]
}

enum StructuredFamily: String, Sendable {
    case tirePlacard, tireSidewall, tireDot, tireTread, tirePressure, tireCracking, tireWear
    case tireDamage, wheelDamage, brakePad, batteryTest, bodyPanel
}

struct StructuredKey: Sendable {
    let family: StructuredFamily
    let corner: InspectionCorner?
    let panel: String?

    static let bodyPanels: Set<String> = [
        "hood", "roof", "trunk_tailgate", "front_bumper", "rear_bumper",
        "left_front_fender", "right_front_fender", "left_front_door", "right_front_door",
        "left_rear_door", "right_rear_door", "left_rear_quarter", "right_rear_quarter",
        "left_rocker", "right_rocker", "other_body_panel",
    ]

    static func parse(_ key: String?) -> StructuredKey? {
        guard let key else { return nil }
        if key == "tires.placard" { return .init(family: .tirePlacard, corner: nil, panel: nil) }
        if key == "battery.test" { return .init(family: .batteryTest, corner: nil, panel: nil) }
        let parts = key.split(separator: ".").map(String.init)
        guard parts.count == 3 else { return nil }
        let corner = InspectionCorner(rawValue: parts[1])
        switch (parts[0], parts[2]) {
        case ("tires", "sidewall"): return corner.map { .init(family: .tireSidewall, corner: $0, panel: nil) }
        case ("tires", "dot_date"): return corner.map { .init(family: .tireDot, corner: $0, panel: nil) }
        case ("tires", "tread"): return corner.map { .init(family: .tireTread, corner: $0, panel: nil) }
        case ("tires", "pressure"): return corner.map { .init(family: .tirePressure, corner: $0, panel: nil) }
        case ("tires", "cracking"): return corner.map { .init(family: .tireCracking, corner: $0, panel: nil) }
        case ("tires", "wear"): return corner.map { .init(family: .tireWear, corner: $0, panel: nil) }
        case ("tires", "damage"): return corner.map { .init(family: .tireDamage, corner: $0, panel: nil) }
        case ("wheels", "damage"): return corner.map { .init(family: .wheelDamage, corner: $0, panel: nil) }
        case ("brakes", "pad_thickness"): return corner.map { .init(family: .brakePad, corner: $0, panel: nil) }
        case ("body", "condition"):
            return bodyPanels.contains(parts[1]) ? .init(family: .bodyPanel, corner: nil, panel: parts[1]) : nil
        default: return nil
        }
    }

    /// Rows presented together on one card: the initial tire-photo pass, a
    /// wheel, a body zone, or the optional brake measurements. Nil means a
    /// single-question step.
    var stepGroupId: String? {
        switch family {
        case .tirePlacard, .tireSidewall, .tireDot:
            return "tires:photos"
        case .bodyPanel:
            guard let panel else { return nil }
            if ["hood", "front_bumper"].contains(panel) { return "body:front" }
            if ["trunk_tailgate", "rear_bumper"].contains(panel) { return "body:rear" }
            if ["roof", "other_body_panel"].contains(panel) { return "body:top" }
            return panel.hasPrefix("left_") ? "body:left" : "body:right"
        case .brakePad:
            return "brakes:measurements"
        case .batteryTest:
            return nil
        default:
            return corner.map { "wheel:\($0.rawValue)" }
        }
    }

    var stepGroupLabel: String? {
        guard let id = stepGroupId else { return nil }
        switch id {
        case "tires:photos": return String(localized: "Tire labels & sidewalls")
        case "body:front": return String(localized: "Body — front")
        case "body:rear": return String(localized: "Body — rear")
        case "body:top": return String(localized: "Body — roof & other")
        case "body:left": return String(localized: "Body — left side")
        case "body:right": return String(localized: "Body — right side")
        case "brakes:measurements": return String(localized: "Brake pad measurements")
        default: return corner.map { String(localized: "\($0.label) wheel") }
        }
    }
}

enum ObservationState: String, CaseIterable, Sendable {
    case observed
    case unableToAssess = "unable_to_assess"
    case notInspected = "not_inspected"
    case notApplicable = "not_applicable"

    var label: String {
        switch self {
        case .observed: return String(localized: "Recorded")
        case .unableToAssess: return String(localized: "Unable to assess")
        case .notInspected: return String(localized: "Not checked")
        case .notApplicable: return String(localized: "Not applicable")
        }
    }
}

enum ExceptionReason: String, CaseIterable, Sendable {
    case noGauge = "no_gauge"
    case inaccessible
    case unsafeAccess = "unsafe_access"
    case unreadable
    case missingLabel = "missing_label"
    case notEquipped = "not_equipped"
    case vehicleConfiguration = "vehicle_configuration"
    case weatherOrLighting = "weather_or_lighting"
    case other

    var label: String {
        switch self {
        case .noGauge: return String(localized: "No gauge available")
        case .inaccessible: return String(localized: "Not accessible")
        case .unsafeAccess: return String(localized: "Unsafe to access")
        case .unreadable: return String(localized: "Not readable")
        case .missingLabel: return String(localized: "Label missing")
        case .notEquipped: return String(localized: "Not equipped on this vehicle")
        case .vehicleConfiguration: return String(localized: "Does not exist on this body style")
        case .weatherOrLighting: return String(localized: "Weather or lighting prevented it")
        case .other: return String(localized: "Other reason")
        }
    }
}

/// Convenience reads and builders over the observation document.
enum Observation {
    static func state(_ observation: JSONValue?) -> ObservationState? {
        observation?["state"]?.stringValue.flatMap(ObservationState.init(rawValue:))
    }

    static func value(_ observation: JSONValue?) -> JSONValue? {
        guard let value = observation?["value"], value != .null else { return nil }
        return value
    }

    static func observed(
        _ value: [String: JSONValue],
        extractionId: String? = nil,
        extractionIds: [String]? = nil,
        evidenceException: ExceptionReason? = nil
    ) -> JSONValue {
        var document: [String: JSONValue] = [
            "v": .number(1),
            "state": .string(ObservationState.observed.rawValue),
            "value": .object(value),
            "reason": .null,
            "source": .string(extractionId == nil ? "inspector_entry" : "confirmed_extraction"),
        ]
        if let extractionId { document["extraction_id"] = .string(extractionId) }
        if let extractionId, let extractionIds {
            let unique = Array(Set(extractionIds + [extractionId])).sorted()
            document["extraction_ids"] = .array(unique.map(JSONValue.string))
        }
        if let evidenceException {
            document["evidence_exception"] = .object(["code": .string(evidenceException.rawValue)])
        }
        return .object(document)
    }

    static func exception(_ state: ObservationState, reason: ExceptionReason, explanation: String?) -> JSONValue {
        var reasonObject: [String: JSONValue] = ["code": .string(reason.rawValue)]
        if let explanation, !explanation.trimmingCharacters(in: .whitespaces).isEmpty {
            reasonObject["explanation"] = .string(explanation.trimmingCharacters(in: .whitespaces))
        }
        return .object([
            "v": .number(1),
            "state": .string(state.rawValue),
            "value": .null,
            "reason": .object(reasonObject),
            "source": .string("inspector_entry"),
        ])
    }

    /// Mirrors requirementError: technicians must measure tread and pressure;
    /// a required check cannot be left "not checked".
    static func requirementMet(key: String?, observation: JSONValue?, required: Bool, performerMode: String) -> Bool {
        guard let parsed = StructuredKey.parse(key) else { return true }
        guard let state = state(observation) else { return !required }
        if state != .observed {
            guard observation?["reason"]?["code"]?.stringValue != nil else { return false }
            if observation?["reason"]?["code"]?.stringValue == "other",
               (observation?["reason"]?["explanation"]?.stringValue ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                return false
            }
        }
        if required && state == .notInspected { return false }
        let measuredOnly = parsed.family == .tireTread || parsed.family == .tirePressure
        if measuredOnly && performerMode != "self" && state != .observed { return false }
        return true
    }

    /// Mirrors structuredPhotoRequired: readings and declared damage need a
    /// photo unless an evidence exception was recorded.
    static func photoRequired(key: String?, observation: JSONValue?) -> Bool {
        guard let parsed = StructuredKey.parse(key), state(observation) == .observed else { return false }
        if case .object = observation?["evidence_exception"] { return false }
        switch parsed.family {
        case .tirePlacard, .tireSidewall, .tireTread: return true
        case .tireDamage, .wheelDamage: return value(observation)?["defects"]?.arrayValue != nil
        case .bodyPanel: return value(observation)?["condition"]?.stringValue == "damage_present"
        default: return false
        }
    }

    /// Accepts "4,5" from comma-decimal locales; nil when not a plain number.
    static func normalizeDecimal(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard (try? /^\d{1,5}(\.\d{1,4})?$/.wholeMatch(in: trimmed)) != nil else { return nil }
        return trimmed
    }
}
