import SwiftUI

/// Composer state for the structured fields of a post type (plan 14.2).
struct PostTypeFields: Equatable {
    var stage = "in_progress"
    var parts = ""
    var service = ""
    var mileage = ""
    var cost = ""
    var diy = false
    var budget = ""
    var yearMin = ""
    var yearMax = ""
    var makes = ""
    var useCase = ""
    var inspectionId = ""
    var pollOptions = ["", ""]
    var pollDurationHours = 72

    static let buildStages: [(String, String)] = [("planning", "Planning"), ("in_progress", "In progress"), ("complete", "Complete")]
    static let pollDurations: [(Int, String)] = [(24, "24 hours"), (72, "3 days"), (168, "7 days")]

    private func list(_ value: String) -> [String] {
        value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func number(_ value: String) -> Double? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : Double(trimmed)
    }

    /// Mirrors the server's `parsePostDetails`; the server validates again.
    func details(for type: CommunityPostType) -> JSONValue {
        var object: [String: JSONValue] = [:]
        switch type {
        case .buildUpdate:
            object["stage"] = .string(stage)
            if !list(parts).isEmpty { object["parts"] = .array(list(parts).map(JSONValue.string)) }
        case .maintenance:
            object["service"] = .string(service.trimmingCharacters(in: .whitespaces))
            if let mileage = number(mileage) { object["mileage"] = .number(mileage.rounded()) }
            if let cost = number(cost) { object["cost_cents"] = .number((cost * 100).rounded()) }
            if diy { object["diy"] = .bool(true) }
            if !list(parts).isEmpty { object["parts"] = .array(list(parts).map(JSONValue.string)) }
        case .inspectionDiscussion:
            object["inspection_request_id"] = .string(inspectionId)
        case .buyingAdvice:
            if let budget = number(budget) { object["budget_cents"] = .number((budget * 100).rounded()) }
            if let yearMin = number(yearMin) { object["year_min"] = .number(yearMin.rounded()) }
            if let yearMax = number(yearMax) { object["year_max"] = .number(yearMax.rounded()) }
            if !list(makes).isEmpty { object["makes"] = .array(list(makes).map(JSONValue.string)) }
            let use = useCase.trimmingCharacters(in: .whitespaces)
            if !use.isEmpty { object["use_case"] = .string(use) }
        case .poll:
            let options = pollOptions.enumerated().compactMap { index, label -> JSONValue? in
                let trimmed = label.trimmingCharacters(in: .whitespaces)
                return trimmed.isEmpty ? nil : .object(["key": .string("opt\(index + 1)"), "label": .string(trimmed)])
            }
            object["poll"] = .object(["duration_hours": .number(Double(pollDurationHours)), "options": .array(options)])
        default:
            break
        }
        return .object(object)
    }

    /// Client-side check so the Publish button can say why (server re-checks).
    func validationMessage(for type: CommunityPostType, photoCount: Int, vehicleAttached: Bool) -> String? {
        switch type {
        case .maintenance where service.trimmingCharacters(in: .whitespaces).isEmpty:
            return "Say what service was performed."
        case .beforeAfter where photoCount < 2:
            return "Before & After posts need at least two photos."
        case .inspectionDiscussion where !vehicleAttached:
            return "Attach the inspected vehicle."
        case .inspectionDiscussion where inspectionId.isEmpty:
            return "Choose the inspection to discuss."
        case .poll where pollOptions.filter({ !$0.trimmingCharacters(in: .whitespaces).isEmpty }).count < 2:
            return "Polls need at least two options."
        default:
            return nil
        }
    }
}

/// Structured fields for the composer (plan 14.3 step 5), one Form section.
struct PostTypeFieldsSection: View {
    let type: CommunityPostType
    @Binding var fields: PostTypeFields
    let inspections: [CommunityPostOptionInspection]
    let attachedVehicleId: String

