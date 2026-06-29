import SwiftUI

/// Guided multi-section inspection screen, mirroring
/// `src/components/shared/inspection-workflow-view.tsx`.
///
/// Loads sections + answers + media for the submission, lets the technician
/// step through one question at a time, supports per-question photo capture,
/// queues changes offline if the network is down, then submits at the end.
struct InspectionWorkflowView: View {
    let submissionId: String

    @StateObject private var model = InspectionWorkflowModel()
    @State private var showCamera = false
    @State private var showOBDScanner = false
    @State private var submitting = false
    @State private var showSubmittedAlert = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if model.loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = model.loadError {
                ErrorView(message: error.localizedDescription) {
                    Task { await model.load(submissionId: submissionId) }
                }
            } else if let section = model.currentSection,
                      let answer = model.currentAnswer {
                workflowBody(section: section, answer: answer)
            } else {
                EmptyStateCard(
                    title: "No questions to answer",
                    message: "This inspection has no questions configured. If you think that's wrong, contact support — otherwise tap Submit to mark the inspection complete.",
                    systemImage: "questionmark.folder"
                )
                .padding()
            }
        }
        .navigationTitle("Inspection")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(submissionId: submissionId) }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCaptureView(
                prompt: model.currentPrompt,
                onCapture: { data in
                    showCamera = false
                    Task { await capture(data) }
                },
                onCancel: { showCamera = false }
            )
        }
        .sheet(isPresented: $showOBDScanner) {
            NavigationStack {
                OBDScannerView(submissionId: submissionId) { snapshot in
                    model.setOBDSnapshot(snapshot)
                    showOBDScanner = false
                }
            }
        }
        .alert("Inspection submitted", isPresented: $showSubmittedAlert) {
            Button("OK", role: .cancel) {}
        }
        .alert("Error", isPresented: .constant(errorMessage != nil),
               actions: { Button("OK") { errorMessage = nil } },
               message: { Text(errorMessage ?? "") })
    }

    @ViewBuilder
    private func workflowBody(section: PpiSection, answer: PpiAnswer) -> some View {
        VStack(spacing: 0) {
            progressHeader

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.spacing) {
                    Text(section.sectionType.rawValue
                            .replacingOccurrences(of: "_", with: " ")
                            .capitalized)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)

                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(answer.prompt)
                            .font(.title3.bold())
                        if answer.isRequired == true {
                            Text("*")
                                .font(.title3.bold())
                                .foregroundStyle(Theme.Palette.danger)
                        }
                    }

                    AnswerEditor(answer: answer) { updated in
                        Task { await model.upsertAnswer(updated) }
                    }
                    .id(answer.id)

                    photosGrid

                    if model.currentRequiresPhoto && !model.currentHasRequiredPhoto {
                        Label("Photo required for this question", systemImage: "camera.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.Palette.warning)
                    }

                    Button {
                        showCamera = true
                    } label: {
                        Label("Capture Photo", systemImage: "camera")
                    }
                    .buttonStyle(OutlineButtonStyle())

                    if model.atLast {
                        obdDiagnosticsCard
                    }
                }
                .padding()
            }

            navBar
        }
    }

    @ViewBuilder
    private var obdDiagnosticsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "waveform.path.ecg")
                    .foregroundStyle(Theme.Palette.primary)
                Text("OBD Diagnostics")
                    .font(.headline)
                Spacer()
                if model.currentOBDSnapshot != nil {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Theme.Palette.success)
                }
            }

            if let snapshot = model.currentOBDSnapshot {
                Text(snapshot.summaryLine)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let completedAt = snapshot.completedAt ?? snapshot.createdAt {
                    Text(completedAt, style: .date)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if OfflineQueue.shared.pendingOBDSnapshots.contains(where: { $0.submissionId == submissionId }) {
                Label("Queued for sync", systemImage: "icloud.and.arrow.up")
                    .font(.footnote)
                    .foregroundStyle(Theme.Palette.warning)
            } else {
                Text("No OBD snapshot saved")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button {
                showOBDScanner = true
            } label: {
                Label(model.currentOBDSnapshot == nil ? "Scan OBD" : "Re-scan OBD",
                      systemImage: "dot.radiowaves.left.and.right")
            }
            .buttonStyle(OutlineButtonStyle())
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var progressHeader: some View {
        VStack(spacing: 8) {
            ProgressView(value: Double(model.progressIndex),
                         total: Double(max(model.progressTotal, 1)))
                .tint(Theme.Palette.primary)

            HStack {
                Text("Question \(model.progressIndex + 1) of \(model.progressTotal)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
                if !OfflineQueue.shared.isOnline {
                    Label("Offline", systemImage: "icloud.slash")
                        .font(.footnote)
                        .foregroundStyle(Theme.Palette.warning)
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var photosGrid: some View {
        let photos = model.media(for: model.currentAnswer?.id)
        if !photos.isEmpty {
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                ForEach(photos) { media in
                    // Constrain each cell to a definite 4:3 box sized to the
                    // column width. Without this bounding frame the fill-mode
                    // image overflows its cell and the thumbnails overlap.
                    Color.clear
                        .aspectRatio(4/3, contentMode: .fit)
                        .overlay {
                            SecureImage(path: "/api/ppi/media/\(media.id)")
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    @ViewBuilder
    private var navBar: some View {
        HStack {
            Button {
                model.previous()
            } label: {
                Label("Back", systemImage: "chevron.left")
            }
            .disabled(model.atFirst)

            Spacer()

            if model.atLast {
                Button {
                    Task { await submit() }
                } label: {
                    Text(submitting ? "Submitting…" : "Submit")
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: submitting))
                .frame(maxWidth: 200)
                .disabled(submitting || !model.canAdvance)
            } else {
                Button {
                    model.next()
                } label: {
                    Label("Next", systemImage: "chevron.right")
                }
                .disabled(!model.canAdvance)
            }
        }
        .padding()
        .background(.bar)
    }

    private func capture(_ data: Data) async {
        let captured = Date()
        guard let section = model.currentSection,
              let answer = model.currentAnswer else { return }

        let filename = "capture-\(Int(captured.timeIntervalSince1970)).jpg"

        // If online, upload now; if offline, save to disk and enqueue.
        if OfflineQueue.shared.isOnline {
            do {
                let url = try await R2Uploader.upload(
                    data: data,
                    filename: filename,
                    contentType: "image/jpeg",
                    entity: "ppi_media",
                    recordId: submissionId
                )
                let media = try await PpiAPI.attachMedia(
                    submissionId: submissionId,
                    payload: AttachMediaRequest(
                        ppiSectionId: section.id,
                        ppiAnswerId: answer.id,
                        url: url,
                        mediaType: "image",
                        capturedAt: captured
                    )
                )
                model.addMedia(media)
            } catch {
                errorMessage = error.localizedDescription
            }
        } else {
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try? data.write(to: tmp)
            OfflineQueue.shared.enqueueMedia(.init(
                id: UUID().uuidString,
                submissionId: submissionId,
                sectionId: section.id,
                answerId: answer.id,
                localFileURL: tmp,
                filename: filename,
                contentType: "image/jpeg",
                capturedAt: captured
            ))
            model.markLocalPhoto(answerId: answer.id)
        }
    }

    private func submit() async {
        guard !submitting else { return }
        if let message = model.missingRequirementMessage {
            errorMessage = message
            model.jumpToFirstMissingRequirement()
            return
        }
        submitting = true
        defer { submitting = false }
        do {
            await OfflineQueue.shared.drain()
            guard !hasPendingOfflineItemsForSubmission else {
                errorMessage = OfflineQueue.shared.isOnline
                    ? "Please wait for saved answers and photos to finish syncing before submitting."
                    : "Reconnect to the internet so saved answers and photos can sync before submitting."
                return
            }
            _ = try await PpiAPI.submit(submissionId: submissionId)
            showSubmittedAlert = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private var hasPendingOfflineItemsForSubmission: Bool {
        return OfflineQueue.shared.pendingAnswers.contains { $0.submissionId == submissionId } ||
        OfflineQueue.shared.pendingMedia.contains { $0.submissionId == submissionId } ||
        OfflineQueue.shared.pendingOBDSnapshots.contains { $0.submissionId == submissionId }
    }
}
