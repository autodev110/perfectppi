import ImageIO
import SwiftUI

@MainActor
private final class SecureImageCache {
    static let shared = SecureImageCache()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 80
        cache.totalCostLimit = 96 * 1_024 * 1_024
    }

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func insert(_ image: UIImage, for key: String) {
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        cache.setObject(image, forKey: key as NSString, cost: cost)
    }
}

/// Loads bytes from an authenticated API path (e.g. /api/ppi/media/{id}) and
/// displays them. Used so we never expose raw R2 URLs. Decoded images share a
/// cost-limited memory cache so recycled feed cards do not decode them again.
struct SecureImage: View {
    let path: String
    var contentMode: ContentMode = .fill
    var maxPixelSize: CGFloat = 2_048

    @State private var image: UIImage?
    @State private var failed = false

    private var cacheKey: String { "\(path)#\(Int(maxPixelSize))" }

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
        .task(id: cacheKey) { await load() }
    }

    private func load() async {
        image = nil
        failed = false

        if let cached = SecureImageCache.shared.image(for: cacheKey) {
            image = cached
            return
        }

        do {
            let (data, _) = try await APIClient.shared.bytes(path)
            try Task.checkCancellation()
            let ui = await Task.detached(priority: .utility) {
                downsampleImage(data: data, maxPixelSize: maxPixelSize)
            }.value
            try Task.checkCancellation()
            guard let ui else {
                failed = true
                return
            }
            SecureImageCache.shared.insert(ui, for: cacheKey)
            image = ui
        } catch is CancellationError {
            // SwiftUI cancels the task when a card scrolls off-screen.
        } catch {
            failed = true
        }
    }
}

private nonisolated func downsampleImage(data: Data, maxPixelSize: CGFloat) -> UIImage? {
    guard maxPixelSize > 0,
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
              kCGImageSourceShouldCacheImmediately: true,
          ] as CFDictionary) else {
        return nil
    }
    return UIImage(cgImage: cgImage)
}
