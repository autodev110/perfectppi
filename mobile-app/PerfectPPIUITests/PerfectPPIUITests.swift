import XCTest

final class PerfectPPIUITests: XCTestCase {
    /// Launch smoke test: the app must reach the foreground without crashing.
    /// Deliberately auth-state-agnostic — depending on a persisted session the
    /// app may open on the login screen or straight into a signed-in tab, so we
    /// assert the process is alive rather than looking for a specific screen.
    func testLaunch() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }
}
