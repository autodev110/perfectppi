import SwiftUI
import XCTest
@testable import PerfectPPI

/// Layout harness: hosts real screens with fixture data in a window and
/// writes PNGs so the layout can be inspected without a backend. Set
/// PERFECTPPI_SNAPSHOT_DIR in the test scheme to choose the output folder;
/// otherwise the simulator's temporary directory is used (path is printed).
@MainActor
final class GarageRenderHarnessTests: XCTestCase {
    private let outDir: URL = {
        if let custom = ProcessInfo.processInfo.environment["PERFECTPPI_SNAPSHOT_DIR"], !custom.isEmpty {
            return URL(fileURLWithPath: custom)
        }
        return FileManager.default.temporaryDirectory.appendingPathComponent("perfectppi-snapshots")
    }()

    private func vehicle(_ id: String, nickname: String? = nil, year: Int = 2018, make: String = "Acura", model: String = "TLX", trim: String? = "A-Spec SH-AWD", state: VehicleOwnershipState = .owned, listed: Bool = false, inspection: PpiRequestStatus? = .completed) -> Vehicle {
        Vehicle(
            id: id, ownerId: "o", vin: "19UUB3F70JA000123", year: year, make: make, model: model, trim: trim,
            engine: "3.5L V6", drivetrain: "AWD", transmission: "9-speed automatic", bodyStyle: "Sedan",
            nickname: nickname, ownershipState: state, mileage: 48_210, mileageUpdatedAt: Date(),
            notes: nil, visibility: .public, soldAt: nil, createdAt: Date(), vehicleMedia: nil,
            ppiRequests: inspection.map { [GarageInspectionSummary(id: "r\(id)", status: $0, createdAt: Date(), updatedAt: nil)] },
            marketplaceListings: listed ? [GarageListingSummary(id: "l\(id)", status: .active)] : []
        )
    }

    private func snapshot<V: View>(_ view: V, name: String, size: CGSize = CGSize(width: 393, height: 852)) throws {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: CGRect(origin: .zero, size: size))
        window.frame = CGRect(origin: .zero, size: size)
        let host = UIHostingController(rootView: view)
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let deadline = Date().addingTimeInterval(1.5)
        while Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { context in
            if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                window.layer.render(in: context.cgContext)
            }
        }
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        let file = outDir.appendingPathComponent("\(name).png")
        try image.pngData()!.write(to: file)
        XCTAssertGreaterThan(image.size.width, 0)
        print("snapshot written: \(file.path)")
    }

    func testRenderGarage() throws {
        let vehicles = [
            vehicle("1", nickname: "Daily", listed: true),
            vehicle("2", year: 1997, make: "Toyota", model: "Land Cruiser", trim: "FZJ80", state: .project, inspection: .inProgress),
            vehicle("3", year: 2024, make: "Hyundai", model: "Ioniq 5", trim: nil, state: .considering, inspection: nil),
        ]
        struct Host: View {
            let vehicles: [Vehicle]
            @State var filter: GarageFilter = .all
            var body: some View {
                NavigationStack {
                    GarageList(vehicles: vehicles, filter: $filter)
                        .navigationTitle("Garage")
                }
            }
        }
        try snapshot(Host(vehicles: vehicles), name: "garage-list")
        try snapshot(NavigationStack { VehicleDetailView(preview: vehicles[0]) }, name: "garage-detail")
    }
}
