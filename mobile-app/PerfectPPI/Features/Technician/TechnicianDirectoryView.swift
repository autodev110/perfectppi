import SwiftUI

struct TechnicianDirectoryView: View {
    @State private var independentOnly = false
    @State private var reloadToken = UUID()

    var body: some View {
        AsyncContent(
            load: { try await TechniciansAPI.list(independent: independentOnly ? true : nil) },
            loaded: { technicians in
                Group {
                    if technicians.isEmpty {
                        EmptyStateCard(
                            title: "No technicians found",
                            message: "Verified and public technician profiles will appear here.",
                            systemImage: "wrench.and.screwdriver"
                        )
                        .padding()
                    } else {
                        List(technicians) { technician in
                            NavigationLink {
                                TechnicianDirectoryDetailView(technician: technician)
                            } label: {
                                TechnicianDirectoryRow(technician: technician)
                            }
                        }
                        .listStyle(.insetGrouped)
                    }
                }
                .navigationTitle("Technicians")
                .toolbar {
                    Toggle(isOn: $independentOnly) {
                        Image(systemName: "person")
                    }
                    .onChange(of: independentOnly) {
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

private struct TechnicianDirectoryRow: View {
    let technician: TechnicianProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(technician.profile?.displayName ?? technician.profile?.username ?? "Technician")
                    .font(.headline)
                Spacer()
                if let avg = technician.avgRating, avg > 0 {
                    Label(avg.formatted(.number.precision(.fractionLength(1))), systemImage: "star.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.Palette.warning)
                }
            }
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let specialties = technician.specialties, !specialties.isEmpty {
                Text(specialties.prefix(3).joined(separator: ", "))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        let level = technician.certificationLevel?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
        let area = technician.serviceArea ?? technician.location
        return [level, area].compactMap { $0 }.joined(separator: " - ")
    }
}

private struct TechnicianDirectoryDetailView: View {
    let technician: TechnicianProfile

    @State private var reviews: TechnicianReviewsResponse?
    @State private var contacting = false
    @State private var notice: String?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(technician.profile?.displayName ?? technician.profile?.username ?? "Technician")
                        .font(.title3.bold())
                    if let bio = technician.bio ?? technician.profile?.bio, !bio.isEmpty {
                        Text(bio)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        metric(
                            value: technician.totalInspections.map(String.init) ?? "0",
                            label: "Inspections"
                        )
                        metric(
                            value: technician.avgRating.map {
                                $0.formatted(.number.precision(.fractionLength(1)))
                            } ?? "-",
                            label: "Rating"
                        )
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Details") {
                LabeledContent("Certification", value: technician.certificationLevel?.rawValue.replacingOccurrences(of: "_", with: " ").capitalized ?? "-")
                LabeledContent("Service Area", value: technician.serviceArea ?? technician.location ?? "-")
                LabeledContent("Available", value: (technician.isAvailable ?? technician.availableForWork ?? false) ? "Yes" : "No")
                LabeledContent("Reviews", value: "\(technician.totalReviews ?? reviews?.summary?.totalReviews ?? 0)")
            }

            Section {
                Button {
                    Task { await contact() }
                } label: {
                    Label(contacting ? "Opening..." : "Message Technician", systemImage: "message")
                }
                .disabled(contacting)
            }

            Section("Reviews") {
                if let reviews, !reviews.reviews.isEmpty {
                    ForEach(reviews.reviews) { review in
                        ReviewRow(review: review)
                    }
                } else {
                    Text("No reviews yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Technician")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadReviews() }
        .alert("Technician",
               isPresented: .constant(notice != nil),
               actions: { Button("OK") { notice = nil } },
               message: { Text(notice ?? "") })
    }

    private func metric(value: String, label: String) -> some View {
        VStack(alignment: .leading) {
            Text(value).font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Theme.Palette.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func loadReviews() async {
        do {
            reviews = try await ReviewsAPI.technicianReviews(technicianProfileId: technician.id)
        } catch {
            reviews = nil
        }
    }

    private func contact() async {
        guard !contacting else { return }
        contacting = true
        defer { contacting = false }
        do {
            _ = try await MessagesAPI.createConversation(participantId: technician.profileId)
            notice = "Conversation created. Open Messages to continue."
        } catch {
            notice = error.localizedDescription
        }
    }
}

struct ReviewRow: View {
    let review: TechnicianReview

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label("\(review.rating)", systemImage: "star.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.Palette.warning)
                if let reviewer = review.reviewer?.displayName ?? review.reviewer?.username {
                    Text(reviewer)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let created = review.createdAt {
                    Text(created, style: .date)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if let title = review.title, !title.isEmpty {
                Text(title).font(.subheadline.weight(.semibold))
            }
            if let content = review.content, !content.isEmpty {
                Text(content)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
