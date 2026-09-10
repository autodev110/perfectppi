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
        let mileage: Int?
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
            notes: String? = nil,
            nickname: String? = nil,
            ownershipState: VehicleOwnershipState? = nil
        ) {
            self.vin = vin
            self.year = year
            self.make = make
            self.model = model
            self.trim = trim
            self.mileage = mileage
            self.notes = notes
            self.nickname = nickname
            self.ownershipState = ownershipState
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
            ownershipState: VehicleOwnershipState? = nil
        ) {
            self.vin = vin
            self.year = year
            self.make = make
            self.model = model
            self.trim = trim
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
}
