import Foundation

enum VehiclesAPI {
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
    }

    static func update(id: String, payload: UpdatePayload) async throws -> Vehicle {
        try await APIClient.shared.patch("/api/vehicles/\(id)", body: payload)
    }

    static func media(id: String) async throws -> [VehicleMedia] {
        try await APIClient.shared.get("/api/vehicles/\(id)/media")
    }
}
