import Foundation

enum VehiclesAPI {
    struct DecodedVinVehicle: Codable {
        let vin: String
        let year: Int?
        let make: String?
        let model: String?
        let trim: String?
        /// Factory values in the shape of the current-build fields (Renditions doc).
        var factorySummary: VehicleFactorySummary? = nil
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

    static func catalog(kind: String, make: String? = nil, year: Int? = nil, query: String = "") async throws -> [String] {
        var items = [URLQueryItem(name: "kind", value: kind)]
        if let make, !make.isEmpty { items.append(URLQueryItem(name: "make", value: make)) }
        if let year { items.append(URLQueryItem(name: "year", value: String(year))) }
        if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        return try await APIClient.shared.get("/api/vehicles/catalog", query: items)
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
        let configurationType: VehicleConfigurationType?
        let engineOriginal: Bool?
        let transmissionOriginal: Bool?
        let drivetrainOriginal: Bool?
        let mileageStatus: VehicleMileageStatus?
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
            bodyStyle: String? = nil,
            configurationType: VehicleConfigurationType? = nil,
            engineOriginal: Bool? = nil,
            transmissionOriginal: Bool? = nil,
            drivetrainOriginal: Bool? = nil,
            mileageStatus: VehicleMileageStatus? = nil
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
            self.configurationType = configurationType
            self.engineOriginal = engineOriginal
            self.transmissionOriginal = transmissionOriginal
            self.drivetrainOriginal = drivetrainOriginal
            self.mileageStatus = mileageStatus
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
        let configurationType: VehicleConfigurationType?
        let engineOriginal: Bool?
        let transmissionOriginal: Bool?
        let drivetrainOriginal: Bool?
        let mileageStatus: VehicleMileageStatus?

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
            bodyStyle: String? = nil,
            configurationType: VehicleConfigurationType? = nil,
            engineOriginal: Bool? = nil,
            transmissionOriginal: Bool? = nil,
            drivetrainOriginal: Bool? = nil,
            mileageStatus: VehicleMileageStatus? = nil
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
            self.configurationType = configurationType
            self.engineOriginal = engineOriginal
            self.transmissionOriginal = transmissionOriginal
            self.drivetrainOriginal = drivetrainOriginal
            self.mileageStatus = mileageStatus
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

    struct HandoffClaim: Codable {
        let code: String
        let expiresAt: Date
    }

    struct ClaimHandoffPayload: Encodable {
        let code: String
        let vin: String
    }

    struct ClaimedVehicle: Codable {
        let vehicleId: String
    }

    static func issueHandoffClaim(id: String) async throws -> HandoffClaim {
        try await APIClient.shared.post("/api/vehicles/\(id)/handoff", body: Empty())
    }

    static func claimHandoff(code: String, vin: String) async throws -> ClaimedVehicle {
        try await APIClient.shared.post(
            "/api/vehicles/claim",
            body: ClaimHandoffPayload(code: code, vin: vin)
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
        var stageId: String? = nil
        var laborCents: Int? = nil
        var laborHours: Double? = nil
        var beforeSpec: String? = nil
        var afterSpec: String? = nil
    }

    static func buildEntries(id: String) async throws -> [VehicleBuildEntry] {
        try await APIClient.shared.get("/api/vehicles/\(id)/build")
    }

    /// Stages, entries with photos, private documents, and per-stage totals.
    static func buildProgression(id: String) async throws -> VehicleBuildProgression {
        try await APIClient.shared.get("/api/vehicles/\(id)/build/progression")
    }

    struct BuildStagePayload: Encodable {
        let title: String
        let description: String?
        let status: VehicleBuildStageStatus
        let targetDate: String?
        let isPublic: Bool
    }

    static func addBuildStage(id: String, payload: BuildStagePayload) async throws -> VehicleBuildStage {
        try await APIClient.shared.post("/api/vehicles/\(id)/build/stages", body: payload)
    }

    struct BuildStageUpdate: Encodable {
        var status: VehicleBuildStageStatus? = nil
        var isPublic: Bool? = nil
    }

    static func updateBuildStage(vehicleId: String, stageId: String, update: BuildStageUpdate) async throws -> VehicleBuildStage {
        try await APIClient.shared.patch("/api/vehicles/\(vehicleId)/build/stages/\(stageId)", body: update)
    }

    static func deleteBuildStage(vehicleId: String, stageId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(vehicleId)/build/stages/\(stageId)")
    }

    struct SignedDocument: Decodable { let url: String }

    /// Short-lived signed URL for one of the owner's private documents.
    static func buildDocumentURL(vehicleId: String, documentId: String) async throws -> URL {
        let signed: SignedDocument = try await APIClient.shared.get("/api/vehicles/\(vehicleId)/build/documents/\(documentId)")
        guard let url = URL(string: signed.url) else { throw APIError.unknown(NSError(domain: "VehiclesAPI", code: 2)) }
        return url
    }

    private struct EntryPhotosPayload: Encodable { let mediaIds: [String] }
    struct EntryPhotosResult: Decodable { let entryId: String; let mediaIds: [String] }

    /// Replace an entry's photos with this vehicle's approved media, in order.
    static func setBuildEntryPhotos(vehicleId: String, entryId: String, mediaIds: [String]) async throws -> EntryPhotosResult {
        try await APIClient.shared.put(
            "/api/vehicles/\(vehicleId)/build/\(entryId)/photos",
            body: EntryPhotosPayload(mediaIds: mediaIds)
        )
    }

    struct BuildDocumentPayload: Encodable {
        let storageReference: String
        let title: String
        let kind: VehicleBuildDocumentKind
        let entryId: String?
        let stageId: String?
        let contentType: String
        let sizeBytes: Int
    }

    /// Upload a private document (receipt, invoice, dyno sheet) and attach it
    /// to an entry or a stage. The bytes go to private storage; only the
    /// owner can ever open it.
    static func addBuildDocument(
        vehicleId: String,
        data: Data,
        filename: String,
        contentType: String,
        kind: VehicleBuildDocumentKind,
        entryId: String?,
        stageId: String?,
        onProgress: R2Uploader.ProgressHandler? = nil
    ) async throws -> VehicleBuildDocument {
        let reference = try await R2Uploader.upload(
            data: data, filename: filename, contentType: contentType,
            entity: "vehicle_document", recordId: vehicleId, onProgress: onProgress
        )
        let title = String((filename as NSString).deletingPathExtension.prefix(120))
        return try await APIClient.shared.post(
            "/api/vehicles/\(vehicleId)/build/documents",
            body: BuildDocumentPayload(
                storageReference: reference, title: title.isEmpty ? "Document" : title, kind: kind,
                entryId: entryId, stageId: stageId, contentType: contentType, sizeBytes: data.count
            )
        )
    }

    static func deleteBuildDocument(vehicleId: String, documentId: String) async throws -> Empty {
        try await APIClient.shared.delete("/api/vehicles/\(vehicleId)/build/documents/\(documentId)")
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
