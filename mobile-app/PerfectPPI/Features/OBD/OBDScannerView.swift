import SwiftUI

/// Top-level OBD page. Renders one of the connection stages plus the data
/// export view once the adapter is connected.
struct OBDScannerView: View {
    @StateObject private var bluetooth: OBDBluetoothManager
    @StateObject private var session: OBDSession
    @State private var step: ConnectionStep = .prepare
    private let submissionId: String?
    private let onSaved: ((OBDSnapshotRecord) -> Void)?

    enum ConnectionStep: Int, CaseIterable {
        case prepare    // permission/BT ready + intro instructions
        case plugIn     // physical: plug adapter into OBD-II port
        case ignition   // physical: turn ignition to ACC/ON
        case scan       // discover BLE devices
        case connecting // BLE connecting
        case connected  // ready to run scan + export
    }

    init(
        submissionId: String? = nil,
        onSaved: ((OBDSnapshotRecord) -> Void)? = nil
    ) {
        // Single shared OBDBluetoothManager instance the session also points
        // to. No inline default — that path would build a throw-away manager
        // (with its own CBCentralManager) before init can override it.
        let bt = OBDBluetoothManager()
        _bluetooth = StateObject(wrappedValue: bt)
        _session = StateObject(wrappedValue: OBDSession(bluetooth: bt))
        self.submissionId = submissionId
        self.onSaved = onSaved
    }

