import Foundation

/// Drives the composer progress UI while attachments upload. `R2Uploader`
/// reports bytes from `URLSession`'s delegate queue, so this is the one place
/// that hops back to the main actor.
@MainActor
final class UploadProgressModel: ObservableObject {
    /// 0...1 for the item currently uploading, or nil when nothing is in flight.
    @Published private(set) var fraction: Double?
    @Published private(set) var completed = 0
    @Published private(set) var total = 0

    var isUploading: Bool { total > 0 }

    /// Human-readable state for a multi-item upload, e.g. "Uploading 2 of 5 — 40%".
    var label: String? {
        guard total > 0 else { return nil }
        let percent = Int((fraction ?? 0) * 100)
        return total == 1
            ? "Uploading… \(percent)%"
            : "Uploading \(min(completed + 1, total)) of \(total) — \(percent)%"
    }

    func begin(total: Int) {
        self.total = total
        completed = 0
        fraction = 0
    }

    func finishItem() {
        completed = min(completed + 1, total)
        fraction = 0
    }

    func reset() {
        total = 0
        completed = 0
        fraction = nil
    }

    func handler() -> R2Uploader.ProgressHandler {
        { [weak self] value in
            Task { @MainActor in self?.fraction = value }
        }
    }
}
