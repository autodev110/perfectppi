import Foundation

/// Runtime configuration loaded from `Resources/AppConfig.plist`.
/// Fail fast if the bundle is misconfigured — better than silent fallback.
enum AppConfig {
    static let apiBaseURL: URL = {
        guard let s = stringValue(forKey: "APIBaseURL"),
              let url = URL(string: s) else {
            fatalError("AppConfig.plist missing APIBaseURL")
        }
        return url
    }()

    static let publicSiteURL: URL = {
        guard let s = stringValue(forKey: "PublicSiteURL"),
              let url = URL(string: s) else {
            fatalError("AppConfig.plist missing PublicSiteURL")
        }
        return url
    }()

    static let supabaseURL: URL = {
        guard let s = stringValue(forKey: "SupabaseURL"),
              let url = URL(string: s) else {
            fatalError("AppConfig.plist missing SupabaseURL")
        }
        return url
    }()

    static let supabaseAnonKey: String = {
        guard let s = stringValue(forKey: "SupabaseAnonKey"), !s.isEmpty else {
            fatalError("AppConfig.plist missing SupabaseAnonKey")
        }
        return s
    }()

    static let universalLinkHost: String =
        stringValue(forKey: "UniversalLinkHost") ?? "www.perfectppi.com"

    static let customURLScheme: String =
        stringValue(forKey: "CustomURLScheme") ?? "perfectppi"

    /// Whether this binary carries the Sign in with Apple entitlement. CI
    /// stamps `PerfectPPIAppleSignInEnabled` from the build setting of the
    /// same name; a build without the entitlement must not offer the button
    /// (the authorization sheet would fail with an unhelpful error). Missing
    /// key means an ordinary build, which always has the entitlement.
    static let appleSignInEnabled: Bool = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "PerfectPPIAppleSignInEnabled") else {
            return true
        }
        if let flag = raw as? Bool { return flag }
        let text = (raw as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return !["NO", "FALSE", "0"].contains(text)
    }()

    private static func stringValue(forKey key: String) -> String? {
        guard let url = Bundle.main.url(forResource: "AppConfig", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else { return nil }
        return plist[key] as? String
    }
}
