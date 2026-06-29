import SwiftUI

/// Post-connection screen. Runs the scan (handshake + VIN/PIDs/DTCs), shows
/// the results, and offers a share-sheet export. The user can re-run the scan
/// or disconnect from here.
struct OBDDataExportView: View {
    @ObservedObject var session: OBDSession
    @ObservedObject var bluetooth: OBDBluetoothManager
    var submissionId: String?
    var onSaved: ((OBDSnapshotRecord) -> Void)?
    var onDisconnect: () -> Void

    @State private var shareItem: ShareItem?
    @State private var saving = false
    @State private var savedMessage: String?
    @State private var saveError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            connectedHeader

            switch session.phase {
            case .idle:
                idleCTA
            case .handshaking(let label), .reading(let label):
                runningCard(label: label)
            case .ready:
                resultsCard
            case .failed(let msg):
                failureCard(msg)
            }

            transcriptCard
        }
        .task {
            // Auto-start the scan on first arrival.
            if session.phase == .idle {
                await session.runScan()
            }
        }
        .sheet(item: $shareItem) { item in
            ShareSheet(items: [item.url])
        }
        .alert("OBD Diagnostics", isPresented: .constant(savedMessage != nil),
               actions: { Button("OK") { savedMessage = nil } },
               message: { Text(savedMessage ?? "") })
        .alert("Save Failed", isPresented: .constant(saveError != nil),
               actions: { Button("OK") { saveError = nil } },
               message: { Text(saveError ?? "") })
    }

    // MARK: - Subviews

    @ViewBuilder
    private var connectedHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(Theme.Palette.success)
                .font(.title2)
            VStack(alignment: .leading) {
                Text("Connected").font(.headline)
                Text(bluetooth.connectedDevice?.name ?? "OBD Adapter")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Disconnect", action: onDisconnect)
                .buttonStyle(.bordered)
                .tint(Theme.Palette.danger)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Theme.Palette.success.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var idleCTA: some View {
        Button {
            Task { await session.runScan() }
        } label: {
            Label("Run diagnostic scan", systemImage: "play.circle.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryButtonStyle())
    }

    @ViewBuilder
    private func runningCard(label: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                ProgressView()
                Text(label).font(.subheadline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var resultsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Diagnostic Snapshot").font(.headline)

            ResultRow(label: "VIN", value: session.snapshot.vin ?? "—")
            ResultRow(label: "MIL / Check Engine", value: milStatusText)
            ResultRow(
                label: "ECU DTC Count",
                value: session.snapshot.monitorStatus.map { "\($0.storedDTCCount)" } ?? "—"
            )
            ResultRow(
                label: "Stored DTCs",
                value: session.snapshot.storedDTCs.isEmpty
                    ? "None"
                    : session.snapshot.storedDTCs.joined(separator: ", ")
            )
            ResultRow(
                label: "Pending DTCs",
                value: session.snapshot.pendingDTCs.isEmpty
                    ? "None"
                    : session.snapshot.pendingDTCs.joined(separator: ", ")
            )
            ResultRow(
                label: "Supported PIDs",
                value: session.snapshot.supportedPids.isEmpty
                    ? "—"
                    : session.snapshot.supportedPids.map { String(format: "0x%02X", $0) }.joined(separator: ", ")
            )

            if !session.snapshot.liveReadings.isEmpty {
                Divider()
                Text("Live Sensor Data")
                    .font(.subheadline.weight(.semibold))
                ForEach(session.snapshot.liveReadings) { reading in
                    ResultRow(label: reading.name, value: reading.formattedValue)
                }
            }

            HStack {
                Button {
                    Task { await session.runScan() }
                } label: {
                    Label("Re-run", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                Spacer()
                if submissionId != nil {
                    Button {
                        Task { await saveToInspection() }
                    } label: {
                        Label(saving ? "Saving..." : "Save", systemImage: "tray.and.arrow.down")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!session.snapshot.hasAnyData || saving)
                }
                Button {
                    shareItem = exportSnapshotToTempFile()
                } label: {
                    Label("Export JSON", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(PrimaryButtonStyle())
                .frame(maxWidth: 200)
                .disabled(!session.snapshot.hasAnyData)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var milStatusText: String {
        guard let status = session.snapshot.monitorStatus else { return "—" }
        return status.milOn ? "On" : "Off"
    }

    @ViewBuilder
    private func failureCard(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Scan failed", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(Theme.Palette.danger)
            Text(message).font(.subheadline)
            Button("Try again") {
                Task { await session.runScan() }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.danger.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var transcriptCard: some View {
        if !bluetooth.transcript.isEmpty {
            DisclosureGroup("Adapter transcript (\(bluetooth.transcript.count))") {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(bluetooth.transcript) { ex in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("> \(ex.command)")
                                .font(.caption.monospaced())
                                .foregroundStyle(Theme.Palette.primary)
                            Text(ex.rawResponse.isEmpty ? "(no response)" : ex.rawResponse)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                        }
                        Divider()
                    }
                }
                .padding(.top, 4)
            }
            .padding()
            .background(Theme.Palette.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func saveToInspection() async {
        guard let submissionId else { return }
        guard session.snapshot.hasAnyData else { return }

        if !OfflineQueue.shared.isOnline {
            OfflineQueue.shared.enqueueOBDSnapshot(
                submissionId: submissionId,
                snapshot: session.snapshot,
                transcript: bluetooth.transcript
            )
            savedMessage = "Queued for sync."
            return
        }

        saving = true
        defer { saving = false }
        do {
            let record = try await PpiAPI.saveOBDSnapshot(
                submissionId: submissionId,
                snapshot: session.snapshot,
                transcript: bluetooth.transcript
            )
            onSaved?(record)
            savedMessage = "Saved to inspection."
        } catch {
            saveError = error.localizedDescription
        }
    }

    // MARK: - Export

    private func exportSnapshotToTempFile() -> ShareItem? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let payload = ExportPayload(
            snapshot: session.snapshot,
            transcript: bluetooth.transcript
        )
        guard let data = try? encoder.encode(payload) else { return nil }

        let filename = "obd-scan-\(Int(Date().timeIntervalSince1970)).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: url, options: .atomic)
            return ShareItem(url: url)
        } catch {
            return nil
        }
    }
}

private struct ResultRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.monospaced())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ExportPayload: Codable {
    let exportedAt: Date
    let snapshot: OBDDiagnosticSnapshot
    let transcript: [OBDExchange]

    init(snapshot: OBDDiagnosticSnapshot, transcript: [OBDExchange]) {
        self.exportedAt = Date()
        self.snapshot = snapshot
        self.transcript = transcript
    }
}

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
