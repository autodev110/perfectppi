import Foundation

/// Stable, permission-aware share links (plan 15.4). A share link is the
/// canonical web page; whoever opens it is re-checked against the current
/// visibility rules, and the same paths open natively via universal links.
enum ShareLinks {
    static func post(id: String) -> URL {
        AppConfig.apiBaseURL.appendingPathComponent("community/posts/\(id)")
    }

    static func group(slug: String) -> URL {
        AppConfig.apiBaseURL.appendingPathComponent("community/groups/\(slug)")
    }

    static func profile(username: String) -> URL {
        AppConfig.apiBaseURL.appendingPathComponent("profile/\(username)")
    }

    static func vehicle(id: String) -> URL {
        AppConfig.apiBaseURL.appendingPathComponent("vehicle/\(id)")
    }

    static func listing(id: String) -> URL {
        AppConfig.apiBaseURL.appendingPathComponent("marketplace/listings/\(id)")
    }
}
