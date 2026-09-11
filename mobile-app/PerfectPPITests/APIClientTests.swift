import XCTest
@testable import PerfectPPI

/// Light smoke tests. Most logic is exercised through integration with the
/// real Next.js API; these guard the JSON envelope decoder and date strategy.
final class APIClientTests: XCTestCase {
    func testDateDecodingHandlesFractionalAndPlain() throws {
        struct A: Decodable { let ts: Date }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithFractional

        let plain = #"{"ts":"2025-01-01T12:00:00Z"}"#.data(using: .utf8)!
        let frac  = #"{"ts":"2025-01-01T12:00:00.123Z"}"#.data(using: .utf8)!

        XCTAssertNoThrow(try decoder.decode(A.self, from: plain))
        XCTAssertNoThrow(try decoder.decode(A.self, from: frac))
    }

    func testEnumDecoding() throws {
        let json = #"{"role":"org_manager"}"#.data(using: .utf8)!
        struct Wrap: Decodable { let role: UserRole }
        let d = try JSONDecoder().decode(Wrap.self, from: json)
        XCTAssertEqual(d.role, .orgManager)
    }

    func testStableServerCodesBecomeHelpfulMessages() {
        XCTAssertEqual(
            APIError.userFacingServerMessage(
                status: 429,
                code: "rate_limited",
                serverMessage: "rate_limited",
                retryAfterSeconds: 120
            ),
            "You're doing that too quickly. Try again in about 2 minutes."
        )
        XCTAssertEqual(
            APIError.userFacingServerMessage(
                status: 422,
                code: "invalid_media",
                serverMessage: "invalid_media"
            ),
            "One of the selected files could not be used. Try a different photo."
        )
    }

    func testTechnicalServerDetailsAreNotShownToUsers() {
        XCTAssertEqual(
            APIError.userFacingServerMessage(
                status: 400,
                serverMessage: "duplicate key value violates unique constraint"
            ),
            "We couldn't complete that request. Check the information and try again."
        )
    }

    func testStructuredServerResponseKeepsExactRetryTime() {
        let error = APIError.serverResponse(
            status: 429,
            code: "rate_limited",
            message: "rate_limited",
            retryAfterSeconds: 120
        )

        XCTAssertEqual(
            error.localizedDescription,
            "You're doing that too quickly. Try again in about 2 minutes."
        )
    }
}
