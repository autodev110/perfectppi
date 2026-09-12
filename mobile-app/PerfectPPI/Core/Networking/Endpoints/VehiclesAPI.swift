import Foundation

enum VehiclesAPI {
    struct DecodedVinVehicle: Codable {
        let vin: String
        let year: Int?
        let make: String?
        let model: String?
        let trim: String?
    }

    private struct DecodeVinPayload: Encodable {
        let vin: String
    }

    static func decodeVIN(_ vin: String) async throws -> DecodedVinVehicle {
        try await APIClient.shared.postCamel(
            "/api/vehicles/decode-vin",
            body: DecodeVinPayload(vin: vin)
        )
    }

    static func list() async throws -> [Vehicle] {
        try await APIClient.shared.get("/api/vehicles")
    }

    struct CreatePayload: Encodable {
        let vin: String?
        let year: Int?
        let make: String?
        let model: String?
        let trim: String?
        let engine: String?
        let drivetrain: String?
        let transmission: String?
        let bodyStyle: String?
        let mileage: Int?
        let notes: String?
        let nickname: String?
        let ownershipState: VehicleOwnershipState?
        let visibility: VehicleVisibility?

        init(
            vin: String?,
            year: Int?,
            make: String?,
            model: String?,
            trim: String?,
            mileage: Int?,
            notes: String? = nil,
            nickname: String? = nil,
            ownershipState: VehicleOwnershipState? = nil,
            visibility: VehicleVisibility? = nil,
            engine: String? = nil,
            drivetrain: String? = nil,
            transmission: String? = nil,
            bodyStyle: String? = nil
        ) {
            self.vin = vin
            self.year = year
            self.make = make
            self.model = model
            self.trim = trim
            self.engine = engine
            self.drivetrain = drivetrain
            self.transmission = transmission
            self.bodyStyle = bodyStyle
            self.mileage = mileage
            self.notes = notes
            self.nickname = nickname
            self.ownershipState = ownershipState
            self.visibility = visibility
        }
    }

    static func create(_ payload: CreatePayload) async throws -> Vehicle {
        try await APIClient.shared.post("/api/vehicles", body: payload)
    }

    static func get(id: String) async throws -> Vehicle {
        try await APIClient.shared.get("/api/vehicles/\(id)")
    }

    struct UpdatePayload: Encodable {
        let vin: String?
        let year: Int?
        let make: String?
        let model: String?
        let trim: String?
        let engine: String?
        let drivetrain: String?
        let transmission: String?
        let bodyStyle: String?
        let mileage: Int?
        let visibility: VehicleVisibility?
        let notes: String?
        let nickname: String?
        let ownershipState: VehicleOwnershipState?

        init(
            vin: String?,
            year: Int?,
            make: String?,
            model: String?,
            trim: String?,
            mileage: Int?,
            visibility: VehicleVisibility?,
            notes: String? = nil,
            nickname: String? = nil,
            ownershipState: VehicleOwnershipState? = nil,
            engine: String? = nil,
            drivetrain: String? = nil,
            transmission: String? = nil,
            bodyStyle: String? = nil
        ) {
            self.vin = vin
            self.year = year
            self.make = make
            self.model = model
            self.trim = trim
            self.engine = engine
            self.drivetrain = drivetrain
            self.transmission = transmission
            self.bodyStyle = bodyStyle
            self.mileage = mileage
            self.visibility = visibility
            self.notes = notes
            self.nickname = nickname
            self.ownershipState = ownershipState
        }
    }

    static func update(id: String, payload: UpdatePayload) async throws -> Vehicle {
        try await APIClient.shared.patch("/api/vehicles/\(id)", body: payload)
    }

    private struct MarkSoldPayload: Encodable {
        let keepPublicHistory: Bool
    }

    static func markSold(id: String, keepPublicHistory: Bool) async throws -> Vehicle {
        try await APIClient.shared.post(
            "/api/vehicles/\(id)/sold",
            body: MarkSoldPayload(keepPublicHistory: keepPublicHistory)
        )
    }

    static func media(id: String) async throws -> [VehicleMedia] {
        try await APIClient.shared.get("/api/vehicles/\(id)/media")
    }

    struct AddMediaPayload: Encodable {
        let url: String
        let mediaType: String
        let contentType: String
        let isPrimary = false
        let sortOrder = 0
    }

    static func addMedia(id: String, attachment: PickedAttachment) async throws -> VehicleMedia {
        let url = try await R2Uploader.upload(
            data: attachment.data,
            filename: attachment.filename,
            contentType: attachment.contentType,
            entity: "vehicle_media",
            recordId: id
        )
        return try await APIClient.shared.post(
            "/api/vehicles/\(id)/media",
            body: AddMediaPayload(
                url: url,
                mediaType: attachment.kind == .video ? "video" : "image",
                contentType: attachment.contentType
            )
        )
    }

    static func removeMedia(vehicleId: String, mediaId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(vehicleId)/media/\(mediaId)")
    }

    static func delete(id: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(id)")
    }

    struct BuildEntryPayload: Encodable {
        let category: String
        let title: String
        let manufacturer: String?
        let partNumber: String?
        let installedOn: String?
        let mileage: Int?
        let installationKind: VehicleInstallationKind
        let shopName: String?
        let costCents: Int?
        let publicNotes: String?
        let privateNotes: String?
        let status: VehicleBuildStatus
        let isPublic: Bool
    }

    static func buildEntries(id: String) async throws -> [VehicleBuildEntry] {
        try await APIClient.shared.get("/api/vehicles/\(id)/build")
    }

    static func addBuildEntry(id: String, payload: BuildEntryPayload) async throws -> VehicleBuildEntry {
        try await APIClient.shared.post("/api/vehicles/\(id)/build", body: payload)
    }

    static func deleteBuildEntry(vehicleId: String, entryId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(vehicleId)/build/\(entryId)")
    }

    struct BuildSubscriptionResult: Codable { let subscribed: Bool }
    private struct BuildSubscriptionPayload: Encodable { let subscribed: Bool }

    static func buildSubscription(id: String) async throws -> BuildSubscriptionResult {
        try await APIClient.shared.get("/api/vehicles/\(id)/build-subscription")
    }

    static func setBuildSubscription(id: String, subscribed: Bool) async throws -> BuildSubscriptionResult {
        try await APIClient.shared.post(
            "/api/vehicles/\(id)/build-subscription",
            body: BuildSubscriptionPayload(subscribed: subscribed)
        )
    }

    struct MaintenanceEventPayload: Encodable {
        let serviceType: String
        let servicedOn: String
        let mileage: Int?
        let partsFluids: String?
        let provider: String?
        let costCents: Int?
        let publicNotes: String?
        let privateNotes: String?
        let nextDueOn: String?
        let nextDueMileage: Int?
        let isPublic: Bool
    }

    static func maintenanceEvents(id: String) async throws -> [VehicleMaintenanceEvent] {
        try await APIClient.shared.get("/api/vehicles/\(id)/maintenance")
    }

    static func addMaintenanceEvent(id: String, payload: MaintenanceEventPayload) async throws -> VehicleMaintenanceEvent {
        try await APIClient.shared.post("/api/vehicles/\(id)/maintenance", body: payload)
    }

    static func deleteMaintenanceEvent(vehicleId: String, eventId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(vehicleId)/maintenance/\(eventId)")
    }
}
