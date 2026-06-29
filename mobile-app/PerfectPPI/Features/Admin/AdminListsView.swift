import SwiftUI

struct AdminListsView: View {
    var body: some View {
        List {
            NavigationLink("Users", value: AdminListSection.users)
            NavigationLink("Technicians", value: AdminListSection.technicians)
            NavigationLink("Organizations", value: AdminListSection.organizations)
            NavigationLink("Inspections", value: AdminListSection.inspections)
            NavigationLink("Payments", value: AdminListSection.payments)
            NavigationLink("Contracts", value: AdminListSection.contracts)
            NavigationLink("Warranties", value: AdminListSection.warranties)
            NavigationLink("Vehicles", value: AdminListSection.vehicles)
            NavigationLink("Outputs", value: AdminListSection.outputs)
            NavigationLink("Marketplace", value: AdminListSection.listings)
            NavigationLink("Community", value: AdminListSection.community)
            NavigationLink("Reviews", value: AdminListSection.reviews)
            NavigationLink("Communications", value: AdminListSection.communications)
            NavigationLink("Audit Log", value: AdminListSection.audit)
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Records")
        .navigationDestination(for: AdminListSection.self) { section in
            AdminListDetailView(section: section)
        }
    }
}

enum AdminListSection: String, Hashable {
    case users, technicians, organizations, inspections
    case payments, contracts, warranties, vehicles, outputs, audit
    case listings, community, reviews, communications
}

struct AdminListDetailView: View {
    let section: AdminListSection

