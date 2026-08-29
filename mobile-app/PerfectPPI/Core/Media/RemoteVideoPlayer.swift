import AVKit
import SwiftUI

/// Plays a remote video. The player is built once in `init` and held in state —
/// constructing `AVPlayer(url:)` inside `body` would spin up a fresh player on
/// every re-render and restart playback.
struct RemoteVideoPlayer: View {
    @State private var player: AVPlayer

    init(url: URL) {
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        VideoPlayer(player: player)
            .onDisappear { player.pause() }
    }
}
