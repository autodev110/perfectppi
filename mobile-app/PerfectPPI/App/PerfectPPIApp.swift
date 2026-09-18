import SwiftUI

@main
struct PerfectPPIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthStore()
    @StateObject private var router = URLRouter.shared
    @StateObject private var offline = OfflineQueue.shared
    @AppStorage(AppAppearance.storageKey) private var appearanceRaw = AppAppearance.system.rawValue
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
                .environmentObject(auth)
                .environmentObject(router)
                .environmentObject(offline)
                .task {
                    AppHealthReporter.shared.start()
                    await auth.bootstrap()
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await auth.refreshCapabilities() }
                    AppHealthReporter.shared.sceneBecameActive(signedIn: auth.profile != nil)
                }
                .onChange(of: auth.profile?.id) { _, id in
                    // A sign-in after launch is the start of that member's session.
                    guard id != nil, scenePhase == .active else { return }
                    AppHealthReporter.shared.sceneBecameActive(signedIn: true)
                }
                .onOpenURL { url in
                    Task { await router.handle(url, authStore: auth) }
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    Task { await router.handle(url, authStore: auth) }
                }
                .onReceive(NotificationCenter.default.publisher(for: .pushDeepLinkReceived)) { note in
                    guard let url = note.userInfo?["url"] as? URL else { return }
                    Task { await router.handle(url, authStore: auth) }
                }
        }
    }
}
