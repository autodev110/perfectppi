import SwiftUI

/// Plan 15.5: the safety notice shown on posts that involve brakes, airbags,
/// lifting, fuel systems, or high-voltage systems. The server computes the
/// label and the wording; this view only presents it and links to the rules.
struct CommunitySafetyNoticeView: View {
    let notice: CommunitySafetyNotice
    var compact: Bool = false

    @State private var showingGuidelines = false

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(compact ? .caption : .subheadline)
                .foregroundStyle(Theme.Palette.warning)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(notice.message)
                    .font(compact ? .caption : .footnote)
                    .foregroundStyle(.primary.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
                Button("Read the safety rules") { showingGuidelines = true }
                    .font((compact ? Font.caption : Font.footnote).weight(.semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.Palette.primary)
            }
        }
        .padding(.horizontal, compact ? 10 : 12)
        .padding(.vertical, compact ? 8 : 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.warning.opacity(0.12))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Theme.Palette.warning.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Safety notice")
        .accessibilityValue(notice.message)
        .sheet(isPresented: $showingGuidelines) {
            SafariWebView(url: PolicyPage.communityGuidelines.url)
        }
    }
}
