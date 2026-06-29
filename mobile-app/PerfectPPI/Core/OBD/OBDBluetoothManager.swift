import Foundation
// CoreBluetooth's handle types (CBPeripheral, CBService, CBCharacteristic) are
// not marked Sendable. Our central manager runs on `.main`, so every delegate
// callback already arrives on the main actor and the hop into `Task { @MainActor }`
// is safe. `@preconcurrency` tells the compiler we've accounted for that and
// clears the Swift 6 "sending non-Sendable value" errors.
@preconcurrency import CoreBluetooth
import Combine

/// CoreBluetooth wrapper for the OBDLink CX. Handles:
///   - permission + state coordination
///   - scanning (filtered by the OBDLink UART service when possible)
///   - connect/disconnect lifecycle
///   - service + characteristic discovery
///   - a serial command pipeline (write request → notify response framed at the
///     ELM327 `>` prompt)
///
/// Higher-level logic (handshake, VIN parsing, DTC parsing) lives in
/// `OBDSession`. The UI only ever talks to this manager and the session.
@MainActor
final class OBDBluetoothManager: NSObject, ObservableObject {
    // MARK: - Public state

    enum Phase: Equatable {
        case unknown
        case unauthorized
        case poweredOff
        case unsupported  // simulator, iPad without BLE, etc.
        case ready
        case scanning
        case connecting
        case connected
        case failed(String)
    }

    /// Lightweight view-model of a discovered peripheral. We don't expose
    /// CBPeripheral directly because it isn't Sendable and we want the UI
    /// layer to deal with stable IDs rather than CoreBluetooth handles.
    struct Discovery: Identifiable, Hashable {
        let id: UUID
        let name: String
        let rssi: Int
        let isLikelyAdapter: Bool
    }

    @Published private(set) var phase: Phase = .unknown
    @Published private(set) var discoveries: [Discovery] = []
    @Published private(set) var connectedDevice: Discovery?
    /// Raw response transcript — useful for diagnostics and export.
    @Published private(set) var transcript: [OBDExchange] = []

    // MARK: - Internal CoreBluetooth state

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?
    private var writeType: CBCharacteristicWriteType = .withoutResponse
    private var notifyChar: CBCharacteristic?
    /// Strong references to peripherals we discover, keyed by identifier.
    /// `CBCentralManager.retrievePeripherals` only returns peripherals the
    /// system still considers known, which can become empty between scans on
    /// a fresh launch — keeping our own table guarantees `connect(_:)` works.
    private var knownPeripherals: [UUID: CBPeripheral] = [:]

    /// Outstanding command waiting for its `>` prompt. Only one in flight at a
    /// time — OBDLink CX cannot queue writes.
    private var pendingCommand: PendingCommand?
    /// Monotonically increasing token used to match a response (or a timeout)
    /// to the command that started it. Prevents a delayed reply to command A
    /// from accidentally resolving command B.
    private var nextCommandToken: UInt64 = 0
    /// Accumulating notify buffer, flushed once we see the `>` prompt.
    private var responseBuffer = ""
    /// Workitem that triggers the permissive (no-service-filter) fallback
    /// scan. Held so we can invalidate it when the user stops scanning early.
    private var scanFallbackWorkItem: DispatchWorkItem?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    // MARK: - Public API