    var body: some View {
        switch type {
        case .buildUpdate:
            Section("Build details") {
                Picker("Stage", selection: $fields.stage) {
                    ForEach(PostTypeFields.buildStages, id: \.0) { code, label in Text(label).tag(code) }
                }
                TextField("Parts (comma-separated, up to 10)", text: $fields.parts)
            }
        case .maintenance:
            Section("Maintenance details") {
                TextField("Service performed *", text: $fields.service)
                TextField("Mileage (optional)", text: $fields.mileage).keyboardType(.numberPad)
                TextField("Cost in USD (optional)", text: $fields.cost).keyboardType(.decimalPad)
                TextField("Parts (comma-separated)", text: $fields.parts)
                Toggle("Did it myself", isOn: $fields.diy)
            }
        case .beforeAfter:
            Section {
                Text("Add at least two photos: the first is before, the second is after.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        case .inspectionDiscussion:
            Section {
                let eligible = inspections.filter { attachedVehicleId.isEmpty || $0.vehicleId == attachedVehicleId }
                if eligible.isEmpty {
                    Text(attachedVehicleId.isEmpty ? "Attach the inspected vehicle first." : "No completed inspections for this vehicle yet.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    Picker("Inspection", selection: $fields.inspectionId) {
                        Text("Choose an inspection").tag("")
                        ForEach(eligible) { inspection in Text(inspection.label).tag(inspection.id) }
                    }
                }
            } header: {
                Text("Inspection")
            } footer: {
                Text("Only the inspection type, scope, status, and date are shown. Findings stay in your report.")
            }
        case .buyingAdvice:
            Section("What you're considering") {
                TextField("Budget in USD (optional)", text: $fields.budget).keyboardType(.numberPad)
                HStack {
                    TextField("From year", text: $fields.yearMin).keyboardType(.numberPad)
                    TextField("To year", text: $fields.yearMax).keyboardType(.numberPad)
                }
                TextField("Makes considered (comma-separated, up to 5)", text: $fields.makes)
                TextField("What it's for (optional)", text: $fields.useCase)
            }
        case .poll:
            Section {
                ForEach(fields.pollOptions.indices, id: \.self) { index in
                    HStack {
                        TextField("Option \(index + 1)", text: $fields.pollOptions[index])
                        if fields.pollOptions.count > 2 {
                            Button { fields.pollOptions.remove(at: index) } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove option \(index + 1)")
                        }
                    }
                }
                if fields.pollOptions.count < 6 {
                    Button("Add option", systemImage: "plus") { fields.pollOptions.append("") }
                }
                Picker("Runs for", selection: $fields.pollDurationHours) {
                    ForEach(PostTypeFields.pollDurations, id: \.0) { hours, label in Text(label).tag(hours) }
                }
            } header: {
                Text("Poll options (2–6)")
            } footer: {
                Text("One vote per member, changeable until the poll closes. Votes are private; counts show after voting or at close. Options cannot change once someone has voted.")
            }
        default:
            EmptyView()
        }
    }
}

/// Structured details under a post's text (plan 14.7).
struct CommunityPostDetailsView: View {
    let post: CommunityPost

    private var rows: [(String, String)] {
        guard let type = post.postType, let details = post.details else { return [] }
        var rows: [(String, String)] = []
        let mileage = { (value: Double) in value.formatted(.number.grouping(.automatic)) + " mi" }
        let money = { (cents: Double) in (cents / 100).formatted(.currency(code: "USD").precision(.fractionLength(0))) }
        switch type {
        case .buildUpdate:
            if let stage = details["stage"]?.stringValue,
               let label = PostTypeFields.buildStages.first(where: { $0.0 == stage })?.1 { rows.append(("Stage", label)) }
            let parts = details["parts"]?.stringList ?? []
            if !parts.isEmpty { rows.append(("Parts", parts.joined(separator: ", "))) }
        case .maintenance:
            if let service = details["service"]?.stringValue { rows.append(("Service", service)) }
            if let value = details["mileage"]?.doubleValue { rows.append(("Mileage", mileage(value))) }
            if let cents = details["cost_cents"]?.doubleValue { rows.append(("Cost", money(cents))) }
            if details["diy"]?.boolValue == true { rows.append(("Done by", "Owner (DIY)")) }
            let parts = details["parts"]?.stringList ?? []
            if !parts.isEmpty { rows.append(("Parts", parts.joined(separator: ", "))) }
        case .buyingAdvice:
            if let cents = details["budget_cents"]?.doubleValue { rows.append(("Budget", money(cents))) }
            let yearMin = details["year_min"]?.doubleValue.map { String(Int($0)) }
            let yearMax = details["year_max"]?.doubleValue.map { String(Int($0)) }
            if yearMin != nil || yearMax != nil { rows.append(("Years", "\(yearMin ?? "…") – \(yearMax ?? "…")")) }
            let makes = details["makes"]?.stringList ?? []
            if !makes.isEmpty { rows.append(("Makes", makes.joined(separator: ", "))) }
            if let use = details["use_case"]?.stringValue { rows.append(("Use", use)) }
        case .inspectionDiscussion:
            if let inspection = post.inspection {
                rows.append(("Inspection", inspection.inspectionScope == "dents_tires" ? "Dents & tires" : "Complete"))
                rows.append(("Type", inspection.ppiType.replacingOccurrences(of: "_", with: " ")))
                let when = inspection.completedAt.map { " " + $0.formatted(date: .abbreviated, time: .omitted) } ?? ""
                rows.append(("Status", inspection.status == "completed" ? "Completed\(when)" : "Submitted"))
            }
        default:
            break
        }
        return rows
    }

    var body: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                if post.postType == .inspectionDiscussion {
                    Label("Findings are not shared automatically", systemImage: "checkmark.seal")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                ForEach(rows, id: \.0) { label, value in
                    HStack(alignment: .top, spacing: 8) {
                        Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            .frame(width: 72, alignment: .leading)
                        Text(value).font(.caption)
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

/// Poll (plan 14.2): one vote per member, changeable until close; counts
/// appear after voting or at close. Voter identities never reach the app.
struct CommunityPollCard: View {
    let postId: String
    @State private var poll: CommunityPollView
    @State private var busy = false
    @State private var error: String?

    init(postId: String, poll: CommunityPollView) {
        self.postId = postId
        _poll = State(initialValue: poll)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(poll.options) { option in
                let mine = poll.viewerOptionKey == option.key
                let share = poll.revealed && poll.totalVotes > 0 ? Double(option.votes ?? 0) / Double(poll.totalVotes) : 0
                Button {
                    Task { await vote(option.key) }
                } label: {
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(mine ? Theme.Palette.primary.opacity(0.08) : Theme.Palette.subtle)
                        if poll.revealed {
                            GeometryReader { geometry in
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Theme.Palette.primary.opacity(0.18))
                                    .frame(width: geometry.size.width * share)
                            }
                        }
                        HStack {
                            Text(option.label)
                                .font(.subheadline.weight(mine ? .semibold : .regular))
                                .foregroundStyle(mine ? Theme.Palette.primary : .primary)
                            Spacer()
                            if poll.revealed {
                                Text("\(Int((share * 100).rounded()))%" + (option.votes.map { " · \($0)" } ?? ""))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                    }
                }
                .buttonStyle(.plain)
                .disabled(busy || poll.closed)
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(mine ? .isSelected : [])
            }
            Text(footer)
                .font(.caption2)
                .foregroundStyle(.secondary)
            if let error {
                Text(error).font(.caption2).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    private var footer: String {
        var parts = ["\(poll.totalVotes) vote\(poll.totalVotes == 1 ? "" : "s")"]
        if poll.closed {
            parts.append("Closed")
        } else if let closesAt = poll.closesAt {
            parts.append("Closes " + closesAt.formatted(.relative(presentation: .named)))
        }
        if !poll.revealed && !poll.closed { parts.append("Vote to see results") }
        return parts.joined(separator: " · ")
    }

    @MainActor
    private func vote(_ optionKey: String) async {
        guard !busy, !poll.closed else { return }
        busy = true
        defer { busy = false }
        do {
            poll = try await CommunityAPI.votePoll(postId: postId, optionKey: optionKey)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
