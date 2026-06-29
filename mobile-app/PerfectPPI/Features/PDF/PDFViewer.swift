import SwiftUI
import PDFKit

/// PDFKit-backed viewer. Used for `/api/outputs/[id]/pdf` and any other PDF
/// download. Performs the network fetch through the authenticated APIClient
/// so private R2 redirects work transparently.
struct PDFViewer: View {
    let path: String

    @State private var data: Data?
    @State private var error: Error?

    var body: some View {
        Group {
            if let data {
                PDFKitView(data: data)
            } else if let error {
                ErrorView(message: error.localizedDescription) {
                    Task { await load() }
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await load() }
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func load() async {
        do {
            let (bytes, _) = try await APIClient.shared.bytes(path)
            self.data = bytes
            self.error = nil
        } catch {
            self.error = error
        }
    }
}

private struct PDFKitView: UIViewRepresentable {
    let data: Data

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.document = PDFDocument(data: data)
        return view
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        uiView.document = PDFDocument(data: data)
    }
}
