import SwiftUI

/// Editors for catalog-2 structured answers (tread, pressure, sidewall
/// markings, DOT code, cracking/wear, tire/wheel damage, placard, body
/// panels). Mirrors `src/components/shared/structured-answer-input.tsx`:
/// each editor keeps a draft and emits an observation only when the draft is
/// complete; the server validates every observation authoritatively.
struct StructuredAnswerEditor: View {
    let answer: PpiAnswer
    let submissionId: String
    let performerMode: String
    let latestPhotoId: String?
    let hidePhotoSuggestion: Bool
    var onChange: (JSONValue?) -> Void

    init(
        answer: PpiAnswer,
        submissionId: String,
        performerMode: String,
        latestPhotoId: String?,
        hidePhotoSuggestion: Bool = false,
        onChange: @escaping (JSONValue?) -> Void
    ) {
        self.answer = answer
        self.submissionId = submissionId
        self.performerMode = performerMode
        self.latestPhotoId = latestPhotoId
        self.hidePhotoSuggestion = hidePhotoSuggestion
        self.onChange = onChange
    }

    var body: some View {
        switch StructuredKey.parse(answer.questionKey)?.family {
        case .tireTread?, .tirePressure?, .brakePad?, .batteryTest?:
            MeasurementEditorView(answer: answer, performerMode: performerMode, onChange: onChange)
        case .tireSidewall?:
            MarkingsEditorView(answer: answer, submissionId: submissionId, latestPhotoId: latestPhotoId, hidePhotoSuggestion: hidePhotoSuggestion, onChange: onChange)
        case .tireDot?:
            DotEditorView(answer: answer, submissionId: submissionId, latestPhotoId: latestPhotoId, hidePhotoSuggestion: hidePhotoSuggestion, onChange: onChange)
        case .tireCracking?, .tireWear?:
            ScaleEditorView(answer: answer, onChange: onChange)
        case .tireDamage?:
            DefectEditorView(answer: answer, kind: .tire, onChange: onChange)
        case .wheelDamage?:
            DefectEditorView(answer: answer, kind: .wheel, onChange: onChange)
        case .bodyPanel?:
            DefectEditorView(answer: answer, kind: .body, onChange: onChange)
        case .tirePlacard?:
            PlacardEditorView(answer: answer, submissionId: submissionId, latestPhotoId: latestPhotoId, hidePhotoSuggestion: hidePhotoSuggestion, onChange: onChange)
        case nil:
            Label("Update the app to answer this question.", systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(Theme.Palette.warning)
        }
    }
}

// MARK: - Shared pieces

private struct ChoiceChips: View {
    let options: [(id: String, label: String)]
    let selected: String?
    let onSelect: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(options, id: \.id) { option in
                Button {
                    onSelect(option.id)
                } label: {
                    Text(option.label)
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(selected == option.id ? Theme.Palette.primary : Theme.Palette.subtle, in: Capsule())
                        .foregroundStyle(selected == option.id ? Color.white : Color.primary)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected == option.id ? .isSelected : [])
            }
        }
    }
}

/// Wrapping row of chips.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct ReasonPicker: View {
    let codes: [ExceptionReason]
    @Binding var reason: ExceptionReason?
    @Binding var explanation: String
    var onChange: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Why could it not be checked?")
                .font(.subheadline.weight(.medium))
            ChoiceChips(options: codes.map { ($0.rawValue, $0.label) }, selected: reason?.rawValue) { id in
                reason = ExceptionReason(rawValue: id)
                onChange()
            }
            TextField(reason == .other ? "Explain what prevented the check (required)" : "Optional detail", text: $explanation, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .onChange(of: explanation) { _, _ in onChange() }
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(.secondary))
    }
}

private func modeOptions(_ modes: [ObservationState]) -> [(id: String, label: String)] {
    modes.map { ($0.rawValue, $0.label) }
}

// MARK: - Measurements

private struct MeasurementEditorView: View {
    let answer: PpiAnswer
    let performerMode: String
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var reading: String
    @State private var unit: String
    @State private var method: String
    @State private var context: String
    @State private var pressureLoss: String
    @State private var recheckReading: String
    @State private var recheckMinutes: String
    @State private var result: String
    @State private var reason: ExceptionReason?
    @State private var explanation: String
    @State private var error: String?

    private var family: StructuredFamily? { StructuredKey.parse(answer.questionKey)?.family }

