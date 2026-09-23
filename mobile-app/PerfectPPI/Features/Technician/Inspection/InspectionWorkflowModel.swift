import Foundation
import Combine

/// View model for the guided inspection. Maintains the flat list of
/// (section, answer) pairs the technician steps through, plus the per-answer
/// media cache.
@MainActor
final class InspectionWorkflowModel: ObservableObject {
    @Published private(set) var sections: [PpiSection] = []
    @Published private(set) var answers: [PpiAnswer] = []
    @Published private(set) var allMedia: [PpiMedia] = []
    @Published private(set) var obdSnapshots: [OBDSnapshotRecord] = []
    @Published private(set) var currentIndex: Int = 0
    @Published private(set) var loading: Bool = true
    @Published private(set) var loadError: Error?
    @Published private(set) var localPhotoAnswerIds: Set<String> = []
    @Published private(set) var skippedAnswerIds: Set<String> = []
    /// Drives the scanner gate: Dents & Tires uses the adapter for the VIN only.
    @Published private(set) var inspectionScope: InspectionScope = .complete
    /// "self" or "technician" from the request; technicians must measure tread and pressure.
    @Published private(set) var performerMode: String = "technician"
    @Published private(set) var catalogVersion: Int = 1
    /// Server revision the review screen showed; the certification binds to it.
    @Published private(set) var reviewedRevision: Int?

    private var submissionId: String?
    private let treadDepthPrompts: Set<String> = [
        "Front left tire tread depth (in 32nds of an inch)",
        "Front right tire tread depth (in 32nds of an inch)",
        "Rear left tire tread depth (in 32nds of an inch)",
        "Rear right tire tread depth (in 32nds of an inch)",
    ]

    // MARK: - Public

    var currentAnswer: PpiAnswer? {
        guard currentIndex < answers.count else { return nil }
        return answers[currentIndex]
    }

    var currentSection: PpiSection? {
        guard let a = currentAnswer else { return nil }
        return sections.first { $0.id == a.ppiSectionId }
    }

    var currentPrompt: String? {
        currentAnswer?.prompt
    }

    /// Answers shown together with the current one (a wheel card or body zone).
    var currentStepRange: Range<Int> {
        stepRange(containing: currentIndex)
    }

    var currentStepAnswers: [PpiAnswer] {
        guard !answers.isEmpty else { return [] }
        return Array(answers[currentStepRange])
    }

    var currentStepTitle: String? {
        guard currentStepAnswers.count > 1 || StructuredKey.parse(currentAnswer?.questionKey)?.stepGroupId != nil else { return nil }
        return StructuredKey.parse(currentAnswer?.questionKey)?.stepGroupLabel
    }

    private func groupId(at index: Int) -> String? {
        guard answers.indices.contains(index) else { return nil }
        let answer = answers[index]
        guard let group = StructuredKey.parse(answer.questionKey)?.stepGroupId else { return nil }
        return "\(answer.ppiSectionId):\(group)"
    }

    private func stepRange(containing index: Int) -> Range<Int> {
        guard answers.indices.contains(index) else { return index..<index }
        guard let group = groupId(at: index) else { return index..<(index + 1) }
        var lower = index
        while lower > 0 && groupId(at: lower - 1) == group { lower -= 1 }
        var upper = index + 1
        while upper < answers.count && groupId(at: upper) == group { upper += 1 }
        return lower..<upper
    }

    private var stepStarts: [Int] {
        var starts: [Int] = []
        var index = 0
        while index < answers.count {
            starts.append(index)
            index = stepRange(containing: index).upperBound
        }
        return starts
    }

    var currentOBDSnapshot: OBDSnapshotRecord? {
        obdSnapshots.first
    }

    var progressIndex: Int { stepStarts.firstIndex(of: currentStepRange.lowerBound) ?? 0 }
    var progressTotal: Int { stepStarts.count }
    var atFirst: Bool { currentStepRange.lowerBound == 0 }
    var atLast: Bool { currentStepRange.upperBound >= answers.count }
    var currentWasSkipped: Bool {
        currentStepAnswers.contains { skippedAnswerIds.contains($0.id) }
    }
    var canSkipCurrent: Bool {
        guard !currentStepAnswers.isEmpty, !atLast, !currentWasSkipped else { return false }
        return !currentStepAnswers.allSatisfy { isComplete($0) }
    }
    var currentRequiresPhoto: Bool {
        guard let answer = currentAnswer else { return false }
        return requiresPhoto(answer)
    }
    var currentHasRequiredPhoto: Bool {
        guard let answer = currentAnswer else { return true }
        return hasPhoto(for: answer.id)
    }

