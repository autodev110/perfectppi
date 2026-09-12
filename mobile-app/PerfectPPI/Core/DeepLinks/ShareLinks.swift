import Foundation

/// Stable, permission-aware share links (plan 15.4). A share link is the
/// canonical web page; whoever opens it is re-checked against the current
/// visibility rules, and the same paths open natively via universal links.
enum ShareLinks {
    static func post(id: String) -> URL {
        AppConfig.publicSiteURL.appendingPathComponent("community/posts/\(id)")
    }

    static func group(slug: String) -> URL {
        AppConfig.publicSiteURL.appendingPathComponent("community/groups/\(slug)")
    }

    static func profile(username: String) -> URL {
        AppConfig.publicSiteURL.appendingPathComponent("profile/\(username)")
    }

    static func vehicle(id: String) -> URL {
        AppConfig.publicSiteURL.appendingPathComponent("vehicle/\(id)")
    }

    static func vehicleBuild(id: String, entryId: String?) -> URL {
        var components = URLComponents(
            url: AppConfig.publicSiteURL.appendingPathComponent("vehicle/\(id)"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "tab", value: "build")]
        if let entryId { components.fragment = "build-\(entryId)" }
        return components.url!
    }

    static func listing(id: String) -> URL {
        AppConfig.publicSiteURL.appendingPathComponent("marketplace/listings/\(id)")
    }
}
