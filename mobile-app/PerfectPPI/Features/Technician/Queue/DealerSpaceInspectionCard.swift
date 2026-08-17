import SwiftUI

// ============================================================================
// The DealerSpace panel on a technician's inspection, mirroring the web one.
//
// Without this the round trip breaks in the middle: a technician can perform the
// whole inspection on the phone, walking around the car, and then has to find a
// laptop to press Send. The four-artifact gate is enforced by the server; this
// view reports it so the button is never a guess.
//
// Renders nothing for ordinary consumer inspections.
// ============================================================================

struct DealerSpaceInspectionCard: View {
    let requestId: String

    @State private var context: PerfectPpiPartnerContext?
    @State private var loaded = false
    @State private var sending = false
    @State private var message: String?
    @State private var error: String?

    var body: some View {
        Group {
            if let context {
                VStack(alignment: .leading, spacing: Theme.spacing) {
                    header(context)
                    snapshotRows(context)
                    artifactChecklist(context)
                    actions(context)
                }
                .padding()
                .background(Theme.Palette.card)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Theme.Palette.primary.opacity(0.3), lineWidth: 1)
                )
            }
        }
        .task { await load() }
    }

    // MARK: - Sections

    @ViewBuilder
    private func header(_ context: PerfectPpiPartnerContext) -> some View {
        HStack {
            Image(systemName: "building.2.fill").foregroundStyle(Theme.Palette.primary)
            Text(context.sourceLabel ?? context.partnerName).font(.headline)
            Spacer()
        }

        HStack(spacing: 8) {
            StatusBadge(text: context.integrationStatusLabel, color: Theme.Palette.primary)
            StatusBadge(text: context.deliveryStatusLabel, color: context.deliveryTint)
        }
    }

    @ViewBuilder
    private func snapshotRows(_ context: PerfectPpiPartnerContext) -> some View {
        if let snapshot = context.vehicleSnapshot {
            if let stock = snapshot.stockNumber {
                InfoRow(label: "Stock number", value: stock, icon: "number")
            }
            if let recon = context.externalReconCaseId {
                InfoRow(label: "Recon case", value: recon, icon: "folder.fill")
            }
        }
    }

    @ViewBuilder
    private func artifactChecklist(_ context: PerfectPpiPartnerContext) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Deliverables")
                .font(.subheadline.weight(.semibold))
            Text(context.deliverablesReady
                 ? "All four reports are ready to send."
                 : "Available once the inspection report and VSC determination have both been generated.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func actions(_ context: PerfectPpiPartnerContext) -> some View {
        if !context.connectionActive {
            Text("This DealerSpace connection has been revoked. Ask your organization manager to reconnect it.")
                .font(.caption)
                .foregroundStyle(Theme.Palette.danger)
        } else if context.deliveryStatus == "delivered" {
            Label("Delivered to DealerSpace", systemImage: "checkmark.seal.fill")
                .font(.subheadline)
                .foregroundStyle(Theme.Palette.success)
        } else if context.canSend {
            Button {
                Task { await send() }
            } label: {
                Text(sending ? "Sending…"
                     : context.deliveryStatus == "failed" ? "Retry delivery"
                     : "Send to DealerSpace")
            }
            .buttonStyle(PrimaryButtonStyle(isLoading: sending))
            .disabled(sending || !context.deliverablesReady || context.deliveryInFlight)
        }

        if let message {
            Text(message).font(.caption).foregroundStyle(Theme.Palette.success)
        }
        if let error {
            Text(error).font(.caption).foregroundStyle(Theme.Palette.danger)
        }
    }

    // MARK: - Actions

    private func load() async {
        guard !loaded else { return }
        loaded = true
        context = try? await PpiAPI.dealerSpaceContext(requestId: requestId)
    }

    private func send() async {
        sending = true
        error = nil
        message = nil
        defer { sending = false }

        do {
            let result = try await PpiAPI.sendToDealerSpace(requestId: requestId)
            message = result.alreadyQueued
                ? "This delivery is already in progress."
                : "Queued for delivery to DealerSpace."
            // Re-read so the badges reflect the queued state.
            loaded = false
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
