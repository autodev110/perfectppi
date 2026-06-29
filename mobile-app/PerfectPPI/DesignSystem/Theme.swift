import SwiftUI

/// Shared colors / spacing / typography. Keep this small and aligned with
/// the web. Concrete brand values can be tuned later.
enum Theme {
    static let cornerRadius: CGFloat = 14
    static let spacing: CGFloat = 16

    enum Palette {
        static let primary = Color(red: 0.10, green: 0.46, blue: 0.95)
        static let success = Color(red: 0.10, green: 0.66, blue: 0.36)
        static let warning = Color(red: 0.96, green: 0.62, blue: 0.10)
        static let danger  = Color(red: 0.93, green: 0.27, blue: 0.27)
        static let subtle  = Color(.secondarySystemBackground)
    }
}
