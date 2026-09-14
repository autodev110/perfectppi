import SwiftUI

/// Enforcement notice for a suspended or closed account (plan 17.4 / 18.6).
/// The session stays valid; product access does not. The member sees what
/// happened, the policy category, how long it lasts, what still works, and
/// how to ask for a review — never who reported or how many did.
struct AccountUnavailableView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.openURL) private var openURL
    @State private var status: EnforcementStatus?
    @State private var loadFailed = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Image(systemName: status?.notice == nil ? "exclamationmark.triangle" : "shield.lefthalf.filled.slash")
                        .font(.largeTitle)
                        .foregroundStyle(Theme.Palette.warning)
                    if let notice = status?.notice {
                        Text(notice.title).font(.title2.bold())
                        Text(notice.body).font(.body)
                        Text(notice.stillAvailable).font(.subheadline).foregroundStyle(.secondary)
                        Text(notice.nextStep).font(.subheadline)
                        if let ends = status?.actions.first?.endsAt, let date = ISO8601DateFormatter.parseFlexible(ends) {
                            Label("Ends \(date.formatted(date: .abbreviated, time: .shortened))", systemImage: "calendar")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    } else if status == nil && !loadFailed {
                        ProgressView("Checking your account…")
                    } else {
                        Text("Your account is unavailable").font(.title2.bold())
                        Text("You're signed in, but product access is currently unavailable. This may be temporary or may need help from support.")
                            .font(.body)
                    }

                    VStack(spacing: 10) {
                        Button {
                            openURL(AppConfig.apiBaseURL.appendingPathComponent(status?.supportPath.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? "support"))
                        } label: {
                            Label(status?.notice == nil ? "Contact support" : "Contact support to request a review", systemImage: "envelope")
                        }
                        .buttonStyle(PrimaryButtonStyle())

                        Button {
                            Task { await auth.retryProfileLoad() }
                        } label: {
                            Label("Try again", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(OutlineButtonStyle())

                        Button {
                            openURL(AppConfig.apiBaseURL.appendingPathComponent("privacy-choices"))
                        } label: {
                            Label("Privacy choices and data requests", systemImage: "hand.raised")
                        }
                        .buttonStyle(OutlineButtonStyle())

                        Button(role: .destructive) {
                            Task { await auth.signOut() }
                        } label: {
                            Text("Sign out")
                        }
                        .buttonStyle(OutlineButtonStyle())
                    }
                    .padding(.top, 8)

                    Text("You can still read our policies, contact support, and exercise your privacy rights while product access is unavailable.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
        }
    }

    @MainActor
    private func load() async {
        do {
            status = try await AccountAPI.enforcementStatus()
        } catch {
            loadFailed = true
        }
    }
}

/// Mirrors `EnforcementStatus` from `src/features/moderation/enforcement-status.ts`.
struct EnforcementStatus: Decodable {
    struct Notice: Decodable {
        let title: String
        let body: String
        let stillAvailable: String
        let nextStep: String
    }
    struct Action: Decodable, Identifiable {
        let id: String
        let actionType: String
        let label: String
        let startsAt: String
        let endsAt: String?
    }
    let available: Bool
    let notice: Notice?
    let actions: [Action]
    let supportPath: String
}

enum AccountAPI {
    /// Reachable during a suspension: the one thing a suspended member must be able to read.
    static func enforcementStatus() async throws -> EnforcementStatus {
        try await APIClient.shared.get("/api/me/enforcement")
    }
}

extension ISO8601DateFormatter {
    /// Accepts timestamps with or without fractional seconds.
    static func parseFlexible(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }
}
