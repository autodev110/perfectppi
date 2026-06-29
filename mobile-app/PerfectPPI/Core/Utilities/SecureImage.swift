import SwiftUI

/// Loads bytes from an authenticated API path (e.g. /api/ppi/media/{id}) and
/// displays them. Used so we never expose raw R2 URLs. Caches the image data
/// in-memory for the view's lifetime.
struct SecureImage: View {
    let path: String
    var contentMode: ContentMode = .fill

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if failed {
                ZStack {
                    Theme.Palette.subtle
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                }
            } else {
                ZStack {
                    Theme.Palette.subtle
                    ProgressView()
                }
            }
        }
        .task(id: path) { await load() }
    }

    private func load() async {
        do {
            let (data, _) = try await APIClient.shared.bytes(path)
            if let ui = UIImage(data: data) {
                self.image = ui
            } else {
                self.failed = true
            }
        } catch {
            self.failed = true
        }
    }
}
