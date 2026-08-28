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

    private var submissionId: String?
    private let photoRequiredPrompts: Set<String> = [
        "Current odometer reading (miles)",
        "Are any warning lights currently on?",
        "Overall paint condition",
        "Overall interior condition",
        "Front left tire tread depth (in 32nds of an inch)",
        "Engine oil condition",
        "Frame rust level",
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

    var currentOBDSnapshot: OBDSnapshotRecord? {
        obdSnapshots.first
    }

    var progressIndex: Int { currentIndex }
    var progressTotal: Int { answers.count }
    var atFirst: Bool { currentIndex == 0 }
    var atLast: Bool { currentIndex >= answers.count - 1 }
    var currentWasSkipped: Bool {
        guard let answer = currentAnswer else { return false }
        return skippedAnswerIds.contains(answer.id)
    }
    var canSkipCurrent: Bool {
        guard let answer = currentAnswer else { return false }
        return !atLast && !hasAnswerValue(answer) && !skippedAnswerIds.contains(answer.id)
    }
    var currentRequiresPhoto: Bool {
        guard let answer = currentAnswer else { return false }
        return requiresPhoto(answer)
    }
    var currentHasRequiredPhoto: Bool {
        guard let answer = currentAnswer else { return true }
        return hasPhoto(for: answer.id)
    }

    /// True when the current answer is filled (if required) or optional.
    var canAdvance: Bool {
        guard let a = currentAnswer else { return false }
        let answerSatisfied = a.isRequired != true || hasAnswerValue(a)
        let photoSatisfied = !requiresPhoto(a) || hasPhoto(for: a.id)
        return answerSatisfied && photoSatisfied
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
        return allMedia.filter { $0.ppiAnswerId == answerId }
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
            self.currentIndex = 0
            self.skippedAnswerIds = deferredIds
        } catch {
            self.loadError = error
        }
        loading = false
    }

    func next() {
        if currentIndex < answers.count - 1 {
            currentIndex += 1
        }
    }

    func previous() {
        if currentIndex > 0 {
            currentIndex -= 1
        }
    }

    func skipCurrent() async {
        guard canSkipCurrent, let submissionId else { return }
        let current = answers[currentIndex]
        let payload = PpiAPI.SaveAnswerPayload(
            answerId: current.id,
            value: current.answerValue ?? "",
            deferred: true
        )
        if OfflineQueue.shared.isOnline {
            do {
                _ = try await PpiAPI.saveAnswer(submissionId: submissionId, payload: payload)
            } catch {
                OfflineQueue.shared.enqueueAnswer(submissionId: submissionId, payload: payload)
            }
        } else {
            OfflineQueue.shared.enqueueAnswer(submissionId: submissionId, payload: payload)
        }

        let skipped = answerCopy(current, answerValue: current.answerValue, deferredAt: Date())
        answers.remove(at: currentIndex)
        answers.append(skipped)
        skippedAnswerIds.insert(skipped.id)
        // Keep the cursor in place: removing the current item shifts the next
        // normal question into this slot while the skipped one moves to the end.
    }

    func addMedia(_ media: PpiMedia) {
        allMedia.append(media)
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
    func upsertAnswer(_ payload: PpiAPI.SaveAnswerPayload) async {
        guard let submissionId else { return }
        // Optimistic local update.
        if let idx = answers.firstIndex(where: { $0.id == payload.answerId }) {
            let clearsDeferral = !payload.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            answers[idx] = answerCopy(
                answers[idx],
                answerValue: payload.value,
                deferredAt: clearsDeferral ? nil : answers[idx].deferredAt
            )
            if clearsDeferral {
                skippedAnswerIds.remove(payload.answerId)
            }
        }

        if OfflineQueue.shared.isOnline {
            do {
                _ = try await PpiAPI.saveAnswer(
                    submissionId: submissionId,
                    payload: payload
                )
            } catch {
                OfflineQueue.shared.enqueueAnswer(
                    submissionId: submissionId,
                    payload: payload
                )
            }
        } else {
            OfflineQueue.shared.enqueueAnswer(
                submissionId: submissionId,
                payload: payload
            )
        }
    }

    private func hasAnswerValue(_ answer: PpiAnswer) -> Bool {
        let v = (answer.answerValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return false }

        switch answer.answerType {
        case .number:
            return Double(v) != nil
        case .yesNo:
            return v == "yes" || v == "no"
        case .select:
            guard let options = answer.options, !options.isEmpty else { return true }
            return options.contains(v)
        case .text:
            return true
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
        deferredAt: Date?
    ) -> PpiAnswer {
        PpiAnswer(
            id: answer.id,
            ppiSectionId: answer.ppiSectionId,
            prompt: answer.prompt,
            answerType: answer.answerType,
            answerValue: answerValue,
            deferredAt: deferredAt,
            options: answer.options,
            isRequired: answer.isRequired,
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

    private func requiresPhoto(_ answer: PpiAnswer) -> Bool {
        photoRequiredPrompts.contains(answer.prompt.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func hasPhoto(for answerId: String) -> Bool {
        localPhotoAnswerIds.contains(answerId) ||
        allMedia.contains { $0.ppiAnswerId == answerId } ||
        OfflineQueue.shared.pendingMedia.contains { $0.answerId == answerId }
    }
}
