import SwiftUI

struct PrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if isLoading {
                ProgressView().tint(.white)
            }
            configuration.label
                .font(.headline)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .foregroundStyle(.white)
        .background(Theme.brandGradient)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
        .shadow(color: Theme.Palette.primary.opacity(configuration.isPressed ? 0.15 : 0.35),
                radius: configuration.isPressed ? 4 : 12, y: configuration.isPressed ? 2 : 6)
        .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(Theme.Palette.primary)
            .background(
                RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                    .fill(Theme.Palette.primary.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                    .stroke(Theme.Palette.primary.opacity(0.45), lineWidth: 1.5)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Soft, tinted fill button for secondary actions that still want presence.
struct SoftButtonStyle: ButtonStyle {
    var tint: Color = Theme.Palette.primary

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct AsyncContent<Value, Loaded: View, ErrorView: View>: View {
    enum LoadState {
        case loading
        case loaded(Value)
        case failed(Error)
    }

    @State private var state: LoadState = .loading

    let load: () async throws -> Value
    let loaded: (Value) -> Loaded
    let failure: (Error, @escaping () -> Void) -> ErrorView

    init(
        load: @escaping () async throws -> Value,
        @ViewBuilder loaded: @escaping (Value) -> Loaded,
        @ViewBuilder failure: @escaping (Error, @escaping () -> Void) -> ErrorView
    ) {
        self.load = load
        self.loaded = loaded
        self.failure = failure
    }

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .tint(Theme.Palette.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .loaded(let value):
                loaded(value)
            case .failed(let error):
                failure(error, { Task { await reload() } })
            }
        }
        .task { await reload() }
    }

    func reload() async {
        do {
            let v = try await load()
            state = .loaded(v)
        } catch {
            state = .failed(error)
        }
    }
}

struct StatusBadge: View {
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(text)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(color.opacity(0.14))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

struct ErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(Theme.Palette.warning.opacity(0.14))
                    .frame(width: 84, height: 84)
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.Palette.warning)
            }
            Text("Something went wrong")
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            Button("Try Again", action: retry)
                .buttonStyle(OutlineButtonStyle())
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Reusable empty-state card. Use whenever a list/section would otherwise
/// render a blank screen because the underlying API returned no rows.
/// Lives in the design system so every feature can drop it in.
struct EmptyStateCard: View {
    let title: String
    let message: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Theme.Palette.primary.opacity(0.12))
                    .frame(width: 72, height: 72)
                Image(systemName: systemImage)
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Theme.Palette.primary)
            }
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: .infinity)
        .background(Theme.Palette.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 1)
        )
        .shadow(color: Theme.Shadow.color, radius: Theme.Shadow.radius, y: Theme.Shadow.y)
    }
}

/// Modern label/value detail row rendered as an elevated card. When
/// `valueColor` is supplied, the value renders as a colored status pill —
/// ideal for "Status" rows.
struct InfoRow: View {
    let label: String
    let value: String
    var icon: String? = nil
    var valueColor: Color? = nil

    var body: some View {
        HStack(spacing: 12) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Palette.primary)
                    .frame(width: 22)
            }
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            if let valueColor {
                StatusBadge(text: value, color: valueColor)
            } else {
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .background(Theme.Palette.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 1)
        )
    }
}

/// Maps a status string (e.g. "in_progress", "completed") to a semantic tint
/// so status pills read at a glance across the app.
func statusTint(_ raw: String) -> Color {
    switch raw.lowercased() {
    case "completed", "approved", "reviewed", "active", "signed", "paid", "delivered":
        return Theme.Palette.success
    case "cancelled", "canceled", "rejected", "expired", "failed", "archived":
        return Theme.Palette.danger
    case "pending", "draft", "assigned", "in_progress", "in progress", "processing", "awaiting":
        return Theme.Palette.warning
    default:
        return Theme.Palette.primary
    }
}

/// Circular monogram avatar used across feed/profile rows.
struct Avatar: View {
    let name: String
    var size: CGFloat = 40

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Theme.brandGradient)
            .clipShape(Circle())
    }
}
