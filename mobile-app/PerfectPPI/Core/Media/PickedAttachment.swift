import Foundation
import Photos
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct PickedAttachment: Identifiable {
    enum Kind: Equatable {
        case image
        case video
        case file
    }

    let id = UUID()
    let data: Data
    let filename: String
    let contentType: String
    let kind: Kind

    static func cameraPhoto(_ data: Data) -> PickedAttachment {
        PickedAttachment(
            data: data,
            filename: "camera-\(UUID().uuidString).jpg",
            contentType: "image/jpeg",
            kind: .image
        )
    }
}

enum AttachmentPickerSupport {
    /// Mirrors `UPLOAD_LIMITS` on the server. Offering broader supertypes here
    /// (`.image`, `.movie`, `.content`) lets the file picker hand back formats
    /// the upload endpoint rejects with a 400.
    static let supportedFileTypes: [UTType] = {
        var types: [UTType] = [
            .jpeg, .png, .webP, .heic, .heif,
            .mpeg4Movie, .quickTimeMovie,
            .pdf, .plainText,
        ]
        types += [
            "com.microsoft.word.doc",
            "org.openxmlformats.wordprocessingml.document",
        ].compactMap { UTType($0) }
        return types
    }()

    @MainActor
    static func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    static func requestPhotoAccess() async -> PHAuthorizationStatus {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard current == .notDetermined else { return current }
        return await withCheckedContinuation { continuation in
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                continuation.resume(returning: status)
            }
        }
    }

    static func load(_ item: PhotosPickerItem) async throws -> PickedAttachment {
        guard let data = try await item.loadTransferable(type: Data.self) else {
            throw CocoaError(.fileReadCorruptFile)
        }

        let type = item.supportedContentTypes.first(where: { $0.conforms(to: .movie) })
            ?? item.supportedContentTypes.first(where: { $0.conforms(to: .image) })
            ?? .data
        let kind: PickedAttachment.Kind = type.conforms(to: .movie) ? .video : .image

        // Re-encoding selected still images removes EXIF, GPS, camera serial,
        // and other source metadata that is not needed for the attachment.
        if kind == .image, let image = UIImage(data: data), let sanitized = image.jpegData(compressionQuality: 0.9) {
            return PickedAttachment(
                data: sanitized,
                filename: "attachment-\(UUID().uuidString).jpg",
                contentType: "image/jpeg",
                kind: .image
            )
        }

        return PickedAttachment(
            data: data,
            filename: "attachment-\(UUID().uuidString).\(type.preferredFilenameExtension ?? "bin")",
            contentType: type.preferredMIMEType ?? "application/octet-stream",
            kind: kind
        )
    }

    static func loadFile(_ url: URL) throws -> PickedAttachment {
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }

        let data = try Data(contentsOf: url)
        let type = UTType(filenameExtension: url.pathExtension) ?? .data
        return PickedAttachment(
            data: data,
            filename: url.lastPathComponent,
            contentType: type.preferredMIMEType ?? "application/octet-stream",
            kind: .file
        )
    }
}
