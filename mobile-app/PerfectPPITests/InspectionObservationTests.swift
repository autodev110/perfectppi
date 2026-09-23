import XCTest
@testable import PerfectPPI

/// Mirrors the web contract in src/features/ppi/inspection-schema.ts so both
/// clients agree on keys, grouping, role requirements and photo rules.
@MainActor
final class InspectionObservationTests: XCTestCase {
    func testParsesKeysAndGroupsWheelCardsAndBodyZones() {
        XCTAssertEqual(StructuredKey.parse("tires.front_left.tread")?.family, .tireTread)
        XCTAssertEqual(StructuredKey.parse("tires.front_left.tread")?.stepGroupId, "wheel:front_left")
        XCTAssertEqual(StructuredKey.parse("wheels.front_left.damage")?.stepGroupId, "wheel:front_left")
        XCTAssertEqual(StructuredKey.parse("body.left_rear_door.condition")?.stepGroupId, "body:left")
        XCTAssertNil(StructuredKey.parse("tires.placard")?.stepGroupId)
        XCTAssertNil(StructuredKey.parse("tires.fl.tread"), "aliases are not canonical corners")
        XCTAssertNil(StructuredKey.parse("Front left tire tread depth (in 32nds of an inch)"))
    }

    func testTechniciansMustMeasureWhileSelfInspectorsMayGiveAReason() {
        let unavailable = Observation.exception(.unableToAssess, reason: .noGauge, explanation: nil)
        XCTAssertFalse(Observation.requirementMet(key: "tires.rear_left.tread", observation: unavailable, required: true, performerMode: "technician"))
        XCTAssertTrue(Observation.requirementMet(key: "tires.rear_left.tread", observation: unavailable, required: true, performerMode: "self"))
        XCTAssertFalse(Observation.requirementMet(key: "tires.rear_left.pressure", observation: nil, required: true, performerMode: "self"))
        let otherWithoutDetail = Observation.exception(.unableToAssess, reason: .other, explanation: " ")
        XCTAssertFalse(Observation.requirementMet(key: "tires.rear_left.tread", observation: otherWithoutDetail, required: true, performerMode: "self"))
    }

    func testPhotoRulesFollowTheAnswer() {
        let tread = Observation.observed(["reading": .string("5"), "unit": .string("thirty_seconds_inch"), "method": .string("tread_depth_gauge")])
        XCTAssertTrue(Observation.photoRequired(key: "tires.front_left.tread", observation: tread))
        let noDamage = Observation.observed(["none_observed": .bool(true)])
        XCTAssertFalse(Observation.photoRequired(key: "tires.front_left.damage", observation: noDamage))
        let damage = Observation.observed(["defects": .array([.object(["id": .string("abcd1"), "type": .string("puncture")])])])
        XCTAssertTrue(Observation.photoRequired(key: "tires.front_left.damage", observation: damage))
        let excepted = Observation.observed(["defects": .array([.object(["id": .string("abcd1"), "type": .string("puncture")])])], evidenceException: .inaccessible)
        XCTAssertFalse(Observation.photoRequired(key: "tires.front_left.damage", observation: excepted))
    }

    func testBodyMarkersStayOnTheirPanel() {
        // Tapping the hood while marking the left front door lands on the door.
        XCTAssertEqual(BodyDiagram.clamp(panel: "left_front_door", x: 0.5, y: 0.15), BodyDiagram.Point(x: 0.3, y: 0.32))
        XCTAssertEqual(BodyDiagram.clamp(panel: "roof", x: 0.41234, y: 0.5), BodyDiagram.Point(x: 0.412, y: 0.5))
        XCTAssertEqual(BodyDiagram.defaultMarker(panel: "left_rocker"), BodyDiagram.Point(x: 0.2, y: 0.5))
        let stored = BodyDiagram.json(BodyDiagram.Point(x: 0.26, y: 0.4))
        XCTAssertEqual(stored["view"]?.stringValue, "top")
        XCTAssertEqual(BodyDiagram.point(from: stored), BodyDiagram.Point(x: 0.26, y: 0.4))
        XCTAssertNil(BodyDiagram.point(from: nil))
    }

    func testDecimalInputNormalization() {
        XCTAssertEqual(Observation.normalizeDecimal("4,5"), "4.5")
        XCTAssertEqual(Observation.normalizeDecimal("0"), "0")
        XCTAssertNil(Observation.normalizeDecimal("-1"))
        XCTAssertNil(Observation.normalizeDecimal("1e3"))
    }

    func testSavePayloadKeepsExplicitClearDistinctFromNoChange() throws {
        let encoder = JSONEncoder()
        let cleared = try JSONSerialization.jsonObject(with: encoder.encode(PpiAPI.SaveAnswerPayload(answerId: "a", value: "", observation: .null))) as? [String: Any]
        XCTAssertTrue(cleared?.keys.contains("observation") == true)
        XCTAssertTrue(cleared?["observation"] is NSNull)
        let unchanged = try JSONSerialization.jsonObject(with: encoder.encode(PpiAPI.SaveAnswerPayload(answerId: "a", value: "", deferred: true))) as? [String: Any]
        XCTAssertFalse(unchanged?.keys.contains("observation") == true)

        // Offline persistence round-trips the explicit clear.
        let data = try encoder.encode(PpiAPI.SaveAnswerPayload(answerId: "a", value: "", observation: .null))
        let decoded = try JSONDecoder().decode(PpiAPI.SaveAnswerPayload.self, from: data)
        XCTAssertEqual(decoded.observation, .null)
    }

    func testUnknownAnswerTypesDecodeInsteadOfFailingTheInspection() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let json = #"{"id":"1","ppi_section_id":"s","prompt":"Future","answer_type":"hologram","answer_value":null,"deferred_at":null,"options":null,"is_required":true,"requires_photo":false,"photo_prompt":null,"sort_order":1}"#
        let answer = try decoder.decode(PpiAnswer.self, from: Data(json.utf8))
        XCTAssertEqual(answer.answerType, .unsupported)
        let typed = #"{"id":"2","ppi_section_id":"s","prompt":"Tread","question_key":"tires.front_left.tread","answer_type":"measurement","answer_value":"5/32 in","observation":{"v":1,"state":"observed","value":{"reading":"5","unit":"thirty_seconds_inch","none_observed":true}},"deferred_at":null,"options":null,"is_required":true,"requires_photo":false,"photo_prompt":null,"sort_order":2}"#
        let measurement = try decoder.decode(PpiAnswer.self, from: Data(typed.utf8))
        XCTAssertEqual(measurement.questionKey, "tires.front_left.tread")
        // Observation keys keep their snake_case spelling.
        XCTAssertEqual(Observation.value(measurement.observation)?["none_observed"]?.boolValue, true)
    }
}