    var body: some View {
        VStack(spacing: 0) {
            progressBar
            ScrollView {
                content
                    .padding()
            }
        }
        .navigationTitle(submissionId == nil ? "OBD Scanner" : "Inspection Diagnostics")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: bluetooth.phase) { _, newPhase in
            sync(with: newPhase)
        }
        .onAppear {
            sync(with: bluetooth.phase)
        }
    }

    // MARK: - Step driver

    private func sync(with phase: OBDBluetoothManager.Phase) {
        // Only the BLE-driven steps follow the manager's phase. Steps the
        // user advances through manually (prepare/plugIn/ignition) must NOT
        // be auto-pushed forward, otherwise a fallback scan firing after a
        // back-press would yank the user out of the instructions.
        switch phase {
        case .connecting: step = .connecting
        case .connected:  step = .connected
        default:          break
        }
    }

    // MARK: - Layout

    @ViewBuilder
    private var progressBar: some View {
        let total = ConnectionStep.allCases.count
        ProgressView(value: Double(step.rawValue + 1), total: Double(total))
            .tint(Theme.Palette.primary)
            .padding(.horizontal)
            .padding(.top, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .prepare:    prepareStep
        case .plugIn:     plugInStep
        case .ignition:   ignitionStep
        case .scan:       scanStep
        case .connecting: connectingStep
        case .connected:  connectedStep
        }
    }

    // MARK: - Step views

    @ViewBuilder
    private var prepareStep: some View {
        StepCard(
            number: 1,
            title: "Get ready",
            message: "We'll connect your phone to an OBDLink CX (or compatible BLE OBD-II adapter), then pull diagnostic data straight from the car."
        ) {
            phaseHint
            Button {
                step = .plugIn
            } label: {
                Label("I have an adapter", systemImage: "checkmark.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(
                bluetooth.phase == .poweredOff
                || bluetooth.phase == .unauthorized
                || bluetooth.phase == .unsupported
            )
        }
    }

    @ViewBuilder
    private var plugInStep: some View {
        StepCard(
            number: 2,
            title: "Plug in the adapter",
            message: "Locate the OBD-II port (usually under the dashboard near the steering column). Plug the adapter in firmly — its LED should light up."
        ) {
            Image(systemName: "powerplug.fill")
                .font(.system(size: 56))
                .foregroundStyle(Theme.Palette.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            navRow(back: { step = .prepare }, forward: { step = .ignition })
        }
    }

    @ViewBuilder
    private var ignitionStep: some View {
        StepCard(
            number: 3,
            title: "Turn the ignition on",
            message: "Turn the key (or push button) to the accessory or ON position. The engine doesn't have to be running — but it must be running for live engine data."
        ) {
            Image(systemName: "key.fill")
                .font(.system(size: 56))
                .foregroundStyle(Theme.Palette.warning)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            navRow(back: { step = .plugIn }) {
                bluetooth.startScan()
                step = .scan
            }
        }
    }

    @ViewBuilder
    private var scanStep: some View {
        StepCard(
            number: 4,
            title: "Pair with the adapter",
            message: "Pick your adapter from the list below. OBDLink CX appears as “OBDLink CX”."
        ) {
            phaseHint
            if bluetooth.discoveries.isEmpty {
                VStack(spacing: 10) {
                    if bluetooth.phase == .scanning {
                        ProgressView()
                        Text("Scanning for nearby BLE devices…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Image(systemName: "antenna.radiowaves.left.and.right.slash")
                            .font(.title)
                            .foregroundStyle(.secondary)
                        Text("No adapters found")
                            .font(.subheadline.weight(.medium))
                        Text("Make sure the OBDLink CX is plugged in, the ignition is on, and the LED is lit. Then tap Rescan.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                VStack(spacing: 0) {
                    ForEach(bluetooth.discoveries) { d in
                        Button {
                            bluetooth.connect(d)
                        } label: {
                            DiscoveryRow(discovery: d)
                        }
                        .buttonStyle(.plain)
                        .disabled(bluetooth.phase == .connecting || bluetooth.phase == .connected)
                        Divider()
                    }
                }
            }
            HStack {
                Button("Back") { bluetooth.stopScan(); step = .ignition }
                    .buttonStyle(.bordered)
                Spacer()
                Button("Rescan") {
                    bluetooth.startScan()
                }
                .buttonStyle(.bordered)
                .disabled(bluetooth.phase == .connecting)
            }
        }
    }

    @ViewBuilder
    private var connectingStep: some View {
        StepCard(
            number: 5,
            title: "Connecting…",
            message: "Establishing a BLE link with the adapter and discovering its UART service."
        ) {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 80)
            phaseHint
            HStack {
                Button("Cancel") {
                    bluetooth.disconnect()
                    step = .scan
                    bluetooth.startScan()
                }
                .buttonStyle(.bordered)
                Spacer()
            }
        }
    }

    @ViewBuilder
    private var connectedStep: some View {
        OBDDataExportView(
            session: session,
            bluetooth: bluetooth,
            submissionId: submissionId,
            onSaved: onSaved
        ) {
            // User tapped disconnect — reset the session too so a reconnect
            // auto-rescans and shows fresh data instead of the previous
            // snapshot.
            bluetooth.disconnect()
            session.reset()
            step = .scan
            bluetooth.startScan()
        }
    }

    // MARK: - Shared bits

    @ViewBuilder
    private var phaseHint: some View {
        switch bluetooth.phase {
        case .unauthorized:
            HintRow(
                icon: "exclamationmark.shield.fill",
                tint: Theme.Palette.danger,
                text: "Bluetooth permission is denied. Enable it in Settings → PerfectPPI → Bluetooth."
            )
        case .poweredOff:
            HintRow(
                icon: "antenna.radiowaves.left.and.right.slash",
                tint: Theme.Palette.danger,
                text: "Bluetooth is off on this device. Turn it on in Control Center."
            )
        case .unsupported:
            HintRow(
                icon: "iphone.gen3.slash",
                tint: Theme.Palette.warning,
                text: "Bluetooth isn't available on this device — the iOS Simulator can't run a real BLE scan. Test on a physical iPhone."
            )
        case .failed(let msg):
            HintRow(icon: "xmark.octagon.fill", tint: Theme.Palette.danger, text: msg)
        case .scanning:
            HintRow(icon: "dot.radiowaves.left.and.right", tint: Theme.Palette.primary, text: "Scanning…")
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func navRow(back: @escaping () -> Void, forward: @escaping () -> Void) -> some View {
        HStack {
            Button("Back", action: back)
                .buttonStyle(.bordered)
            Spacer()
            Button("Continue", action: forward)
                .buttonStyle(PrimaryButtonStyle())
                .frame(maxWidth: 180)
        }
    }
}

// MARK: - Reusable bits

private struct StepCard<Content: View>: View {
    let number: Int
    let title: String
    let message: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(number)")
                    .font(.subheadline.bold())
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Theme.Palette.primary.opacity(0.15))
                    .foregroundStyle(Theme.Palette.primary)
                    .clipShape(Capsule())
                Text(title).font(.title3.bold())
            }
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}

private struct DiscoveryRow: View {
    let discovery: OBDBluetoothManager.Discovery

    var body: some View {
        HStack {
            Image(systemName: discovery.isLikelyAdapter ? "checkmark.seal.fill" : "antenna.radiowaves.left.and.right")
                .foregroundStyle(discovery.isLikelyAdapter ? Theme.Palette.success : Theme.Palette.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(discovery.name).font(.subheadline.weight(.medium))
                Text("Signal \(discovery.rssi) dBm")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 10)
    }
}

private struct HintRow: View {
    let icon: String
    let tint: Color
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(text).font(.caption)
        }
        .padding(.vertical, 4)
    }
}
