import SwiftUI

struct MediaPackagesView: View {
    @State private var reloadToken = UUID()
    @State private var showingCreate = false

    var body: some View {
        AsyncContent(
            load: { try await MediaPackagesAPI.list() },
            loaded: { packages in
                Group {
                    if packages.isEmpty {
                        EmptyStateCard(
                            title: "No media packages",
                            message: "Create shareable photo, video, or file packages for buyers and technicians.",
                            systemImage: "photo.on.rectangle"
                        )
                        .padding()
                    } else {
                        List(packages) { package in
                            NavigationLink {
                                MediaPackageDetailView(package: package) {
                                    reloadToken = UUID()
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(package.title)
                                        .font(.headline)
                                    Text("\(package.items.count) item\(package.items.count == 1 ? "" : "s")")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if let created = package.createdAt {
                                        Text(created, style: .relative)
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Media")
                .toolbar {
                    Button { showingCreate = true } label: {
                        Image(systemName: "plus")
                    }
                }
                .sheet(isPresented: $showingCreate) {
                    NewMediaPackageView {
                        reloadToken = UUID()
                    }
                }
            },
            failure: { error, retry in
                ErrorView(message: error.localizedDescription, retry: retry)
            }
        )
        .id(reloadToken)
    }
}

private struct MediaPackageDetailView: View {
    let package: MediaPackage
    let onChanged: () -> Void

    @State private var shareNotice: String?
    @State private var generating = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(package.title)
                        .font(.title3.bold())
                    if let description = package.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Items") {
                ForEach(package.items) { item in
                    Link(destination: URL(string: item.url) ?? URL(string: "https://perfectppi.com")!) {
                        HStack {
                            Image(systemName: icon(for: item.type))
                            VStack(alignment: .leading) {
                                Text(item.name ?? item.url)
                                    .font(.subheadline)
                                    .lineLimit(1)
                                Text(item.type.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Share") {
                if let link = package.shareLinks?.first {
                    ShareLinkRow(urlText: shareURL(token: link.token))
                }
                Button(generating ? "Generating..." : "Generate Share Link") {
                    Task { await generateShareLink() }
                }
                .disabled(generating)
            }
        }
        .navigationTitle("Package")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Share Link",
               isPresented: .constant(shareNotice != nil),
               actions: { Button("OK") { shareNotice = nil } },
               message: { Text(shareNotice ?? "") })
    }

    private func generateShareLink() async {
        guard !generating else { return }
        generating = true
        defer { generating = false }
        do {
            let link = try await MediaPackagesAPI.createShareLink(
                targetType: .mediaPackage,
                targetId: package.id
            )
            shareNotice = link.url
            onChanged()
        } catch {
            shareNotice = error.localizedDescription
        }
    }

    private func shareURL(token: String) -> String {
        "\(AppConfig.apiBaseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/share/\(token)"
    }

    private func icon(for type: String) -> String {
        switch type {
        case "video": return "play.rectangle"
        case "file": return "doc"
        default: return "photo"
        }
    }
}

private struct ShareLinkRow: View {
    let urlText: String

    var body: some View {
        ShareLink(item: URL(string: urlText) ?? urlText) {
            Label(urlText, systemImage: "square.and.arrow.up")
                .font(.caption)
                .lineLimit(2)
        }
    }
}

private struct NewMediaPackageView: View {
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var title = ""
    @State private var description = ""
    @State private var itemURL = ""
    @State private var itemName = ""
    @State private var itemType = "image"
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Package") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section("First Item") {
                    Picker("Type", selection: $itemType) {
                        Text("Image").tag("image")
                        Text("Video").tag("video")
                        Text("File").tag("file")
                    }
                    TextField("URL", text: $itemURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Name", text: $itemName)
                }

                if let error {
                    Text(error).foregroundStyle(Theme.Palette.danger)
                }
            }
            .navigationTitle("New Package")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave || saving)
                }
            }
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        URL(string: itemURL.trimmingCharacters(in: .whitespacesAndNewlines)) != nil
    }

    private func save() async {
        guard canSave, !saving else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await MediaPackagesAPI.create(
                .init(
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    ppiSubmissionId: nil,
                    items: [
                        .init(
                            type: itemType,
                            url: itemURL.trimmingCharacters(in: .whitespacesAndNewlines),
                            name: itemName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                        )
                    ]
                )
            )
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
