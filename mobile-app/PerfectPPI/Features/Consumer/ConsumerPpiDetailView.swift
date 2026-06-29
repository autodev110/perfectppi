import SwiftUI

struct ConsumerPpiDetailView: View {
    let requestId: String

    @State private var request: PpiRequest?
    @State private var submission: PpiSubmission?
    @State private var error: Error?
    @State private var showingReview = false

    var body: some View {
        Group {
            if let request {
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.spacing) {
                        InfoRow(label: "Type",
                                value: (request.ppiType?.rawValue ?? "-")
                                    .replacingOccurrences(of: "_", with: " ").capitalized,
                                icon: "wrench.and.screwdriver.fill")
                        InfoRow(label: "Status",
                                value: request.status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                                icon: "circle.dashed",
                                valueColor: statusTint(request.status.rawValue))

                        if request.performerType == .selfInspection,
                           let submission,
                           submission.status == .draft || submission.status == .inProgress {
                            NavigationLink {
                                InspectionWorkflowView(submissionId: submission.id)
                            } label: {
                                Label("Continue Inspection", systemImage: "checkmark.seal")
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        }

                        if request.status == .submitted || request.status == .completed {
                            NavigationLink {
                                StandardizedReportView(requestId: request.id)
                            } label: {
                                Label("View Report", systemImage: "doc.text")
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        }

                        if request.status == .completed,
                           request.performerType == .technician {
                            Button {
                                showingReview = true
                            } label: {
                                Label("Review Technician", systemImage: "star")
                            }
                            .buttonStyle(OutlineButtonStyle())
                        }
                    }
                    .padding()
                }
            } else if let error {
                ErrorView(message: error.localizedDescription) { Task { await load() } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Inspection")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showingReview) {
            ReviewComposerView(requestId: requestId) {
                Task { await load() }
            }
        }
    }

    private func load() async {
        // Fetch the request and the submission separately. The submission
        // call can fail (e.g. permissions or transient network) — we don't
        // want a submissions failure to hide the request data we already
        // successfully fetched, otherwise the whole detail view goes blank.
        do {
            self.request = try await PpiAPI.getRequest(id: requestId)
            self.error = nil
        } catch {
            self.error = error
            return
        }

        do {
            let submissions: [PpiSubmission] = try await APIClient.shared.get(
                "/api/ppi/submissions",
                query: [URLQueryItem(name: "request_id", value: requestId)]
            )
            self.submission = submissions.first
        } catch {
            // Tolerate — we just won't show the "Continue Inspection" button.
            self.submission = nil
        }
    }
}

/// Fetches the standardized output and shows its PDF. Output generation is
/// async on the server (fire-and-forget after submit), so we poll briefly
/// before giving up — otherwise a user submitting and immediately tapping
/// "View Report" would always see a 404.
struct StandardizedReportView: View {
    let requestId: String

    @State private var submissionId: String?
    @State private var output: StandardizedOutput?
    @State private var error: Error?
    @State private var stillGenerating = false
    @State private var regenerating = false
    @State private var showingPDF = false

    var body: some View {
        Group {
            if let output, let content = output.structuredContent {
                NativeReportView(
                    output: output,
                    content: content,
                    showingPDF: $showingPDF,
                    regenerating: $regenerating,
                    onRegenerate: { Task { await regenerate() } },
                    onRefresh: { Task { await load() } }
                )
            } else if stillGenerating {
                generatingView
            } else if let error {
                ErrorView(message: error.localizedDescription) { Task { await load() } }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Report")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private var generatingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Generating report…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("This usually takes under a minute.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                Button("Retry") { Task { await load() } }
                    .buttonStyle(.bordered)
                Button(regenerating ? "Regenerating…" : "Regenerate") {
                    Task { await regenerate() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(regenerating || submissionId == nil)
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func regenerate() async {
        guard let submissionId else { return }
        regenerating = true
        defer { regenerating = false }
        do {
            struct Body: Encodable { let submissionId: String }
            let _: Empty = try await APIClient.shared.postCamel(
                "/api/ppi/outputs/regenerate",
                body: Body(submissionId: submissionId)
            )
            await load()
        } catch {
            self.error = error
        }
    }

    private func load() async {
        error = nil
        stillGenerating = false

        let resolvedSubmissionId: String
        do {
            let subs: [PpiSubmission] = try await APIClient.shared.get(
                "/api/ppi/submissions",
                query: [URLQueryItem(name: "request_id", value: requestId)]
            )
            guard let sub = subs.first else { throw APIError.notFound }
            resolvedSubmissionId = sub.id
            self.submissionId = sub.id
        } catch {
            self.error = error
            return
        }

        // Poll for the output entity. `structured_content` is filled in by
        // Stage 1 (Gemini) and is reliable — the PDF (`document_url`) is a
        // separate, optional Stage 2 that depends on R2 being configured. We
        // render the native view as soon as `structured_content` exists.
        for attempt in 0..<10 {
            do {
                let fetched = try await PpiAPI.standardizedOutput(submissionId: resolvedSubmissionId)
                if fetched.structuredContent != nil {
                    self.output = fetched
                    return
                }
                stillGenerating = true
            } catch APIError.notFound {
                stillGenerating = true
            } catch {
                self.error = error
                return
            }
            let delayNs = UInt64(min(3.0, pow(1.5, Double(attempt))) * 1_000_000_000)
            try? await Task.sleep(nanoseconds: delayNs)
        }
        // Give up after timeout — keep stillGenerating so the user can retry.
        stillGenerating = true
    }
}

/// Renders the standardized report from the structured JSON content. Works
/// even when the PDF stage hasn't finished — the user can tap "View PDF"
/// once `documentUrl` is set, and "Regenerate" if generation got stuck.
private struct NativeReportView: View {
    let output: StandardizedOutput
    let content: StandardizedContent
    @Binding var showingPDF: Bool
    @Binding var regenerating: Bool
    var onRegenerate: () -> Void
    var onRefresh: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let summary = content.overallSummary, !summary.isEmpty {
                    sectionBlock(title: "Overall Summary") {
                        Text(summary).font(.subheadline)
                    }
                }

                if let findings = content.notableFindings, !findings.isEmpty {
                    sectionBlock(title: "Notable Findings") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(findings, id: \.self) { f in
                                HStack(alignment: .top, spacing: 6) {
                                    Text("•").bold()
                                    Text(f).font(.subheadline)
                                }
                            }
                        }
                    }
                }

                if let diagnostics = content.diagnostics,
                   diagnostics.obdSnapshotPresent {
                    sectionBlock(title: "OBD-II Diagnostics") {
                        VStack(alignment: .leading, spacing: 6) {
                            diagnosticRow(
                                "MIL",
                                diagnostics.milOn.map { $0 ? "On" : "Off" } ?? "Unknown"
                            )
                            diagnosticRow(
                                "Stored DTCs",
                                diagnostics.storedDtcs.isEmpty ? "None" : diagnostics.storedDtcs.joined(separator: ", ")
                            )
                            diagnosticRow(
                                "Pending DTCs",
                                diagnostics.pendingDtcs.isEmpty ? "None" : diagnostics.pendingDtcs.joined(separator: ", ")
                            )
                            Text(diagnostics.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                ForEach(content.sections ?? []) { section in
                    sectionDetail(section)
                }

                footerActions
            }
            .padding()
        }
        .sheet(isPresented: $showingPDF) {
            NavigationStack {
                PDFViewer(path: "/api/outputs/\(output.id)/pdf")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showingPDF = false }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(vehicleLabel).font(.title2.bold())
            if let vin = content.vehicle?.vin {
                Text("VIN: \(vin)").font(.caption).foregroundStyle(.secondary)
            }
            if let m = content.vehicle?.mileage {
                Text("\(m.formatted()) mi").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var vehicleLabel: String {
        let v = content.vehicle
        let parts = [v?.year.map(String.init), v?.make, v?.model, v?.trim].compactMap { $0 }
        return parts.isEmpty ? "Unknown Vehicle" : parts.joined(separator: " ")
    }

    @ViewBuilder
    private func sectionBlock<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func diagnosticRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption.monospaced())
        }
    }

    @ViewBuilder
    private func sectionDetail(_ section: StandardizedSection) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(section.sectionLabel ?? section.sectionType ?? "Section")
                    .font(.headline)
                Spacer()
                if let rating = section.conditionRating {
                    StatusBadge(text: rating.capitalized, color: conditionColor(rating))
                }
            }
            if let summary = section.summary, !summary.isEmpty {
                Text(summary).font(.subheadline)
            }
            if let findings = section.findings, !findings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(findings) { f in
                        HStack(alignment: .top, spacing: 8) {
                            if let sev = f.severity {
                                Text(sev.uppercased())
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(severityColor(sev).opacity(0.18))
                                    .foregroundStyle(severityColor(sev))
                                    .clipShape(Capsule())
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.prompt ?? "").font(.caption.weight(.semibold))
                                Text(f.answer ?? "—").font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if let notes = section.notes, !notes.isEmpty {
                Text("Notes: \(notes)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var footerActions: some View {
        VStack(spacing: 8) {
            if let url = output.documentUrl, !url.isEmpty {
                Button {
                    showingPDF = true
                } label: {
                    Label("View PDF", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
            } else {
                Label("PDF not yet available — content above is the full report.",
                      systemImage: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }
            HStack {
                Button("Refresh") { onRefresh() }
                    .buttonStyle(.bordered)
                Spacer()
                Button(regenerating ? "Regenerating…" : "Regenerate") {
                    onRegenerate()
                }
                .buttonStyle(.bordered)
                .disabled(regenerating)
            }
        }
        .padding(.top, 4)
    }

    private func conditionColor(_ rating: String) -> Color {
        switch rating.lowercased() {
        case "excellent", "good": return Theme.Palette.success
        case "fair": return Theme.Palette.warning
        case "poor": return Theme.Palette.danger
        default: return Theme.Palette.primary
        }
    }

    private func severityColor(_ sev: String) -> Color {
        switch sev.lowercased() {
        case "critical", "major": return Theme.Palette.danger
        case "moderate": return Theme.Palette.warning
        case "minor": return Theme.Palette.primary
        default: return .secondary
        }
    }
}
