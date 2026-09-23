import Foundation

/// The generic top-view body diagram, mirroring
/// src/features/ppi/body-diagram.ts. Coordinates are normalized 0–1 in the
/// diagram box: x from the vehicle's left to its right, y from the front
/// bumper to the rear. tests/unit/body-diagram.test.mts checks that these
/// numbers match the web and report geometry.
enum BodyDiagram {
    static let view = "top"

    struct Rect {
        let x: Double, y: Double, w: Double, h: Double
    }

    /// A stored marker position in diagram coordinates.
    struct Point: Hashable, Sendable {
        var x: Double
        var y: Double
    }

    // Silhouette.
    static let body = Rect(x: 0.23, y: 0.04, w: 0.54, h: 0.92)
    static let cabin = Rect(x: 0.3, y: 0.32, w: 0.4, h: 0.32)
    static let wheels: [Rect] = [
        Rect(x: 0.11, y: 0.19, w: 0.11, h: 0.18),
        Rect(x: 0.78, y: 0.19, w: 0.11, h: 0.18),
        Rect(x: 0.11, y: 0.66, w: 0.11, h: 0.18),
        Rect(x: 0.78, y: 0.66, w: 0.11, h: 0.18),
    ]
    static let seams: [Double] = [0.2, 0.28, 0.69, 0.78]

    /// Region a marker may occupy for each panel, as (x0, y0, x1, y1).
    static let regions: [String: (Double, Double, Double, Double)] = [
        "front_bumper": (0.23, 0.04, 0.77, 0.09),
        "hood": (0.3, 0.09, 0.7, 0.2),
        "left_front_fender": (0.23, 0.09, 0.3, 0.32),
        "right_front_fender": (0.7, 0.09, 0.77, 0.32),
        "left_front_door": (0.23, 0.32, 0.3, 0.48),
        "right_front_door": (0.7, 0.32, 0.77, 0.48),
        "left_rear_door": (0.23, 0.48, 0.3, 0.64),
        "right_rear_door": (0.7, 0.48, 0.77, 0.64),
        "left_rocker": (0.17, 0.37, 0.23, 0.66),
        "right_rocker": (0.77, 0.37, 0.83, 0.66),
        "roof": (0.3, 0.32, 0.7, 0.64),
        "left_rear_quarter": (0.23, 0.64, 0.3, 0.86),
        "right_rear_quarter": (0.7, 0.64, 0.77, 0.86),
        "trunk_tailgate": (0.3, 0.78, 0.7, 0.91),
        "rear_bumper": (0.23, 0.91, 0.77, 0.96),
        "other_body_panel": (0.17, 0.04, 0.83, 0.96),
    ]

    /// Where a finding sits when no marker was placed.
    static let defaultMarkers: [String: (Double, Double)] = [
        "front_bumper": (0.5, 0.05),
        "hood": (0.5, 0.15),
        "left_front_fender": (0.25, 0.24),
        "right_front_fender": (0.75, 0.24),
        "left_front_door": (0.25, 0.42),
        "right_front_door": (0.75, 0.42),
        "left_rocker": (0.2, 0.5),
        "right_rocker": (0.8, 0.5),
        "roof": (0.5, 0.48),
        "left_rear_door": (0.25, 0.58),
        "right_rear_door": (0.75, 0.58),
        "left_rear_quarter": (0.26, 0.75),
        "right_rear_quarter": (0.74, 0.75),
        "trunk_tailgate": (0.5, 0.86),
        "rear_bumper": (0.5, 0.95),
        "other_body_panel": (0.5, 0.66),
    ]

    static func region(_ panel: String) -> (Double, Double, Double, Double) {
        regions[panel] ?? regions["other_body_panel"]!
    }

    /// Nearest point on the panel, rounded to the stored precision, so a
    /// marker never lands on a neighbouring panel.
    static func clamp(panel: String, x: Double, y: Double) -> Point {
        let (x0, y0, x1, y1) = region(panel)
        func round3(_ value: Double) -> Double { (value * 1000).rounded() / 1000 }
        return Point(x: round3(min(x1, max(x0, x))), y: round3(min(y1, max(y0, y))))
    }

    static func defaultMarker(panel: String) -> Point {
        let (x, y) = defaultMarkers[panel] ?? defaultMarkers["other_body_panel"]!
        return clamp(panel: panel, x: x, y: y)
    }

    /// Reads a stored `{view, x, y}` marker.
    static func point(from marker: JSONValue?) -> Point? {
        guard let x = marker?["x"]?.doubleValue, let y = marker?["y"]?.doubleValue else { return nil }
        return Point(x: x, y: y)
    }

    static func json(_ point: Point) -> JSONValue {
        .object(["view": .string(view), "x": .number(point.x), "y": .number(point.y)])
    }
}
