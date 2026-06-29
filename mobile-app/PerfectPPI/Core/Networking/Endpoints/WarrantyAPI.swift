import Foundation

enum WarrantyAPI {
    static func options(forVscOutputId vscOutputId: String) async throws -> WarrantyOption {
        try await APIClient.shared.get("/api/warranty/options/\(vscOutputId)")
    }

    static func warranties() async throws -> [WarrantyListEntry] {
        try await APIClient.shared.get("/api/warranty/orders")
    }

    struct CreateOrderPayload: Encodable {
        let warrantyOptionId: String
        let planIndex: Int

        enum CodingKeys: String, CodingKey {
            case warrantyOptionId
            case planIndex
        }
    }

    struct CreateOrderResponse: Codable {
        let orderId: String
    }

    static func createOrder(_ payload: CreateOrderPayload) async throws -> CreateOrderResponse {
        try await APIClient.shared.postCamel("/api/warranty/orders", body: payload)
    }

    static func order(id: String) async throws -> WarrantyOrder {
        try await APIClient.shared.get("/api/warranty/orders/\(id)")
    }

    static func signLink(contractId: String) async throws -> WarrantyContractSignURL {
        try await APIClient.shared.get("/api/warranty/contracts/\(contractId)/sign")
    }

    struct PresentContractPayload: Encodable {
        let orderId: String

        enum CodingKeys: String, CodingKey {
            case orderId
        }
    }

    struct PresentContractResponse: Codable {
        let contractId: String
    }

    static func presentContract(orderId: String) async throws -> PresentContractResponse {
        try await APIClient.shared.postCamel(
            "/api/warranty/contracts",
            body: PresentContractPayload(orderId: orderId)
        )
    }

    struct SignatureSyncResponse: Codable {
        let signed: Bool
    }

    static func syncSignature(contractId: String) async throws -> SignatureSyncResponse {
        try await APIClient.shared.post(
            "/api/warranty/contracts/\(contractId)/sync",
            body: Empty()
        )
    }

    struct PaymentPayload: Encodable {
        let contractId: String

        enum CodingKeys: String, CodingKey {
            case contractId
        }
    }

    static func startCheckout(contractId: String) async throws -> WarrantyCheckoutURL {
        try await APIClient.shared.postCamel(
            "/api/warranty/payments",
            body: PaymentPayload(contractId: contractId)
        )
    }
}
