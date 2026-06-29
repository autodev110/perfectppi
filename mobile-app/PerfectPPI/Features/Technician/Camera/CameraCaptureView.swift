import SwiftUI
@preconcurrency import AVFoundation
import PhotosUI

/// AVFoundation-based capture screen, mirroring the web's
/// `CameraCapture` component. Returns the captured JPEG bytes to a callback.
struct CameraCaptureView: View {
    let prompt: String?
    var onCapture: (Data) -> Void
    var onCancel: () -> Void

    @StateObject private var camera = CameraController()
    @State private var preview: UIImage?
    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let preview {
                previewView(image: preview)
            } else if camera.permissionDenied || camera.cameraUnavailable {
                fallback(reason: camera.permissionDenied
                         ? "Camera permission denied."
                         : "No camera available on this device.")
            } else {
                CameraPreviewLayerView(session: camera.session)
                    .ignoresSafeArea()
                cameraOverlay
            }
        }
        .task {
            await camera.start()
        }
        .onDisappear {
            camera.stop()
        }
        .statusBarHidden()
    }

    // MARK: - Live camera UI

    @ViewBuilder
    private var cameraOverlay: some View {
        VStack {
            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(.white)
                        .background(.black.opacity(0.5))
                        .clipShape(Circle())
                }
                if let prompt {
                    Text(prompt)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.5))
                        .clipShape(Capsule())
                }
                Spacer()
                Button {
                    camera.flip()
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath.camera")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(.white)
                        .background(.black.opacity(0.5))
                        .clipShape(Circle())
                }
            }
            .padding()

            Spacer()

            HStack(spacing: 32) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Image(systemName: "photo.on.rectangle")
                        .font(.title2)
                        .frame(width: 56, height: 56)
                        .foregroundStyle(.white)
                        .background(.black.opacity(0.5))
                        .clipShape(Circle())
                }
                .onChange(of: pickerItem) { _, item in
                    Task { await loadPickedImage(item) }
                }

                Button {
                    Task { await capture() }
                } label: {
                    Circle()
                        .strokeBorder(.white, lineWidth: 4)
                        .frame(width: 80, height: 80)
                        .overlay {
                            Circle()
                                .fill(.white)
                                .frame(width: 64, height: 64)
                        }
                }
                .disabled(!camera.isReady || camera.isCapturing)
                .opacity(camera.isReady && !camera.isCapturing ? 1 : 0.5)

                Color.clear.frame(width: 56, height: 56)
            }
            .padding(.bottom, 36)
        }
    }

    @ViewBuilder
    private func previewView(image: UIImage) -> some View {
        VStack(spacing: 0) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()

            HStack(spacing: 24) {
                Button("Retake") {
                    preview = nil
                }
                .buttonStyle(OutlineButtonStyle())
                .tint(.white)

                Button("Use Photo") {
                    if let data = image.jpegData(compressionQuality: 0.9) {
                        onCapture(data)
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding()
        }
    }

    @ViewBuilder
    private func fallback(reason: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "camera")
                .font(.largeTitle)
                .foregroundStyle(.white.opacity(0.5))
            Text(reason)
                .foregroundStyle(.white.opacity(0.7))
            PhotosPicker(selection: $pickerItem, matching: .images) {
                Text("Choose Photo")
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 40)
            .onChange(of: pickerItem) { _, item in
                Task { await loadPickedImage(item) }
            }
            Button("Close", action: onCancel)
                .foregroundStyle(.white)
        }
        .padding()
    }

    private func capture() async {
        guard let image = await camera.capturePhoto() else { return }
        self.preview = image
    }

    private func loadPickedImage(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        self.preview = image
    }
}

// MARK: - UIKit bridge

private struct CameraPreviewLayerView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.videoPreviewLayer.session = session
        v.videoPreviewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        uiView.videoPreviewLayer.session = session
    }
}

private final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var videoPreviewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}

// MARK: - Capture controller

@MainActor
final class CameraController: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate {
    @Published var permissionDenied = false
    @Published var cameraUnavailable = false
    @Published var isReady = false
    @Published var isCapturing = false

    // AVCaptureSession and friends are not Sendable and must be configured and
    // mutated on a single serial queue (never the main thread, since
    // `startRunning()` blocks). These live off the actor; `sessionQueue` — not
    // the main actor — is what serializes access to them, which is exactly the
    // synchronization `nonisolated(unsafe)` asserts we are providing.
    nonisolated(unsafe) let session = AVCaptureSession()
    nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    nonisolated(unsafe) private var currentInput: AVCaptureDeviceInput?
    private let sessionQueue = DispatchQueue(label: "com.perfectppi.camera.session")

    private var position: AVCaptureDevice.Position = .back
    private var captureContinuation: CheckedContinuation<UIImage?, Never>?

    func start() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            if !granted {
                permissionDenied = true
                return
            }
        case .denied, .restricted:
            permissionDenied = true
            return
        case .authorized:
            break
        @unknown default:
            permissionDenied = true
            return
        }

        await configureSession(position: .back)
    }

    func stop() {
        sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    func flip() {
        position = position == .back ? .front : .back
        Task { await configureSession(position: position) }
    }

    func capturePhoto() async -> UIImage? {
        guard captureContinuation == nil, !isCapturing else { return nil }
        isCapturing = true
        return await withCheckedContinuation { cont in
            captureContinuation = cont
            sessionQueue.async { [photoOutput] in
                let settings = AVCapturePhotoSettings()
                photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        // Extract the bytes here (off the main actor) so only Sendable `Data`
        // crosses the isolation boundary, never the non-Sendable AVCapturePhoto.
        let data = photo.fileDataRepresentation()
        Task { @MainActor in
            defer {
                self.captureContinuation = nil
                self.isCapturing = false
            }
            if let data, let image = UIImage(data: data) {
                self.captureContinuation?.resume(returning: image)
            } else {
                self.captureContinuation?.resume(returning: nil)
            }
        }
    }

    private func configureSession(position: AVCaptureDevice.Position) async {
        isReady = false
        cameraUnavailable = false

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            sessionQueue.async { [self] in
                session.beginConfiguration()

                // Remove old input.
                if let currentInput {
                    session.removeInput(currentInput)
                }

                guard let device = AVCaptureDevice.default(
                    .builtInWideAngleCamera,
                    for: .video,
                    position: position
                ),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else {
                    session.commitConfiguration()
                    Task { @MainActor in self.cameraUnavailable = true }
                    continuation.resume()
                    return
                }
                session.addInput(input)
                currentInput = input

                if !session.outputs.contains(photoOutput) && session.canAddOutput(photoOutput) {
                    session.addOutput(photoOutput)
                }

                if session.canSetSessionPreset(.photo) {
                    session.sessionPreset = .photo
                }

                session.commitConfiguration()

                if !session.isRunning {
                    session.startRunning()
                }

                Task { @MainActor in self.isReady = true }
                continuation.resume()
            }
        }
    }
}
