import Foundation

// Mirrors src/types/enums.ts on the server. Keep in sync.

enum UserRole: String, Codable, CaseIterable {
    case consumer
    case technician
    case orgManager = "org_manager"
    case admin
    // A developer account parks here between roles. It has no tab bar of its
    // own — the switcher stands in for one. It must decode regardless:
    // Profile.role is a RawRepresentable, so an unrecognized string fails the
    // whole profile decode and locks the account out of the app entirely.
    case developer

    /// Roles a developer can switch into, in the order the switcher lists them.
    /// Mirrors SWITCHABLE_ROLES in src/types/enums.ts.
    static let switchable: [UserRole] = [
        .developer, .consumer, .technician, .orgManager, .admin,
    ]

    var label: String {
        switch self {
        case .consumer: return "Consumer"
        case .technician: return "Technician"
        case .orgManager: return "Organization Manager"
        case .admin: return "Admin"
        case .developer: return "Developer"
        }
    }

    var summary: String {
        switch self {
        case .consumer: return "Vehicles, listings, inspection requests, warranties."
        case .technician: return "Assigned inspection queue, submissions, reviews."
        case .orgManager: return "Organization roster, inspections, DealerSpace."
        case .admin: return "Platform-wide moderation, outputs, audit log."
        case .developer: return "This switcher. No portal data of its own."
        }
    }

    var icon: String {
        switch self {
        case .consumer: return "car.fill"
        case .technician: return "wrench.and.screwdriver.fill"
        case .orgManager: return "building.2.fill"
        case .admin: return "shield.lefthalf.filled"
        case .developer: return "hammer.fill"
        }
    }
}

enum MediaType: String, Codable { case image, video }
enum VehicleVisibility: String, Codable { case `public`, `private` }

enum WhoseCar: String, Codable { case own, other }
enum RequesterRole: String, Codable { case buying, selling, documenting }
enum PerformerType: String, Codable { case selfInspection = "self", technician }

enum PpiType: String, Codable {
    case personal
    case generalTech = "general_tech"
    case certifiedTech = "certified_tech"
}

enum PpiRequestStatus: String, Codable {
    case draft
    case pendingAssignment = "pending_assignment"
    case assigned
    case accepted
    case inProgress = "in_progress"
    case submitted
    case needsRevision = "needs_revision"
    case completed
    case archived
}

enum PpiSubmissionStatus: String, Codable {
    case draft
    case inProgress = "in_progress"
    case submitted
    case completed
}

/// Which question set an inspection asks. Distinct from `PpiType`, which is the
/// trust tier derived from the performer's certification.
enum InspectionScope: String, Codable, CaseIterable {
    case complete
    case dentsTires = "dents_tires"

    var label: String {
        switch self {
        case .complete: return "Complete Inspection"
        case .dentsTires: return "Dents & Tires"
        }
    }

    var summary: String {
        switch self {
        case .complete: return "Full pre-purchase inspection — every system, inside and out."
        case .dentsTires: return "Tire tread, wheels, and cosmetic body damage."
        }
    }
}

enum SectionType: String, Codable, CaseIterable {
    case vehicleBasics = "vehicle_basics"
    case dashboardWarnings = "dashboard_warnings"
    case exterior
    case interior
    case engineBay = "engine_bay"
    case tiresBrakes = "tires_brakes"
    case suspensionSteering = "suspension_steering"
    case fluids
    case electricalControls = "electrical_controls"
    case underbody
    case roadTest = "road_test"
    case modifications
    // dents_tires scope only
    case wheelsTires = "wheels_tires"
    case bodyDamage = "body_damage"

    var label: String {
        switch self {
        case .wheelsTires: return "Wheels & Tires"
        default: return rawValue.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

enum CompletionState: String, Codable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case completed
}

enum AnswerType: String, Codable {
    case text
    case yesNo = "yes_no"
    case select
    case number
}

enum WarrantyOrderStatus: String, Codable {
    case contractPending = "contract_pending"
    case signed
    case paymentPending = "payment_pending"
    case paid
    case failed
    case cancelled
}

enum PaymentStatus: String, Codable {
    case pending, completed, failed, refunded
}

enum CertificationLevel: String, Codable {
    case none, ase, master
    case oemQualified = "oem_qualified"
}

enum NotificationType: String, Codable {
    case techRequestNew = "tech_request_new"
    case techRequestAccepted = "tech_request_accepted"
    case inspectionSubmitted = "inspection_submitted"
    case inspectionUpdated = "inspection_updated"
    case warrantyAvailable = "warranty_available"
    case paymentCompleted = "payment_completed"
    case messageReceived = "message_received"
}

enum ListingStatus: String, Codable {
    case active, sold, archived
}

enum CommunityContentStatus: String, Codable {
    case active, hidden, archived
}

enum CommunityPostAudience: String, Codable, CaseIterable, Identifiable {
    case `public`, friends

    var id: String { rawValue }
    var label: String { self == .public ? "Public" : "Friends" }
}

enum ReviewStatus: String, Codable {
    case active, hidden
}

enum ShareTargetType: String, Codable {
    case mediaPackage = "media_package"
    case inspectionResult = "inspection_result"
    case standardizedOutput = "standardized_output"
}
