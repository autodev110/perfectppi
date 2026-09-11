import PhotosUI
import SwiftUI

/// Create or edit a member group (plan 13.2 / 13.3 / 13.4). Visibility drives
/// the join policies on offer: Public groups may be Open; Private and
/// Unlisted groups need request approval or invitations.
struct GroupSettingsView: View {
    enum Mode: Equatable {
        case create
        case edit(slug: String)
    }

    let mode: Mode
    var onSaved: (String) -> Void = { _ in }
    /// Edit mode only: the group whose images can be changed (plan 13.5).
    private let imageTarget: (id: String, slug: String)?
    @State private var avatarUrl: String?
    @State private var coverUrl: String?
    @State private var showingImagePicker = false
    @State private var pendingImageKind: String?
    @State private var imagePickerItem: PhotosPickerItem?
    @State private var imageBusy: String?

    @Environment(\.dismiss) private var dismiss
    @State private var slug = ""
    @State private var name = ""
    @State private var description = ""
    @State private var category = "general"
    @State private var rulesText = ""
    @State private var vehicleMake = ""
    @State private var vehicleModel = ""
    @State private var yearStart = ""
    @State private var yearEnd = ""
    @State private var locationRegion = ""
    @State private var postingPolicy = "members"
    @State private var visibility = "public"
    @State private var joinPolicy = "open"
    @State private var saving = false
    @State private var error: String?

    private static let categories: [(String, String)] = [
        ("make_model", "Make / model"), ("technical", "Technical"), ("detailing", "Detailing"),
        ("off_road", "Off-road"), ("restoration", "Restoration"), ("track", "Track & autocross"),
        ("classics", "Classics"), ("ev", "EV ownership"), ("local_club", "Local club"), ("general", "General"),
    ]

    init(mode: Mode, initial: CommunityGroupSummary? = nil, onSaved: @escaping (String) -> Void = { _ in }) {
        self.mode = mode
        self.onSaved = onSaved
        if case .edit(let slug) = mode, let initial {
            imageTarget = (id: initial.id, slug: slug)
            _avatarUrl = State(initialValue: initial.avatarUrl)
            _coverUrl = State(initialValue: initial.coverUrl)
        } else {
            imageTarget = nil
        }
        if let initial {
            _name = State(initialValue: initial.name)
            _description = State(initialValue: initial.description)
            _category = State(initialValue: initial.category)
            _rulesText = State(initialValue: initial.rules.joined(separator: "\n"))
            _vehicleMake = State(initialValue: initial.vehicleMake ?? "")
            _vehicleModel = State(initialValue: initial.vehicleModel ?? "")
            _yearStart = State(initialValue: initial.yearStart.map(String.init) ?? "")
            _yearEnd = State(initialValue: initial.yearEnd.map(String.init) ?? "")
            _locationRegion = State(initialValue: initial.locationRegion ?? "")
            _postingPolicy = State(initialValue: initial.postingPolicy ?? "members")
            _visibility = State(initialValue: initial.visibility ?? "public")
            _joinPolicy = State(initialValue: initial.joinPolicy ?? "open")
        }
    }

    private static let visibilities: [(String, String, String)] = [
        ("public", "Public", "Listed in the directory; anyone signed in can read posts."),
        ("private", "Private", "Listed in the directory; only members can read posts."),
        ("unlisted", "Unlisted", "Hidden from the directory; reached by link or invitation."),
    ]
    private static let joinPolicies: [(String, String, String)] = [
        ("open", "Open", "Anyone can join instantly."),
        ("request_approval", "Request approval", "Members ask to join; moderators approve."),
        ("invite_only", "Invite only", "Moderators invite members."),
    ]

    private var allowedJoinPolicies: [(String, String, String)] {
        Self.joinPolicies.filter { visibility == "public" || $0.0 != "open" }
    }