    /// True when every row in the current step is answered (if required) and
    /// has the photos its answer calls for.
    var canAdvance: Bool {
        guard !currentStepAnswers.isEmpty else { return false }
        return currentStepAnswers.allSatisfy { isComplete($0) }
    }

    func isComplete(_ a: PpiAnswer) -> Bool {
        let answerSatisfied = a.isRequired != true || hasAnswerValue(a)
        let photoSatisfied = !requiresPhoto(a) || hasPhoto(for: a.id)
        return answerSatisfied && photoSatisfied
    }

    func needsPhoto(_ answer: PpiAnswer) -> Bool {
        requiresPhoto(answer) && !hasPhoto(for: answer.id)
    }

    /// IDs of required answers that are still empty — used to gate submit.
    var unansweredRequiredIds: [String] {
        answers.compactMap { a in
            guard a.isRequired == true else { return nil }
            return hasAnswerValue(a) ? nil : a.id
        }
    }

    var missingPhotoRequiredIds: [String] {
        answers.compactMap { a in
            requiresPhoto(a) && !hasPhoto(for: a.id) ? a.id : nil
        }
    }

    var missingRequirementMessage: String? {
        if !unansweredRequiredIds.isEmpty {
            return "Please answer all required questions before submitting."
        }
        if !missingPhotoRequiredIds.isEmpty {
            return "Please capture a required photo before continuing."
        }
        return nil
    }

    /// Jump the user back to the first missing required answer.
    func jumpToFirstMissingRequirement() {
        let firstMissing = unansweredRequiredIds.first ?? missingPhotoRequiredIds.first
        guard let firstMissing,
              let idx = answers.firstIndex(where: { $0.id == firstMissing }) else { return }
        currentIndex = idx
    }

    func media(for answerId: String?) -> [PpiMedia] {
        guard let answerId else { return [] }
        return allMedia.filter { $0.ppiAnswerId == answerId && $0.mediaType == "image" }
    }

    func setOBDSnapshot(_ snapshot: OBDSnapshotRecord) {
        obdSnapshots.removeAll { $0.id == snapshot.id || $0.isCurrent == true }
        obdSnapshots.insert(snapshot, at: 0)

        var prefills: [String: String] = [:]
        if let vin = snapshot.vin?.trimmingCharacters(in: .whitespacesAndNewlines),
           vin.count == 17 {
            prefills["Confirm the VIN on the vehicle"] = vin.uppercased()
        }
        if let milOn = snapshot.milOn {
            prefills["Is the check engine light on?"] = milOn ? "yes" : "no"
            if milOn {
                prefills["Are any warning lights currently on?"] = "yes"
                prefills["List all active warning lights (if any)"] = "Check engine light (MIL)"
            }
        }

        let codes = Array(Set(
            (snapshot.storedDtcs + snapshot.pendingDtcs + snapshot.rawPayload.permanentDTCs)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
                .filter { !$0.isEmpty }
        )).sorted()
        let dtcScanCompleted = !codes.isEmpty || (
            hasPositiveModeResponse(snapshot.rawPayload.rawStoredDtcsResponse, mode: "43") &&
            hasPositiveModeResponse(snapshot.rawPayload.rawPendingDtcsResponse, mode: "47")
        )
        if dtcScanCompleted {
            prefills["Were DTC codes scanned? List codes if yes."] = codes.isEmpty
                ? "Scanned - no DTC codes found"
                : "Scanned - \(codes.joined(separator: ", "))"
        }

        for (prompt, value) in prefills {
            prefillBlankAnswer(prompt: prompt, value: value)
        }
    }

    // MARK: - Loading