    init(answer: PpiAnswer, performerMode: String, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.performerMode = performerMode
        self.onChange = onChange
        let observation = answer.observation
        let value = Observation.value(observation)
        let family = StructuredKey.parse(answer.questionKey)?.family
        _mode = State(initialValue: Observation.state(observation) ?? .observed)
        _reading = State(initialValue: value?["reading"]?.stringValue ?? "")
        _unit = State(initialValue: value?["unit"]?.stringValue ?? (family == .tireTread ? "thirty_seconds_inch" : family == .tirePressure ? "psi" : family == .batteryTest ? "volts" : "mm"))
        _method = State(initialValue: value?["method"]?.stringValue ?? (family == .tireTread ? "tread_depth_gauge" : family == .tirePressure ? "pressure_gauge" : family == .batteryTest ? "battery_tester" : "caliper_gauge"))
        _context = State(initialValue: value?["context"]?.stringValue ?? "")
        _pressureLoss = State(initialValue: value?["pressure_loss"]?.stringValue ?? "not_tested")
        _recheckReading = State(initialValue: value?["recheck"]?["reading"]?.stringValue ?? "")
        _recheckMinutes = State(initialValue: value?["recheck"]?["minutes_elapsed"]?.stringValue ?? "")
        _result = State(initialValue: value?["result"]?.stringValue ?? "")
        _reason = State(initialValue: observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    private var measuredOnly: Bool {
        (family == .tireTread || family == .tirePressure) && performerMode != "self"
    }

    private var modes: [ObservationState] {
        if measuredOnly { return [.observed] }
        return answer.isRequired == true ? [.observed, .unableToAssess] : [.observed, .notInspected]
    }

    private var unitLabel: String {
        switch unit {
        case "thirty_seconds_inch": return "/32 in"
        case "kpa": return "kPa"
        case "psi": return "psi"
        case "volts": return "V"
        default: return "mm"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if modes.count > 1 {
                ChoiceChips(options: modeOptions(modes), selected: mode.rawValue) { id in
                    mode = ObservationState(rawValue: id) ?? .observed
                    publish()
                }
            }
            if measuredOnly {
                Text("Technicians record a measured reading for every tire.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if mode == .observed {
                HStack {
                    TextField("Reading", text: $reading)
                        .keyboardType(.decimalPad)
                        .font(.title3.monospaced())
                        .multilineTextAlignment(.center)
                        .textFieldStyle(.roundedBorder)
                    Text(unitLabel).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                }
                .onChange(of: reading) { _, _ in publish() }
                if family == .tireTread {
                    ChoiceChips(options: [("thirty_seconds_inch", String(localized: "32nds of an inch")), ("mm", String(localized: "Millimetres"))], selected: unit) { id in
                        unit = id
                        publish()
                    }
                    Text("Enter the lowest reading you measured. Decimals are fine; 0 is a valid reading.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ChoiceChips(options: [("tread_depth_gauge", String(localized: "Tread depth gauge")), ("ruler_or_coin", String(localized: "Ruler or coin")), ("other", String(localized: "Other tool"))], selected: method) { id in
                        method = id
                        publish()
                    }
                }
                if family == .tirePressure {
                    ChoiceChips(options: [("psi", "psi"), ("kpa", "kPa")], selected: unit) { id in
                        unit = id
                        publish()
                    }
                    Text("Were the tires cold?").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ChoiceChips(options: [("cold", String(localized: "Cold")), ("warm", String(localized: "Warm (recently driven)")), ("unknown", String(localized: "Not sure"))], selected: context) { id in
                        context = id
                        publish()
                    }
                    Text("Pressure loss").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ChoiceChips(options: [
                        ("not_tested", String(localized: "Not tested")),
                        ("not_observed_during_test", String(localized: "Held pressure on recheck")),
                        ("observed", String(localized: "Lost pressure")),
                        ("reported", String(localized: "Owner reports it loses air")),
                    ], selected: pressureLoss) { id in
                        pressureLoss = id
                        publish()
                    }
                    if pressureLoss == "observed" || pressureLoss == "not_observed_during_test" {
                        Text("Pressure recheck").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Recheck reading").font(.caption2).foregroundStyle(.secondary)
                                HStack {
                                    TextField("Reading", text: $recheckReading)
                                        .keyboardType(.decimalPad)
                                        .textFieldStyle(.roundedBorder)
                                    Text(unitLabel).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                }
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Minutes elapsed").font(.caption2).foregroundStyle(.secondary)
                                HStack {
                                    TextField("Minutes", text: $recheckMinutes)
                                        .keyboardType(.decimalPad)
                                        .textFieldStyle(.roundedBorder)
                                    Text("min").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .onChange(of: recheckReading) { _, _ in publish() }
                        .onChange(of: recheckMinutes) { _, _ in publish() }
                    }
                }
                if family == .batteryTest {
                    ChoiceChips(options: [("good", String(localized: "Good")), ("marginal", String(localized: "Marginal")), ("replace", String(localized: "Replace")), ("inconclusive", String(localized: "Inconclusive"))], selected: result) { id in
                        result = id
                        publish()
                    }
                }
            } else {
                ReasonPicker(
                    codes: [.noGauge, .inaccessible, .unsafeAccess, .weatherOrLighting, .other],
                    reason: $reason,
                    explanation: $explanation,
                    onChange: publish
                )
            }
            if let error {
                Text(error).font(.footnote.weight(.medium)).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            if reason == .other && explanation.trimmingCharacters(in: .whitespaces).isEmpty {
                error = String(localized: "Explain the reason.")
                onChange(nil)
                return
            }
            error = nil
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        guard !reading.trimmingCharacters(in: .whitespaces).isEmpty else { error = nil; onChange(nil); return }
        guard let normalized = Observation.normalizeDecimal(reading), let number = Double(normalized) else {
            error = String(localized: "Enter a plain number like 5 or 4.5.")
            onChange(nil)
            return
        }
        let limit: Double = switch unit {
        case "thirty_seconds_inch": 32
        case "mm": family == .brakePad ? 30 : 25.4
        case "psi": 120
        case "kpa": 830
        default: 20
        }
        guard number <= limit else {
            error = String(localized: "Enter a reading from 0 to \(limit.formatted()).")
            onChange(nil)
            return
        }
        var value: [String: JSONValue] = [
            "reading": .string(normalized),
            "unit": .string(unit),
            "method": .string(method),
        ]
        if family == .tirePressure {
            guard !context.isEmpty else {
                error = String(localized: "Choose whether the tires were cold, warm or you are not sure.")
                onChange(nil)
                return
            }
            value["context"] = .string(context)
            value["pressure_loss"] = .string(pressureLoss)
            if pressureLoss == "observed" || pressureLoss == "not_observed_during_test" {
                guard
                    let normalizedRecheck = Observation.normalizeDecimal(recheckReading),
                    let recheckNumber = Double(normalizedRecheck),
                    recheckNumber <= limit,
                    let normalizedMinutes = Observation.normalizeDecimal(recheckMinutes),
                    let elapsedMinutes = Double(normalizedMinutes),
                    elapsedMinutes > 0
                else {
                    error = String(localized: "Enter the recheck reading and elapsed time.")
                    onChange(nil)
                    return
                }
                value["recheck"] = .object([
                    "reading": .string(normalizedRecheck),
                    "minutes_elapsed": .string(normalizedMinutes),
                ])
            }
        }
        if family == .batteryTest {
            guard !result.isEmpty else {
                error = String(localized: "Choose the battery test result.")
                onChange(nil)
                return
            }
            value["result"] = .string(result)
        }
        error = nil
        onChange(Observation.observed(value))
    }
}

// MARK: - Photo suggestions

private struct SuggestFromPhoto: View {
    let submissionId: String
    let mediaId: String?
    let target: String
    let fields: [(key: String, label: String)]
    var onUse: (PpiAPI.ExtractionResult) -> Void

    @State private var result: PpiAPI.ExtractionResult?
    @State private var loading = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if mediaId == nil {
                Text("Take the photo below to get a suggested reading, or type the values.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let result, result.status == "extracted" {
                Text("Suggested from photo — check before using")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(fields, id: \.key) { field in
                    HStack {
                        Text(field.label).foregroundStyle(.secondary)
                        Spacer()
                        Text((result.candidates[field.key] ?? nil) ?? "—").monospaced()
                    }
                    .font(.subheadline)
                }
                Button("Use these values") { onUse(result) }
                    .buttonStyle(OutlineButtonStyle())
            } else if result != nil || failed {
                Text("The photo could not be read. Retake a closer photo or enter the values.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Button {
                    Task { await read() }
                } label: {
                    Label(loading ? "Reading photo…" : "Suggest from photo", systemImage: "sparkles")
                }
                .buttonStyle(OutlineButtonStyle())
                .disabled(loading)
            }
        }
        .padding(10)
        .background(Theme.Palette.subtle, in: RoundedRectangle(cornerRadius: 12))
        .onChange(of: mediaId) { _, _ in
            result = nil
            failed = false
        }
    }

    private func read() async {
        guard let mediaId else { return }
        loading = true
        defer { loading = false }
        do {
            result = try await PpiAPI.readPhoto(submissionId: submissionId, mediaId: mediaId, target: target)
        } catch {
            failed = true
        }
    }
}

// MARK: - Sidewall markings

private struct MarkingsEditorView: View {
    let answer: PpiAnswer
    let submissionId: String
    let latestPhotoId: String?
    let hidePhotoSuggestion: Bool
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var size: String
    @State private var loadIndex: String
    @State private var speedRating: String
    @State private var brand: String
    @State private var model: String
    @State private var extraMarking: String
    @State private var extractionId: String?
    @State private var extractionIds: [String]
    @State private var reason: ExceptionReason?
    @State private var explanation: String
    @State private var error: String?

    init(answer: PpiAnswer, submissionId: String, latestPhotoId: String?, hidePhotoSuggestion: Bool, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.submissionId = submissionId
        self.latestPhotoId = latestPhotoId
        self.hidePhotoSuggestion = hidePhotoSuggestion
        self.onChange = onChange
        let value = Observation.value(answer.observation)
        _mode = State(initialValue: Observation.state(answer.observation) ?? .observed)
        _size = State(initialValue: value?["size"]?.stringValue ?? "")
        _loadIndex = State(initialValue: value?["load_index"]?.stringValue ?? "")
        _speedRating = State(initialValue: value?["speed_rating"]?.stringValue ?? "")
        _brand = State(initialValue: value?["brand"]?.stringValue ?? "")
        _model = State(initialValue: value?["model"]?.stringValue ?? "")
        _extraMarking = State(initialValue: value?["extra_marking"]?.stringValue ?? "")
        _extractionId = State(initialValue: answer.observation?["extraction_id"]?.stringValue)
        _extractionIds = State(initialValue: answer.observation?["extraction_ids"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        _reason = State(initialValue: answer.observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: answer.observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChoiceChips(options: modeOptions([.observed, .unableToAssess]), selected: mode.rawValue) { id in
                mode = ObservationState(rawValue: id) ?? .observed
                publish()
            }
            if mode == .observed {
                if !hidePhotoSuggestion {
                    SuggestFromPhoto(
                        submissionId: submissionId,
                        mediaId: latestPhotoId,
                        target: "tire_sidewall",
                        fields: [("size", String(localized: "Size")), ("load_index", String(localized: "Load index")), ("speed_rating", String(localized: "Speed rating")), ("brand", String(localized: "Brand"))]
                    ) { result in
                        size = (result.candidates["size"] ?? nil) ?? size
                        loadIndex = (result.candidates["load_index"] ?? nil) ?? loadIndex
                        speedRating = (result.candidates["speed_rating"] ?? nil) ?? speedRating
                        brand = (result.candidates["brand"] ?? nil) ?? brand
                        model = (result.candidates["model"] ?? nil) ?? model
                        extraMarking = (result.candidates["extra_marking"] ?? nil) ?? extraMarking
                        extractionId = result.extractionId
                        extractionIds = [result.extractionId]
                        publish()
                    }
                }
                Group {
                    TextField("Tire size, e.g. 225/50R17", text: $size)
                    TextField("Load index (number, e.g. 98)", text: $loadIndex).keyboardType(.numberPad)
                    TextField("Speed rating (letter, e.g. V)", text: $speedRating).textInputAutocapitalization(.characters)
                    TextField("Brand (optional)", text: $brand)
                    TextField("Model (optional)", text: $model)
                    TextField("XL / LT marking (optional)", text: $extraMarking)
                }
                .textFieldStyle(.roundedBorder)
                .onChange(of: size) { _, _ in publish() }
                .onChange(of: loadIndex) { _, _ in publish() }
                .onChange(of: speedRating) { _, _ in publish() }
                .onChange(of: brand) { _, _ in publish() }
                .onChange(of: model) { _, _ in publish() }
                .onChange(of: extraMarking) { _, _ in publish() }
                Text("Leave a field blank if it cannot be read; it is reported as unknown, never as matching.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ReasonPicker(codes: [.unreadable, .inaccessible, .other], reason: $reason, explanation: $explanation, onChange: publish)
            }
            if let error {
                Text(error).font(.footnote.weight(.medium)).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        let trimmedSize = size.trimmingCharacters(in: .whitespaces)
        guard !trimmedSize.isEmpty else { error = nil; onChange(nil); return }
        let load = loadIndex.trimmingCharacters(in: .whitespaces)
        let speed = speedRating.trimmingCharacters(in: .whitespaces).uppercased()
        if !load.isEmpty && (try? /^\d{2,3}(\/\d{2,3})?$/.wholeMatch(in: load)) == nil {
            error = String(localized: "Load index is a number such as 91 or 121/118.")
            onChange(nil)
            return
        }
        if !speed.isEmpty && (try? /^\(?[A-Z]{1,2}\)?$/.wholeMatch(in: speed)) == nil {
            error = String(localized: "Speed rating is a letter such as H, V, W or Y.")
            onChange(nil)
            return
        }
        var value: [String: JSONValue] = ["size": .string(trimmedSize)]
        if !load.isEmpty { value["load_index"] = .string(load) }
        if !speed.isEmpty { value["speed_rating"] = .string(speed) }
        let brandValue = brand.trimmingCharacters(in: .whitespaces)
        if !brandValue.isEmpty { value["brand"] = .string(brandValue) }
        let modelValue = model.trimmingCharacters(in: .whitespaces)
        if !modelValue.isEmpty { value["model"] = .string(modelValue) }
        let extraMarkingValue = extraMarking.trimmingCharacters(in: .whitespaces)
        if !extraMarkingValue.isEmpty { value["extra_marking"] = .string(extraMarkingValue) }
        error = nil
        onChange(Observation.observed(value, extractionId: extractionId, extractionIds: extractionIds.isEmpty ? nil : extractionIds))
    }
}

// MARK: - DOT code

private struct DotEditorView: View {
    let answer: PpiAnswer
    let submissionId: String
    let latestPhotoId: String?
    let hidePhotoSuggestion: Bool
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var code: String
    @State private var extractionId: String?
    @State private var extractionIds: [String]
    @State private var reason: ExceptionReason?
    @State private var explanation: String
    @State private var error: String?

    init(answer: PpiAnswer, submissionId: String, latestPhotoId: String?, hidePhotoSuggestion: Bool, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.submissionId = submissionId
        self.latestPhotoId = latestPhotoId
        self.hidePhotoSuggestion = hidePhotoSuggestion
        self.onChange = onChange
        _mode = State(initialValue: Observation.state(answer.observation) ?? .observed)
        _code = State(initialValue: Observation.value(answer.observation)?["code"]?.stringValue ?? "")
        _extractionId = State(initialValue: answer.observation?["extraction_id"]?.stringValue)
        _extractionIds = State(initialValue: answer.observation?["extraction_ids"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        _reason = State(initialValue: answer.observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: answer.observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChoiceChips(options: modeOptions([.observed, .unableToAssess]), selected: mode.rawValue) { id in
                mode = ObservationState(rawValue: id) ?? .observed
                publish()
            }
            if mode == .observed {
                if !hidePhotoSuggestion {
                    SuggestFromPhoto(submissionId: submissionId, mediaId: latestPhotoId, target: "tire_dot", fields: [("code", String(localized: "Date code"))]) { result in
                        code = (result.candidates["code"] ?? nil) ?? code
                        extractionId = result.extractionId
                        extractionIds = [result.extractionId]
                        publish()
                    }
                }
                TextField("WWYY", text: $code)
                    .keyboardType(.numberPad)
                    .font(.title3.monospaced())
                    .multilineTextAlignment(.center)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: code) { _, _ in
                        extractionId = nil
                        extractionIds = []
                        publish()
                    }
                Text("The last four digits after “DOT”: week then year. 0224 means week 2 of 2024. Keep leading zeros.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ReasonPicker(codes: [.unreadable, .inaccessible, .other], reason: $reason, explanation: $explanation, onChange: publish)
            }
            if let error {
                Text(error).font(.footnote.weight(.medium)).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        let digits = code.filter(\.isNumber)
        guard !digits.isEmpty else { error = nil; onChange(nil); return }
        guard digits.count == 4, let week = Int(digits.prefix(2)), (1...53).contains(week) else {
            error = String(localized: "Enter the four digits; the first two are the week (01–53).")
            onChange(nil)
            return
        }
        error = nil
        onChange(Observation.observed(["code": .string(digits)], extractionId: extractionId, extractionIds: extractionIds.isEmpty ? nil : extractionIds))
    }
}

// MARK: - Cracking / wear

private struct ScaleEditorView: View {
    let answer: PpiAnswer
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var level: String
    @State private var reason: ExceptionReason?
    @State private var explanation: String

    init(answer: PpiAnswer, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.onChange = onChange
        _mode = State(initialValue: Observation.state(answer.observation) ?? .observed)
        _level = State(initialValue: Observation.value(answer.observation)?["level"]?.stringValue ?? "")
        _reason = State(initialValue: answer.observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: answer.observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    private var levels: [(id: String, label: String, detail: String, color: Color)] {
        if StructuredKey.parse(answer.questionKey)?.family == .tireCracking {
            return [
                ("none", String(localized: "None"), String(localized: "No visible cracking on the sidewall or between tread blocks."), .green),
                ("starting", String(localized: "Starting"), String(localized: "Fine, shallow surface cracks. Worth noting; not by itself a replacement."), .yellow),
                ("significant", String(localized: "Significant"), String(localized: "Many or wider cracks across the sidewall or tread grooves. Replacement recommended."), .orange),
                ("severe", String(localized: "Severe"), String(localized: "Deep or extensive cracking, possibly into the rubber structure. Replace before driving further."), .red),
            ]
        }
        return [
            ("even", String(localized: "Even"), String(localized: "Tread depth looks consistent across the width of the tire."), .green),
            ("uneven_monitor", String(localized: "Mild uneven"), String(localized: "One edge or area is noticeably more worn. Check inflation and alignment."), .yellow),
            ("severe_uneven", String(localized: "Severe uneven"), String(localized: "Pronounced uneven wear, cupping or bald areas. Needs assessment soon."), .red),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChoiceChips(options: modeOptions([.observed, .unableToAssess]), selected: mode.rawValue) { id in
                mode = ObservationState(rawValue: id) ?? .observed
                publish()
            }
            if mode == .observed {
                ForEach(levels, id: \.id) { option in
                    Button {
                        level = option.id
                        publish()
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            RoundedRectangle(cornerRadius: 3).fill(option.color).frame(width: 6)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label).font(.subheadline.weight(.semibold))
                                Text(option.detail).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if level == option.id {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.Palette.primary)
                            }
                        }
                        .padding(10)
                        .background(level == option.id ? Theme.Palette.subtle : Color.clear, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                ReasonPicker(codes: [.inaccessible, .weatherOrLighting, .unsafeAccess, .other], reason: $reason, explanation: $explanation, onChange: publish)
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        guard !level.isEmpty else { onChange(nil); return }
        onChange(Observation.observed(["level": .string(level)]))
    }
}

// MARK: - Tire / wheel / body damage

private struct DefectEditorView: View {
    enum Kind { case tire, wheel, body }

    /// Type and confirmation (or extent) start unset: a draft is never
    /// saved as a finding the inspector did not choose.
    struct Draft: Identifiable, Hashable {
        let id: String
        var type: String = ""
        var location: String = "unknown"
        var certainty: String?
        var severity: String?
        var structural: Bool = false
        var note: String = ""
        /// Tap-placed location on the body diagram (body panels only).
        var marker: BodyDiagram.Point?

        func isComplete(body: Bool) -> Bool {
            !type.isEmpty && (body ? severity != nil : certainty != nil)
        }
    }

    let answer: PpiAnswer
    let kind: Kind
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var choice: String?
    @State private var defects: [Draft]
    @State private var noPhoto: Bool
    @State private var reason: ExceptionReason?
    @State private var explanation: String

    init(answer: PpiAnswer, kind: Kind, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.kind = kind
        self.onChange = onChange
        let observation = answer.observation
        let value = Observation.value(observation)
        _mode = State(initialValue: Observation.state(observation) ?? .observed)
        let initialChoice: String?
        if Observation.state(observation) == .observed {
            if value?["none_observed"]?.boolValue == true || value?["condition"]?.stringValue == "no_visible_damage" {
                initialChoice = "none"
            } else {
                initialChoice = "damage"
            }
        } else {
            initialChoice = nil
        }
        _choice = State(initialValue: initialChoice)
        _defects = State(initialValue: (value?["defects"]?.arrayValue ?? []).compactMap { entry in
            guard let id = entry["id"]?.stringValue, let type = entry["type"]?.stringValue else { return nil }
            return Draft(
                id: id,
                type: type,
                location: entry["location"]?.stringValue ?? "unknown",
                certainty: entry["certainty"]?.stringValue,
                severity: entry["severity"]?.stringValue,
                structural: entry["structural"]?.boolValue ?? false,
                note: entry["note"]?.stringValue ?? "",
                marker: BodyDiagram.point(from: entry["marker"])
            )
        })
        _noPhoto = State(initialValue: observation?["evidence_exception"]?.objectValue != nil)
        _reason = State(initialValue: observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    private var types: [(id: String, label: String)] {
        switch kind {
        case .tire:
            return [
                ("puncture", String(localized: "Puncture")),
                ("foreign_object", String(localized: "Embedded object (nail, screw)")),
                ("cut", String(localized: "Cut")),
                ("missing_rubber", String(localized: "Missing rubber / chunk")),
                ("bulge", String(localized: "Bulge / bubble")),
                ("exposed_cords", String(localized: "Exposed cords / wires")),
                ("suspected_separation", String(localized: "Suspected separation")),
                ("other", String(localized: "Other")),
            ]
        case .wheel:
            return [
                ("scratch_curb_rash", String(localized: "Scratches / curb rash")),
                ("gouge_chipped_material", String(localized: "Gouge / chipped material")),
                ("bent", String(localized: "Bent")),
                ("cracked", String(localized: "Cracked")),
                ("other", String(localized: "Other")),
            ]
        case .body:
            return [
                ("dent", String(localized: "Dent")),
                ("scratch", String(localized: "Scratch")),
                ("paint_damage", String(localized: "Paint damage")),
                ("rust", String(localized: "Rust / corrosion")),
                ("mismatched_repaint", String(localized: "Mismatched / repainted panel")),
                ("other", String(localized: "Other")),
            ]
        }
    }

    private var panel: String? { kind == .body ? StructuredKey.parse(answer.questionKey)?.panel : nil }

    private var modes: [ObservationState] {
        if kind == .body {
            return answer.isRequired == true ? [.observed, .unableToAssess, .notApplicable] : [.observed, .notInspected]
        }
        return [.observed, .unableToAssess]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChoiceChips(options: modeOptions(modes), selected: mode.rawValue) { id in
                mode = ObservationState(rawValue: id) ?? .observed
                publish()
            }
            if mode == .observed {
                ChoiceChips(
                    options: kind == .body
                        ? [("none", String(localized: "No visible damage")), ("damage", String(localized: "Damage present"))]
                        : [("none", String(localized: "None observed")), ("damage", kind == .tire ? String(localized: "Damage or object found") : String(localized: "Damage found"))],
                    selected: choice
                ) { id in
                    choice = id
                    if id == "damage" && defects.isEmpty {
                        defects = [Draft(id: UUID().uuidString.lowercased())]
                    }
                    publish()
                }
                if kind == .tire && choice == "damage" {
                    Text("Any confirmed puncture or embedded object (nail, screw) means the tire must be replaced under the PerfectPPI policy, even if it holds air.")
                        .font(.caption)
                        .padding(8)
                        .background(Color.yellow.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
                }
                if choice == "damage" {
                    ForEach($defects) { $defect in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                ChoiceChips(options: types, selected: defect.type) { id in
                                    defect.type = id
                                    publish()
                                }
                                Button(role: .destructive) {
                                    defects.removeAll { $0.id == defect.id }
                                    publish()
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .accessibilityLabel("Remove this damage entry")
                            }
                            if kind == .tire {
                                ChoiceChips(options: [("tread", String(localized: "Tread")), ("shoulder", String(localized: "Shoulder")), ("sidewall", String(localized: "Sidewall")), ("unknown", String(localized: "Not sure"))], selected: defect.location) { id in
                                    defect.location = id
                                    publish()
                                }
                            }
                            if kind == .body {
                                ChoiceChips(options: [("minor", String(localized: "Minor / cosmetic")), ("moderate", String(localized: "Needs repair")), ("severe", String(localized: "Severe"))], selected: defect.severity) { id in
                                    defect.severity = id
                                    publish()
                                }
                            } else {
                                ChoiceChips(options: [("confirmed", String(localized: "Confirmed")), ("suspected", String(localized: "Suspected — needs a closer look"))], selected: defect.certainty) { id in
                                    defect.certainty = id
                                    publish()
                                }
                            }
                            if (kind == .tire && defect.type == "cut") || kind == .body {
                                Toggle(kind == .tire ? "The cut reaches the tire structure (cords or plies)" : "Structural damage (frame, pillar or crumple zone)", isOn: $defect.structural)
                                    .font(.subheadline)
                                    .onChange(of: defect.structural) { _, _ in publish() }
                            }
                            TextField("Short note (optional)", text: $defect.note, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .onChange(of: defect.note) { _, _ in publish() }
                            if let panel, let index = defects.firstIndex(where: { $0.id == defect.id }) {
                                DefectLocationView(
                                    panel: panel,
                                    label: String(index + 1),
                                    marker: $defect.marker,
                                    others: defects.enumerated().compactMap { position, entry in
                                        guard position != index, let point = entry.marker else { return nil }
                                        return (String(position + 1), point)
                                    },
                                    onChange: publish
                                )
                            }
                            if !defect.isComplete(body: kind == .body) {
                                Text(kind == .body ? "Choose the damage type and its extent." : "Choose the damage type and whether it is confirmed or suspected.")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.orange)
                            }
                        }
                        .padding(10)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
                    }
                    Button {
                        defects.append(Draft(id: UUID().uuidString.lowercased()))
                        publish()
                    } label: {
                        Label("Add damage", systemImage: "plus")
                    }
                    .buttonStyle(OutlineButtonStyle())
                    Toggle("I could not photograph this damage", isOn: $noPhoto)
                        .font(.subheadline)
                        .onChange(of: noPhoto) { _, _ in publish() }
                }
            } else {
                ReasonPicker(
                    codes: mode == .notApplicable ? [.notEquipped, .vehicleConfiguration] : [.inaccessible, .unsafeAccess, .weatherOrLighting, .other],
                    reason: $reason,
                    explanation: $explanation,
                    onChange: publish
                )
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        switch choice {
        case "none":
            onChange(Observation.observed(kind == .body ? ["condition": .string("no_visible_damage")] : ["none_observed": .bool(true)]))
        case "damage":
            guard !defects.isEmpty, defects.allSatisfy({ $0.isComplete(body: kind == .body) }) else { onChange(nil); return }
            let entries: [JSONValue] = defects.map { defect in
                var entry: [String: JSONValue] = ["id": .string(defect.id), "type": .string(defect.type)]
                let note = defect.note.trimmingCharacters(in: .whitespaces)
                if !note.isEmpty { entry["note"] = .string(note) }
                switch kind {
                case .tire:
                    entry["location"] = .string(defect.location)
                    entry["certainty"] = defect.certainty.map(JSONValue.string) ?? .null
                    if defect.type == "cut" { entry["structural"] = .bool(defect.structural) }
                case .wheel:
                    entry["certainty"] = defect.certainty.map(JSONValue.string) ?? .null
                case .body:
                    entry["severity"] = defect.severity.map(JSONValue.string) ?? .null
                    if defect.structural { entry["structural"] = .bool(true) }
                    if let marker = defect.marker { entry["marker"] = BodyDiagram.json(marker) }
                }
                return .object(entry)
            }
            var value: [String: JSONValue] = ["defects": .array(entries)]
            if kind == .body { value["condition"] = .string("damage_present") }
            onChange(Observation.observed(value, evidenceException: noPhoto ? .inaccessible : nil))
        default:
            onChange(nil)
        }
    }
}

// MARK: - Body diagram marker

/// Collapsed until opened, or open when the entry already has a marker.
private struct DefectLocationView: View {
    let panel: String
    let label: String
    @Binding var marker: BodyDiagram.Point?
    let others: [(String, BodyDiagram.Point)]
    var onChange: () -> Void

    @State private var open = false

    var body: some View {
        if open || marker != nil {
            BodyDiagramPicker(panel: panel, label: label, marker: $marker, others: others, onChange: onChange)
        } else {
            Button("Mark the location on the diagram (optional)") { open = true }
                .font(.subheadline.weight(.medium))
        }
    }
}

/// Tap-to-place marker on the generic top-view diagram
/// (Core/Models/BodyDiagram.swift). The target panel is highlighted and every
/// tap is clamped onto it, so a marker never lands on a neighbouring panel.
struct BodyDiagramPicker: View {
    let panel: String
    let label: String
    @Binding var marker: BodyDiagram.Point?
    let others: [(String, BodyDiagram.Point)]
    var onChange: () -> Void

    /// Width / height of the diagram box; the drawing is normalized, so any
    /// aspect keeps each position on the same panel.
    private static let aspect: CGFloat = 100.0 / 140.0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(spacing: 2) {
                Text("FRONT")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                GeometryReader { proxy in
                    let size = proxy.size
                    Canvas { context, canvasSize in
                        draw(in: &context, size: canvasSize)
                    }
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { value in
                        guard size.width > 0, size.height > 0 else { return }
                        marker = BodyDiagram.clamp(panel: panel, x: value.location.x / size.width, y: value.location.y / size.height)
                        onChange()
                    })
                }
                .aspectRatio(Self.aspect, contentMode: .fit)
            }
            .padding(6)
            .frame(maxWidth: 190)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Body diagram. Tap the highlighted panel to mark where the damage is."))
            .accessibilityValue(marker == nil ? Text("No marker") : Text("Marker \(label) placed"))
            .accessibilityAdjustableAction { direction in
                let base = marker ?? BodyDiagram.defaultMarker(panel: panel)
                let step = direction == .increment ? 0.02 : -0.02
                marker = BodyDiagram.clamp(panel: panel, x: base.x, y: base.y + step)
                onChange()
            }

            (marker == nil
                ? Text("Optional: tap where the damage is on the highlighted panel. Without a marker, the report uses the panel's usual position.")
                : Text("Marker \(label) is on the highlighted panel. Tap again to move it."))
                .font(.caption)
                .foregroundStyle(.secondary)
            if marker == nil {
                Button("Place at the panel's usual position") {
                    marker = BodyDiagram.defaultMarker(panel: panel)
                    onChange()
                }
                .font(.subheadline.weight(.medium))
            } else {
                Button("Clear marker") {
                    marker = nil
                    onChange()
                }
                .font(.subheadline.weight(.medium))
            }
        }
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        func rect(_ r: BodyDiagram.Rect) -> CGRect {
            CGRect(x: r.x * size.width, y: r.y * size.height, width: r.w * size.width, height: r.h * size.height)
        }
        let outline = Color.secondary.opacity(0.6)
        let body = rect(BodyDiagram.body)
        context.fill(Path(roundedRect: body, cornerRadius: 10), with: .color(Color(.systemBackground)))
        context.stroke(Path(roundedRect: body, cornerRadius: 10), with: .color(outline), lineWidth: 1)
        for wheel in BodyDiagram.wheels {
            let path = Path(roundedRect: rect(wheel), cornerRadius: 2)
            context.fill(path, with: .color(Color(.secondarySystemBackground)))
            context.stroke(path, with: .color(outline), lineWidth: 1)
        }
        let cabin = Path(roundedRect: rect(BodyDiagram.cabin), cornerRadius: 4)
        context.fill(cabin, with: .color(Color(.secondarySystemBackground)))
        context.stroke(cabin, with: .color(outline), lineWidth: 1)
        for seam in BodyDiagram.seams {
            var line = Path()
            line.move(to: CGPoint(x: body.minX + 3, y: seam * size.height))
            line.addLine(to: CGPoint(x: body.maxX - 3, y: seam * size.height))
            context.stroke(line, with: .color(Color.secondary.opacity(0.4)), lineWidth: 0.8)
        }
        let (x0, y0, x1, y1) = BodyDiagram.region(panel)
        let highlight = Path(roundedRect: CGRect(x: x0 * size.width, y: y0 * size.height, width: (x1 - x0) * size.width, height: (y1 - y0) * size.height), cornerRadius: 2)
        context.fill(highlight, with: .color(Color.accentColor.opacity(0.15)))
        context.stroke(highlight, with: .color(Color.accentColor), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))

        func pin(_ text: String, _ point: BodyDiagram.Point, active: Bool) {
            let center = CGPoint(x: point.x * size.width, y: point.y * size.height)
            let radius: CGFloat = active ? 9 : 7
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                with: .color(active ? Color.accentColor : Color.secondary.opacity(0.7))
            )
            context.draw(Text(verbatim: text).font(.caption2.weight(.bold)).foregroundColor(.white), at: center)
        }
        for (text, point) in others { pin(text, point, active: false) }
        if let marker { pin(label, marker, active: true) }
    }
}

// MARK: - Placard

private struct PlacardEditorView: View {
    let answer: PpiAnswer
    let submissionId: String
    let latestPhotoId: String?
    let hidePhotoSuggestion: Bool
    var onChange: (JSONValue?) -> Void

    @State private var mode: ObservationState
    @State private var frontSize: String
    @State private var frontPressure: String
    @State private var rearSize: String
    @State private var rearPressure: String
    @State private var unit: String
    @State private var loadIndex: String
    @State private var speedRating: String
    @State private var documentedAlternative: String
    @State private var extractionId: String?
    @State private var extractionIds: [String]
    @State private var reason: ExceptionReason?
    @State private var explanation: String

    init(answer: PpiAnswer, submissionId: String, latestPhotoId: String?, hidePhotoSuggestion: Bool, onChange: @escaping (JSONValue?) -> Void) {
        self.answer = answer
        self.submissionId = submissionId
        self.latestPhotoId = latestPhotoId
        self.hidePhotoSuggestion = hidePhotoSuggestion
        self.onChange = onChange
        let value = Observation.value(answer.observation)
        _mode = State(initialValue: Observation.state(answer.observation) ?? .observed)
        _frontSize = State(initialValue: value?["front"]?["size"]?.stringValue ?? "")
        _frontPressure = State(initialValue: value?["front"]?["pressure"]?.stringValue ?? "")
        _rearSize = State(initialValue: value?["rear"]?["size"]?.stringValue ?? "")
        _rearPressure = State(initialValue: value?["rear"]?["pressure"]?.stringValue ?? "")
        _unit = State(initialValue: value?["front"]?["unit"]?.stringValue ?? "psi")
        _loadIndex = State(initialValue: value?["load_index"]?.stringValue ?? "")
        _speedRating = State(initialValue: value?["speed_rating"]?.stringValue ?? "")
        _documentedAlternative = State(initialValue: value?["documented_alternative"]?.stringValue ?? "")
        _extractionId = State(initialValue: answer.observation?["extraction_id"]?.stringValue)
        _extractionIds = State(initialValue: answer.observation?["extraction_ids"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        _reason = State(initialValue: answer.observation?["reason"]?["code"]?.stringValue.flatMap(ExceptionReason.init(rawValue:)))
        _explanation = State(initialValue: answer.observation?["reason"]?["explanation"]?.stringValue ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChoiceChips(options: modeOptions([.observed, .unableToAssess]), selected: mode.rawValue) { id in
                mode = ObservationState(rawValue: id) ?? .observed
                publish()
            }
            if mode == .observed {
                if !hidePhotoSuggestion {
                    SuggestFromPhoto(
                        submissionId: submissionId,
                        mediaId: latestPhotoId,
                        target: "tire_placard",
                        fields: [("front_size", String(localized: "Front size")), ("front_pressure", String(localized: "Front cold pressure")), ("rear_size", String(localized: "Rear size")), ("rear_pressure", String(localized: "Rear cold pressure")), ("load_index", String(localized: "Load index")), ("speed_rating", String(localized: "Speed rating"))]
                    ) { result in
                        frontSize = (result.candidates["front_size"] ?? nil) ?? frontSize
                        frontPressure = (result.candidates["front_pressure"] ?? nil) ?? frontPressure
                        rearSize = (result.candidates["rear_size"] ?? nil) ?? rearSize
                        rearPressure = (result.candidates["rear_pressure"] ?? nil) ?? rearPressure
                        loadIndex = (result.candidates["load_index"] ?? nil) ?? loadIndex
                        speedRating = (result.candidates["speed_rating"] ?? nil) ?? speedRating
                        extractionId = result.extractionId
                        extractionIds = [result.extractionId]
                        publish()
                    }
                }
                Group {
                    TextField("Front tire size", text: $frontSize)
                    TextField("Front cold pressure", text: $frontPressure).keyboardType(.decimalPad)
                    TextField("Rear tire size", text: $rearSize)
                    TextField("Rear cold pressure", text: $rearPressure).keyboardType(.decimalPad)
                    TextField("Load index (if shown)", text: $loadIndex).keyboardType(.numberPad)
                    TextField("Speed rating (if shown)", text: $speedRating).textInputAutocapitalization(.characters)
                    TextField("Approved alternative fitment (optional)", text: $documentedAlternative, axis: .vertical)
                }
                .textFieldStyle(.roundedBorder)
                .onChange(of: frontSize) { _, _ in publish() }
                .onChange(of: frontPressure) { _, _ in publish() }
                .onChange(of: rearSize) { _, _ in publish() }
                .onChange(of: rearPressure) { _, _ in publish() }
                .onChange(of: loadIndex) { _, _ in publish() }
                .onChange(of: speedRating) { _, _ in publish() }
                .onChange(of: documentedAlternative) { _, _ in publish() }
                Button("Rear is the same as front") {
                    rearSize = frontSize
                    rearPressure = frontPressure
                    publish()
                }
                .font(.subheadline.weight(.medium))
                ChoiceChips(options: [("psi", "psi"), ("kpa", "kPa")], selected: unit) { id in
                    unit = id
                    publish()
                }
            } else {
                ReasonPicker(codes: [.missingLabel, .unreadable, .inaccessible, .other], reason: $reason, explanation: $explanation, onChange: publish)
            }
        }
    }

    private func publish() {
        if mode != .observed {
            guard let reason else { onChange(nil); return }
            onChange(Observation.exception(mode, reason: reason, explanation: explanation))
            return
        }
        let front = frontSize.trimmingCharacters(in: .whitespaces)
        let rear = rearSize.trimmingCharacters(in: .whitespaces)
        guard !front.isEmpty || !rear.isEmpty else { onChange(nil); return }
        func axle(_ size: String, _ pressure: String) -> JSONValue {
            var entry: [String: JSONValue] = ["size": .string(size), "unit": .string(unit)]
            if let normalized = Observation.normalizeDecimal(pressure) { entry["pressure"] = .string(normalized) }
            return .object(entry)
        }
        var value: [String: JSONValue] = [
            "front": axle(front, frontPressure),
            "rear": axle(rear, rearPressure),
            "location": .string("driver_door_jamb"),
        ]
        let load = loadIndex.trimmingCharacters(in: .whitespaces)
        if !load.isEmpty { value["load_index"] = .string(load) }
        let speed = speedRating.trimmingCharacters(in: .whitespaces).uppercased()
        if !speed.isEmpty { value["speed_rating"] = .string(speed) }
        let alternative = documentedAlternative.trimmingCharacters(in: .whitespacesAndNewlines)
        if !alternative.isEmpty { value["documented_alternative"] = .string(alternative) }
        onChange(Observation.observed(
            value,
            extractionId: extractionId,
            extractionIds: extractionIds.isEmpty ? nil : extractionIds
        ))
    }
}