    var body: some View {
        Form {
            if imageTarget != nil {
                Section {
                    imageRow(kind: "avatar", label: "Avatar", url: avatarUrl, shape: AnyShape(RoundedRectangle(cornerRadius: 14, style: .continuous)), size: CGSize(width: 64, height: 64))
                    imageRow(kind: "cover", label: "Cover", url: coverUrl, shape: AnyShape(RoundedRectangle(cornerRadius: 10, style: .continuous)), size: CGSize(width: 112, height: 56))
                } header: {
                    Text("Images")
                } footer: {
                    Text("Images pass the same safety check as post photos before they appear. Only the owner and admins can change them.")
                }
            }
            Section("Group") {
                TextField("Name", text: $name)
                if mode == .create {
                    TextField("Address (e.g. miata-meetups)", text: $slug)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: slug) { _, value in
                            let cleaned = value.lowercased().filter {
                                ($0.isASCII && ($0.isLetter || $0.isNumber)) || $0 == "-"
                            }
                            if cleaned != value { slug = cleaned }
                        }
                    Text("Lowercase letters, numbers, and hyphens. This cannot be changed later.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                TextField("Description", text: $description, axis: .vertical)
                    .lineLimit(2...5)
                Picker("Category", selection: $category) {
                    ForEach(Self.categories, id: \.0) { code, label in Text(label).tag(code) }
                }
                Picker("Who can post", selection: $postingPolicy) {
                    Text("All members").tag("members")
                    Text("Moderators only (announcements)").tag("moderators")
                }
            }

            Section {
                Picker("Visibility", selection: $visibility) {
                    ForEach(Self.visibilities, id: \.0) { code, label, _ in Text(label).tag(code) }
                }
                .onChange(of: visibility) { _, value in
                    if value != "public" && joinPolicy == "open" { joinPolicy = "request_approval" }
                }
                Picker("How members join", selection: $joinPolicy) {
                    ForEach(allowedJoinPolicies, id: \.0) { code, label, _ in Text(label).tag(code) }
                }
            } header: {
                Text("Access")
            } footer: {
                Text((Self.visibilities.first { $0.0 == visibility }?.2 ?? "") + " "
                     + (Self.joinPolicies.first { $0.0 == joinPolicy }?.2 ?? ""))
            }

            Section {
                TextField("Make (optional)", text: $vehicleMake)
                TextField("Model (optional)", text: $vehicleModel)
                HStack {
                    TextField("From year", text: $yearStart).keyboardType(.numberPad)
                    TextField("To year", text: $yearEnd).keyboardType(.numberPad)
                }
                TextField("General area, e.g. Portland, OR (optional)", text: $locationRegion)
            } header: {
                Text("Focus")
            } footer: {
                Text("City or region only — never a street address.")
            }

            Section {
                TextField("One rule per line", text: $rulesText, axis: .vertical)
                    .lineLimit(3...8)
            } header: {
                Text("Rules (up to 12)")
            } footer: {
                Text(mode != .create && joinPolicy == "open"
                     ? "Switching to Open admits anyone whose request is still pending."
                     : "Private and unlisted group posts never appear to non-members in profiles, search, or notification previews.")
            }

            if let error {
                Text(error).foregroundStyle(Theme.Palette.danger)
            }
        }
        .navigationTitle(mode == .create ? "Create Group" : "Group Settings")
        .navigationBarTitleDisplayMode(.inline)
        // One picker for both image slots; the tapped slot is remembered
        // separately from presentation so dismissal cannot race the pick.
        .photosPicker(isPresented: $showingImagePicker, selection: $imagePickerItem, matching: .images)
        .onChange(of: imagePickerItem) { _, item in
            guard let item, let kind = pendingImageKind else { return }
            imagePickerItem = nil
            pendingImageKind = nil
            Task { await uploadImage(kind: kind, item: item) }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : (mode == .create ? "Create" : "Save")) { Task { await save() } }
                    .disabled(saving || !canSave)
            }
        }
    }

    private func imageRow(kind: String, label: String, url: String?, shape: AnyShape, size: CGSize) -> some View {
        HStack(spacing: 14) {
            ZStack {
                shape.fill(Color(.secondarySystemFill))
                if let url, let imageURL = URL(string: url) {
                    AsyncImage(url: imageURL) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                    }
                } else {
                    Image(systemName: "photo").foregroundStyle(.secondary)
                }
            }
            .frame(width: size.width, height: size.height)
            .clipShape(shape)
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(.subheadline.weight(.semibold))
                HStack {
                    Button(imageBusy == kind ? "Uploading…" : (url == nil ? "Upload" : "Replace")) {
                        pendingImageKind = kind
                        showingImagePicker = true
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    if url != nil {
                        Button("Remove", role: .destructive) { Task { await removeImage(kind: kind) } }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                }
                .disabled(imageBusy != nil)
            }
            Spacer()
        }
    }

    @MainActor
    private func uploadImage(kind: String, item: PhotosPickerItem) async {
        guard let imageTarget else { return }
        imageBusy = kind
        defer { imageBusy = nil }
        do {
            let attachment = try await AttachmentPickerSupport.load(item)
            guard attachment.kind == .image else {
                error = "Choose a photo for the group \(kind)."
                return
            }
            let result = try await CommunityAPI.setGroupImage(groupId: imageTarget.id, slug: imageTarget.slug, kind: kind, attachment: attachment)
            if kind == "avatar" { avatarUrl = result.url } else { coverUrl = result.url }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    @MainActor
    private func removeImage(kind: String) async {
        guard let imageTarget else { return }
        imageBusy = kind
        defer { imageBusy = nil }
        do {
            _ = try await CommunityAPI.removeGroupImage(slug: imageTarget.slug, kind: kind)
            if kind == "avatar" { avatarUrl = nil } else { coverUrl = nil }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private var canSave: Bool {
        let nameOK = name.trimmingCharacters(in: .whitespaces).count >= 2
        let descriptionOK = !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let slugOK = mode != .create || (slug.count >= 3 && !slug.hasPrefix("-") && !slug.hasSuffix("-") && !slug.contains("--"))
        return nameOK && descriptionOK && slugOK
    }

    @MainActor
    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        let payload = CommunityGroupSettingsPayload(
            slug: mode == .create ? slug : nil,
            name: name.trimmingCharacters(in: .whitespaces),
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            category: category,
            rules: rulesText.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
            vehicleMake: vehicleMake.trimmingCharacters(in: .whitespaces),
            vehicleModel: vehicleModel.trimmingCharacters(in: .whitespaces),
            yearStart: Int(yearStart),
            yearEnd: Int(yearEnd),
            locationRegion: locationRegion.trimmingCharacters(in: .whitespaces),
            postingPolicy: postingPolicy,
            visibility: visibility,
            joinPolicy: joinPolicy
        )
        do {
            let result: CommunityAPI.GroupSlugResult
            switch mode {
            case .create: result = try await CommunityAPI.createGroup(payload)
            case .edit(let slug): result = try await CommunityAPI.updateGroupSettings(slug: slug, payload)
            }
            onSaved(result.slug)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