    func load(submissionId: String) async {
        self.submissionId = submissionId
        loading = true
        loadError = nil
        do {
            async let sections = PpiAPI.sections(submissionId: submissionId)
            async let answers = PpiAPI.answers(submissionId: submissionId)
            async let media = PpiAPI.media(submissionId: submissionId)
            async let obd = PpiAPI.obdSnapshots(submissionId: submissionId)
            async let submission = PpiAPI.getSubmission(id: submissionId)
            let orderedSections = try await sections.sorted {
                ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0)
            }
            let loadedAnswers = try await answers
            self.sections = orderedSections
            // `sort_order` restarts at 1 inside every section. Sorting the
            // entire answer collection by that value interleaves unrelated
            // sections (all question 1s, then all question 2s). Group by the
            // already ordered sections first, then sort within each group.
            let canonicalAnswers = orderedSections.flatMap { section in
                loadedAnswers
                    .filter { $0.ppiSectionId == section.id }
                    .sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
            }
            let deferredAnswers = canonicalAnswers
                .filter { $0.deferredAt != nil }
                .sorted { ($0.deferredAt ?? .distantPast) < ($1.deferredAt ?? .distantPast) }
            let deferredIds = Set(deferredAnswers.map(\.id))
            self.answers = canonicalAnswers.filter { !deferredIds.contains($0.id) } + deferredAnswers
            self.allMedia = try await media
            self.obdSnapshots = try await obd
            let loadedSubmission = try? await submission
            self.inspectionScope = loadedSubmission?.inspectionScope ?? .complete
            self.performerMode = loadedSubmission?.performerMode ?? "technician"
            self.catalogVersion = loadedSubmission?.catalogVersion ?? 1
            self.currentIndex = 0
            self.skippedAnswerIds = deferredIds
        } catch {
            self.loadError = error
        }
        loading = false
    }

    func next() {
        let upper = currentStepRange.upperBound
        if upper < answers.count {
            currentIndex = upper
        }
    }

    func previous() {
        let lower = currentStepRange.lowerBound
        if lower > 0 {
            currentIndex = stepRange(containing: lower - 1).lowerBound
        }
    }

    /// Jump to the step containing an answer (from the review list).
    func jump(toAnswerId answerId: String) {
        guard let index = answers.firstIndex(where: { $0.id == answerId }) else { return }
        currentIndex = stepRange(containing: index).lowerBound
    }

    func skipCurrent() async throws {
        guard canSkipCurrent, let submissionId else { return }
        let range = currentStepRange
        let members = Array(answers[range])
        for current in members {
            let payload = PpiAPI.SaveAnswerPayload(
                answerId: current.id,
                value: current.answerType.isStructured ? "" : (current.answerValue ?? ""),
                deferred: true
            )
            if OfflineQueue.shared.isOnline {
                do {
                    _ = try await PpiAPI.saveAnswer(submissionId: submissionId, payload: payload)
                } catch {
                    try OfflineQueue.shared.enqueueAnswer(submissionId: submissionId, payload: payload)
                }
            } else {
                try OfflineQueue.shared.enqueueAnswer(submissionId: submissionId, payload: payload)
            }
        }

        // The whole card moves to the end together so it stays one step.
        let skipped = members.map { answerCopy($0, answerValue: $0.answerValue, deferredAt: Date()) }
        answers.removeSubrange(range)
        answers.append(contentsOf: skipped)
        skipped.forEach { skippedAnswerIds.insert($0.id) }
        currentIndex = min(range.lowerBound, max(answers.count - 1, 0))
        // Keep the cursor in place: the next step slides into this position.
    }

    /// Reloads the server copy right before review so the certification binds
    /// to exactly what is stored.
    func prepareReview() async throws {
        guard let submissionId else { return }
        let submission = try await PpiAPI.getSubmission(id: submissionId)
        reviewedRevision = submission.revision ?? 0
        let loadedAnswers = try await PpiAPI.answers(submissionId: submissionId)
        let byId = Dictionary(uniqueKeysWithValues: loadedAnswers.map { ($0.id, $0) })
        answers = answers.map { byId[$0.id] ?? $0 }
        allMedia = try await PpiAPI.media(submissionId: submissionId)
    }

    func addMedia(_ media: PpiMedia) {
        allMedia.removeAll { $0.id == media.id }
        allMedia.append(media)
    }

    func refreshMedia() async {
        guard let submissionId else { return }
        if let media = try? await PpiAPI.media(submissionId: submissionId) {
            allMedia = media
        }
    }

    func clearLocalPhotoIfNeeded(answerId: String) {
        guard !allMedia.contains(where: { $0.ppiAnswerId == answerId && $0.mediaType == "image" }),
              !OfflineQueue.shared.pendingMedia.contains(where: { $0.answerId == answerId }) else { return }
        localPhotoAnswerIds.remove(answerId)
    }

    /// Deletes a captured photo server-side, then drops it locally. Also clears
    /// the local "photo captured" marker for the answer when its last photo is
    /// gone, so a required-photo question goes back to blocking Next.
    func deleteMedia(_ media: PpiMedia) async throws {
        try await PpiAPI.deleteMedia(mediaId: media.id)
        allMedia.removeAll { $0.id == media.id }

        if let answerId = media.ppiAnswerId,
           !allMedia.contains(where: { $0.ppiAnswerId == answerId }) {
            localPhotoAnswerIds.remove(answerId)
        }
    }

    func markLocalPhoto(answerId: String) {
        localPhotoAnswerIds.insert(answerId)
    }

    /// Save an answer (online or queued). The view passes the updated
    /// payload; we optimistically update the local list and persist.
    func upsertAnswer(_ payload: PpiAPI.SaveAnswerPayload) async throws {
        guard let submissionId else { return }
        let previousAnswers = answers
        let previousSkippedAnswerIds = skippedAnswerIds
        // Optimistic local update.
        if let idx = answers.firstIndex(where: { $0.id == payload.answerId }) {
            let answer = answers[idx]
            if answer.answerType.isStructured {
                let observation = payload.observation == .null ? nil : payload.observation
                let clearsDeferral = observation != nil
                answers[idx] = answerCopy(
                    answer,
                    answerValue: answer.answerValue,
                    deferredAt: clearsDeferral ? nil : answer.deferredAt,
                    observation: .some(observation)
                )
                if clearsDeferral { skippedAnswerIds.remove(payload.answerId) }
            } else {
                let clearsDeferral = !payload.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                answers[idx] = answerCopy(
                    answer,
                    answerValue: payload.value,
                    deferredAt: clearsDeferral ? nil : answer.deferredAt
                )
                if clearsDeferral {
                    skippedAnswerIds.remove(payload.answerId)
                }
            }
        }

        do {
            if OfflineQueue.shared.isOnline {
                do {
                    _ = try await PpiAPI.saveAnswer(
                        submissionId: submissionId,
                        payload: payload
                    )
                } catch {
                    try OfflineQueue.shared.enqueueAnswer(
                        submissionId: submissionId,
                        payload: payload
                    )
                }
            } else {
                try OfflineQueue.shared.enqueueAnswer(
                    submissionId: submissionId,
                    payload: payload
                )
            }
        } catch {
            answers = previousAnswers
            skippedAnswerIds = previousSkippedAnswerIds
            throw error
        }
    }

    private func hasAnswerValue(_ answer: PpiAnswer) -> Bool {
        if answer.answerType.isStructured {
            guard answer.observation != nil else { return false }
            return Observation.requirementMet(
                key: answer.questionKey,
                observation: answer.observation,
                required: answer.isRequired == true,
                performerMode: performerMode
            )
        }
        let v = (answer.answerValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return false }

        switch answer.answerType {
        case .number:
            guard let number = Double(v), number.isFinite else { return false }
            if treadDepthPrompts.contains(answer.prompt) {
                return number.rounded() == number && (0...32).contains(number)
            }
            return true
        case .yesNo:
            return v == "yes" || v == "no"
        case .select:
            guard let options = answer.options, !options.isEmpty else { return true }
            return options.contains(v)
        case .text:
            return true
        case .unsupported:
            return false
        default:
            return false
        }
    }

    private func prefillBlankAnswer(prompt: String, value: String) {
        guard let index = answers.firstIndex(where: {
            $0.prompt == prompt &&
            ($0.answerValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) else { return }

        let answer = answers[index]
        answers[index] = answerCopy(answer, answerValue: value, deferredAt: nil)
        skippedAnswerIds.remove(answer.id)
    }

    private func answerCopy(
        _ answer: PpiAnswer,
        answerValue: String?,
        deferredAt: Date?,
        observation: JSONValue?? = .none
    ) -> PpiAnswer {
        PpiAnswer(
            id: answer.id,
            ppiSectionId: answer.ppiSectionId,
            prompt: answer.prompt,
            questionKey: answer.questionKey,
            answerType: answer.answerType,
            answerValue: answerValue,
            observation: observation ?? answer.observation,
            deferredAt: deferredAt,
            options: answer.options,
            isRequired: answer.isRequired,
            requiresPhoto: answer.requiresPhoto,
            photoPrompt: answer.photoPrompt,
            sortOrder: answer.sortOrder
        )
    }

    private func hasPositiveModeResponse(_ rawResponse: String?, mode: String) -> Bool {
        guard let rawResponse else { return false }
        let bytes = rawResponse.uppercased().matches(of: /[0-9A-F]{2}/).map {
            String($0.output)
        }
        return bytes.contains(mode)
    }

    /// Read from the answer row rather than a prompt-keyed set. Two inspection
    /// scopes deliberately share tread wording while differing on whether every
    /// corner needs its own photo, which a set keyed on prompt cannot express.
    private func requiresPhoto(_ answer: PpiAnswer) -> Bool {
        (answer.requiresPhoto ?? false) ||
        Observation.photoRequired(key: answer.questionKey, observation: answer.observation)
    }

    private func hasPhoto(for answerId: String) -> Bool {
        localPhotoAnswerIds.contains(answerId) ||
        allMedia.contains { $0.ppiAnswerId == answerId && $0.mediaType == "image" } ||
        OfflineQueue.shared.pendingMedia.contains { $0.answerId == answerId }
    }
}
