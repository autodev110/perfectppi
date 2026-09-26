import SwiftUI
import UIKit

/// Guided multi-section inspection screen, mirroring
/// `src/components/shared/inspection-workflow-view.tsx`.
///
/// Loads sections + answers + media for the submission, lets the technician
/// step through one question at a time, supports per-question photo capture,
/// queues changes offline if the network is down, then submits at the end.
struct InspectionWorkflowView: View {
    private enum ScannerEntryChoice {
        case withScanner
        case withoutScanner
    }

    private enum FullScreenDestination: String, Identifiable {
        case inspectionPhoto
        case vinScanner

        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss

    let submissionId: String
    let onSubmitted: () -> Void

    init(submissionId: String, onSubmitted: @escaping () -> Void = {}) {
        self.submissionId = submissionId
        self.onSubmitted = onSubmitted
    }

    @StateObject private var model = InspectionWorkflowModel()
    @ObservedObject private var offlineQueue = OfflineQueue.shared
    @State private var fullScreenDestination: FullScreenDestination?
    @State private var showOBDScanner = false
    @State private var submitting = false
    @State private var showSubmittedAlert = false
    @State private var errorMessage: String?
    @State private var pendingPhotoDeletion: PpiMedia?
    @State private var deletingPhotoId: String?
    @State private var scannerEntryChoice: ScannerEntryChoice?
    @State private var recentlyUploadedMediaIds: Set<String> = []
    /// The row a camera capture belongs to (a step can hold several rows).
    @State private var captureAnswerId: String?
    @State private var showReview = false
    @State private var readingTirePhotos = false
    @State private var tirePhotoOutcomes: [PpiAPI.TirePhotoReadOutcome] = []
    @State private var tireFillVersion = 0