    /// Start scanning for OBD adapters. Caller should observe `phase` and
    /// `discoveries`. After `seconds`, if nothing matching the OBDLink service
    /// has been found, falls back to a permissive scan.
    func startScan(timeout seconds: TimeInterval = 15) {
        guard central.state == .poweredOn else {
            // The state delegate will pick this up later; surface a hint now.
            updatePhaseForState()
            return
        }
        // Cancel any stale fallback from a previous scan.
        scanFallbackWorkItem?.cancel()
        scanFallbackWorkItem = nil

        discoveries.removeAll()
        phase = .scanning

        // Filter by service to skip random BLE noise. Some clones don't
        // advertise the service UUID though, so we also allow nil to be
        // safe — discoveries with a matching name will still float to the top.
        central.scanForPeripherals(
            withServices: [OBDLink.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )

        let fallback = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard case .scanning = self.phase else { return }
            self.central.stopScan()
            // Fall back to a permissive scan for adapters that don't
            // advertise the service UUID.
            self.central.scanForPeripherals(withServices: nil)
        }
        scanFallbackWorkItem = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: fallback)
    }

    func stopScan() {
        scanFallbackWorkItem?.cancel()
        scanFallbackWorkItem = nil
        central.stopScan()
        if case .scanning = phase { phase = .ready }
    }

    func connect(_ discovery: Discovery) {
        guard phase != .connecting && phase != .connected else { return }

        // Prefer the peripheral we hold from `didDiscover` (most reliable).
        // Fall back to `retrievePeripherals` only if we somehow lost our ref —
        // that path can return an empty array on a fresh app launch.
        let peripheralToConnect: CBPeripheral?
        if let known = knownPeripherals[discovery.id] {
            peripheralToConnect = known
        } else {
            peripheralToConnect = central.retrievePeripherals(withIdentifiers: [discovery.id]).first
        }
        guard let peripheral = peripheralToConnect else {
            phase = .failed("Device no longer available — scan again.")
            return
        }
        scanFallbackWorkItem?.cancel()
        scanFallbackWorkItem = nil
        central.stopScan()
        self.peripheral = peripheral
        peripheral.delegate = self
        phase = .connecting
        central.connect(peripheral, options: nil)
    }

    func disconnect() {
        failPendingCommand(with: OBDError.disconnected)
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        teardown()
    }

    /// Send a single AT or OBD command and await the framed response (text up
    /// to and excluding the next `>` prompt). Commands are sent one at a time;
    /// callers should serialise via `OBDSession`.
    func send(_ command: String, timeout: TimeInterval = 5) async throws -> String {
        guard pendingCommand == nil else {
            throw OBDError.busy
        }
        guard let peripheral, let writeChar else {
            throw OBDError.notConnected
        }

        // Unique per-command token. If a delayed response from a previous
        // command arrives now, the prompt-handler will see the buffer is
        // owned by a different token and drop the stale data instead of
        // resolving the wrong continuation.
        nextCommandToken &+= 1
        let token = nextCommandToken

        return try await withCheckedThrowingContinuation { continuation in
            let line = command + OBDLink.commandTerminator
            guard let data = line.data(using: .ascii) else {
                continuation.resume(throwing: OBDError.encoding)
                return
            }

            pendingCommand = PendingCommand(
                token: token,
                command: command,
                continuation: continuation,
                startedAt: Date()
            )
            // Discard any leftover bytes from a previous (possibly timed-out)
            // command so they can't bleed into this frame.
            responseBuffer = ""

            // OBDLink CX strongly recommends write-without-response; queued
            // writes are not supported. Chunk on MTU just to be safe — most
            // commands are tiny but VIN/DTC bursts can fan out responses.
            let mtu = max(1, peripheral.maximumWriteValueLength(for: writeType))
            if data.count <= mtu {
                peripheral.writeValue(data, for: writeChar, type: writeType)
            } else {
                var offset = 0
                while offset < data.count {
                    let end = min(offset + mtu, data.count)
                    peripheral.writeValue(data.subdata(in: offset..<end),
                                          for: writeChar,
                                          type: writeType)
                    offset = end
                }
            }

            // Timeout watchdog — keyed by token, so it only fires for the
            // command it started with.
            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self else { return }
                guard let pending = self.pendingCommand, pending.token == token else { return }
                self.responseBuffer = ""
                self.failPendingCommand(with: OBDError.timeout(pending.command))
            }
        }
    }

    // MARK: - Internals

    private func teardown() {
        scanFallbackWorkItem?.cancel()
        scanFallbackWorkItem = nil
        peripheral = nil
        writeChar = nil
        writeType = .withoutResponse
        notifyChar = nil
        connectedDevice = nil
        responseBuffer = ""
        phase = central.state == .poweredOn ? .ready : .unknown
        updatePhaseForState()
    }

    private func failPendingCommand(with error: Error) {
        guard let pending = pendingCommand else { return }
        pendingCommand = nil
        pending.continuation.resume(throwing: error)
    }

    private func updatePhaseForState() {
        switch central.state {
        case .poweredOn: if phase == .unknown { phase = .ready }
        case .poweredOff: phase = .poweredOff
        case .unauthorized: phase = .unauthorized
        case .unsupported: phase = .unsupported
        case .resetting, .unknown: phase = .unknown
        @unknown default: phase = .unknown
        }
    }

    private func recordExchange(command: String, response: String) {
        transcript.append(OBDExchange(
            timestamp: Date(),
            command: command,
            rawResponse: response
        ))
    }

    private struct PendingCommand {
        let token: UInt64
        let command: String
        let continuation: CheckedContinuation<String, Error>
        let startedAt: Date
    }
}

