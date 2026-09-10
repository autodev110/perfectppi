import AVKit
import SwiftUI

/// Plays a video served by an authenticated API path (e.g. the status-aware
/// Community media endpoint). The bearer token travels in the request headers
/// via AVURLAsset options, never in the URL, so no reusable link exists.
struct SecureVideoPlayer: View {
    let path: String

    @State private var player: AVPlayer?
    @State private var failed = false

    var body: some View {
        Group {
            if let player {
                VideoPlayer(player: player)
                    .onDisappear { player.pause() }
            } else if failed {
                ZStack {
                    Color.black
                    Image(systemName: "video.slash").foregroundStyle(.white.opacity(0.6))
                }
            } else {
                ZStack {
                    Color.black
                    ProgressView().tint(.white)
                }
            }
        }
        .task(id: path) { await load() }
    }

    private func load() async {
        guard let url = APIClient.shared.absoluteURL(for: path),
              let token = await APIClient.shared.currentBearerToken() else {
            failed = true
            return
        }
        let asset = AVURLAsset(
            url: url,
            options: ["AVURLAssetHTTPHeaderFieldsKey": ["Authorization": "Bearer \(token)"]]
        )
        player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
    }
}
