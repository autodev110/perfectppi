import Foundation
import Combine

/// High-level driver for a single OBDLink session. Owns the handshake
/// sequence and the small set of MVP read commands (VIN, supported PIDs,
/// stored DTCs, pending DTCs). The UI binds to the `@Published` state.
@MainActor
final class OBDSession: ObservableObject {
    enum Phase: Equatable {
        case idle
        case handshaking(stepLabel: String)
        case reading(stepLabel: String)
        case ready
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var snapshot: OBDDiagnosticSnapshot = .empty

    private let bluetooth: OBDBluetoothManager
    private var scanGeneration: UInt64 = 0

    init(bluetooth: OBDBluetoothManager) {
        self.bluetooth = bluetooth
    }

    /// Run the full MVP sequence: handshake, then read VIN + supported PIDs +
    /// stored/pending DTCs. Idempotent — call it again after a disconnect or
    /// to refresh the data.
    func runScan() async {
        switch phase {
        case .handshaking, .reading:
            return
        default:
            break
        }
        scanGeneration &+= 1
        let generation = scanGeneration

        phase = .handshaking(stepLabel: "Resetting adapter")
        var collected = OBDDiagnosticSnapshot.empty
        collected.startedAt = Date()

        do {
            try await handshake(generation: generation)
            guard isCurrent(generation) else { return }

            phase = .reading(stepLabel: "Reading supported PIDs")
            let supported = try await readSupportedPIDs(generation: generation)
            guard isCurrent(generation) else { return }
            collected.supportedPids = supported.pids
            collected.rawSupportedPidsResponse = supported.rawJoined

            phase = .reading(stepLabel: "Reading monitor status")
            let monitorStatusResponse = try await bluetooth.send("0101", timeout: 6)
            guard isCurrent(generation) else { return }
            collected.monitorStatus = OBDParser.parseMonitorStatus(from: monitorStatusResponse)
            collected.rawMonitorStatusResponse = monitorStatusResponse

            phase = .reading(stepLabel: "Reading VIN")
            let vinResponse = try await bluetooth.send("0902", timeout: 8)
            guard isCurrent(generation) else { return }
            collected.vin = OBDParser.parseVIN(from: vinResponse)
            collected.rawVinResponse = vinResponse

            phase = .reading(stepLabel: "Reading stored DTCs")
            let storedResponse = try await bluetooth.send("03", timeout: 6)
            guard isCurrent(generation) else { return }
            collected.storedDTCs = OBDParser.parseDTCs(from: storedResponse, expectedModeByte: 0x43)
            collected.rawStoredDtcsResponse = storedResponse

            phase = .reading(stepLabel: "Reading pending DTCs")
            let pendingResponse = try await bluetooth.send("07", timeout: 6)
            guard isCurrent(generation) else { return }
            collected.pendingDTCs = OBDParser.parseDTCs(from: pendingResponse, expectedModeByte: 0x47)
            collected.rawPendingDtcsResponse = pendingResponse

            // Live sensor data is read last and best-effort: the essential
            // VIN/DTC/readiness snapshot above is already captured, so a flaky
            // sensor here can't cost us the diagnostic record.
            phase = .reading(stepLabel: "Reading live sensor data")
            collected.liveReadings = await readLiveData(supported: collected.supportedPids,
                                                        generation: generation)
            guard isCurrent(generation) else { return }

            collected.completedAt = Date()
            collected.adapterName = bluetooth.connectedDevice?.name
            snapshot = collected
            phase = .ready
        } catch {
            guard isCurrent(generation) else { return }
            snapshot = collected
            phase = .failed(error.localizedDescription)
        }
    }

    func reset() {
        scanGeneration &+= 1
        snapshot = .empty
        phase = .idle
    }

    // MARK: - Internals

