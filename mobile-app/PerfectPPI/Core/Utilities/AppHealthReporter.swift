import Foundation
import MetricKit

/// Plan 34.2 reliability observations without a third-party crash SDK.
/// Delayed diagnostics are not correlated with sessions, so no exact
/// crash-free session rate can be inferred from these event counts.
///
/// Two client-observed product events, both closed names with no payload:
/// - `app_session_started` once per foreground while signed in;
/// - `app_crash_detected` once per crash diagnostic MetricKit delivers on the
///   next launch (the OS batches them; a delivery may carry several).
///
/// Nothing about the crash — stack, thread, device, OS build — leaves the
/// device. The server counts events for the signed-in member, honours the
/// product-analytics opt-out, and expires rows after 90 days.
@MainActor
final class AppHealthReporter: NSObject, MXMetricManagerSubscriber {
    static let shared = AppHealthReporter()

    private var subscribed = false
    private var lastSessionAt: Date?
    private var activeProfileId: String?

    /// Foregrounds within this window count as one session (a quick app
    /// switch is not a new visit).
    private let sessionGap: TimeInterval = 5 * 60

    private override init() {
        super.init()
    }

    func start() {
        guard !subscribed else { return }
        subscribed = true
        MXMetricManager.shared.add(self)
    }

    /// Called on every scene activation; the active account gates the call
    /// because the API only records events for an authenticated member.
    func sceneBecameActive(profileId: String?) {
        if activeProfileId != profileId {
            activeProfileId = profileId
            lastSessionAt = nil
        }
        guard let profileId else { return }
        let now = Date()
        if let last = lastSessionAt, now.timeIntervalSince(last) < sessionGap {
            return
        }
        lastSessionAt = now
        Task {
            guard activeProfileId == profileId else { return }
            await SocialAPI.recordClientEvent("app_session_started")
        }
    }

    // MARK: MXMetricManagerSubscriber

    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        // Performance metrics are not collected (plan 34: no device telemetry).
    }

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let crashes = payloads.reduce(0) { $0 + ($1.crashDiagnostics?.count ?? 0) }
        guard crashes > 0 else { return }
        Task { @MainActor in
            // Never attribute signed-out diagnostics to the next person who
            // signs in on a shared device. Only bounded aggregate observations
            // are sent for the current account; no crash-free rate is inferred.
            guard let profileId = activeProfileId else { return }
            for _ in 0..<min(crashes, 10) {
                guard activeProfileId == profileId else { return }
                await SocialAPI.recordClientEvent("app_crash_detected")
            }
        }
    }
}
