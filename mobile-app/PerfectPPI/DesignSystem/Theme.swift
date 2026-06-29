import SwiftUI

/// Shared design tokens — colors, spacing, radii, shadows, typography.
/// Tuned for a modern, soft-depth look (gradients + subtle shadows + generous
/// rounding). Existing names (`cornerRadius`, `spacing`, `Palette.primary`…)
/// are preserved so call sites keep working; new tokens are additive.
enum Theme {
    // Backwards-compatible defaults.
    static let cornerRadius: CGFloat = 16
    static let spacing: CGFloat = 16

    /// Granular corner-radius scale.
    enum Radius {
        static let sm: CGFloat = 10
        static let md: CGFloat = 16
        static let lg: CGFloat = 22
        static let pill: CGFloat = 999
    }

    /// 4-pt based spacing scale.
    enum Space {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
    }

    enum Palette {
        // Brand. A slightly deeper, more saturated blue reads more premium than
        // a flat system blue, and pairs with the indigo accent for gradients.
        static let primary = Color(red: 0.16, green: 0.40, blue: 0.96)
        static let primaryDeep = Color(red: 0.36, green: 0.22, blue: 0.92)
        static let accent  = Color(red: 0.55, green: 0.30, blue: 0.98)

        static let success = Color(red: 0.10, green: 0.66, blue: 0.36)
        static let warning = Color(red: 0.96, green: 0.62, blue: 0.10)
        static let danger  = Color(red: 0.93, green: 0.27, blue: 0.27)

        // Surfaces.
        static let subtle  = Color(.secondarySystemBackground)
        static let card    = Color(.secondarySystemGroupedBackground)
        static let hairline = Color.primary.opacity(0.06)
    }

    /// Diagonal brand gradient for hero elements and primary buttons.
    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [Palette.primary, Palette.primaryDeep],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Soft elevation shadow for cards and buttons.
    enum Shadow {
        static let color = Color.black.opacity(0.10)
        static let radius: CGFloat = 14
        static let y: CGFloat = 6
    }
}

/// User-selectable appearance, persisted in `UserDefaults` via `@AppStorage`
/// under the key `appAppearance`. Applied at the app root with
/// `.preferredColorScheme` and chosen from Profile → Preferences.
enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light:  return "Light"
        case .dark:   return "Dark"
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    static let storageKey = "appAppearance"
}

extension View {
    /// Wraps content in the standard elevated card surface (rounded, padded,
    /// soft shadow). Drop-in for list rows and panels that should feel modern.
    func cardSurface(padding: CGFloat = Theme.Space.md, radius: CGFloat = Theme.Radius.md) -> some View {
        self
            .padding(padding)
            .background(Theme.Palette.card)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Theme.Palette.hairline, lineWidth: 1)
            )
            .shadow(color: Theme.Shadow.color, radius: Theme.Shadow.radius, y: Theme.Shadow.y)
    }
}
