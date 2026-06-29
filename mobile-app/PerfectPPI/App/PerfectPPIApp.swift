import SwiftUI

@main
struct PerfectPPIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthStore()
    @StateObject private var router = URLRouter.shared
    @StateObject private var offline = OfflineQueue.shared
    @AppStorage(AppAppearance.storageKey) private var appearanceRaw = AppAppearance.system.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
                .environmentObject(auth)
                .environmentObject(router)
                .environmentObject(offline)
                .task {
                    await auth.bootstrap()
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