    var body: some View {
        Group {
            if model.loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = model.loadError {
                ErrorView(message: error.localizedDescription) {
                    Task { await model.load(submissionId: submissionId) }
                }
            } else if shouldPromptForScannerAtStart {
                scannerEntryView
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
        .onChange(of: offlineQueue.mediaSyncRevision) { _, _ in
            Task { await model.refreshMedia() }
        }
        .fullScreenCover(item: $fullScreenDestination) { destination in
            switch destination {
            case .inspectionPhoto:
                CameraCaptureView(
                    prompt: model.answers.first(where: { $0.id == captureAnswerId })?.photoPrompt ?? model.currentPrompt,
                    onCapture: { data in
                        fullScreenDestination = nil
                        Task { await capture(data) }
                    },
                    onCancel: { fullScreenDestination = nil }
                )
            case .vinScanner:
                VINScannerView { decoded in
                    guard let answer = model.currentStepAnswers.first(where: { $0.prompt == "Confirm the VIN on the vehicle" }) ?? model.currentAnswer else { return }
                    Task {
                        do {
                            try await model.upsertAnswer(.init(answerId: answer.id, value: decoded.vin))
                        } catch {
                            errorMessage = saveFailureMessage(error, fallback: "The VIN could not be saved offline. Please try again.")
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showOBDScanner) {
            NavigationStack {
                OBDScannerView(
                    submissionId: submissionId,
                    scanDepth: model.inspectionScope == .dentsTires ? .vinOnly : .full
                ) { snapshot in
                    if let snapshot {
                        model.setOBDSnapshot(snapshot)
                    }
                    scannerEntryChoice = .withScanner
                    showOBDScanner = false
                }
            }
        }
        .confirmationDialog(
            "Delete this photo?",
            isPresented: .init(
                get: { pendingPhotoDeletion != nil },
                set: { if !$0 { pendingPhotoDeletion = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete Photo", role: .destructive) {
                if let media = pendingPhotoDeletion {
                    pendingPhotoDeletion = nil
                    Task { await deletePhoto(media) }
                }
            }
            Button("Cancel", role: .cancel) { pendingPhotoDeletion = nil }
        } message: {
            Text("This removes the photo from the inspection. It cannot be undone.")
        }
        .sheet(isPresented: $showReview) {
            NavigationStack {
                InspectionReviewView(
                    model: model,
                    submissionId: submissionId,
                    onJump: { answerId in
                        showReview = false
                        model.jump(toAnswerId: answerId)
                    },
                    onSubmitted: {
                        showReview = false
                        onSubmitted()
                        showSubmittedAlert = true
                    }
                )
            }
        }
        .alert("Inspection submitted", isPresented: $showSubmittedAlert) {
            Button("Done") { dismiss() }
        }
        .alert("Error", isPresented: .constant(errorMessage != nil),
               actions: { Button("OK") { errorMessage = nil } },
               message: { Text(errorMessage ?? "") })
    }

    @ViewBuilder
    private func workflowBody(section: PpiSection, answer: PpiAnswer) -> some View {
        let tirePhotoStep = StructuredKey.parse(answer.questionKey)?.stepGroupId == "tires:photos"
        VStack(spacing: 0) {
            progressHeader

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.spacing) {
                    obdDiagnosticsCard

                    Text(section.sectionType.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)

                    if let title = model.currentStepTitle {
                        Text(title)
                            .font(.title3.bold())
                        if StructuredKey.parse(answer.questionKey)?.corner != nil {
                            Text("Work around the car front left → rear left → rear right → front right. Left and right are as seen from the driver's seat.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if model.currentWasSkipped {
                        Label("Skipped earlier", systemImage: "clock.arrow.circlepath")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.Palette.warning)
                    }

                    if tirePhotoStep {
                        tirePhotosReader
                    }

                    let unansweredPanels = model.currentStepAnswers.filter {
                        StructuredKey.parse($0.questionKey)?.family == .bodyPanel && $0.isRequired == true && $0.observation == nil
                    }
                    if !unansweredPanels.isEmpty {
                        Button {
                            for panel in unansweredPanels {
                                save(panel, observation: Observation.observed(["condition": .string("no_visible_damage")]))
                            }
                        } label: {
                            Text("Mark the \(unansweredPanels.count) unanswered panel(s) here as no visible damage")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(OutlineButtonStyle())
                    }

                    ForEach(model.currentStepAnswers) { stepAnswer in
                        if tirePhotoStep,
                           let key = StructuredKey.parse(stepAnswer.questionKey),
                           key.family == .tireSidewall,
                           let corner = key.corner {
                            Text(corner.label.uppercased())
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                                .padding(.top, 4)
                        }
                        answerBlock(stepAnswer, grouped: model.currentStepTitle != nil, tirePhotoStep: tirePhotoStep)
                    }
                }
                .padding()
            }

            navBar
        }
    }

    @ViewBuilder
    private func answerBlock(_ answer: PpiAnswer, grouped: Bool, tirePhotoStep: Bool) -> some View {
        let structuredKey = StructuredKey.parse(answer.questionKey)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(answer.prompt)
                    .font(grouped ? .headline : .title3.bold())
                if answer.isRequired == true {
                    Text("*")
                        .font(.title3.bold())
                        .foregroundStyle(Theme.Palette.danger)
                }
            }

            if answer.answerType.isStructured {
                StructuredAnswerEditor(
                    answer: answer,
                    submissionId: submissionId,
                    performerMode: model.performerMode,
                    latestPhotoId: model.media(for: answer.id).last?.id,
                    hidePhotoSuggestion: tirePhotoStep
                ) { observation in
                    save(answer, observation: observation)
                }
                .id("\(answer.id):\(tirePhotoStep ? tireFillVersion : 0)")
            } else {
                AnswerEditor(answer: answer) { updated in
                    Task {
                        do {
                            try await model.upsertAnswer(updated)
                        } catch {
                            errorMessage = saveFailureMessage(error, fallback: "This answer could not be saved offline. Please try again.")
                        }
                    }
                }
                .id(answer.id)
            }

            if answer.prompt == "Confirm the VIN on the vehicle" {
                Button {
                    fullScreenDestination = .vinScanner
                } label: {
                    Label(
                        (answer.answerValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? "Scan VIN"
                            : "Rescan VIN",
                        systemImage: "camera.viewfinder"
                    )
                }
                .buttonStyle(OutlineButtonStyle())
            }

            photosGrid(for: answer.id)

            if model.needsPhoto(answer) {
                Label("Photo required for this question", systemImage: "camera.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.Palette.warning)
            }

            if !(tirePhotoStep && structuredKey?.family == .tireDot) {
                Button {
                    captureAnswerId = answer.id
                    fullScreenDestination = .inspectionPhoto
                } label: {
                    Label(tireCaptureLabel(for: structuredKey) ?? answer.photoPrompt ?? String(localized: "Capture Photo"), systemImage: "camera")
                }
                .buttonStyle(OutlineButtonStyle())
            }
        }
        .padding(grouped ? 12 : 0)
        .overlay {
            if grouped {
                RoundedRectangle(cornerRadius: 14).stroke(Color.secondary.opacity(0.25))
            }
        }
    }

    @ViewBuilder
    private var tirePhotosReader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Photograph the door placard and each tire sidewall, including its DOT code. Add as many close-up photos as needed, then read them together to fill the details below.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Button {
                Task { await readAllTirePhotos() }
            } label: {
                HStack {
                    if readingTirePhotos { ProgressView().tint(.white) }
                    Label(
                        readingTirePhotos ? "Reading photos…" : "Read photos and fill in details",
                        systemImage: "text.viewfinder"
                    )
                    .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(readingTirePhotos || tirePhotoCount == 0)

            if tirePhotoCount == 0 {
                Text("Add at least one placard or sidewall photo first.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(tirePhotoOutcomes) { outcome in
                tirePhotoOutcome(outcome)
            }
        }
        .padding(12)
        .background(Theme.Palette.subtle, in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func tirePhotoOutcome(_ outcome: PpiAPI.TirePhotoReadOutcome) -> some View {
        if let error = outcome.error {
            Label("\(outcome.slot.label): \(error)", systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.Palette.warning)
                .font(.footnote)
        } else if let result = outcome.result {
            if result.photoCount == 0 {
                Text("\(outcome.slot.label): no photos yet.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                let filled = result.answers.flatMap(\.filled)
                if !filled.isEmpty {
                    Label(
                        "\(outcome.slot.label) filled: \(filled.map(tireFieldLabel).joined(separator: ", "))",
                        systemImage: "checkmark.circle.fill"
                    )
                    .foregroundStyle(Theme.Palette.success)
                    .font(.footnote)
                }
                ForEach(result.answers, id: \.answerId) { answer in
                    ForEach(answer.conflicts, id: \.field) { conflict in
                        let values = conflict.read.map(\.value).joined(separator: " / ")
                        Label(
                            conflict.entered.map {
                                "\(outcome.slot.label), \(tireFieldLabel(conflict.field)): photos show \(values), but you entered \($0). Check the value."
                            } ?? "\(outcome.slot.label), \(tireFieldLabel(conflict.field)): photos disagree (\(values)). Check and enter the correct value.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(Theme.Palette.warning)
                        .font(.footnote)
                    }
                    if answer.kept != nil {
                        Text("\(outcome.slot.label): kept your answer that this could not be checked.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let error = answer.error {
                        Label("\(outcome.slot.label): \(error)", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.Palette.warning)
                            .font(.footnote)
                    }
                }
                if !result.readings.contains(where: { $0.status == "extracted" }) {
                    Label(
                        "\(outcome.slot.label): the photos could not be read. Take a closer photo or enter the details.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(Theme.Palette.warning)
                    .font(.footnote)
                } else if filled.isEmpty && result.answers.allSatisfy({ $0.conflicts.isEmpty && $0.error == nil }) {
                    Text("\(outcome.slot.label): nothing new to fill in.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func readAllTirePhotos() async {
        guard !readingTirePhotos else { return }
        readingTirePhotos = true
        defer { readingTirePhotos = false }
        tirePhotoOutcomes = await model.readTirePhotos()
        if tirePhotoOutcomes.contains(where: { $0.result != nil }) {
            tireFillVersion &+= 1
        }
    }

    private var tirePhotoCount: Int {
        let ids = Set(model.currentStepAnswers.map(\.id))
        let saved = model.allMedia.filter { media in
            media.mediaType == "image" && media.ppiAnswerId.map(ids.contains) == true
        }.count
        let queued = offlineQueue.pendingMedia.filter { pending in
            pending.submissionId == submissionId && pending.answerId.map(ids.contains) == true
        }.count
        return saved + queued
    }

    private func tireCaptureLabel(for key: StructuredKey?) -> String? {
        guard key?.family == .tireSidewall, let corner = key?.corner else { return nil }
        switch corner {
        case .frontLeft: return String(localized: "Add front left sidewall & DOT photos")
        case .frontRight: return String(localized: "Add front right sidewall & DOT photos")
        case .rearLeft: return String(localized: "Add rear left sidewall & DOT photos")
        case .rearRight: return String(localized: "Add rear right sidewall & DOT photos")
        }
    }

    private func tireFieldLabel(_ field: String) -> String {
        switch field {
        case "size": return String(localized: "Size")
        case "load_index": return String(localized: "Load index")
        case "speed_rating": return String(localized: "Speed rating")
        case "brand": return String(localized: "Brand")
        case "model": return String(localized: "Model")
        case "extra_marking": return String(localized: "XL / LT marking")
        case "code": return String(localized: "DOT date code")
        case "front_size": return String(localized: "Front size")
        case "front_pressure": return String(localized: "Front pressure")
        case "rear_size": return String(localized: "Rear size")
        case "rear_pressure": return String(localized: "Rear pressure")
        case "unit": return String(localized: "Pressure unit")
        default: return field
        }
    }

    private func save(_ answer: PpiAnswer, observation: JSONValue?) {
        Task {
            do {
                try await model.upsertAnswer(.init(
                    answerId: answer.id,
                    value: "",
                    observation: observation ?? .null
                ))
            } catch {
                errorMessage = saveFailureMessage(error, fallback: "This answer could not be saved offline. Please try again.")
            }
        }
    }

    @ViewBuilder
    private var scannerEntryView: some View {
        VStack(spacing: Theme.spacing) {
            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.title2)
                        .foregroundStyle(Theme.Palette.primary)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(isVinOnlyScan ? "Read the VIN From the Adapter?" : "Start With a Scanner?")
                            .font(.title3.bold())
                        Text("Swift can connect to the OBD adapter over Bluetooth before the inspection begins.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(isVinOnlyScan
                     ? "A Dents & Tires inspection uses the adapter only to identify the vehicle. We'll read the VIN and nothing else."
                     : "If you scan now, we'll save the VIN and diagnostic trouble codes with this inspection and use them in the generated AI report.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 8) {
                    if isVinOnlyScan {
                        Label("Read the VIN straight off the vehicle", systemImage: "checkmark.circle.fill")
                        Label("No trouble codes or emissions data are read", systemImage: "checkmark.circle.fill")
                    } else {
                        Label("Pull check-engine and pending codes up front", systemImage: "checkmark.circle.fill")
                        Label("Save the OBD VIN with the inspection", systemImage: "checkmark.circle.fill")
                        Label("Use scanner data in the final report and warranty analysis", systemImage: "checkmark.circle.fill")
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Button {
                    showOBDScanner = true
                } label: {
                    Label(isVinOnlyScan ? "Read VIN" : "Use Scanner",
                          systemImage: "dot.radiowaves.left.and.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())

                Button {
                    scannerEntryChoice = .withoutScanner
                } label: {
                    Text("Proceed Without Scanner")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(OutlineButtonStyle())
            }
            .padding()
            .background(Theme.Palette.subtle)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
            .padding()

            Spacer(minLength: 0)
        }
    }

    private var isVinOnlyScan: Bool { model.inspectionScope == .dentsTires }

    @ViewBuilder
    private var obdDiagnosticsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: isVinOnlyScan ? "barcode.viewfinder" : "waveform.path.ecg")
                    .foregroundStyle(Theme.Palette.primary)
                Text(isVinOnlyScan ? "Vehicle Identification" : "OBD Diagnostics")
                    .font(.headline)
                Spacer()
                if model.currentOBDSnapshot != nil {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Theme.Palette.success)
                }
            }

            if let snapshot = model.currentOBDSnapshot {
                if let vin = snapshot.vin, !vin.isEmpty {
                    ResultLine(label: "VIN", value: vin)
                }
                if !isVinOnlyScan {
                    ResultLine(
                        label: "Check Engine",
                        value: snapshot.milOn == nil ? "Unknown" : (snapshot.milOn == true ? "On" : "Off")
                    )
                    if !snapshot.storedDtcs.isEmpty {
                        ResultLine(label: "Stored Codes", value: snapshot.storedDtcs.joined(separator: ", "))
                    }
                    if !snapshot.pendingDtcs.isEmpty {
                        ResultLine(label: "Pending Codes", value: snapshot.pendingDtcs.joined(separator: ", "))
                    }
                    Text(snapshot.summaryLine)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
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
                Text(scannerEntryChoice == .withoutScanner
                     ? "Inspection started without a scanner. You can add one any time."
                     : (isVinOnlyScan ? "No adapter VIN saved" : "No OBD snapshot saved"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button {
                showOBDScanner = true
            } label: {
                Label(
                    isVinOnlyScan
                        ? (model.currentOBDSnapshot == nil ? "Read VIN" : "Read VIN Again")
                        : (model.currentOBDSnapshot == nil ? "Scan Vehicle" : "Re-scan Vehicle"),
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
    private func photosGrid(for answerId: String) -> some View {
        let photos = model.media(for: answerId)
        let pending = offlineQueue.pendingMedia.filter {
            $0.submissionId == submissionId && $0.answerId == answerId
        }
        if !photos.isEmpty || !pending.isEmpty {
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                ForEach(pending) { upload in
                    PendingInspectionPhotoTile(
                        upload: upload,
                        progress: offlineQueue.mediaUploadProgress[upload.id],
                        error: offlineQueue.mediaUploadErrors[upload.id],
                        isUploading: offlineQueue.isMediaUploading(id: upload.id),
                        onRetry: { Task { await retryPhoto(upload) } },
                        onRemove: { Task { await removePendingPhoto(upload) } }
                    )
                }
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
                        .overlay(alignment: .topTrailing) {
                            Button {
                                pendingPhotoDeletion = media
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 24, height: 24)
                                    .background(.black.opacity(0.6), in: Circle())
                            }
                            .buttonStyle(.plain)
                            .padding(6)
                            .disabled(deletingPhotoId == media.id)
                            .accessibilityLabel("Delete photo")
                        }
                        .overlay(alignment: .bottomLeading) {
                            if recentlyUploadedMediaIds.contains(media.id) {
                                Label("Uploaded", systemImage: "checkmark.circle.fill")
                                    .font(.caption.bold())
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(.black.opacity(0.7), in: Capsule())
                                    .padding(6)
                                    .transition(.opacity)
                            }
                        }
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

            if model.canSkipCurrent {
                Button("Skip for now") {
                    Task {
                        do {
                            try await model.skipCurrent()
                        } catch {
                            errorMessage = saveFailureMessage(error, fallback: "This skipped answer could not be saved offline. Please try again.")
                        }
                    }
                }
                .foregroundStyle(.secondary)
            }

            if model.atLast {
                Button {
                    Task { await openReview() }
                } label: {
                    Text(submitting ? "Preparing…" : "Review & submit")
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: submitting))
                .frame(maxWidth: 220)
                .disabled(submitting)
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

    private func deletePhoto(_ media: PpiMedia) async {
        guard deletingPhotoId == nil else { return }
        deletingPhotoId = media.id
        defer { deletingPhotoId = nil }
        do {
            try await model.deleteMedia(media)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func capture(_ data: Data) async {
        let captured = Date()
        guard let answer = model.answers.first(where: { $0.id == captureAnswerId }) ?? model.currentAnswer,
              let section = model.sections.first(where: { $0.id == answer.ppiSectionId }) else { return }

        let filename = "capture-\(Int(captured.timeIntervalSince1970)).jpg"

        let uploadId = UUID().uuidString
        do {
            let stored = try offlineQueue.persistMedia(data, filename: filename)
            do {
                try offlineQueue.enqueueMedia(.init(
                    id: uploadId,
                    submissionId: submissionId,
                    sectionId: section.id,
                    answerId: answer.id,
                    localFileURL: stored,
                    filename: filename,
                    contentType: "image/jpeg",
                    capturedAt: captured
                ))
            } catch {
                try? FileManager.default.removeItem(at: stored)
                throw error
            }
            model.markLocalPhoto(answerId: answer.id)
            if offlineQueue.isOnline {
                await retryPhoto(id: uploadId)
            }
        } catch {
            errorMessage = "The photo could not be saved for upload. Please try again."
        }
    }

    private func retryPhoto(_ upload: OfflineQueue.PendingMedia) async {
        await retryPhoto(id: upload.id)
    }

    private func retryPhoto(id: String) async {
        do {
            let media = try await offlineQueue.retryMedia(id: id)
            model.addMedia(media)
            recentlyUploadedMediaIds.insert(media.id)
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(2))
                recentlyUploadedMediaIds.remove(media.id)
            }
        } catch {
            // The tile retains the exact safe error. Keep the section-level
            // alert concise so the user knows where to act.
            errorMessage = "Photo upload failed. Review the photo tile to retry or remove it."
        }
    }

    private func removePendingPhoto(_ upload: OfflineQueue.PendingMedia) async {
        do {
            try await offlineQueue.removeMedia(id: upload.id)
            if let answerId = upload.answerId {
                model.clearLocalPhotoIfNeeded(answerId: answerId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Syncs everything, reloads the stored copy, then shows the review and
    /// certification sheet. Submission itself happens from the sheet.
    private func openReview() async {
        guard !submitting else { return }
        submitting = true
        defer { submitting = false }
        let queue = OfflineQueue.shared
        await queue.drain()

        // Answers saved offline that the server refused: say why, reload the
        // stored copy and open the first one so it can be answered again.
        let rejected = queue.rejectedAnswers.filter { $0.submissionId == submissionId }
        if let first = rejected.first {
            queue.acknowledgeRejections(submissionId: submissionId)
            try? await model.prepareReview()
            model.jump(toAnswerId: first.answerId)
            let prompt = model.answers.first(where: { $0.id == first.answerId })?.prompt ?? String(localized: "An answer")
            let reason = Self.sentence(first.message)
            errorMessage = rejected.count == 1
                ? String(localized: "\(prompt) was not saved: \(reason) Answer it again, then submit.")
                : String(localized: "\(rejected.count) answers were not saved. \(prompt): \(reason) Answer them again, then submit.")
            return
        }

        if let blocker = submissionBlocker() {
            if let answerId = blocker.answerId { model.jump(toAnswerId: answerId) }
            errorMessage = blocker.message
            return
        }
        do {
            try await model.prepareReview()
            showReview = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// What still has to sync before this inspection can be certified, named
    /// specifically and pointing at the question the inspector can act on.
    private func submissionBlocker() -> (message: String, answerId: String?)? {
        let queue = OfflineQueue.shared
        let media = queue.pendingMedia.filter { $0.submissionId == submissionId }
        let answers = queue.pendingAnswers.filter { $0.submissionId == submissionId }
        let scanner = queue.pendingOBDSnapshots.contains { $0.submissionId == submissionId }
        guard !media.isEmpty || !answers.isEmpty || scanner else { return nil }

        guard queue.isOnline else {
            return (String(localized: "Reconnect to the internet so saved answers and photos can sync before submitting."), media.first?.answerId)
        }
        let failed = media.filter { queue.mediaUploadErrors[$0.id] != nil }
        if let first = failed.first {
            let reason = Self.sentence(queue.mediaUploadErrors[first.id] ?? "")
            return (failed.count == 1
                ? String(localized: "A photo could not be uploaded: \(reason) Retry or remove it on its question.")
                : String(localized: "\(failed.count) photos could not be uploaded: \(reason) Retry or remove them on their questions."),
                first.answerId)
        }
        if let first = media.first {
            return (media.count == 1
                ? String(localized: "A photo is still uploading. Keep the app open and try again in a moment.")
                : String(localized: "\(media.count) photos are still uploading. Keep the app open and try again in a moment."),
                first.answerId)
        }
        if let first = answers.first {
            return (answers.count == 1
                ? String(localized: "An answer could not be saved yet. Try again in a moment.")
                : String(localized: "\(answers.count) answers could not be saved yet. Try again in a moment."),
                first.payload.answerId)
        }
        return (String(localized: "The scanner session has not synced yet. Try again in a moment."), nil)
    }

    /// The server's reason for refusing a save, or the local fallback when the
    /// save failed for another reason (it was kept for retry instead).
    private func saveFailureMessage(_ error: Error, fallback: String) -> String {
        if let apiError = error as? APIError, apiError.isPermanentRejection {
            return apiError.localizedDescription
        }
        return fallback
    }

    private static func sentence(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let last = trimmed.last else { return "" }
        return ".!?".contains(last) ? trimmed : trimmed + "."
    }

    private var shouldPromptForScannerAtStart: Bool {
        model.currentAnswer != nil &&
        model.currentOBDSnapshot == nil &&
        !OfflineQueue.shared.pendingOBDSnapshots.contains(where: { $0.submissionId == submissionId }) &&
        scannerEntryChoice == nil
    }
}

private struct PendingInspectionPhotoTile: View {
    let upload: OfflineQueue.PendingMedia
    let progress: Double?
    let error: String?
    let isUploading: Bool
    let onRetry: () -> Void
    let onRemove: () -> Void

    @State private var image: UIImage?

    private var status: String {
        if let error, !error.isEmpty { return "Failed" }
        guard let progress else { return "Saved for upload" }
        return progress >= 0.999 ? "Processing…" : "Uploading… \(Int(progress * 100))%"
    }

    var body: some View {
        Color.clear
            .aspectRatio(4/3, contentMode: .fit)
            .overlay {
                ZStack {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Theme.Palette.subtle
                        Image(systemName: "photo")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }
                    LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .center, endPoint: .bottom)
                    VStack(alignment: .leading, spacing: 5) {
                        Spacer()
                        HStack(spacing: 5) {
                            if isUploading {
                                ProgressView().tint(.white).controlSize(.small)
                            } else if error != nil {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.yellow)
                            } else {
                                Image(systemName: "icloud.and.arrow.up")
                            }
                            Text(status).font(.caption.bold())
                        }
                        if let error, !error.isEmpty {
                            Text(error)
                                .font(.caption2)
                                .lineLimit(3)
                            HStack(spacing: 12) {
                                Button("Retry", action: onRetry).font(.caption.bold())
                                Button("Remove", role: .destructive, action: onRemove).font(.caption.bold())
                            }
                            .disabled(isUploading)
                        } else if !isUploading {
                            HStack(spacing: 12) {
                                Button("Upload now", action: onRetry).font(.caption.bold())
                                Button("Remove", role: .destructive, action: onRemove).font(.caption.bold())
                            }
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(10)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Inspection photo. \(status)")
            .task(id: upload.localFileURL) {
                let data = try? await Task.detached(priority: .utility) {
                    try Data(contentsOf: upload.localFileURL)
                }.value
                image = data.flatMap(UIImage.init(data:))
            }
    }
}

private struct ResultLine: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.monospaced())
        }
    }
}
