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

    private var submissionId: String?
    private let photoRequiredPrompts: Set<String> = [
        "Current odometer reading (miles)",
        "Are any warning lights currently on?",
        "Overall paint condition",
        "Overall interior condition",
        "Are there any visible oil or fluid leaks?",
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
            self.sections = try await sections.sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
            self.answers = try await answers.sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
            self.allMedia = try await media
            self.obdSnapshots = try await obd
            self.currentIndex = 0
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

    func addMedia(_ media: PpiMedia) {
        allMedia.append(media)
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
            answers[idx] = PpiAnswer(
                id: answers[idx].id,
                ppiSectionId: answers[idx].ppiSectionId,
                prompt: answers[idx].prompt,
                answerType: answers[idx].answerType,
                answerValue: payload.value,
                options: answers[idx].options,
                isRequired: answers[idx].isRequired,
                sortOrder: answers[idx].sortOrder
            )
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

    private func requiresPhoto(_ answer: PpiAnswer) -> Bool {
        photoRequiredPrompts.contains(answer.prompt.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func hasPhoto(for answerId: String) -> Bool {
        localPhotoAnswerIds.contains(answerId) ||
        allMedia.contains { $0.ppiAnswerId == answerId } ||
        OfflineQueue.shared.pendingMedia.contains { $0.answerId == answerId }
    }
}