    var body: some View {
        Group {
            switch section {
            case .users:
                AsyncContent(load: { try await AdminAPI.users() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.users.isEmpty,
                        title: "No users",
                        message: "No users have signed up yet.",
                        systemImage: "person.2"
                    ) {
                        List(resp.users) { u in
                            VStack(alignment: .leading) {
                                Text(u.fullName ?? u.email ?? u.id).font(.headline)
                                Text(u.role?.rawValue ?? "—")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .technicians:
                AsyncContent(load: { try await AdminAPI.technicians() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.technicians.isEmpty,
                        title: "No technicians",
                        message: "Once technicians register and create their profiles, they'll show up here.",
                        systemImage: "wrench.and.screwdriver"
                    ) {
                        List(resp.technicians) { t in
                            VStack(alignment: .leading) {
                                Text(t.profile?.displayName ?? t.location ?? "Technician")
                                    .font(.headline)
                                Text(t.certificationLevel?.rawValue ?? "—")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .organizations:
                AsyncContent(load: { try await AdminAPI.organizations() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.organizations.isEmpty,
                        title: "No organizations",
                        message: "No org accounts have been created yet.",
                        systemImage: "building.2"
                    ) {
                        List(resp.organizations) { o in Text(o.name).font(.headline) }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .inspections:
                AsyncContent(load: { try await AdminAPI.inspections() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.data.isEmpty,
                        title: "No inspections",
                        message: "Inspections will appear here as consumers request them.",
                        systemImage: "checkmark.seal"
                    ) {
                        List(resp.data) { request in
                            VStack(alignment: .leading) {
                                Text(request.vehicle.map { vehicleName($0) } ?? request.id.prefix(8).uppercased())
                                    .font(.headline)
                                Text(request.status.rawValue.replacingOccurrences(of: "_", with: " "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .payments:
                AsyncContent(load: { try await AdminAPI.payments() }, loaded: { items in
                    emptyOrList(
                        isEmpty: items.isEmpty,
                        title: "No payments",
                        message: "Stripe transactions will appear here once warranties start checking out.",
                        systemImage: "creditcard"
                    ) {
                        List(items) { p in
                            VStack(alignment: .leading) {
                                Text("$\((p.amountCents ?? 0) / 100)").font(.headline)
                                Text(p.status?.rawValue ?? "—").font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .contracts:
                AsyncContent(load: { try await AdminAPI.contracts() }, loaded: { items in
                    emptyOrList(
                        isEmpty: items.isEmpty,
                        title: "No contracts",
                        message: "DocuSeal contracts created during warranty sign-up will appear here.",
                        systemImage: "doc.text"
                    ) {
                        List(items) { c in
                            VStack(alignment: .leading) {
                                Text(c.id.prefix(8).uppercased()).font(.headline)
                                if let signed = c.signedAt {
                                    Text("Signed " + signed.formatted(date: .abbreviated, time: .omitted))
                                        .font(.caption).foregroundStyle(.secondary)
                                } else {
                                    Text("Pending").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .warranties:
                AsyncContent(load: { try await AdminAPI.warranties() }, loaded: { resp in
                    if resp.options.isEmpty && resp.orders.isEmpty {
                        EmptyStateCard(
                            title: "No warranties",
                            message: "Warranty offers and orders will show up once a completed inspection qualifies.",
                            systemImage: "shield"
                        )
                        .padding()
                    } else {
                        List {
                            Section("Offered (\(resp.options.count))") {
                                if resp.options.isEmpty {
                                    Text("No warranty offers yet").font(.caption).foregroundStyle(.secondary)
                                } else {
                                    ForEach(resp.options) { o in
                                        Text(o.status.capitalized.replacingOccurrences(of: "_", with: " "))
                                            .font(.caption)
                                    }
                                }
                            }
                            Section("Orders (\(resp.orders.count))") {
                                if resp.orders.isEmpty {
                                    Text("No warranty orders yet").font(.caption).foregroundStyle(.secondary)
                                } else {
                                    ForEach(resp.orders) { o in
                                        Text(o.status.rawValue.replacingOccurrences(of: "_", with: " "))
                                            .font(.caption)
                                    }
                                }
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .vehicles:
                AsyncContent(load: { try await AdminAPI.vehicles() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.vehicles.isEmpty,
                        title: "No vehicles",
                        message: "Vehicles will be listed here once consumers add them.",
                        systemImage: "car"
                    ) {
                        List(resp.vehicles) { v in
                            Text("\(v.year.map { "\($0) " } ?? "")\(v.make ?? "") \(v.model ?? "")")
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .outputs:
                AsyncContent(load: { try await AdminAPI.outputs() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.outputs.isEmpty,
                        title: "No outputs",
                        message: "Generated reports will appear here once inspections are submitted.",
                        systemImage: "doc.richtext"
                    ) {
                        List(resp.outputs) { o in
                            VStack(alignment: .leading) {
                                Text(o.vehicleLabel ?? "Output").font(.headline)
                                Text(o.status ?? "—").font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .listings:
                AsyncContent(load: { try await AdminAPI.listings() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.listings.isEmpty,
                        title: "No listings",
                        message: "Marketplace listings will appear here once sellers publish vehicles.",
                        systemImage: "tag"
                    ) {
                        List(resp.listings) { listing in
                            VStack(alignment: .leading) {
                                Text(listing.title).font(.headline)
                                Text("$\((listing.askingPriceCents / 100).formatted()) - \(listing.status.rawValue)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .community:
                AsyncContent(load: { try await AdminAPI.community() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.posts.isEmpty,
                        title: "No posts",
                        message: "Community posts and listing shares will appear here.",
                        systemImage: "text.bubble"
                    ) {
                        List(resp.posts) { post in
                            VStack(alignment: .leading) {
                                Text(post.author?.displayName ?? post.author?.username ?? "Member")
                                    .font(.headline)
                                Text(post.content)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .reviews:
                AsyncContent(load: { try await AdminAPI.reviews() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.reviews.isEmpty,
                        title: "No reviews",
                        message: "Rate My Tech reviews will appear here.",
                        systemImage: "star"
                    ) {
                        List(resp.reviews) { review in
                            ReviewRow(review: review)
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .communications:
                AsyncContent(load: { try await AdminAPI.communications() }, loaded: { items in
                    emptyOrList(
                        isEmpty: items.isEmpty,
                        title: "No communications",
                        message: "Conversation activity will appear here.",
                        systemImage: "bubble.left.and.bubble.right"
                    ) {
                        List(items) { row in
                            VStack(alignment: .leading) {
                                Text(row.conversationId.prefix(8).uppercased()).font(.headline)
                                Text(row.lastMessagePreview ?? "\(row.messageCount ?? 0) messages")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })

            case .audit:
                AsyncContent(load: { try await AdminAPI.audit() }, loaded: { resp in
                    emptyOrList(
                        isEmpty: resp.logs.isEmpty,
                        title: "Audit log is empty",
                        message: "Every privileged action gets logged here.",
                        systemImage: "shield.checkered"
                    ) {
                        List(resp.logs) { e in
                            VStack(alignment: .leading) {
                                Text(e.action).font(.headline)
                                Text(e.createdAt, style: .relative)
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }, failure: { e, r in ErrorView(message: e.localizedDescription, retry: r) })
            }
        }
        .navigationTitle(section.rawValue.capitalized)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func emptyOrList<Content: View>(
        isEmpty: Bool,
        title: String,
        message: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        if isEmpty {
            EmptyStateCard(title: title, message: message, systemImage: systemImage)
                .padding()
        } else {
            content()
        }
    }

    private func vehicleName(_ vehicle: Vehicle) -> String {
        let label = [vehicle.year.map(String.init), vehicle.make, vehicle.model, vehicle.trim]
            .compactMap { $0 }
            .joined(separator: " ")
        return label.isEmpty ? "Inspection" : label
    }
}
