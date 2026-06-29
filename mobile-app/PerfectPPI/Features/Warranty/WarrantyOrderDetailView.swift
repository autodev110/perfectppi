import SwiftUI

/// Drives the warranty flow:
///   - `contract_pending` → open DocuSeal in SafariViewController, then poll.
///   - `signed` → start Stripe checkout in SafariViewController, then poll.
///   - `paid` / `cancelled` / `failed` → terminal.
struct WarrantyOrderDetailView: View {
    let orderId: String

    @State private var order: WarrantyOrder?
    @State private var error: Error?
    @State private var safariURL: URL?
    @State private var refreshing = false

    var body: some View {
        Group {
            if let order {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.spacing) {
                        InfoRow(label: "Status",
                                value: order.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                                icon: "circle.dashed",
                                valueColor: statusTint(order.status.rawValue))
                        InfoRow(label: "Plan", value: order.planName, icon: "shield.lefthalf.filled")
                        InfoRow(label: "Price", value: price(order.priceCents), icon: "creditcard.fill")
                        if let signed = order.contract?.signedAt {
                            InfoRow(label: "Signed",
                                    value: signed.formatted(date: .abbreviated, time: .shortened),
                                    icon: "signature")
                        }
                        if let paid = order.payment?.paidAt {
                            InfoRow(label: "Paid",
                                    value: paid.formatted(date: .abbreviated, time: .shortened),
                                    icon: "checkmark.seal.fill")
                        }

                        actionButton(for: order)
                    }
                    .padding()
                }
                .refreshable { await load() }
            } else if let error {
                ErrorView(message: error.localizedDescription) {
                    Task { await load() }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Warranty Order")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $safariURL) { url in
            SafariWebView(url: url)
                .ignoresSafeArea()
                .onDisappear { Task { await refreshAfterSafari() } }
        }
    }

    @ViewBuilder
    private func actionButton(for order: WarrantyOrder) -> some View {
        switch order.status {
        case .contractPending:
            Button("Sign Contract") {
                Task { await openSign(orderId: order.id) }
            }
            .buttonStyle(PrimaryButtonStyle(isLoading: refreshing))
            .disabled(refreshing)
        case .signed, .paymentPending:
            Button("Pay") {
                Task { await openCheckout(orderId: order.id) }
            }
            .buttonStyle(PrimaryButtonStyle(isLoading: refreshing))
            .disabled(refreshing)
        case .paid:
            Label("Paid", systemImage: "checkmark.seal.fill")
                .foregroundStyle(Theme.Palette.success)
        case .failed:
            Label("Payment failed", systemImage: "xmark.octagon.fill")
                .foregroundStyle(Theme.Palette.danger)
        case .cancelled:
            Label("Order cancelled", systemImage: "minus.circle.fill")
                .foregroundStyle(.secondary)
        }
    }

    private func load() async {
        do {
            self.order = try await WarrantyAPI.order(id: orderId)
            self.error = nil
        } catch {
            self.error = error
        }
    }

    private func openSign(orderId: String) async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            let contractId: String
            if let existingId = order?.contract?.id {
                contractId = existingId
            } else {
                contractId = try await WarrantyAPI.presentContract(orderId: orderId).contractId
                await load()
            }
            let resp = try await WarrantyAPI.signLink(contractId: contractId)
            if let url = URL(string: resp.embedSrc) {
                self.safariURL = url
            }
        } catch {
            self.error = error
        }
    }

    private func openCheckout(orderId: String) async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            guard let contractId = order?.contract?.id else {
                throw APIError.server(status: 400, message: "Contract not ready")
            }
            let resp = try await WarrantyAPI.startCheckout(contractId: contractId)
            if let url = URL(string: resp.checkoutUrl) {
                self.safariURL = url
            }
        } catch {
            self.error = error
        }
    }

    private func refreshAfterSafari() async {
        if let contractId = order?.contract?.id {
            _ = try? await WarrantyAPI.syncSignature(contractId: contractId)
        }
        await load()
    }

    private func price(_ cents: Int) -> String {
        (Double(cents) / 100).formatted(.currency(code: "USD"))
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

