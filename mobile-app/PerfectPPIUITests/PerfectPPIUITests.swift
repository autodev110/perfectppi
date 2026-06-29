import XCTest

final class PerfectPPIUITests: XCTestCase {
    func testLaunch() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["PerfectPPI"].waitForExistence(timeout: 5))
    }
}
