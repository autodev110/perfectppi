import XCTest
@testable import PerfectPPI

/// An answer the server refuses must not sit in the offline queue forever and
/// block submit behind "still syncing"; connectivity and server errors must.
@MainActor
final class OfflineQueueTests: XCTestCase {
    private final class StubURLProtocol: URLProtocol {
        nonisolated(unsafe) static var flakySucceeds = false

        override class func canInit(with request: URLRequest) -> Bool {
            request.url?.path.contains("/api/ppi/submissions/offline-test-") == true
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            let path = request.url?.path ?? ""
            let (status, body): (Int, String)
            if path.contains("offline-test-refused") {
                status = 422
                body = #"{"error":"Choose whether the damage is confirmed or suspected.","invalid":[{"answerId":"a1","error":"Choose whether the damage is confirmed or suspected."}]}"#
            } else if Self.flakySucceeds {
                status = 200
                body = #"{"success":true}"#
            } else {
                status = 503
                body = #"{"error":"Service unavailable"}"#
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }

        override func stopLoading() {}
    }

    override func setUp() {
        super.setUp()
        StubURLProtocol.flakySucceeds = false
        URLProtocol.registerClass(StubURLProtocol.self)
    }

    override func tearDown() {
        URLProtocol.unregisterClass(StubURLProtocol.self)
        super.tearDown()
    }

    func testRefusalsArePermanentButOutagesAreNot() {
        XCTAssertTrue(APIError.serverResponse(status: 422, code: nil, message: "Invalid", retryAfterSeconds: nil).isPermanentRejection)
        XCTAssertTrue(APIError.serverResponse(status: 426, code: "app_update_required", message: nil, retryAfterSeconds: nil).isPermanentRejection)
        XCTAssertTrue(APIError.server(status: 400, message: nil).isPermanentRejection)
        XCTAssertTrue(APIError.notFound.isPermanentRejection)
        XCTAssertFalse(APIError.serverResponse(status: 503, code: nil, message: nil, retryAfterSeconds: 5).isPermanentRejection)
        XCTAssertFalse(APIError.serverResponse(status: 429, code: "rate_limited", message: nil, retryAfterSeconds: 60).isPermanentRejection)
        XCTAssertFalse(APIError.serverResponse(status: 408, code: nil, message: nil, retryAfterSeconds: nil).isPermanentRejection)
        XCTAssertFalse(APIError.notAuthenticated.isPermanentRejection)
        XCTAssertFalse(APIError.transport(URLError(.notConnectedToInternet)).isPermanentRejection)
    }

    func testDrainReportsRefusedAnswersAndKeepsRetryableOnes() async throws {
        let queue = OfflineQueue.shared
        let refused = "offline-test-refused"
        let flaky = "offline-test-flaky"
        try queue.enqueueAnswer(submissionId: refused, payload: .init(answerId: "a1", value: "", observation: .null))
        try queue.enqueueAnswer(submissionId: flaky, payload: .init(answerId: "a2", value: "", observation: .null))

        await queue.drain()

        XCTAssertFalse(queue.pendingAnswers.contains { $0.submissionId == refused }, "a refused answer must leave the queue")
        let rejection = try XCTUnwrap(queue.rejectedAnswers.first { $0.submissionId == refused })
        XCTAssertEqual(rejection.answerId, "a1")
        XCTAssertEqual(rejection.message, "Choose whether the damage is confirmed or suspected.")
        XCTAssertTrue(queue.pendingAnswers.contains { $0.submissionId == flaky }, "an outage keeps the answer queued")
        XCTAssertFalse(queue.rejectedAnswers.contains { $0.submissionId == flaky })

        queue.acknowledgeRejections(submissionId: refused)
        XCTAssertFalse(queue.rejectedAnswers.contains { $0.submissionId == refused })

        // Once the server recovers the queued answer syncs, leaving the app's
        // real queue as it was before the test.
        StubURLProtocol.flakySucceeds = true
        await queue.drain()
        XCTAssertFalse(queue.pendingAnswers.contains { $0.submissionId == flaky })
    }
}