    /// Standard ELM/STN handshake. We send them serially because the OBDLink
    /// CX has no command queue. After each command we sleep 100ms to let the
    /// adapter settle, which dramatically reduces flaky responses on first
    /// connect.
    private func handshake(generation: UInt64) async throws {
        let steps: [(label: String, command: String)] = [
            ("Resetting adapter",   "ATZ"),
            ("Disabling echo",      "ATE0"),
            ("Disabling linefeeds", "ATL0"),
            ("Disabling spaces",    "ATS0"),
            ("Hiding headers",      "ATH0"),
            ("Auto-detecting protocol", "ATSP0"),
        ]
        for step in steps {
            guard isCurrent(generation) else { throw CancellationError() }
            phase = .handshaking(stepLabel: step.label)
            _ = try await bluetooth.send(step.command, timeout: 5)
            guard isCurrent(generation) else { throw CancellationError() }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    /// Walk the Mode 01 supported-PID banks (0x00, 0x20, 0x40, …), following each
    /// bank's "next bank exists" continuation bit, and return the union of every
    /// supported PID plus the raw responses joined for the snapshot record. Stops
    /// at the first bank the car doesn't answer or that doesn't flag a successor —
    /// so a car that only supports the first bank behaves exactly as before.
    private func readSupportedPIDs(generation: UInt64) async throws -> (pids: [UInt8], rawJoined: String) {
        let banks: [(command: String, base: UInt8)] = [
            ("0100", 0x00), ("0120", 0x20), ("0140", 0x40), ("0160", 0x60),
            ("0180", 0x80), ("01A0", 0xA0), ("01C0", 0xC0), ("01E0", 0xE0),
        ]
        var pids: [UInt8] = []
        var rawResponses: [String] = []
        for bank in banks {
            guard isCurrent(generation) else { throw CancellationError() }
            let response = try await bluetooth.send(bank.command, timeout: 6)
            rawResponses.append(response)
            let banked = OBDParser.parseSupportedPIDs(from: response, pidBank: bank.base)
            if banked.isEmpty { break }
            pids.append(contentsOf: banked)
            // The top PID of each bank (0x20, 0x40, …) is the continuation flag,
            // not a real sensor; stop walking once the car stops setting it.
            let continuationPid = bank.base &+ 0x20
            if continuationPid == 0 || !banked.contains(continuationPid) { break }
        }
        return (pids, rawResponses.joined(separator: "\n"))
    }

    /// Read every inspection-relevant live PID the car reported as supported.
    /// Per-PID failures are swallowed (`try?`) so one unsupported or flaky sensor
    /// can't abort the whole scan.
    private func readLiveData(supported: [UInt8], generation: UInt64) async -> [OBDLiveReading] {
        let supportedSet = Set(supported)
        var readings: [OBDLiveReading] = []
        for descriptor in OBDParser.inspectionLivePIDs where supportedSet.contains(descriptor.pid) {
            guard isCurrent(generation) else { break }
            let command = String(format: "01%02X", descriptor.pid)
            guard let response = try? await bluetooth.send(command, timeout: 5) else { continue }
            if let reading = OBDParser.parseLiveReading(from: response, descriptor: descriptor) {
                readings.append(reading)
            }
        }
        return readings
    }

    private func isCurrent(_ generation: UInt64) -> Bool {
        generation == scanGeneration
    }
}

// MARK: - Snapshot model

struct OBDDiagnosticSnapshot: Codable, Hashable {
    var vin: String?
    var supportedPids: [UInt8]
    var monitorStatus: OBDMonitorStatus?
    var storedDTCs: [String]
    var pendingDTCs: [String]
    var liveReadings: [OBDLiveReading]
    var adapterName: String?
    var startedAt: Date?
    var completedAt: Date?

    // Raw transcripts kept so power users can verify parsing decisions and
    // so the inspection's diagnostic record retains everything the car said.
    var rawSupportedPidsResponse: String?
    var rawMonitorStatusResponse: String?
    var rawVinResponse: String?
    var rawStoredDtcsResponse: String?
    var rawPendingDtcsResponse: String?

    static let empty = OBDDiagnosticSnapshot(
        vin: nil,
        supportedPids: [],
        monitorStatus: nil,
        storedDTCs: [],
        pendingDTCs: [],
        liveReadings: [],
        adapterName: nil,
        startedAt: nil,
        completedAt: nil,
        rawSupportedPidsResponse: nil,
        rawMonitorStatusResponse: nil,
        rawVinResponse: nil,
        rawStoredDtcsResponse: nil,
        rawPendingDtcsResponse: nil
    )

    var hasAnyData: Bool {
        vin != nil
            || !supportedPids.isEmpty
            || monitorStatus != nil
            || !storedDTCs.isEmpty
            || !pendingDTCs.isEmpty
            || !liveReadings.isEmpty
    }
}

struct OBDMonitorStatus: Codable, Hashable {
    var milOn: Bool
    var storedDTCCount: Int
    var rawStatusBytes: [UInt8]
}

/// One decoded Mode 01 live-data reading captured during a scan (e.g. engine
/// RPM, coolant temp). The raw response is retained alongside the numeric value
/// so the diagnostic record stays auditable.
struct OBDLiveReading: Codable, Hashable, Identifiable {
    var pid: UInt8
    var name: String
    var value: Double
    var unit: String
    var rawResponse: String

    var id: UInt8 { pid }

    /// Value rendered for display: whole numbers stay integers, everything else
    /// gets one decimal, with the unit appended.
    var formattedValue: String {
        let rounded = (value * 10).rounded() / 10
        let numberText = rounded == rounded.rounded()
            ? String(format: "%.0f", rounded)
            : String(format: "%.1f", rounded)
        return unit.isEmpty ? numberText : "\(numberText) \(unit)"
    }
}