// MARK: - CBCentralManagerDelegate

extension OBDBluetoothManager: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in self.updatePhaseForState() }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertisedServices = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        let advertisedServiceMatch = advertisedServices.contains(OBDLink.serviceUUID)
        let rawName = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
        let name = rawName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let id = peripheral.identifier
        let rssiVal = RSSI.intValue
        let isLikely = advertisedServiceMatch
            || OBDLink.adapterNamePrefixes.contains(where: { name.uppercased().hasPrefix($0.uppercased()) })

        Task { @MainActor in
            guard !name.isEmpty || advertisedServiceMatch else { return }
            let displayName = name.isEmpty ? "OBD Adapter" : name
            // Keep a strong reference so connect(_:) doesn't depend on CB's
            // internal known-peripheral cache, which empties on app relaunch.
            self.knownPeripherals[id] = peripheral
            if let idx = self.discoveries.firstIndex(where: { $0.id == id }) {
                self.discoveries[idx] = Discovery(id: id, name: displayName, rssi: rssiVal, isLikelyAdapter: isLikely)
            } else {
                self.discoveries.append(Discovery(id: id, name: displayName, rssi: rssiVal, isLikelyAdapter: isLikely))
            }
            // Sort: likely adapters first, then by RSSI strength.
            self.discoveries.sort { (lhs, rhs) in
                if lhs.isLikelyAdapter != rhs.isLikelyAdapter { return lhs.isLikelyAdapter }
                return lhs.rssi > rhs.rssi
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            self.peripheral = peripheral
            peripheral.delegate = self
            peripheral.discoverServices([OBDLink.serviceUUID])
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        Task { @MainActor in
            self.phase = .failed(error?.localizedDescription ?? "Failed to connect.")
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        Task { @MainActor in
            // If we had a pending command, fail it.
            self.failPendingCommand(with: OBDError.disconnected)
            // Only run teardown if we haven't already done so via a manual
            // `disconnect()` call. Otherwise we'd race against the UI: e.g.
            // user taps Disconnect → we tear down → UI starts a fresh scan →
            // OS callback arrives → teardown() resets the phase back to
            // .ready and the user-visible scanning state is lost.
            if self.peripheral != nil {
                self.teardown()
            }
            if let error {
                self.phase = .failed(error.localizedDescription)
            }
        }
    }
}

// MARK: - CBPeripheralDelegate

extension OBDBluetoothManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            guard error == nil else {
                self.phase = .failed(error!.localizedDescription)
                return
            }
            guard let service = peripheral.services?.first(where: { $0.uuid == OBDLink.serviceUUID }) else {
                self.phase = .failed("OBDLink UART service not found on this adapter.")
                return
            }
            peripheral.discoverCharacteristics(
                [OBDLink.notifyCharacteristicUUID, OBDLink.writeCharacteristicUUID],
                for: service
            )
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        Task { @MainActor in
            guard error == nil else {
                self.phase = .failed(error!.localizedDescription)
                return
            }
            for c in service.characteristics ?? [] {
                if c.uuid == OBDLink.notifyCharacteristicUUID {
                    self.notifyChar = c
                    peripheral.setNotifyValue(true, for: c)
                } else if c.uuid == OBDLink.writeCharacteristicUUID {
                    self.writeChar = c
                    if c.properties.contains(.writeWithoutResponse) {
                        self.writeType = .withoutResponse
                    } else if c.properties.contains(.write) {
                        self.writeType = .withResponse
                    }
                }
            }

            guard self.notifyChar != nil && self.writeChar != nil else {
                self.phase = .failed("Adapter is missing the expected characteristics.")
                return
            }
            guard let writeChar = self.writeChar,
                  writeChar.properties.contains(.writeWithoutResponse) || writeChar.properties.contains(.write) else {
                self.phase = .failed("Adapter write characteristic does not support writes.")
                return
            }
            // Don't transition to .connected yet — wait for the OS to confirm
            // notifications are actually subscribed in
            // peripheral(_:didUpdateNotificationStateFor:error:). Otherwise
            // the first send() can silently time out because we're writing
            // before we can read.
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        Task { @MainActor in
            guard characteristic.uuid == OBDLink.notifyCharacteristicUUID else { return }
            if let error {
                self.phase = .failed("Couldn't subscribe to adapter notifications: \(error.localizedDescription)")
                return
            }
            guard characteristic.isNotifying else { return }
            let name = peripheral.name ?? "OBD Adapter"
            self.connectedDevice = Discovery(
                id: peripheral.identifier,
                name: name,
                rssi: 0,
                isLikelyAdapter: true
            )
            self.phase = .connected
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard characteristic.uuid == OBDLink.notifyCharacteristicUUID else { return }
        let bytes = characteristic.value ?? Data()
        Task { @MainActor in
            self.consume(bytes: bytes)
        }
    }
}

// MARK: - Response framing

private extension OBDBluetoothManager {
    /// Append incoming bytes to the response buffer; flush when the prompt is
    /// seen. ELM327 responses can arrive across multiple notifications, so we
    /// must accumulate until `>` rather than treating every notify as a
    /// complete frame.
    func consume(bytes: Data) {
        guard !bytes.isEmpty else { return }
        let chunk = String(data: bytes, encoding: .ascii) ?? ""

        // If no command is in flight, this is leftover noise from a
        // previously timed-out command — drop everything up to and including
        // the next prompt so it can't bleed into the next command's frame.
        guard pendingCommand != nil else {
            responseBuffer += chunk
            if let promptRange = responseBuffer.range(of: String(OBDLink.promptCharacter)) {
                responseBuffer = String(responseBuffer[promptRange.upperBound...])
            }
            return
        }

        responseBuffer += chunk
        guard let promptRange = responseBuffer.range(of: String(OBDLink.promptCharacter)) else { return }

        var framed = String(responseBuffer[..<promptRange.lowerBound])
        responseBuffer = String(responseBuffer[promptRange.upperBound...])

        // Strip echoes (when ATE0 hasn't run yet) and normalize whitespace.
        framed = framed.replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\n\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let pending = pendingCommand else { return }
        pendingCommand = nil

        recordExchange(command: pending.command, response: framed)
        if let message = adapterFailureMessage(from: framed) {
            pending.continuation.resume(throwing: OBDError.adapterError(message))
            return
        }
        pending.continuation.resume(returning: framed)
    }

    func adapterFailureMessage(from response: String) -> String? {
        let upper = response.uppercased()
        if upper.contains("UNABLE TO CONNECT") {
            return "The adapter connected, but it could not talk to the vehicle. Make sure the ignition is ON and the adapter is firmly seated."
        }
        if upper.contains("BUS INIT") && upper.contains("ERROR") {
            return "The adapter could not initialize the vehicle bus. Check ignition state and try again."
        }
        if upper.contains("CAN ERROR") || upper.contains("BUFFER FULL") || upper.contains("STOPPED") {
            return "The adapter reported a communication error. Try reconnecting and running the scan again."
        }
        if upper.trimmingCharacters(in: .whitespacesAndNewlines) == "?" {
            return "The adapter did not understand one of the setup commands."
        }
        return nil
    }
}

// MARK: - Errors and exchange model

enum OBDError: LocalizedError {
    case notConnected
    case busy
    case encoding
    case timeout(String)
    case disconnected
    case adapterError(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Adapter is not connected."
        case .busy: return "Another command is still in flight."
        case .encoding: return "Could not encode command."
        case .timeout(let c): return "Adapter didn't respond to \(c) in time."
        case .disconnected: return "Adapter disconnected mid-command."
        case .adapterError(let m): return m
        }
    }
}

struct OBDExchange: Identifiable, Hashable, Codable {
    let id: UUID
    let timestamp: Date
    let command: String
    let rawResponse: String

    init(timestamp: Date, command: String, rawResponse: String) {
        self.id = UUID()
        self.timestamp = timestamp
        self.command = command
        self.rawResponse = rawResponse
    }
}
