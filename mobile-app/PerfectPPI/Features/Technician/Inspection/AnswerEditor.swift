import SwiftUI

/// Renders the right input for the answer type — text, yes/no, select, or
/// number — and emits a save payload on every change.
struct AnswerEditor: View {
    let answer: PpiAnswer
    var onChange: (PpiAPI.SaveAnswerPayload) -> Void

    @State private var text: String
    @State private var numberText: String
    @State private var yesNo: String

    init(answer: PpiAnswer, onChange: @escaping (PpiAPI.SaveAnswerPayload) -> Void) {
        self.answer = answer
        self.onChange = onChange
        let raw = answer.answerValue ?? ""

        _numberText = State(initialValue: raw)

        // Keep unanswered required yes/no questions visibly unanswered.
        let normalizedYesNo = (raw == "yes" || raw == "no") ? raw : ""
        _yesNo = State(initialValue: normalizedYesNo)

        // Keep select questions visibly unanswered until the user chooses.
        let validSelect: String
        if let opts = answer.options, !opts.isEmpty {
            validSelect = opts.contains(raw) ? raw : ""
        } else {
            validSelect = raw
        }
        _text = State(initialValue: answer.answerType == .select ? validSelect : raw)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch answer.answerType {
            case .text:
                TextField("Answer", text: $text, axis: .vertical)
                    .lineLimit(3...8)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: text) { _, new in emit(new) }

            case .yesNo:
                Picker("", selection: $yesNo) {
                    Text("Select").tag("")
                    Text("No").tag("no")
                    Text("Yes").tag("yes")
                }
                .pickerStyle(.segmented)
                .onChange(of: yesNo) { _, new in emit(new) }

            case .number:
                TextField("Number", text: $numberText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: numberText) { _, new in
                        emit(new)
                    }

            case .select:
                if let options = answer.options, !options.isEmpty {
                    Picker("Selection", selection: $text) {
                        Text("Select…").tag("")
                        ForEach(options, id: \.self) { option in
                            Text(option).tag(option)
                        }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: text) { _, new in emit(new) }
                } else {
                    // Defensive: a select-type answer with no options is a
                    // template data bug — show an inline error so the tech
                    // (and us) notice it instead of silently degrading to a
                    // free-text field whose value will be rejected.
                    Label("This question has no options configured. Contact support.",
                          systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.danger)
                }
            }
        }
    }

    private func emit(_ value: String) {
        onChange(.init(
            answerId: answer.id,
            value: value
        ))
    }
}
