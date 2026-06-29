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
        .padding(.vertical, 14)
        .foregroundStyle(.white)
        .background(Theme.Palette.primary)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
        .opacity(configuration.isPressed ? 0.85 : 1.0)
    }
}

struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(Theme.Palette.primary)
            .background(
                RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                    .stroke(Theme.Palette.primary, lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.85 : 1.0)
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
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

struct ErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
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
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}
