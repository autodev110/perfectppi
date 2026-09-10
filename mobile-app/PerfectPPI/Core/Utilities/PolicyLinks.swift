import SwiftUI

/// Published policy and support pages (plan 4, 7.4, 31.4). The same pages
/// back the App Store support URL, so the app links to them rather than
/// carrying a second copy that could drift from what is actually shipped.
enum PolicyPage: String, CaseIterable, Identifiable {
    case support = "/support"
    case communityGuidelines = "/community-guidelines"
    case privacy = "/privacy"
    case terms = "/terms"
    case aiDisclosure = "/ai-disclosure"
    case copyright = "/copyright"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .support: "Help & Safety"
        case .communityGuidelines: "Community Guidelines"
        case .privacy: "Privacy Policy"
        case .terms: "Terms of Service"
        case .aiDisclosure: "AI Processing Disclosure"
        case .copyright: "Copyright Complaints"
        }
    }

    var systemImage: String {
        switch self {
        case .support: "lifepreserver"
        case .communityGuidelines: "checklist"
        case .privacy: "lock.shield"
        case .terms: "doc.text"
        case .aiDisclosure: "sparkles"
        case .copyright: "c.circle"
        }
    }

    var url: URL {
        URL(string: "https://\(AppConfig.universalLinkHost)\(rawValue)")!
    }
}

/// A settings row that opens a policy page in an in-app Safari sheet.
struct PolicyLinkRow: View {
    let page: PolicyPage
    @State private var presented = false

    var body: some View {
        Button {
            presented = true
        } label: {
            Label(page.title, systemImage: page.systemImage)
        }
        .sheet(isPresented: $presented) {
            SafariWebView(url: page.url)
        }
    }
}
