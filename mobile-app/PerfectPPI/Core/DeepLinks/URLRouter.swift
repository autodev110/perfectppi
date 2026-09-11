import Foundation
import SwiftUI

/// Routes incoming URLs (universal links + custom scheme) into app
/// navigation. Held in the environment so any view can subscribe to
/// `selectedRoute` and react.
@MainActor
final class URLRouter: ObservableObject {
    static let shared = URLRouter()

    enum Route: Equatable {
        case authCallback(URL)
        case ppiRequest(id: String)
        case ppiSubmission(id: String)
        case warrantyOrder(id: String)
        /// /notifications/{id}: resolve through the server (plan 22.1).
        case notification(id: String)
        case profile(username: String)
        case unknown
    }

    @Published var selectedRoute: Route? = nil

    /// Returns true if the URL was recognized.
    @discardableResult
    func handle(_ url: URL, authStore: AuthStore) async -> Bool {
        // OAuth callback can arrive on either scheme.
        if url.path.hasSuffix("/callback") || url.host == "callback" {
            selectedRoute = .authCallback(url)
            await authStore.exchangeCode(from: url)
            return true
        }

        // Path-based routing (universal links). Matches:
        //   /dashboard/ppi/{id}
        //   /tech/ppi/{id}
        //   /dashboard/warranty/{id}
        let parts = url.path.split(separator: "/").map(String.init)

        if parts.count >= 3, parts[0] == "dashboard" || parts[0] == "tech",
           parts[1] == "ppi" {
            selectedRoute = .ppiRequest(id: parts[2])
            return true
        }

        if parts.count >= 3, parts[0] == "dashboard", parts[1] == "warranty" {
            selectedRoute = .warrantyOrder(id: parts[2])
            return true
        }

        if parts.count >= 2, parts[0] == "notifications", UUID(uuidString: parts[1]) != nil {
            selectedRoute = .notification(id: parts[1])
            return true
        }

        if url.host == "profile", let username = parts.first, !username.isEmpty {
            selectedRoute = .profile(username: username)
            return true
        }
        if parts.count >= 2, parts[0] == "profile", !parts[1].isEmpty {
            selectedRoute = .profile(username: parts[1])
            return true
        }

        selectedRoute = .unknown
        return false
    }
}
