import SwiftUI
import SafariServices

/// Wraps SFSafariViewController in a SwiftUI sheet. Used for both DocuSeal
/// signing and Stripe checkout — Apple permits these for real-world services
/// (warranty plan = vehicle service), and SFSafariView keeps cookies isolated.
struct SafariWebView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let cfg = SFSafariViewController.Configuration()
        cfg.entersReaderIfAvailable = false
        cfg.barCollapsingEnabled = true
        let vc = SFSafariViewController(url: url, configuration: cfg)
        vc.dismissButtonStyle = .close
        vc.preferredControlTintColor = UIColor(Theme.Palette.primary)
        return vc
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
