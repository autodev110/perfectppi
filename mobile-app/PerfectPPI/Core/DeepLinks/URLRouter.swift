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

        selectedRoute = .unknown
        return false
    }
}
