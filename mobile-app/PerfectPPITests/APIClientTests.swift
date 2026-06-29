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
}
