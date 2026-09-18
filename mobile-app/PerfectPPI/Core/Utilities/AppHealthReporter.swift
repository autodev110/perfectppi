import Foundation
import MetricKit

/// Plan 34.2 "crash-free sessions" without a third-party crash SDK.
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
    /// Crash diagnostics that arrived before the member was signed in; sent
    /// with the next session so a cold-start crash is not lost.
    private var pendingCrashCount = 0
    private var signedIn = false

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

    /// Called on every scene activation; `signedIn` gates the network call
    /// because the API only records events for an authenticated member.
    func sceneBecameActive(signedIn: Bool) {
        self.signedIn = signedIn
        guard signedIn else { return }
        let now = Date()
        if let last = lastSessionAt, now.timeIntervalSince(last) < sessionGap {
            return
        }
        lastSessionAt = now
        Task {
            await SocialAPI.recordClientEvent("app_session_started")
            await flushPendingCrashes()
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
            pendingCrashCount += crashes
            await flushPendingCrashes()
        }
    }

    private func flushPendingCrashes() async {
        guard signedIn, pendingCrashCount > 0 else { return }
        let count = pendingCrashCount
        pendingCrashCount = 0
        for _ in 0..<count {
            await SocialAPI.recordClientEvent("app_crash_detected")
        }
    }
}
