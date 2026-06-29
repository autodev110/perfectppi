import Foundation

// Mirrors src/types/enums.ts on the server. Keep in sync.

enum UserRole: String, Codable, CaseIterable {
    case consumer
    case technician
    case orgManager = "org_manager"
    case admin
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

enum ReviewStatus: String, Codable {
    case active, hidden
}

enum ShareTargetType: String, Codable {
    case mediaPackage = "media_package"
    case inspectionResult = "inspection_result"
    case standardizedOutput = "standardized_output"
}
