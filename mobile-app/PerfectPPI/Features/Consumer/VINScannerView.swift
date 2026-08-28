import SwiftUI
@preconcurrency import Vision
import UIKit

struct VINScannerView: View {
    @Environment(\.dismiss) private var dismiss
    let onDecoded: (VehiclesAPI.DecodedVinVehicle) -> Void

    @State private var processing = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            CameraCaptureView(
                prompt: "Fill the frame with the complete 17-character VIN",
                onCapture: { data in
                    Task { await process(data) }
                },
                onCancel: { dismiss() }
            )

            if processing {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Reading and decoding VIN...")
                        .font(.subheadline.weight(.semibold))
                }
                .padding(24)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .alert("VIN not found", isPresented: .constant(errorMessage != nil)) {
            Button("Try Again") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func process(_ imageData: Data) async {
        guard !processing else { return }
        processing = true
        defer { processing = false }

        do {
            let vin = try await VINTextRecognizer.recognize(in: imageData)
            let decoded = try await VehiclesAPI.decodeVIN(vin)
            onDecoded(decoded)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private enum VINRecognitionError: LocalizedError {
    case invalidImage
    case notFound

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            return "That image could not be read. Please take another photo."
        case .notFound:
            return "A complete VIN was not visible. Move closer, avoid glare, and include all 17 characters."
        }
    }
}

private enum VINTextRecognizer {
    static func recognize(in imageData: Data) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            guard let image = UIImage(data: imageData), let cgImage = image.cgImage else {
                throw VINRecognitionError.invalidImage
            }

            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            try handler.perform([request])

            let strings = (request.results ?? []).compactMap {
                $0.topCandidates(1).first?.string
            }
            for string in strings {
                for candidate in vinCandidates(from: string) where isValidVIN(candidate) {
                    return candidate
                }
            }

            throw VINRecognitionError.notFound
        }.value
    }

    private static func vinCandidates(from text: String) -> [String] {
        let upper = text.uppercased()
        let direct = upper.matches(of: /[A-HJ-NPR-Z0-9]{17}/).map { String($0.output) }
        let compact = upper.filter { character in
            character.isNumber || (character.isLetter && !"IOQ".contains(character))
        }
        return compact.count == 17 ? direct + [compact] : direct
    }

    private static func isValidVIN(_ vin: String) -> Bool {
        vin.wholeMatch(of: /[A-HJ-NPR-Z0-9]{17}/) != nil
    }
}
