# PerfectPPI Social Media Update Plan

**Document type:** Product, UX, backend, moderation, and rollout specification

**Status:** Implementation plan

**Last updated:** September 9, 2026

**Primary audience:** Anzo and any PerfectPPI mobile, web, backend, database, moderation, or QA developer

**Primary implementation surface:** Native iOS app, Next.js API/admin application, Supabase/Postgres, and R2 media storage

## 1. Purpose of this document

This document is the consolidated source of truth for the PerfectPPI social-media expansion. It combines:

- The original requested social features: public/private profiles, required usernames, mutual friends, people search, groups, general posts, and group posts.
- The current state of the native Swift app and existing web/backend implementation.
- The requested launch moderation change: ordinary posts are published automatically, new Community video uploads are paused, every eligible post has a visible report action, one valid report immediately hides the post globally, and an administrator decides whether to restore or remove it.
- Required evidence retention: an administrator removing a reported post must not hard-delete the underlying post or its moderation evidence.
- Product, UX, privacy, accessibility, marketplace, Garage, inspection, and car-enthusiast improvements that make the social feature useful rather than a generic social feed.
- Explicit states, permissions, edge cases, acceptance criteria, rollout phases, and deferred scope so implementation does not depend on guesswork.

Where this plan conflicts with the older `2026-08-04-updates/social-media-user-image-upload-compliance.md` brainstorm, this document controls product behavior for the initial social launch. The older document remains valuable as the description of the already-built moderation infrastructure and the possible future automated moderation system. Existing legal-hold, audit, storage-security, and account-enforcement protections are not to be removed merely because automated publication review is paused.

This is a product and engineering specification, not legal advice. Legal reporting obligations, ordinary moderation-evidence retention periods, legal-hold release, minimum age, and law-enforcement workflows still require approval from the appropriate business owner and counsel.

## 2. Product vision

PerfectPPI should not become a generic Instagram clone with cars in the photos. Its defensible purpose is to connect the identity and history of a vehicle with the people who own, inspect, repair, discuss, buy, and sell it.

The intended product loop is:

> Discover a vehicle -> inspect it -> buy or own it -> maintain or build it -> discuss it with relevant people -> eventually sell it with useful, trustworthy history.

Every significant social feature should help a user do at least one of the following:

- Document a vehicle.
- Solve a vehicle problem.
- Learn from relevant owners or verified technicians.
- Find a useful group, shop, event, listing, or person.
- Evaluate a purchase.
- Maintain, modify, protect, or sell a vehicle.

Time spent scrolling and raw like counts are not the primary product goals. Meaningful vehicle activity, useful answers, inspection conversion, safer ownership, trusted transactions, and repeat ownership use are the primary goals.

## 3. Non-negotiable product decisions

These decisions are requirements unless the product owner explicitly changes them in a later written update.

### 3.1 Social identity

- PerfectPPI uses mutual **friends**, not followers and following.
- A friendship exists only after a request is accepted.
- Every account must have one unique username.
- Usernames are permanent for the initial release. Users cannot change them in Settings.
- Profiles can be public or private, but accepting a friendship is still required in both cases. A public profile is not a one-way follow relationship.
- Social profile information and account/settings information must be separate screens.

### 3.2 Community structure

- A user can publish to the general Community or to one group they are allowed to post in.
- General posts appear on the author's profile and in eligible general/friend/vehicle-aware feeds.
- Group posts appear in the group and in eligible members' feeds. Private-group content must never leak through profiles, search, notifications, share links, or vehicle pages.
- Users can create groups, discover groups, search groups, join or request access, leave groups, and post within joined groups.
- People, groups, posts, vehicles/builds, listings, and technicians are searchable, subject to privacy and blocking rules.

### 3.3 Initial publication and media policy

- Ordinary text posts and comments publish immediately after server-side authentication, authorization, schema validation, posting restrictions, rate limits, and basic deterministic security/spam checks.
- They do not wait for Gemini, another general-purpose AI classifier, or ordinary manual approval in this launch mode.
- “Auto-approved” means there is no routine human or AI approval gate. It does **not** mean an older client can bypass account restrictions, rate limits, attachment ownership, file validation, privacy rules, or a required known-illegal-content safeguard.
- Still-photo posts remain available only under the launch matrix below. Photos must retain existing file-size, MIME/magic-byte, ownership-bound reservation, hash, and safe-storage controls, and must add verified EXIF/location metadata removal plus safe display-variant processing.
- Launch configuration: the general-purpose Gemini editorial classifier is not a publication gate for ordinary text or still-photo posts; the existing specialist known-illegal-image safeguard remains enabled as a separate safety control.
- If a legally required or product-required public-image safety gate is unavailable, the safe fallback is to disable new public image uploads rather than silently weaken that required safeguard. This decision must be reviewed before production launch.
- New Community/social video selection and upload are disabled for this release.
- The video restriction is limited to Community/social posts. It must not silently disable inspection evidence, vehicle documentation, private messages, or Media Packages unless those surfaces receive a separate product decision.
- Existing video schema, storage support, and moderation code should remain behind a server-controlled feature flag for a later release. Do not delete that architecture.
- Already approved Community videos may remain viewable. Previously pending, rejected, quarantined, or legal-hold videos must not be made public by the new auto-publish mode.

### 3.4 Reporting and removal

- Every visible post not authored by the current viewer has an obvious report action in both feed cards and post detail.
- One valid first report immediately hides that post from all ordinary users while it awaits administrator review. This conservative one-report threshold is intentional for the test launch.
- Reports on comments immediately hide the reported comment, not the entire parent post, unless an administrator separately hides the post.
- Reporting does not prove that a violation occurred and does not automatically ban the author.
- An administrator can restore the content, confirm removal from the Community, or preserve and escalate it under legal hold.
- “Remove” or “Delete from Community” means a **soft removal from public product surfaces**. It must not physically delete the database row, reports, audit history, or preserved media evidence.
- Reporter identity is never disclosed to the author, group moderators, other users, or public APIs.
- No report automatically sends information to law enforcement. External disclosure requires an authorized human workflow, appropriate legal basis, and an audit trail.

### 3.5 Product scope guardrails

- Do not add Stories, Reels, livestreaming, autoplay video, streaks, popularity leaderboards, or a black-box engagement-ranking system in the initial expansion.
- Do not expose live vehicle location, a home address, a complete VIN, private receipts, private inspection notes, or unredacted documents through social features.
- Do not build speed leaderboards, street-racing challenges, or other mechanics that encourage dangerous driving.
- Do not present community answers, OBD information, or AI output as a certain professional diagnosis.

### 3.6 Initial release configuration at a glance

This table is the authoritative launch configuration. Later sections explain the implementation details.

| Capability | Initial production state | Required behavior |
|---|---|---|
| General text posts | Enabled | Publish immediately after deterministic validation; no Gemini/general AI approval gate |
| Text comments | Enabled | Publish immediately after deterministic validation; no routine human/AI approval gate |
| Still-photo posts | Conditionally enabled | Enable only while the mandatory specialist known-illegal-image gate and private media delivery are healthy; general Gemini editorial image gate off; automatically disable new photo publishing if the required gate is unavailable |
| New Community video | Disabled | Removed from UI and rejected by reservations, upload, finalization, and post APIs; already-approved legacy videos may remain viewable through the new private delivery path, while all pending/rejected/quarantined/held videos remain unavailable |
| Phase 1A post types | General and Question/Troubleshooting | Accepted Answer included; other structured types remain feature-flagged for later phases |
| Groups in Phase 1A | Staff-curated public/open groups | Join, leave, view, and post; user-created/private/unlisted groups remain off until Phase 1C |
| Report threshold | First valid report hides immediately | After a human restoration, the exact unchanged revision follows the explicit re-report rule in Section 20.1 |
| Community access | Authenticated app users | Public-web exposure is a separate per-content opt-in and remains off by default |
| Public Community media | No permanent public object URLs | Serve from private storage through authenticated status/audience checks on every delivery request |
| Automated law-enforcement contact | Disabled | Only the authorized, audited safety/legal workflow may disclose evidence externally |

## 4. App Store and launch-safety position

The report-and-hide feature is useful and should materially improve launch safety, but a report button alone is not a complete App Store user-generated-content program.

As of this document's date, [Apple App Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/) separately calls for:

- A method for filtering objectionable material from being posted.
- A mechanism to report offensive content and timely responses to concerns.
- The ability to block abusive users.
- Published contact information so users can reach the service.

Therefore, the minimum initial release must also include:

1. Server-side post validation, practical anti-spam/rate-limit controls, and a documented objectionable-content safety control. This can be lightweight and non-AI, but it cannot be merely a decorative client check.
2. Report controls on all relevant user-generated-content surfaces.
3. A working review queue monitored by a named administrator or moderator with defined response targets.
4. User blocking that affects feeds, search, friendships, mentions, and messaging.
5. Community Guidelines and a visible Support/Contact path inside the iOS app as well as on the website.
6. The ability to remove violating content and restrict abusive accounts.
7. App Review notes and a review account that make the safety controls easy for Apple to test.

This document must not be used to claim or guarantee App Store approval. If the product launches with every item published and no meaningful filtering control, that remains an explicit review and safety risk even when reports are available.

## 5. Terminology and state definitions

Developers, administrators, support staff, and user-facing copy must use these terms consistently.

| Term | Meaning |
|---|---|
| `draft` | The user is still composing. It is not public and is not a moderation state. |
| `active` content | Eligible viewers can retrieve and see the content. |
| `archived` | The author intentionally removed their own content from normal display. This is not a moderation decision. |
| `hidden` | The platform has made the content unavailable to ordinary viewers, normally because a report or review is open. |
| `pending_review` | A moderator decision is required. For posts/comments, the paired public content state must be `hidden`. |
| `rejected` | A moderator confirmed that the content will remain removed from the Community. The record is retained. |
| `legal_hold` | The content and related evidence are hidden, locked against ordinary cleanup, and available only through the restricted workflow. |
| restore/unhide | A moderator found no actionable violation and returns the content to `active`. |
| remove from Community | A moderator confirms a violation. The content remains `hidden/rejected`; the underlying evidence is retained. |
| hard delete/purge | Physical deletion after an approved retention period and only when no hold applies. This is never an ordinary moderator button. |

The existing two-field approach should remain:

- `content status` controls product visibility, such as `active`, `hidden`, or `archived`.
- `moderation status` controls the review lifecycle, such as `active`, `pending_review`, `rejected`, or `legal_hold`.

A separate moderation case/resolution record should make the administrator's outcome explicit:

- `open`
- `no_violation_restored`
- `violation_removed`
- `legal_escalation`
- `appeal_open`
- `appeal_upheld`
- `appeal_overturned`

Do not overload `archived` to mean “moderator removed,” and do not label a retained soft removal as a database deletion.

## 6. Current architecture and required changes

The project already has a strong foundation. The implementation should adapt it rather than replace it.

### 6.1 Existing useful foundation

- `community_posts`, `community_comments`, and `community_post_media` already exist.
- Posts and comments already have public status and moderation status fields.
- `moderation_items`, `moderation_reports`, append-only `moderation_events`, appeals, enforcement actions, media hashes, legal-hold reviewers, upload reservations, and cleanup jobs already exist.
- Community writes are server-mediated so clients cannot directly bypass moderation logic.
- Feed queries already require both `status = active` and `moderation_status = active`.
- A protected web moderation queue already exists at `/admin/moderation`.
- Admin review already supports approval, rejection, legal hold, warnings, posting/media holds, and suspension.
- Legal-hold database triggers already protect held posts/comments/media from deletion.
- The iOS application already has Community feed/detail/composer views and a `CommunityAPI.report` path.
- Media already uses quarantine-capable R2 storage and protected admin-preview infrastructure.

### 6.2 Current gaps that must be fixed

| Current behavior | Required behavior |
|---|---|
| `GET /api/community/posts` can currently be read without authentication and the query uses an admin client with broad `vehicles(*)`/`marketplace_listings(*)` joins. | Require authentication, replace service-role feed reads with viewer-aware authorization, and return narrow redacted DTOs. Never send a full VIN-bearing vehicle/listing row to the feed. |
| New posts/comments are inserted hidden, synchronously classified, and only then published. Provider failure fails closed. | Launch mode publishes normally valid text posts/comments immediately without calling the AI classifier. Record the configured launch decision for audit without provider dependency. |
| The iOS report control is gray and appears in post detail, not on every feed card. | Use the exact red flag control specified below on every eligible feed card and detail screen. |
| A successful iOS report shows an alert but does not remove/reload the post. | Remove the post locally only after server confirmation and reload/invalidate the feed. |
| `submit_moderation_report` records the report and changes `moderation_items`, but does not atomically hide the underlying post/comment. | The same database transaction must update the content to `hidden/pending_review`. |
| Approved post media is stored at a public R2 URL that may remain directly reachable after a DB hide. | Migrate Community media to private R2 and serve it only through the authenticated status-aware endpoint; retain restricted evidence references. |
| The web moderation queue may show only a 500-character preview and limited context. | Show the exact reported revision, all media/context, all reports, and relevant account/moderation history. |
| Admin actions are named Approve/Reject/Legal Hold. | Use Restore Post, Remove from Community, and Preserve and Escalate, with explicit resolution semantics. |
| The separate admin Community page exposes a physical Delete button. | Remove the hard-delete action for reported/rejected/held content and replace ordinary removal with soft removal. |
| Author or admin deletion can physically delete an ordinary post and its media unless it is already under legal hold. | Reported or retained moderation evidence must be protected from hard deletion; normal author removal is a soft archive. |
| Account deletion can cascade through the author relationship and destroy ordinary report evidence. | Account deletion must respect documented moderation-evidence retention and legal holds while minimizing/anonymizing unrelated account data. |
| New Community uploads currently accept image and video MIME types. | Remove video from current iOS selection and reject Community video reservations/attachments server-side. |
| Media promotion currently copies uploaded image bytes and does not guarantee EXIF/metadata removal or re-encoding. | Add verified metadata removal/re-encoding for public Community variants and retain only approved evidence metadata in restricted storage. |
| The public Privacy, AI Disclosure, and Community Guidelines describe automated text/image/video behavior. | Update all public/in-app disclosures to match the feature-flag configuration actually shipped. |
| No user-block relationship is implemented. | Add blocking before App Store submission and enforce it in every social query/action. |

### 6.3 Primary files and systems affected

The implementation will likely touch at least these current surfaces:

- Native tab structure: `mobile-app/PerfectPPI/Features/Consumer/ConsumerTabs.swift`
- Native More menu: `mobile-app/PerfectPPI/Features/Platform/PlatformMoreView.swift`
- Native Community feed/detail/composer/report UI: `mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift`
- Native Community networking: `mobile-app/PerfectPPI/Core/Networking/Endpoints/CommunityAPI.swift`
- Shared native models: `mobile-app/PerfectPPI/Core/Models/Domain.swift`
- Community server actions: `src/features/community/actions.ts`
- Community viewer-aware queries: `src/features/community/queries.ts`
- Report and review actions: `src/features/moderation/actions.ts`
- Moderation queue queries/UI: `src/features/moderation/queries.ts` and `src/app/(admin)/admin/moderation/page.tsx`
- Separate admin Community UI: `src/app/(admin)/admin/community/page.tsx`
- Community API routes under `src/app/api/community/`
- Upload routes and R2 helpers under `src/app/api/upload/`, `src/features/uploads/`, and `src/lib/storage/`
- Current moderation policy modules under `src/lib/moderation/`
- Community/moderation Supabase migrations and database tests.
- Privacy deletion/export implementation under `src/lib/privacy/`.
- Public Privacy Policy, AI Disclosure, Terms, Support, and Community Guidelines routes.

## 7. Information architecture and navigation

### 7.1 Consumer tab bar

Change the consumer tab bar from:

> Home · Vehicles · Inspections · Warranty · More

to:

> Home · Garage · Inspections · Community · More

Requirements:

- Rename consumer-facing Vehicles to **Garage**. Internal/admin terminology may remain “vehicles” where operationally useful.
- Promote Community to a permanent top-level tab when the social expansion ships.
- Move Warranty into the relevant vehicle's Garage page, a contextual Home card when action is needed, and a secondary More destination.
- Marketplace, Technicians, Messages, Media Packages, Saved Items, Support, and Settings remain accessible from More unless later usage data justifies another navigation change.
- Use notification badges for pending friend requests, unread messages, group activity, and moderation notices. Do not add separate permanent tabs for each.

### 7.2 Home dashboard

Home should answer: “What needs my attention today?” It should not become a duplicate infinite Community feed.

Recommended order:

1. **Your Garage:** horizontal vehicle cards using real cover photos.
2. **Next actions:** resume a draft inspection, reply to a message, complete onboarding, update mileage, resolve a listing, or review warranty eligibility.
3. **Quick actions:** Add Vehicle/Scan VIN, Start Inspection, Create Post, and List Vehicle.
4. **Vehicle alerts:** maintenance, recall, inspection follow-up, or warranty information.
5. **Recent inspections:** a concise list with status and next action.
6. **Community preview:** a small number of relevant friend/group/My Cars items, not the full feed.
7. **Marketplace preview:** saved-listing changes or a relevant inspected listing when useful.

Empty Home modules collapse rather than leaving large blank areas. Every empty state provides one meaningful action.

### 7.3 Community structure

Community has two top-level sections within the tab:

- **Feed** — posts published to the general Community.
- **Groups** — joined-group activity plus the group directory.

Search opens a unified Discover experience rather than occupying a third permanent segment. This avoids duplicating Groups in both the top navigation and feed filters.

Feed uses an easy-to-reach segmented filter or chips:

- **All:** all eligible general Community posts.
- **Friends:** chronological general posts from accepted friends.
- **My Cars:** general posts and questions tagged to vehicles/models in the viewer's Garage or saved interests.

Group posts remain under Groups. The Groups screen can segment **Joined · Discover** and show recent posts from joined groups without mixing private-group activity into the public All feed.

Start with transparent reverse-chronological ordering. Ranking can later add relevance based on selected interests, Garage vehicles, joined groups, and saved searches, but it must not become an unexplained engagement algorithm during the initial rollout.

### 7.4 Global Community header

- Use a clearly visible Create Post action. Do not hide it under the current ellipsis menu.
- Provide search/discover access.
- Provide inbox/message and notification icons with unread badges. They open the same global Messages and Notifications destinations already accessible from More; do not create a second Community-only inbox or duplicate unread counts.
- The ellipsis remains available only for secondary actions such as My Posts, Saved Items, Community Guidelines, and muted/blocked accounts.

## 8. Required usernames and account completion

### 8.1 Username rules

Every PerfectPPI account must have a username that satisfies all of these rules:

- Length: 4 through 16 characters inclusive.
- Allowed characters: ASCII letters `A-Z`/`a-z`, numbers `0-9`, and underscore `_` only.
- Hyphens, periods, spaces, emoji, accents, and other symbols are not allowed.
- Usernames are case-insensitively unique. `Dan110` and `dan110` are the same username for availability purposes.
- Preserve the casing the user chose for display, normalize/store a lowercase canonical lookup form, and display the chosen form with `@`.
- Reject reserved platform, legal, safety, support, and impersonation-sensitive names, including obvious variations where practical.
- Availability shown while typing is advisory. The server/database makes the final atomic uniqueness decision when the user submits.
- The database, web API, and Swift validation must enforce the same rules. The current 3–30-character/hyphen behavior must be migrated rather than left inconsistent.
- Usernames are not editable by ordinary users after onboarding in this release.
- A narrowly authorized administrator may correct a username only for security, impersonation, legal, or migration reasons. That action must be audited.

### 8.2 New account flow

- Email/password signup asks for a username before the account reaches the main app.
- Google, Apple, or another federated sign-in may authenticate first, but the user is then held in a required **Choose your username** completion screen.
- The auth/profile trigger may create a profile with `username = NULL` only while `username_state = pending`. Pending accounts may access onboarding/account recovery but no main social/product data.
- A one-time authenticated claim operation atomically validates availability, writes the username, and changes `username_state` to `claimed`.
- The user cannot dismiss that screen into the app until a valid unique username is committed.
- Preserve the intended destination so a user who signed in from a listing/profile deep link returns there after completion.
- Show the rules in plain language: “4–16 characters. Letters, numbers, and underscores only. Usernames cannot be changed yet.”
- Check availability after a short typing debounce and again at final submission.
- If another user takes the name between the advisory check and submission, keep the typed value, display “That username was just taken,” and let the user try another.
- Because the current iOS app offers Google sign-in, implement Sign in with Apple for the production iOS build unless counsel/product documents a valid current App Review Guideline 4.8 exception. The username completion gate applies identically after Apple sign-in.

### 8.3 Existing users

- Backfill every existing non-pending profile without a username before enforcing the conditional rule that every completed account has a username.
- Generate a random, non-identifying valid username; do not derive it from an email address, phone number, VIN, legal name, or authentication identifier.
- Handle collisions inside one database transaction or retry loop.
- Generated usernames should look neutral, for example a short “driver” prefix plus random letters/numbers, while remaining within 16 characters.
- Existing users see the assigned username in their profile. Per the current product decision it is permanent, but support/admin can resolve an inappropriate generated value.
- Invalid existing usernames must be normalized or migrated. Preserve a private mapping/tombstone if public profile links change.

### 8.4 Deletion and reuse

- Do not recycle deleted or banned usernames in the initial release. Immediate reuse enables impersonation and breaks old links.
- Retain a minimal, non-public username reservation/tombstone while removing or anonymizing unrelated deleted-account data. A future username-reuse feature requires a separate approved policy and link-migration design.
- Public links to a deleted profile show “This profile is unavailable,” not the new owner of a recycled identifier.

## 9. Social profiles and privacy

The app currently labels an account/settings list as “Profile.” Split this into two separate experiences.

### 9.1 Social profile screen

The social profile is what another member sees after tapping an avatar or username. It includes:

- Avatar.
- Display name.
- `@username`.
- Bio.
- Mutual-friend count rather than follower/following counts.
- Relevant verified badges with clear definitions, such as Verified Technician, Verified Owner of a displayed vehicle, or PerfectPPI Inspected Vehicle.
- Primary actions: Add Friend/Respond to Request/Friends, Message when allowed, and overflow actions for Mute, Block, and Report Profile.
- Tabs or sections for **Posts**, **Garage**, and **About**.
- Optional displayed groups, joined date, general region, and automotive interests only when the user chooses to show them.
- Empty states that explain why content is unavailable or invite an allowed action.

Do not expose email, phone number, authentication provider, full VIN, complete address, precise live location, private messages, receipts, unshared inspection details, internal role-switching capability, or staff-only enforcement data.

### 9.2 Profile privacy behavior

**Public profile:**

- Signed-in members can view the basic social profile and content explicitly marked Public.
- Sending a friend request is still required to become friends.
- A public profile does not create a one-way follower relationship.
- A separate explicit setting must control whether a profile is also accessible on the public web. “Public inside PerfectPPI” must not silently mean “indexed by search engines.”

**Private profile:**

- Non-friends see avatar, display name, username, a limited bio if the user allows it, mutual-friend count, and the Add Friend control.
- Non-friends do not see friends-only posts, the private Garage, private group membership, or activity history.
- Accepted friends see content marked Friends, subject to per-vehicle and per-post visibility.

**Blocked relationship:**

- The profiles appear unavailable to each other except where a safety/admin process requires otherwise.
- Neither user can infer the block from an explicit “you were blocked” message.

**Authoritative audience rules:**

| Situation | Allowed audience/default |
|---|---|
| Public profile, general post | Public-inside-PerfectPPI or Friends; default Public-inside-PerfectPPI |
| Private profile, general post | Friends only; a private profile cannot create a public general post |
| Any profile, group post | The group's audience; the composer explicitly warns a private-profile user before posting to a public group |
| Public-web view | Separate post/group opt-in plus feature flag; off by default for the launch |
| Vehicle attachment | Redacted immutable snapshot approved in the composer; underlying Garage privacy does not change |

Community feeds require authentication. If public-web sharing is enabled later, an anonymous visitor can see only explicitly web-public content. Tapping Report requires sign-in and returns the user to the exact report sheet after authentication; anonymous reports do not directly trigger global hiding.

Changing a profile from Public to Private immediately reduces all general-profile posts to Friends visibility. Changing from Private to Public does not automatically broaden historical posts; the owner may review and change them individually. A current group audience continues to control group posts. Public-web opt-in is always separate and revocable.

### 9.3 Owner controls

The owner of a profile receives:

- Edit Profile.
- View My Profile.
- **View as Stranger** privacy preview.
- Controls for profile privacy, default post audience, friend-request policy, searchable/discoverable status, displayed vehicles, displayed groups, messages, mentions, and notification preferences.

Keep the normal Edit Profile screen concise. Put profile privacy and the default audience at the top; place discovery, exact-username lookup, messages, mentions, displayed groups, and other granular choices under **Advanced Privacy** with plain-language current defaults.

Hide absent optional fields instead of showing “—”. Keep Account, Privacy, Legal, Export/Delete, Appearance, and connected-login management under Settings.

## 10. Friend relationships

### 10.1 Relationship states

Every pair of users can be in exactly one core relationship state:

- No relationship.
- Outgoing request.
- Incoming request.
- Friends.
- Blocked, which supersedes requests and friendship.

Mute is a separate one-way preference that can coexist with No Relationship or Friends. It does not change the mutual relationship state.

### 10.2 Request behavior

- A user can search for another user and send a friend request if the recipient's policy permits it.
- Sending a request does not expose friends-only content.
- The recipient can Accept or Decline.
- The sender can Cancel while pending.
- Crossed simultaneous requests must resolve atomically into one friendship, not two duplicated rows.
- Duplicate requests are idempotent.
- Declining, canceling, or removing a friendship sends no punitive notification.
- Accepting sends one notification to the requester.
- Removing a friend immediately revokes friends-only access in feed, profile, vehicle, search, cached detail, and shared-link queries.
- Blocking transactionally cancels requests and removes friendship.

### 10.3 Friend-request privacy settings

Offer:

- Everyone.
- Friends of Friends.
- Nobody.

The initial release does not import address books. Suggestions may use mutual friends, shared groups, selected automotive interests, and overlapping vehicle makes/models without exposing private data.

### 10.4 Friend list

- The profile owner can search and manage their friend list.
- Another viewer sees only friends the privacy rules permit, plus mutual friends.
- Friend totals must not reveal blocked or private relationships through count differences.

## 11. Blocking, muting, and member safety

User blocking must ship with the social update; it is both a safety feature and part of the App Store UGC baseline.

Blocking another user must atomically:

- End an existing friendship.
- Cancel friend requests in both directions.
- Prevent new friend requests.
- Remove each user's profile, posts, comments, Garage, and activity from the other's feeds, search, suggestions, mentions, and notifications.
- Prevent likes, comments, mentions, invitations, and other direct interaction.
- Prevent new direct-message threads and message requests.
- Hide or disable Marketplace contact between the accounts.
- Stop ordinary listing-scoped conversation immediately. If an active transaction, dispute, or safety case requires contact, route it through a restricted PerfectPPI support case rather than reopening direct user-to-user messaging.
- Preserve necessary moderation, transaction, and evidence records.
- Avoid notifying the blocked user.

Shared-group handling:

- The two members do not see or directly interact with each other's ordinary group content.
- Group moderators may still see the content required to moderate the group.
- A blocked user cannot use quoted posts, mentions, invitations, alternate accounts, or notifications to bypass the block.

Muting is separate:

- Mute hides a person's posts and optional notifications without unfriending or notifying them.
- Mute does not prevent messaging unless the user separately changes message settings.
- Users can review and reverse blocks/mutes from Privacy & Safety settings.

## 12. People search and discovery

- Search by exact or partial username and display name.
- Give exact username matches priority.
- Debounce network requests, paginate results, and show clear loading/empty/error states.
- Each result includes avatar, display name, username, relevant mutual friends/shared groups, and current friendship action.
- Search must honor profile discoverability, blocks, suspensions, and privacy before returning results.
- Never fetch a broad service-role result set and rely on Swift to remove unauthorized users.
- Rate-limit enumeration and return only the fields required by the result card.
- Do not expose email/phone lookup in the initial release.

When **Discoverable** is off, remove the profile from suggestions and partial-name/partial-username results. A separate **Allow exact username lookup** setting, on by default, controls whether a signed-in user who enters the complete username can find the limited profile shell. Direct links obey that same setting plus blocks/account state.

Mentions use the canonical `@username` parser and store the mentioned account ID as well as the rendered text. Limit a post/comment to ten resolved mentions. A mention becomes a link/notification only when the mentioned user could view the destination and has not blocked the author or disabled that mention class. Private-group mentions never leak outside the group. An audited admin correction of a username updates future rendering/resolution through the account ID; historical text may retain the original spelling. Mention spam is rate-limited and covered by report/block controls.

## 13. Groups

This section defines the complete group system. To keep the first beta testable, Phase 1A starts with staff-curated public/open groups and owner/moderator/member roles. User-created, private, unlisted, invite-only, and advanced-role behavior remains required end-state scope but is enabled in Phase 1C after the simpler authorization/moderation paths are proven.

### 13.1 Purpose and group types

Groups are topic communities comparable to subreddits, but tailored to vehicle ownership. Supported purposes include:

- Make/model/generation/chassis groups.
- Local clubs.
- Build or discipline groups, such as detailing, off-road, restoration, track, autocross, classics, or EV ownership.
- Technical topics.
- Event communities.

### 13.2 Group creation

The create flow requires:

- Display name and a globally unique stable slug/identifier. Display names may repeat when context makes them distinguishable.
- Short description.
- Group category/type.
- Avatar; cover image is optional initially.
- Visibility: Public, Private, or Unlisted.
- Join policy: Open, Request Approval, or Invite Only.
- Group rules and posting permissions.
- Optional make/model/year/generation tags.
- Optional general location such as city/region, never an organizer's home address.

Apply account-age, rate-limit, and enforcement checks to group creation. Consider limiting brand-new accounts to joining groups before allowing them to create many groups.

### 13.3 Visibility and membership

**Public:** discoverable; profile and posts are visible to eligible signed-in users; join behavior follows the selected join policy.

**Private:** discoverable only with a limited description unless configured otherwise; posts/member list require membership; joining requires approval or invitation.

**Unlisted:** does not appear in general discovery; accessible by direct invitation/link; posts still require membership.

Allowed visibility/join combinations:

| Visibility | Allowed join policies |
|---|---|
| Public | Open, Request Approval, Invite Only |
| Private | Request Approval, Invite Only |
| Unlisted | Direct-link Request, Invite Only |

Do not permit Private + Open or an unlisted group that appears in general discovery.

Membership states:

- None.
- Requested.
- Invited.
- Member.
- Removed.
- Banned.

Joining or accepting an invitation must be idempotent. Leaving is immediate. A user cannot bypass a group ban by repeatedly requesting membership.

### 13.4 Group roles and permissions

**Owner:** all group settings, role assignment, ownership transfer, membership moderation, content moderation, visibility changes, and archive/delete controls.

**Admin:** membership and content management plus ordinary settings. Cannot transfer ownership, archive/delete the group, change the group to a less restrictive visibility, view reporter identity, or perform restricted platform/legal actions.

**Moderator:** group post/comment moderation, member removal where granted, and group report handling. A group moderator cannot see protected reporter identity, apply a platform-wide ban, or release legal holds.

**Member:** view/post/comment according to group rules.

There must always be one owner. The owner must transfer ownership before leaving. Archiving/deleting a group removes it from normal use but does not destroy active moderation evidence.

A user-requested account deletion cannot complete while that user is the sole owner of an active group; require transfer or group archive first. If an owner is suddenly suspended/banned or unavailable, freeze new group posts/role changes and send the group to platform review. Do not automatically promote a member. A platform moderator with the proper capability may assign an eligible willing owner or archive the group, with an audit event.

### 13.5 Group screen

Include:

- Cover/avatar, name, description, rules, member count, privacy/join state.
- Join/Leave/Request/Invite control as permitted.
- Tabs or sections for Posts, About/Rules, Members, and later Events/Resources.
- Pinned announcements and guides.
- Search within the group.
- Visible group-level report and block/mute controls where appropriate.

### 13.6 Group posts

- The composer clearly shows “Post to: [Group Name].”
- Authorized members' launch-phase group posts publish immediately; there is no separate routine group preapproval queue.
- The group's visibility determines who may see the post.
- A private or unlisted group post must not become visible through the author's public profile, a vehicle profile, global search, a public share card, or a notification preview.
- On an eligible author's profile, group posts may appear only to viewers who can open that group content.
- Leaving a group does not automatically delete the user's previous posts; group rules determine continued visibility/removal.
- If a group is archived, preserve posts and evidence but stop new posts and comments.

Launch with a curated set of useful groups rather than automatically generating hundreds of empty model groups.

### 13.7 Group removal versus platform moderation

Track destination moderation separately from platform content status:

- A group owner/admin/moderator may set the group-post destination state to `group_removed`, which removes it from that group and from profile/feed representations derived from that destination. It does not mark a platform policy violation or destroy the post/evidence.
- A platform report changes the global content/moderation state and hides every representation.
- Platform restoration after a false report restores only the platform state; it does not reverse an independent `group_removed` decision.
- A group moderator cannot restore platform-rejected content, view protected reporter identity, or release a legal hold.
- The author may appeal a platform action through the platform flow and contest a group action through a separate group-owner contact/appeal mechanism where enabled.

## 14. Posts and composer

### 14.1 Post destinations

A post has exactly one primary destination:

- **General Community/Profile:** stored as a general post; appears on the author's eligible profile and in eligible general/friend/My Cars feeds.
- **Group:** stored with one group destination; appears in that group and eligible group/member feeds.

A post can additionally attach one owned vehicle, one active owned listing, or one shareable/redacted inspection summary where supported. An attached listing automatically implies its vehicle; do not create contradictory vehicle/listing combinations.

### 14.2 Target post types and release timing

Phase 1A enables:

- General.
- Question/Troubleshooting, including Accepted Answer.

Phase 2 enables:

- Build Update.
- Maintenance or Repair.
- Before and After.
- Inspection Discussion.
- Buying Advice.
- Poll.

A poll has 2–6 non-empty options and a duration of 24 hours, 3 days, or 7 days. One account has one vote; it may change that vote until close. Voter identities are not public, although the server retains the account association for integrity. Results appear after voting and at close. Options cannot be edited after the first vote. A hidden/removed poll stops voting and disappears like any other post.

Later types can include Event/Meet, Listing Discussion, and Car Spotted after the required location/privacy controls exist.

### 14.3 Composer layout

Use this order:

1. **Post to:** General Community or one joined group.
2. **Audience:** a plain-language summary such as Public, Friends, or Acura TLX Owners members.
3. **Post type.**
4. **Text editor** with a helpful prompt appropriate to the selected type.
5. **Structured fields** required by the type.
6. **Vehicle/listing/inspection attachment** shown as a removable preview card.
7. **Photos** shown as reorderable thumbnails.
8. **Privacy preview** and Publish action.

Use an auto-growing editor rather than the current large fixed blank rectangle. Keep a keyboard-safe attachment rail for Photo, Camera, Vehicle, Listing, and Inspection. The Publish button remains visible and reflects validation/upload state.

### 14.4 Post limits and validation

- Text maximum: 1,200 characters.
- Comment maximum: 600 characters.
- Allow text-only, photo-only, or structured-attachment posts.
- Update the database constraint that currently requires nonempty post text: text may be empty only when the same finalization transaction verifies at least one permitted photo or structured attachment. Comments always require nonempty text.
- Maximum: 10 still photos.
- Community video is not selectable or accepted during this release.
- Show a character count near the limit rather than at all times.
- Validate URL/link volume and known spam patterns server-side.
- Users under an active posting restriction cannot publish even if an older client tries.
- A private vehicle can be attached to a public post only as an explicitly previewed, redacted vehicle snapshot. Publishing the snapshot does not change the underlying Garage/Vehicle Passport visibility. Never silently expose private vehicle fields.
- Only the owner may attach their private vehicle data or listing. Redacted public inspection sharing must verify authorization.

### 14.5 Drafts and retries

- Autosave an unfinished composer locally.
- Confirm before discarding a non-empty draft.
- Upload progress must be visible.
- A network/media failure preserves the draft and any canonical post identifier so Retry cannot accidentally create duplicate posts.
- Store server-side assembly in a separate private `community_post_drafts`-style record; a draft/assembly is not a moderation state and never appears in `community_posts` feeds.
- Bind upload reservations and private uploaded photos to that draft.
- One idempotent finalize transaction validates the draft, attachments, audience, and post rules, then creates the post, first immutable revision, attachment rows, and active publication together.
- An expiry worker removes abandoned draft records and unattached objects after the configured draft/reservation window.
- Never create an active text post and attach its photos afterward; a partial media post must not briefly publish.
- Retrying a successful request should be idempotent.

### 14.6 Editing and author removal

- Editing an active post creates a revision and shows “Edited.”
- Preserve the exact revision that existed when a report was submitted.
- A post under review cannot be edited, restored, archived, or physically deleted by its author.
- If a restored post is later edited, create a new revision and treat future reports as applying to that new revision.
- “Remove Post” for the author is a soft archive from ordinary display.
- A post with a pending/rejected/legal-hold moderation case remains preserved according to the moderation retention rules even if the author requests removal or account deletion.
- An unreported archived post is restorable by its author for 30 days. After 30 days it becomes eligible for the controlled purge worker, subject to the prerequisites in Section 19.3. Update the current dashboard copy and implement the worker so the promised 30-day behavior is real.

### 14.7 Post card

Every post card should use a social layout rather than an inset Settings-style row. Include:

- Tappable avatar, display name, and username.
- Relevant verified badge.
- Destination/group and audience context.
- Relative timestamp and “Edited” when applicable.
- The report flag in the exact location described in the reporting section.
- Post-type chip such as Question, Solved, Build, Inspection, or Maintenance.
- Text with sensible expansion for long content.
- Full-width photo carousel/gallery.
- Rich vehicle/listing/inspection attachment card.
- Like, Comment, Save, and Share actions.

Remove disclosure chevrons from feed cards. Tapping content opens detail, while avatar, group, attachment, and actions remain independently tappable.

## 15. Comments, likes, saves, shares, and accepted answers

### 15.1 Comments

- Display threaded replies only one level deep in the initial release; deeper replies remain visually flat with reply attribution.
- Use a sticky keyboard-safe comment composer on post detail.
- New comments publish immediately under the same launch policy as text posts.
- A reported comment is hidden globally while the parent post remains available.
- Comment overflow includes Report and, for the author, Edit/Remove where allowed.
- Do not display comments belonging to blocked users to each other.
- Authors may edit an active, unreported comment; every edit creates an immutable revision and displays “Edited.” A comment under review cannot be edited.
- Author removal is soft. If a removed comment has replies, keep a neutral “Comment removed” placeholder so reply structure remains understandable; otherwise omit it.
- An Accepted Answer must be a top-level response by someone other than the question author. The question author can change the selection while both responses are active.
- If the accepted response becomes hidden or removed, remove its visible Accepted Answer state and reputation credit while preserving the historical event; notify the question author that they may select another response.

### 15.2 Likes/helpful reactions

- Initial post reaction is Like.
- Technical answers use Helpful instead of Like once that feature launches, so two nearly identical reaction buttons do not compete on one response.
- One user has at most one active reaction on an entity, and authors cannot react to their own content.
- Updates are optimistic but must reconcile with server authorization and canonical counts.
- Do not notify the author for every rapid like. Aggregate notifications.
- Counts exclude interactions on hidden content and must not leak hidden-content existence.
- Helpful credit applies only while the answer remains active. Hiding/removing the answer removes it from current reputation totals without deleting the historical moderation/reaction record.

### 15.3 Saves and collections

- Saves are private by default and never shown as public popularity metrics.
- Begin with one-tap private Save/Unsave. Named collections such as “TLX suspension,” “Buying checklist,” or “DIY later” belong to the later car-differentiation phase.
- Collections can eventually contain posts, builds, listings, and vehicles.
- If saved content becomes private/hidden/unavailable, show an unavailable placeholder without leaking its prior content.

### 15.4 Sharing

- In-app shares use stable, permission-aware deep links.
- External share cards contain only fields that the current audience is allowed to make public.
- A public link to subsequently hidden/private content stops resolving to the content.
- Never put complete VIN, exact location, report reasons, private-group text, or private inspection findings into link previews.

### 15.5 Questions and accepted answers

Question/Troubleshooting posts may collect:

- Vehicle, model/trim/engine.
- Mileage.
- Symptoms and when they occur.
- Diagnostic codes.
- Recent work.
- What has already been tried.
- Photos.

The author can mark one response as **Accepted Answer** and later choose an outcome:

- Fixed the issue.
- Helped but did not fully solve it.
- Did not fix it.
- Still diagnosing.

Accepted answers ship with the structured Question/Troubleshooting type. The separate Helpful reaction and reputation contribution can follow when reputation launches. Posts involving brakes, airbags, vehicle lifting, fuel systems, or high-voltage EV systems display a safety notice. Community content is not represented as a substitute for a qualified inspection or repair professional.

## 16. Reporting experience

### 16.1 Exact post control

Every post must expose a dedicated reporting affordance in the feed and on post detail. Use Apple SF Symbol **`flag`** as a small outline icon in the system semantic red color. A warning triangle suggests an error, and an exclamation mark suggests urgency rather than reporting; the flag is the most familiar and least ambiguous choice.

Implementation details:

- Place the flag at the trailing edge of the post header, aligned with the author/timestamp block. It must remain visible without opening an ellipsis menu.
- Render the glyph at approximately 14–16 points inside a minimum 44-by-44-point tappable area. The visual can be small; the touch target cannot.
- Do not put the icon in a filled red circle, which makes every feed card visually alarming. Use a red outline glyph, a subtle pressed state, and no persistent background.
- VoiceOver label: “Report this post.” VoiceOver hint: “Opens reporting options. A submitted report hides the post while it is reviewed.”
- Give the control an accessibility identifier and a short tooltip on iPad/pointer environments.
- Do not use the filled `flag.fill` state as a public accusation. The post disappears after a successful report, so a permanent selected state is unnecessary.
- The author does not report their own post. On their own cards, use the same reserved header space for a Manage/ellipsis action containing Edit, Archive, and the current moderation status. This avoids layout shifting while preventing meaningless self-reports.

The current iOS implementation exposes a gray flag only from some detail/comment menus. That is not sufficient. The red post flag must be present on every eligible feed card, search result card that renders full post content, group feed card, profile post card, and post-detail screen.

### 16.2 Report sheet

Tapping the flag opens a bottom sheet. It does **not** submit immediately; accidental taps must be reversible until the final action.

The sheet contains:

1. Title: **Report post**.
2. Explanation: “Tell us what is wrong. When you submit, this post will be hidden while the PerfectPPI team reviews it. The author will not be told who reported it.”
3. One required reason:
   - Spam or misleading content.
   - Harassment or bullying.
   - Hate or dehumanizing content.
   - Violence, threats, or encouragement of harm.
   - Nudity or sexual content.
   - Personal or private information.
   - Scam, fraud, or unsafe transaction.
   - Illegal or dangerous activity.
   - Dangerous vehicle or repair advice.
   - Copyright or other intellectual-property issue.
   - Other.
4. Optional details field, maximum 500 characters. Details are required for Other and intellectual-property reports.
5. A red **Submit Report** action and neutral Cancel action.

Use these stable machine reason codes, separate from localized labels: `spam`, `harassment`, `hate`, `violence`, `sexual_content`, `personal_information`, `fraud`, `illegal_content`, `dangerous_vehicle_advice`, `intellectual_property`, and `other`. Migrate/map older reason codes deliberately; do not store localized display strings as policy keys.

The report domain supports these entity-type codes: `post`, `comment`, `profile`, `group`, `listing`, `review`, `message`, and `media`. A type may remain disabled until its surface launches, but the schema, validation, evidence adapter, and queue must use one defined code set. Expand current post/comment-only database constraints accordingly.

The sheet should not ask the user to decide whether content is criminal. It asks what they observed. For imminent danger, the copy may say to contact local emergency services; PerfectPPI must not imply it provides an emergency-response service.

### 16.3 Submission states

- Disable repeated taps while the request is in flight and show a compact progress indicator.
- On server success, remove the post from the current screen immediately and show: **“Report received. This post is hidden while it is reviewed.”**
- Offer a secondary **Block this user** action in the success confirmation. Reporting and blocking remain separate records; declining to block does not undo the report.
- If the user is on post detail, return to the prior screen after confirmation.
- If the request fails, keep the post visible, keep the sheet selections, explain that the report was not submitted, and offer Retry.
- Do not silently background-queue a safety report in the launch release. If offline, preserve the selected reason/details locally, show “Not submitted,” and require an explicit Retry when connectivity returns. The UI must not claim the post is globally hidden until the server confirms the atomic transaction.
- If another report hid the post first, treat the later valid request as success, attach its report to the existing case, and remove the post from the reporter's UI.
- A duplicate report from the same account for the same content revision returns the original success result rather than creating another record.

API semantics are stable:

- Return `201 Created` when this call creates a new report, including an additional unique supporting report on an existing case.
- Return `200 OK` with the original result for an idempotent retry/duplicate by the same reporter on the same entity revision.
- Return a structured error for invalid/self/rate-limited/no-longer-reportable targets; the app never infers state from error-message text.
- Successful body includes `reportId`, `caseId`, `entityType`, `entityId`, `revisionId`, `caseState`, `contentStatus`, `moderationStatus`, and `hiddenGlobally`. It excludes report counts, other reporters, and internal priority.

### 16.4 Comment and other UGC reporting

The launch requirement is a visible red flag on every eligible post. Comments should use **Report comment** in their ellipsis menu to keep dense threads readable. Reporting a comment hides that comment globally and queues only that comment unless the full post is separately reported.

App Store safety coverage cannot stop at posts. Profiles, group names/descriptions, marketplace listings, reviews, messages, and uploaded media also need a discoverable report path before those user-generated surfaces are broadly enabled. Those surfaces can use a conventional ellipsis menu rather than a permanently red icon, but they must feed the same case system and preserve the correct evidence type.

### 16.5 Entity-specific immediate effects

| Reported entity | Immediate effect after valid server success |
|---|---|
| Post | Hide the post globally under the one-report/re-report rules |
| Comment | Hide the comment globally; keep parent post active unless separately reported |
| Media attached to a post/comment | Hide the parent entity globally and restrict the media |
| Profile/avatar | Remove it from the reporter's view, offer Block, and queue review; do not globally erase an account on one ordinary profile report |
| Group name/description/cover | Remove it from the reporter's recommendations where possible and queue platform review; membership/content continues unless a high-risk rule or moderator freezes it |
| Marketplace listing | Hide it for the reporter and queue fraud/safety review; high-risk fraud, illegal item, or exposed private-information rules may platform-hide it immediately |
| Review | Hide it for the reporter and queue review; platform visibility changes only through its review policy |
| Direct message/media | Hide the selected item for the reporter, offer Block/End Conversation, preserve thread context, and queue review; it is not retracted from the other participant's already-delivered copy |

The one-valid-report global-hide requirement is specifically mandatory for Community posts and comments. Other entity types use this table so a single malicious report cannot erase an account, group, transaction, or conversation without an explicit high-risk rule.

## 17. Moderation state machine and report transaction

### 17.1 Canonical state transitions

The content table remains the source of truth for whether ordinary users may see an item. `moderation_items` describes why it is in a review state; it must not be the only table changed.

| Event | Content status | Moderation status | Ordinary visibility |
|---|---|---|---|
| Valid new post completes | `active` | `active` | Visible to its permitted audience |
| First valid report | `hidden` | `pending_review` | Hidden globally |
| Additional report | `hidden` | `pending_review` | Remains hidden; report is attached to the case |
| Administrator restores | `active` | `active` | Visible again to its permitted audience |
| Administrator confirms violation | `hidden` | `rejected` | Removed from Community surfaces |
| Authorized legal preservation | `hidden` | `legal_hold` | Hidden; access restricted to designated reviewers |
| Author archives an unreported post | `archived` | retain current status, normally `active` | Hidden from ordinary surfaces |

For a comment, use the equivalent comment status. Hiding a parent post also hides all children through visibility rules, without changing every child row. Restoring the parent does not restore independently hidden/rejected comments.

### 17.2 Meaning of a valid report

A report is valid for triggering the initial hide when all of the following are true:

- The reporter is authenticated and not suspended from reporting.
- The target exists and the reporter was authorized to view that exact revision immediately before reporting.
- The reporter is not the content author.
- The target is not already archived, rejected, or under legal hold.
- The reporter has not already reported that entity revision.
- The request passes report-rate and abuse limits.
- The reason is recognized and required detail is present.

“Valid” here means structurally and procedurally valid, not that the allegation has been proven.

### 17.3 Required atomic server operation

The current database report function inserts a report and changes the moderation item, but does not reliably change the underlying `community_posts` or `community_comments` row. Because feed queries use the content row, that can leave reported content public. Replace that behavior with one transaction that:

1. Authenticates the reporter from the server/session context; never accepts a trusted reporter ID from the client.
2. Locks the target content/moderation record so simultaneous reports cannot race.
3. Resolves idempotency/duplicate status before rejecting a now-hidden target, then re-evaluates ownership, base audience entitlement, and rate-limit rules.
4. Inserts the report with an idempotency key and the reported revision ID.
5. Creates or updates the moderation item and aggregates report count/reason categories.
6. Captures the immutable evidence snapshot described below.
7. Changes the underlying post or comment to `hidden` and its moderation state to `pending_review` when this is the first eligible report.
8. Appends an immutable moderation event containing actor class, prior state, next state, reason, and timestamp.
9. Enqueues a durable moderator notification/outbox event.
10. Commits all changes together or rolls all of them back.

Feed/detail DTOs include a short-lived opaque report-context token bound to viewer, entity, revision, and prior audience entitlement. This lets a second person who had the same revision on screen attach a supporting report after the first report hides it. The server validates the token and current account/block state, and may ignore only the hide caused by that open report; the token never grants content viewing or media access. Without a valid recent token, a hidden target cannot be newly reported through entity guessing.

The response returns the canonical content state and case identifier. Clients must never fake success by only filtering a local array.

After commit, invalidate or update every representation of the item: general and friend feeds, group feeds, profile posts, search indexes, saved-content retrieval, vehicle/build pages, listing discussion, notification previews, share/deep links, counts, server caches, client caches, and CDN-accessible media. Realtime events may accelerate removal, but authorization at read time remains the guarantee.

### 17.4 Author experience while under review

The author should not see the reporter's identity, free-text explanation, or report count. In **My Posts**, show a read-only status card:

- “This post is temporarily hidden while our team reviews a report.”
- Submitted time and a link to Community Guidelines.
- No Edit, Republish, Share, or Delete control while the case is open.

When a decision is made:

- Restored: notify the author that the post is visible again, with no allegation details that could identify the reporter.
- Removed: show the violated policy category, action date, account consequence if any, and appeal control.
- Legal hold: use counsel-approved neutral copy. Do not reveal investigative or preservation details.

## 18. Moderator/admin review experience

### 18.1 Roles and access

Create a service-only `moderation_role_grants`-style capability record. The initial capabilities are:

- `queue_read`
- `reporter_identity_read`
- `content_decide`
- `account_enforce`
- `evidence_export`
- `legal_hold_review`

Existing production admins receive no implicit evidence access after migration; bootstrap each needed grant explicitly. A moderator may receive queue/read/decision without reporter-identity, account-enforcement, export, or legal-hold authority. Production developer role-switching must not grant moderation/evidence capabilities. Keep Switch Role for debug/staging or explicitly provisioned test environments only.

Route guards, server actions, and SQL functions enforce the capabilities separately. Legal-hold evidence remains limited to the separately designated legal-hold reviewer capability already represented by the current protected workflow.

Every view, media access, status change, note, export, and external-disclosure step must be audited. Fetch sensitive evidence only through an audited service endpoint, not a generic direct admin query that leaves reads invisible. Administrative service credentials must never be embedded in the iOS app.

### 18.2 Queue layout

The admin moderation page should have these queue tabs:

- **New reports** — open cases ordered by risk priority, then oldest first.
- **In review** — cases claimed by a moderator.
- **Escalated/legal** — restricted access.
- **Appeals** — removed content with an open appeal.
- **Closed** — restored, removed, or otherwise resolved cases.

Each row should show enough context to triage without exposing more sensitive evidence than necessary:

- Content type and case ID.
- Author username and enforcement status.
- Group/destination and vehicle/listing attachment type.
- Created, first-reported, and oldest-unreviewed times.
- Number of unique reports and summarized reason categories.
- Whether media, prior revisions, prior violations, or an appeal exist.
- Risk badges for threat, personal information, suspected illegal content, or repeat offender.
- Assigned moderator and SLA indicator.

Filters should include reason, content type, group, status, age, media presence, repeat reports, author enforcement state, and assigned moderator. Search should accept case ID, post ID, and exact username; it must not expose this index to ordinary admin roles that lack moderation permission.

### 18.3 Case detail

The case page should include:

- The exact reported revision, not just the current mutable post.
- Full text and privately served evidence media.
- Author, audience, group, vehicle/listing/inspection references, and creation/edit timestamps.
- Reports grouped by reason, with reporter identity visible only to authorized platform moderators.
- Prior moderation history for the author and prior reports against this content.
- A chronological, append-only event timeline.
- Internal notes with author and timestamp.
- A conflict warning if another moderator changes the case while it is open.

Do not rely on the current short preview alone. A moderator needs the whole relevant context, including the surrounding comment thread when the report concerns harassment or dangerous advice.

### 18.4 Moderator decisions

Use these exact primary actions:

1. **Restore Post** — closes the report as no violation or insufficient evidence, changes the content back to `active`, republishes only to its original audience, records the decision, and notifies the author. It must not broaden a private audience.
2. **Remove from Community** — keeps the content `hidden`, sets moderation status to `rejected`, requires a policy category and internal rationale, preserves the record/evidence, revokes public media, closes or links all open reports, and notifies the author with an appeal option.
3. **Preserve and Escalate** — keeps content hidden, applies legal hold, moves media/evidence into restricted access, and alerts the designated safety/legal reviewer. This action is available only to authorized roles and does not itself contact authorities.

Secondary actions may include warn author, restrict posting for a defined duration, suspend account, ban account, reject a malicious report, or request a second reviewer. Account enforcement uses the existing `user_enforcement_actions` system and always records actor, reason, start, end, and appeal state.

Replace any production-facing action that physically deletes a community row—such as the current Community admin **Delete** action—with **Remove from Community**. A separately protected retention worker may physically purge eligible data only after the approved retention period and after confirming that no legal hold, open report, appeal, fraud case, transaction requirement, or preservation request applies.

### 18.5 Review service levels

For launch operations, use these targets:

- Imminent threats, exposed personal information, suspected child sexual abuse material, or credible illegal-content reports: immediate restricted escalation and continuous priority until handed to the approved owner.
- Other hidden reported content: first human review within 24 hours.
- Appeals: first review within 72 hours by someone other than the original decision-maker when staffing permits.

The queue should alert before an SLA expires and escalate overdue cases. If PerfectPPI cannot staff this coverage, social posting should remain in a controlled beta rather than implying a safety process that does not exist.

### 18.6 Account-enforcement effects

- **Warning:** records/notifies the decision; does not change visibility by itself.
- **Posting hold:** blocks new posts, comments, groups, and edits for the defined duration. Existing content remains visible unless separately moderated.
- **Media hold:** blocks new media reservations/finalization while allowed text behavior follows any posting hold.
- **Reporting hold:** blocks ordinary in-product reports after confirmed abuse while leaving the monitored urgent Help & Safety contact available.
- **Temporary suspension:** blocks sign-in/social interaction for the duration and makes the social profile unavailable. Existing authored content follows the explicit enforcement decision rather than being silently deleted.
- **Ban:** makes the social profile and all authored social content unavailable through the central visibility policy while retaining each item's prior state for appeal/reversal. Active listings, inspections, transactions, and safety/support cases are frozen and reviewed rather than blindly erased.

Update the existing review RPC constraints so every exposed enforcement action—including ban—is actually accepted only by the correct capability. An appeal overturn restores only content/audiences that remain otherwise eligible.

## 19. Evidence preservation, media depublication, and retention

### 19.1 Evidence snapshot

At the first report, preserve an immutable snapshot containing:

- Post/comment ID and exact revision ID.
- Full text and structured fields as displayed.
- Author account reference using the minimum durable identifier needed for enforcement.
- Destination, group, audience, and relationship context.
- Attached vehicle/listing/inspection references and the public redacted values that appeared.
- Media object IDs, original metadata needed for evidence, cryptographic hashes, size, type, and private evidence location.
- Content creation/edit time, report time, reporter reason/details, and relevant request/security metadata allowed by policy.
- Every subsequent state transition, reviewer, rationale, enforcement action, appeal, hold, and release.

The evidence snapshot is not editable by moderators. Corrections are appended as events.

### 19.2 Public media must actually become inaccessible

Changing a database status cannot atomically delete a public R2 object or purge a CDN. Therefore, the launch architecture is **private-by-default Community storage with status-aware delivery**, not permanent public R2 URLs.

- Store originals and display variants in private R2 keyspaces using immutable/object-versioned keys.
- Render through an authenticated endpoint such as `/api/community/media/{mediaId}/{variant}`. On every request, it verifies viewer, parent content status, moderation status, audience, group membership, and blocks before streaming the private object.
- Do not redirect the client to a reusable direct R2 URL. For the launch, use private/no-store response caching so a newly hidden object is denied on the next server request. A later status-aware edge cache must provide synchronous invalidation before it replaces this rule.
- The report transaction changes the database state; immediately afterward the media endpoint denies new reads without waiting for an R2 delete or CDN purge.
- Preserve the immutable object/hash as restricted evidence and make evidence access use a separate audited moderator endpoint. The ordinary delivery endpoint can never serve hidden evidence.
- Thumbnails, resized variants, originals, share-preview images, and future transcodes all point to the same parent authorization state.
- Return a generic unavailable response to ordinary callers so the moderation reason is not leaked.

Before the social beta, migrate every existing Community media object that has a permanent public URL: create/verify its private immutable copy, change database delivery references, delete the public copy, purge CDN variants, and prove the old URL no longer resolves. Use an idempotent migration/outbox with retries and do not enable the beta until verification reaches zero public Community objects.

Restoration makes the normal status-aware delivery endpoint eligible again; it never makes the restricted evidence endpoint/object public. PerfectPPI cannot remotely erase a copy a user already downloaded or screenshotted, so product copy should promise removal from PerfectPPI surfaces and future retrieval, not control of third-party copies.

### 19.3 No routine hard deletion

User-facing removal, moderator removal, account deletion, or group deletion must not destroy evidence attached to an open report, confirmed violation, appeal, or legal hold. Ordinary tables can use tombstones/anonymization so public and application code no longer treat the item as live while the restricted moderation record remains intact.

This preservation must not turn into indefinite casual storage. Add `retention_expires_at`, retention basis, hold status, and disposal state to every case. The repository's retention register currently leaves the closed ordinary-moderation period awaiting Trust & Safety/privacy counsel approval. `retention_expires_at = NULL` means **not eligible for purge**, never “purge now.” Production launch is blocked until an approved period populates newly closed ordinary cases. Until then, reported evidence stays restricted and is not hard-deleted by normal application flows.

The purge worker proceeds only when all are true: the case is closed; expiry has passed; no legal hold, open appeal, preservation request, fraud/transaction requirement, or linked open case exists; every database row and private/public object is enumerated; processor cleanup is queued; and a purge event can be durably recorded. A partial failure retries idempotently and never silently reports completion.

A legal hold overrides ordinary expiry until an authorized release is recorded. A CyberTipline-reported evidence record follows the approved statutory workflow and minimum period recorded in the retention schedule. No developer should independently decide that a post is reportable to law enforcement or transmit it through an ad hoc channel.

### 19.4 Account deletion and identity minimization

Account deletion should immediately remove the user from public product surfaces and delete unrelated eligible personal data. For preserved moderation cases:

- Replace public profile fields with a deleted-account tombstone.
- Retain only the minimum restricted identity linkage required for enforcement, fraud defense, appeal, or legal obligation.
- Avoid `ON DELETE CASCADE` behavior that destroys reports/evidence when the author or reporter deletes an account. Use a retention-aware service path and nullable/pseudonymous reporter linkage where appropriate.
- Do not retain a reporter's full profile merely to preserve the existence of a report.
- Prevent a banned user from escaping enforcement simply by deleting and immediately recreating an account, subject to the approved privacy policy and lawful identifiers.
- When every retention basis expires, the deletion worker purges content and media, propagates deletion to processors/backups according to policy, and keeps only a minimized audit tombstone where permitted.

## 20. Abuse prevention and edge cases

### 20.1 Reporting abuse

A one-report-global-hide rule is intentionally conservative but can be weaponized. Protect it with:

- Per-account and per-device/IP report-rate limits, evaluated carefully so shared networks are not automatically punished.
- Unique reporter/entity/revision enforcement.
- No self-reporting and no reports on content the account could not view.
- Account-age/risk signals and CAPTCHA or step-up checks for suspicious bursts.
- Detection of coordinated reports across the same targets.
- An append-only record of reports that moderators determine were knowingly malicious.
- Graduated reporting restrictions for repeated abuse; restrictions do not block access to urgent safety/contact channels.

Initial per-account limit is 10 newly created reports in a rolling hour and 30 in a rolling 24 hours. Idempotent retries do not consume another slot. Device/network risk limits are additive and configuration-backed. A rate-limited user can still reach the monitored Help & Safety contact form for an urgent concern, but that form does not automatically hide content.

After a human restores a post unchanged, that exact revision uses this explicit exception:

- A new eligible report coded `violence`, `sexual_content`, `personal_information`, or `illegal_content` immediately creates a follow-up case and re-hides the post.
- Other reason codes create a follow-up monitoring case but re-hide only when three new distinct eligible reporters report that revision within a rolling seven-day window.
- A reporter who already reported that revision cannot report it again; uniqueness is reporter + entity type + entity ID + revision ID.
- Reports outside the seven-day window remain in audit/abuse analysis but do not accumulate forever toward the threshold.
- An edit creates a new revision, so its first valid report follows the normal immediate-hide rule.

### 20.2 Other edge cases

- **Simultaneous reports:** one transaction wins the state transition; every eligible unique report is attached once.
- **Report during edit:** lock/version-check the target and report the revision actually viewed. If the edit committed first, return the new revision for confirmation or report that revision.
- **Author archives first:** record the report if the reporter legitimately viewed the prior revision, keep it nonpublic, and preserve evidence; do not reactivate it.
- **Group is deleted/private:** preserve case context and evidence; never expose the content outside its prior audience during review.
- **Author blocks reporter after report:** the case remains valid; neither party sees the other's private information.
- **Reporter deletes account:** retain a minimized/pseudonymous report record for the approved period.
- **Moderator restores after author deletion:** keep it nonpublic because there is no active author account.
- **Attachment is separately illegal/private:** hide the parent post and place the attachment in the most restrictive applicable state.
- **Post quoted/shared elsewhere:** revoke embedded preview content and review independently copied text/media if it exists as a separate post.
- **Push notification already delivered:** opening it must re-check permission/status and show “This content is no longer available,” not cached content.
- **Client cache/offline mode:** status tombstones must supersede stale feed data as soon as connectivity returns. Never cache restricted evidence for ordinary clients.
- **Moderator conflict:** opening work places a renewable 15-minute soft claim on the case. Another moderator may view but sees the assignee. Every decision uses compare-and-swap on `decision_version`; an expired/reassigned claim or stale version returns a conflict and reloads the case rather than overwriting a newer decision.
- **Restoration:** recompute the original audience and current author/group/account eligibility. Restoration is not allowed if another independent restriction still blocks publication.

### 20.3 Operational circuit breakers

Maintain independent server kill switches for new text posts/comments, photo uploads, group creation, messaging attachments, and external sharing. Initial beta guardrails:

- Any confirmed case where hidden/private content or evidence media remains publicly retrievable triggers an incident and disables the affected creation/media path until fixed.
- Any failure in which a successful report does not globally hide the target triggers an incident and disables new public posting on the affected entity type until the atomic path is verified.
- An urgent queue item unacknowledged for 15 minutes pages the on-call owner. If no qualified reviewer is available, keep high-risk media disabled and pause expansion of the beta.
- If more than 25 cases are open or more than 20% of ordinary cases are older than the 24-hour target for two consecutive hours, stop new beta invitations and user-created-group rollout; the safety owner decides whether public creation also pauses.
- Alert when at least 20 decided cases for a cohort have a restoration rate above 50%, when one reporter produces an unusual share of takedowns, or when the same restored targets recur. This prompts anti-abuse review but does not silently change moderation rules.

These are conservative beta defaults and should be configuration-backed. Changing them requires a recorded product/Trust & Safety decision, not an unreviewed code edit.

## 21. Auto-publication, content filtering, and paused video

### 21.1 What auto-approved means operationally

For this release, a normal text post/comment reaches `active` in the same request once it passes deterministic validation. It does not enter `pending_scan` merely because it exists, and it does not wait for Gemini or a human moderator.

Keep a small synchronous safety layer that is not an editorial approval queue:

- Authentication, claimed username, account/posting restrictions, group membership, audience, blocks, and attachment ownership.
- UTF-8/control-character handling, server-side trimming, length/schema validation, and safe rendering. Unicode normalization may be used for comparison/filtering without destructively rewriting the user's display text.
- At most three `http`/`https` links per post and one per comment in the beta; reject custom/executable schemes and versioned known-malicious/blocked domains.
- Reject an exact normalized duplicate by the same author/destination within two minutes; rate-limit more than three near-duplicate submissions in ten minutes. Store thresholds in audited configuration.
- Apply a versioned, server-side high-confidence objectionable-content pattern policy covering explicit exploitation solicitation, direct threats, targeted dehumanizing slurs/harassment, exposed private-information patterns, and known scam phrases. High-confidence matches return `content_not_allowed` for user revision; ambiguous general profanity is not silently treated as a proven violation.
- Reject known-blocked media hashes/signatures and apply the required specialist still-image result before finalization. Never reveal a sensitive match signature in client error text.
- Validate photo MIME, magic bytes, decoded format, dimensions, size/count, reservation ownership, and metadata-safe derivative before publication.

Stable user-facing outcome codes are `validation_failed`, `unsafe_link`, `duplicate_content`, `rate_limited`, `content_not_allowed`, `invalid_media`, `media_safety_unavailable`, `posting_restricted`, and `unauthorized_audience`. Each maps to plain recovery copy; the client does not receive the private pattern/hash rule.

The filter policy is stored as an approved versioned server configuration with audit history. Servers retain the last known-good version during a configuration-service outage. If no valid policy is available, new public posting is disabled through the creation kill switch rather than bypassing the filter.

This distinction matters: ordinary users experience instant publication, while PerfectPPI still rejects technically malicious requests and enforces explicit account restrictions.

### 21.2 Still photos

Still photos may ship only through the existing reservation/quarantine/promotion pipeline or an equally safe replacement. Preserve MIME/magic-byte validation, size and count limits, owner binding, private quarantine, object cleanup, and specialist safeguards required by the approved launch policy. Add verified EXIF/location stripping and safe public-variant decode/re-encoding; the current byte-copy promotion behavior does not provide that guarantee.

For this launch, disable the general-purpose Gemini image classifier as an editorial publication gate, while retaining the existing specialist known-illegal-image safeguard. A photo that passes the technical and required specialist controls publishes without ordinary human approval. A specialist match, uncertain result, or unavailable required check does not publish; if that service is unavailable, disable new Community image publishing and leave text posting available. Pausing **video** moderation does not authorize bypassing the separate image safeguard.

### 21.3 Community video pause

Video must be disabled at every layer:

- Remove video from the native and web post pickers and update the label from “Photos and videos” to **Photos**.
- Reject video MIME types/extensions and video upload reservations at the Community API, even from older clients.
- Reject video attachment finalization and post submission server-side with a stable unsupported-media response.
- Keep feature flags server-controlled so enabling UI alone cannot bypass policy.
- Do not auto-approve a previously pending or quarantined video during migration.
- Continue to honor deletion, evidence, legal-hold, and viewing rules for videos that already exist.
- Preserve the future video scanning/transcoding/moderation architecture in dormant code and schema, with tests that verify the flag is off in production.

Copy should say **“Video posts are coming later”** only if a user reaches a legacy entry point. Do not advertise a date.

### 21.4 App Store safety baseline

The report button by itself is not a guarantee of App Store approval. Apple's user-generated-content guideline explicitly expects filtering of objectionable material, reporting with timely responses, the ability to block abusive users, and published contact information. The minimum launch bundle is therefore:

- Deterministic filtering/security rules plus any required specialist image safeguard.
- Report coverage across enabled UGC surfaces.
- A staffed human queue and documented response targets.
- Block-user controls that take effect throughout the product.
- Published Community Guidelines, Terms, Privacy information, safety/contact method, and an operational inbox.
- Age rating/content disclosures that match the shipped app.
- A tested escalation and evidence-preservation process.

Do not describe reporting as “good enough for Apple” in release documentation. State what is implemented and let review evaluate the complete system.

## 22. Notifications, inbox, and messaging

### 22.1 Notification categories

The in-app Notifications screen should group useful social activity rather than becoming a stream of every tap. Support:

- Friend request and request accepted.
- Group invitation, join-request decision, and moderator announcement.
- Comment on the user's post, direct reply, mention, and accepted/helpful answer.
- A useful aggregate such as “8 people liked your post,” not eight separate alerts.
- Marketplace inquiry and saved-listing status change.
- Inspection/request activity relevant to the user.
- Report decision, account warning/restriction, and appeal decision.

Each item deep-links to a permission-checked destination. If the destination is now hidden, deleted, private, blocked, or no longer available, show a neutral unavailable screen rather than stale preview content.

Moderation notification recipients are explicit:

- **Author:** content hidden, restored, removed, appeal decision, warning/restriction, and restriction expiry where useful.
- **Reporter:** immediate receipt confirmation and an optional neutral “Our review is complete” notice. Never reveal the action against the author, other reports, evidence, or enforcement details.
- **Moderator/on-call owner:** new-case, priority, assignment, conflict, and SLA alerts through protected operational channels.

Provide per-category controls for push and in-app notifications. Safety, enforcement, account-security, and privacy-request notices cannot be fully disabled, although ordinary marketing/social push can. Badge counts must reconcile across devices and not count inaccessible content.

### 22.2 Notification presentation

- Add an unread badge to the Community bell and More/Notifications row.
- Group repeated activity by post and day.
- Mark items read on open and provide Mark All as Read.
- Keep previews privacy-aware; private-group or private-profile text should not appear on a lock-screen push by default.
- Use server-created notification records and an outbox/retry path so a failed push does not lose the in-app notice.
- Do not include report reasons, reporter identity, full VIN, exact location, or restricted media in a push payload.

### 22.3 Direct messages

Messaging should support purposeful contact without turning every public profile into an open inbox:

- Friends may message one another unless either user disables friend messages.
- Marketplace inquiries may open a listing-scoped conversation without requiring friendship.
- Users may choose whether group co-members can send message requests.
- Unknown senders go to Requests; they cannot see read receipts until accepted.
- Block immediately ends new messaging in both directions and hides the thread from the normal inbox while preserving report/evidence rules.
- Conversation, individual message, and attachment reporting must exist before broad message access is enabled.
- Do not expose phone number/email automatically. Users may choose to share contact information in a conversation, with an anti-scam warning.

Rate limits, link/media controls, delete-for-self semantics, participant-aware account deletion, and moderator evidence access must be defined consistently with the existing Messages feature. End-to-end encryption must not be claimed unless it is actually implemented and independently verified.

## 23. Garage and Vehicle Passport

### 23.1 Replace a generic vehicle list with Garage

Rename the user-facing **Vehicles** destination to **Garage**. “Garage” feels native to enthusiasts and communicates that these are vehicles the user owns, follows, is building, or is considering—not just database records.

Each Garage card should include a real vehicle photo or a clean make/model placeholder, nickname, year/make/model/trim, ownership relationship, mileage with last-updated date, and compact status indicators for inspection, build, maintenance, listing, or warranty. Avoid showing VIN as a list subtitle.

Garage filters:

- Owned.
- Previously owned.
- Shopping/considering.
- Projects.
- Listed for sale.

### 23.2 Vehicle Passport

Each vehicle gets a permission-aware Vehicle Passport with:

- Cover photo and optional nickname.
- Year, make, model, trim, engine/drivetrain, transmission, and body style.
- Ownership state and optional verified-owner badge.
- Mileage and update date.
- Inspection summary and shareable redacted reports.
- Build/modification journal.
- Maintenance timeline.
- Vehicle-related posts.
- Marketplace listing when active.
- Warranty/coverage when applicable.

Use tabs or a compact segmented control: **Overview · Posts · Build · Maintenance · Inspections**. Listing and coverage can appear as contextual cards/actions rather than permanent tabs when absent.

### 23.3 Vehicle privacy

Vehicle visibility is separate from profile visibility and defaults to private. Options:

- Only Me.
- Friends.
- Public.

The user may override visibility for an individual post without silently changing the full Vehicle Passport. Public views must redact full VIN, plate, precise home/storage location, private documents, receipts, personal notes, and non-shareable inspection details. Display at most a safe vehicle identifier such as year/make/model and an optional user-approved nickname; if a partial VIN is needed, show only an approved masked form.

Photo upload should offer automatic EXIF location removal and optional license-plate/face blur. The original unblurred photo should not remain at a public URL.

### 23.4 Ownership changes

When a vehicle is sold:

- The seller can mark it Previously Owned and archive or keep permitted public build history.
- Personal maintenance receipts, addresses, keys/codes, and inspection notes do not transfer automatically.
- Public provenance can be shared only with explicit seller consent and a clear preview.
- The buyer creates or claims their own Garage record through a verification flow; ownership is not inferred from a marketplace message.
- Posts keep historical attribution without implying the prior owner still owns the vehicle.

## 24. Build journals, maintenance, and ownership tools

### 24.1 Build journal

Build journals should be structured enough to answer enthusiast questions about compatibility. Each entry may include:

- Modification category and title.
- Part manufacturer and part number.
- Vehicle configuration/trim/engine.
- Wheel size, width, offset, tire size, suspension drop, or other category-specific fitment fields.
- Install date and mileage.
- Shop or self-installed indicator.
- Cost, kept private by default.
- Photos, notes, and related Community post.
- Installed, removed, planned, or sold status.

Users can **Subscribe to Build Updates** or save a build without creating a follower relationship with its owner. This is a content subscription and never appears as a social follower count.

Fitment shown by PerfectPPI should distinguish **owner-reported**, **community-confirmed**, and **manufacturer/verified** data. Do not present anecdotal fitment as guaranteed compatibility.

### 24.2 Maintenance timeline

The maintenance area should support:

- Service type, date, mileage, notes, parts/fluids, and provider.
- Receipt/document storage private by default.
- Recurring mileage/time reminders.
- Upcoming maintenance based on user-entered or authoritative manufacturer intervals.
- Cost-of-ownership summaries visible only to the owner unless explicitly shared.
- Export of the owner's records in a useful format.

A maintenance event can generate a redacted Community post, but sharing is opt-in and previews exactly what will become public. A Community post never makes the underlying receipt public.

### 24.3 Repair and safety context

For technical posts and build entries:

- Let users tag a system such as brakes, electrical, engine, suspension, ADAS, airbags, fuel, or high-voltage EV.
- Surface qualified-technician and accepted-answer responses without claiming they are warranties or diagnoses.
- Display specific caution copy for high-risk work.
- Do not gamify speed, street racing, emissions tampering, theft bypasses, unsafe lifting, or disabling safety systems.
- Provide a report reason for dangerous automotive advice and allow moderators to add a safety interstitial even when content is not fully removed.

## 25. Marketplace and inspection integration

### 25.1 Marketplace discovery

The current Marketplace list needs enthusiast-grade filtering and real imagery. Add:

- Make/model/year range, price, mileage, distance/region, transmission, drivetrain, body style, title status, seller type, and inspection availability.
- Sort by newest, price, mileage, distance, and recently inspected.
- Saved searches and saved listings with sensible notification frequency.
- A thumbnail carousel or primary real photo on each card; the generic car glyph is only a fallback.
- Clear city/region, not an exact address.
- Inspection badge with inspection date and scope, never an unexplained “verified” badge.

Search state should remain when returning from a listing. Use paginated/infinite results with skeletons, pull-to-refresh, retry, and an explicit end state.

### 25.2 Listing detail layout

Improve the current listing screen in this order:

1. Swipeable full-width image gallery with count.
2. Price, year/make/model/trim, mileage, city/region, and seller type.
3. Save and Share actions.
4. Inspection card showing who performed it, when, scope, and a permission-aware redacted report.
5. Condition/description and structured specifications.
6. Known modifications and maintenance highlights, labeled by source.
7. Seller card linking to the permitted public profile and marketplace history.
8. Safety/scam guidance.
9. Sticky **Message Seller** and, when appropriate, **Request Inspection** actions.

If the viewer owns the listing, replace “Contact Seller” with **Manage Listing**. Never show a button inviting the owner to contact themselves. Management includes Edit, Mark Pending/Sold, Pause, and Remove. Remove is soft while reports, transactions, or retention obligations exist.

### 25.3 Inspection-native trust

PerfectPPI's strongest marketplace advantage is inspection context:

- Allow a seller to attach only an inspection they are authorized to share.
- Give the owner a preview of all redactions before publishing.
- Show inspection age and scope prominently so an old or limited inspection is not mistaken for a current comprehensive one.
- Let a buyer request a new independent inspection.
- Keep raw technician notes, private media, VIN, addresses, and documents behind authorization.
- Never reduce a complex inspection to a simplistic pass/fail or one opaque score.
- Make clear that inspection findings are time-specific and not a guarantee of future condition.

Listing comments, if enabled later, should be separate from seller messages and covered by reporting/blocking. Do not launch public listing comments until spam/scam operations are ready.

## 26. Technicians, reputation, groups, and events

### 26.1 Verified expertise

Useful reputation should reflect contribution and verified context rather than popularity alone. Possible signals:

- Verified vehicle owner for the attached vehicle.
- Verified technician/business identity and approved credentials.
- Accepted answers and Helpful marks.
- Completed PerfectPPI inspections, displayed only where contract/policy allows.
- Constructive participation with no current enforcement restriction.

Badges must name what was verified and when relevant. Do not sell an indistinguishable “verified” badge or imply that PerfectPPI endorses every statement from a badge holder.

Do not ship a generic Verified Owner or Verified Technician badge until the verification policy defines the proof source, verifier, issue/expiry time, revocation triggers, renewal, dispute/correction path, and policy owner. In the early beta, use factual labels such as “Inspection completed by [technician/business] on [date]” or “Vehicle added by this profile,” which do not imply a stronger identity or ownership guarantee.

Technician profiles can include service area, specialties, supported makes, mobile/shop availability, credentials with expiry, inspection availability, and contact/request action. Reviews/ratings should wait until purchase/inspection linkage, dispute handling, anti-retaliation, and moderation are implemented.

### 26.2 Group quality tools

Groups benefit from:

- Pinned resources and announcements.
- Searchable FAQs/accepted-answer collections.
- Vehicle/model tags.
- Clear rules shown before the first post.
- Owner/moderator tools for membership, post removal from that group, slow mode, and temporary posting restrictions.
- A visible distinction between platform moderation and group moderation.

Group moderators may remove a post from their group, but cannot erase platform evidence, see confidential reporter identity, lift a platform hold, or ban an account from PerfectPPI. Platform reporting always reaches PerfectPPI's protected queue.

### 26.3 Meets and events — later phase

Events can eventually support car meets, track days, shows, shop events, and group drives, with:

- Title, type, organizer, date/time, general location, capacity, cost, requirements, and group association.
- RSVP states Going/Interested/Not Going.
- Weather and organizer updates where available.
- Post-event photo thread.

Safety/privacy requirements come first:

- Public discovery shows an approximate area; exact meet instructions may be limited to accepted attendees.
- No continuous/live attendee or vehicle-location sharing.
- Organizer identity/reporting/blocking and event cancellation notifications are required.
- Prohibit unsafe street-racing coordination and provide a clear event-reporting path.
- Minors/age rules, liability wording, payments/refunds, and organizer responsibility require separate approval before paid events.

## 27. Feed, discovery, and unified search

### 27.1 Feed behavior

Start with understandable feed modes:

- **All** — eligible posts published to the general Community.
- **Friends** — eligible posts from accepted friends.
- **My Cars** — posts relevant to makes/models/vehicles the user owns or follows.

Joined-group activity lives in the Community **Groups** section, not as a second identically named feed filter.

Default to a recency-first feed with simple relevance filters. Do not launch a black-box engagement algorithm. If ranking is added later, explain the primary reasons a post appears, provide a Recent option, prevent repeated exposure of the same creators, and ensure moderation/privacy filters execute before ranking.

Feed quality controls:

- Hide blocked/muted authors and groups.
- Let users mute a specific group, post type, or vehicle topic without leaving/friending changes.
- Collapse repetitive reposts and rate-limit near-duplicates.
- Insert suggested groups/builds sparingly and label them.
- Preserve scroll position when returning from post detail.
- Support pull-to-refresh, cursor pagination, skeletons, retry, and clear empty/end states.

### 27.2 Unified search

One Community search entry point should search, with separate result tabs:

- People.
- Groups.
- Posts/questions.
- Vehicles/builds.
- Marketplace listings.
- Technicians.
- Events when enabled.

Search should understand structured automotive data: make, model, generation, year, trim, engine, diagnostic code, part number, and common aliases. Prefer structured tags over relying solely on hashtags.

Privacy and safety filters are mandatory before indexing and again before result delivery. Private profiles expose only their allowed identity shell; private groups/content are not discoverable to nonmembers; blocked users do not appear to each other; hidden/rejected/legal-hold content is removed from results and autocomplete.

Recent searches remain local/private by default and can be cleared. Do not expose another user's searches. Provide typo tolerance, helpful no-result suggestions, and reports for abusive usernames/group names that appear in results.

## 28. Screen-by-screen layout improvements

### 28.1 Bottom navigation

Recommended consumer tabs:

> **Home · Garage · Inspections · Community · More**

This makes Community a first-class product rather than burying it two levels under More. Keep **Inspections** as the tab label because tapping it opens the inspection list; use **Start Inspection** for the creation action.

Move Warranty out of the permanent tab bar. Show active coverage within the related Vehicle Passport and a Coverage/Warranty destination in More. A mostly empty Warranty tab should not consume one of five primary positions while Community is a major product initiative.

This navigation change should be released with stable deep-link routing so old links and restored tabs still reach the right destination.

### 28.2 Home

The current Home screen is dominated by whitespace and two recent-inspection cards. Rebuild it as a concise dashboard:

- Greeting/account identity only if it adds value.
- Horizontal Garage preview with real thumbnails.
- “Next actions” such as resume draft inspection, complete vehicle information, respond to friend request, or review a marketplace inquiry.
- Quick actions: Add Vehicle, Start Inspection, Create Post, and Browse Marketplace. Show the three most relevant actions first and keep the fourth one tap away if horizontal space is limited.
- Alerts for inspection result, maintenance due, expiring listing, warranty/coverage, or account safety.
- Recent inspections with date, vehicle, status, and Resume/View action.
- A small relevant Community preview, not an endless feed embedded on Home.

Show at most three priority modules above the fold: Next Action, Garage, and Quick Actions. Alerts/previews appear below only when they contain meaningful current information, so the dashboard does not become another long menu.

Cards should size to their content. Empty sections disappear or show one actionable empty state rather than creating a large blank canvas.

### 28.3 Garage/Vehicles

Use cards with photo, useful summary, and status; add search/filter once more than a few vehicles exist. The floating plus remains appropriate, but its accessibility label must be “Add vehicle.” Swipe actions may archive or edit, but destructive removal requires confirmation and explains effects on inspections/posts/listings.

### 28.4 Inspections

Add a segmented filter: **Active · Drafts · Completed**. Draft cards need a prominent **Resume** action and “last edited” date. Completed cards show completion/submission date and a concise next step. Do not encode status only through blue/orange color; retain text/icon labels for accessibility.

### 28.5 Warranty/Coverage

Keep the polished empty-state card but make its action useful: **Learn how coverage works** or **Start an eligible inspection**. Once coverage exists, show it on the associated vehicle first. The separate More destination can list all plans/contracts.

### 28.6 More

Reorganize More so it does not mix social, work, account, and settings without hierarchy:

- **Discover:** Marketplace, Technicians, Events when enabled. Marketplace also remains a Home quick action and a result category in unified Community search.
- **Communication:** Messages, Notifications.
- **Your content:** Saved, Media Packages, Listings.
- **Account & app:** Profile, Settings, Privacy & Account, Help & Safety.
- **Developer:** Switch Role only for debug/internal builds or explicitly authorized test accounts. It should not appear for production consumers.

Community leaves More because it becomes a tab. Avoid duplicate navigation destinations.

### 28.7 Community

Replace the current large empty blank area with:

- Large title plus compact search, notifications, and compose buttons.
- Segmented top navigation **Feed · Groups**.
- Feed filter chips All, Friends, and My Cars. Within Groups, use Joined and Discover.
- Unified search is the discovery entry point for people, groups, posts, vehicles, listings, and technicians.
- An actionable empty state: Find Friends, Join Groups, or Create First Post.
- Suggested groups/people based on explicit vehicle interests, with a reason label and dismissal.

The compose button must be immediately visible. The ellipsis in the current header is too vague as the primary navigation/control.

### 28.8 New Post

The current composer has a very large empty text box and separate vehicle/listing rows. Use the auto-growing composer from Section 14, a clear Post To selector, post type, attachment rail, image thumbnails, privacy summary, and persistent Publish action. When video is paused, say **Photos (0/10)** and **Choose Photos**—never “Photos and videos.”

### 28.9 Social profile versus settings

The existing Profile page is an account/settings page. Split it:

- **Social profile:** avatar, display name, `@username`, bio, location at city/region level, vehicles/builds, friends, groups, posts, and profile privacy. This is what another user sees, with Add Friend/Requested/Friends, Message where permitted, and ellipsis actions.
- **Settings:** email, role, appearance, edit account/profile, notifications, privacy, blocked users, Community Guidelines, support, data export/deletion, and sign out.

Never show another user account email, internal role-switch controls, or private account fields on the social profile.

### 28.10 Visual and interaction polish

Across the app:

- Retain the clean native SwiftUI character, rounded cards, semantic blue accent, and generous touch targets.
- Reduce oversized top/vertical gaps when they do not communicate hierarchy.
- Use real content thumbnails before generic symbols.
- Allow two-line vehicle/listing titles before truncating and keep year/make/model consistent.
- Show dates/“last updated” where status can become stale.
- Replace unexplained `—` values with Hide, Not provided, or an actionable completion prompt.
- Use skeleton loading rather than layout-jumping spinners.
- Include pull-to-refresh, retry states, pagination/end states, and useful empty-state actions.
- Respect light/dark mode, Dynamic Type, VoiceOver order, button traits, Reduce Motion, Increase Contrast, and minimum 44-point touch targets.
- Do not convey active/draft/report states by color alone.
- Keep the floating/custom tab bar clear of the Home indicator, keyboard, sheets, and scroll content on all supported device sizes.

## 29. Data model and backend architecture

### 29.1 Reuse the existing moderation foundation

Do not build a second, disconnected reporting system. Extend the existing Supabase structures for `community_posts`, `community_comments`, `moderation_items`, `moderation_reports`, `moderation_events`, `moderation_appeals`, `user_enforcement_actions`, legal holds, upload reservations, and storage cleanup.

Important corrections:

- The underlying content status and moderation status must change together.
- Report records refer to an immutable content revision.
- Public-content deletion becomes soft removal/tombstoning.
- Public media is revocable while evidence media remains private.
- Account-deletion cascades become retention-aware for reported content.
- Feed/search/profile queries all use one canonical visibility rule.

Use database constraints for valid states and transitions where practical. A client-provided status is never trusted.

### 29.2 Required social entities

Adapt existing tables rather than duplicating them, but the domain must support these concepts:

- **Profiles:** account ID, unique normalized username, display name, bio, avatar, city/region, profile visibility, discovery/message preferences, account state, and timestamps.
- **Friendships/requests:** requester, addressee, state, created/responded time, and uniqueness for an unordered account pair.
- **Blocks/mutes:** blocker, target, scope, created time; block uniqueness by pair.
- **Groups:** owner, name, unique slug, description, avatar/cover, visibility/join mode, vehicle/topic metadata, rules, state, and timestamps.
- **Group memberships:** group, user, role, membership state, notification preference, joined/left time, and inviter/request context.
- **Posts:** author, destination type/ID, audience snapshot, type, active revision, content/moderation state, attachment references, created/edited/archived time, and version.
- **Post revisions:** immutable text/structured fields/audience-relevant snapshot for every published edit.
- **Comments:** post, parent comment where applicable, author, revision, state, moderation state, and timestamps.
- **Reactions:** user, entity, reaction type, active state, and unique constraint.
- **Saves/collections:** owner-private collection and saved-entity join.
- **Notifications:** recipient, actor where safe, type, entity reference, privacy-safe payload, read time, and delivery state.
- **Moderation cases/reports/events/evidence:** generic entity type/ID plus the preserved revision and restricted-media references.

All timestamps are server-generated UTC. Public clients receive localized presentation, not permission to choose audit timestamps.

### 29.3 Username storage

Store the display username and a canonical comparison form. Enforce uniqueness in the database using the same normalization used by availability checks. Reserve system/support/admin/confusing names, profanity/impersonation patterns approved by policy, and names that differ only by case.

The random username migration must be deterministic/idempotent, collision-safe, and resumable. Do not derive public usernames directly from email, phone number, Google name, or another private identifier.

Keep username nullable only for `username_state = pending` onboarding records. Add a database constraint that `claimed` accounts have a valid username and pending accounts cannot invoke ordinary product RPCs. Remove username from the generic self-profile update API/RLS update surface. A database immutability trigger allows only the initial claim operation and an explicitly audited correction by an authorized identity administrator; removing the Swift edit field alone is not enforcement.

### 29.4 Friendship integrity

Use one `friend_relationships`-style row per unordered user pair, with the two ordered account IDs, original requester, state, and response timestamps. Mutes and blocks are separate directional tables. This prevents crossed requests from creating duplicates. The transaction that accepts a request must verify the addressee, update once, and create notifications atomically. Blocking cancels pending requests and prevents new ones. Unfriending does not delete prior content or messages, but new reads obey current audience permissions.

### 29.5 Group integrity

- A group always has at least one owner; ownership transfer must complete before the last owner can leave.
- Group roles are owner, admin, moderator, and member. Avoid storing arbitrary role strings without constraints.
- Membership changes and content access use server/database authorization, not a SwiftUI-only filter.
- Private-group identity/content must be protected in RLS, API endpoints, notifications, analytics, search, and storage URLs.
- Group deletion is a reversible closed/tombstoned state during the approved retention window.

### 29.6 Central visibility policy

Create one tested policy/service that answers whether viewer X can see entity Y. It must consider:

- Content status and moderation status.
- Author account/enforcement state.
- Post audience and current profile privacy.
- Friend relationship.
- Group visibility and membership.
- Blocks/mutes.
- Vehicle/listing/inspection attachment permissions.
- Viewer role, including narrowly scoped moderator access.

Use it for feeds, detail, profile, search, share links, notification hydration, counts, and media delivery. Do not reimplement slightly different visibility logic in each Swift view or API route.

Counts must be computed from entities the viewer may know exist. A private group, blocked account, or hidden post cannot leak through totals, autocomplete, error wording, or timing-sensitive existence checks.

### 29.7 Revisions and moderation cases

Create immutable `community_post_revisions` and `community_comment_revisions` records. The live entity points to `active_revision_id`; edits append a revision rather than overwriting the evidence target.

Create `moderation_cases` as the canonical case record instead of trying to place multiple revision-specific cases into the existing entity-unique `moderation_items` row. Required fields/concepts:

- Case ID, entity type/ID, and exact revision ID.
- State: `monitoring`, `open`, `claimed`, `escalated`, `appeal_open`, or `closed`.
- Final resolution: `no_violation_restored`, `violation_removed`, `legal_escalation`, `appeal_upheld`, or `appeal_overturned` where applicable.
- Priority, SLA due time, assigned moderator, claim time, and claim expiry.
- Integer decision version for compare-and-swap concurrency.
- First/last report and closure timestamps.
- Retention basis, `retention_expires_at`, legal-hold state, and disposition state.

Reports, events, evidence snapshots, appeals, moderator notes, and enforcement links reference `case_id`. Enforce one open/monitoring case per entity revision while allowing a later follow-up case after restoration under Section 20.1. Enforce report uniqueness on reporter + entity type + entity ID + revision ID.

Expand database constraints/RPC validation with stable codes before the UI uses them. At minimum, moderation event types include `report_created`, `case_auto_hidden`, `case_claimed`, `case_claim_expired`, `content_restored`, `content_removed`, `legal_hold_applied`, `legal_hold_released`, `appeal_opened`, `appeal_decided`, `enforcement_applied`, `media_restricted`, and `evidence_purged`. Notification types cover the explicit social/moderation categories in Section 22. Enforcement validation includes warning, posting hold, media hold, reporting hold, temporary suspension, and ban.

Migrate existing `moderation_items` history into cases. After migration, `moderation_cases` is the lifecycle source of truth; retain `moderation_items` only as a derived/current aggregate or compatibility view during rollout, not as an independently mutable competing case system. The denormalized `community_posts`/`community_comments.moderation_status` remains the visibility field and is updated atomically with the case.

### 29.8 Indexes and pagination

Add indexes that match real queries: active posts by destination/time, profile posts, group membership, pending friend requests, username lookup, open moderation cases by priority/time, notifications by recipient/read time, and searchable automotive metadata. Use stable cursor pagination based on timestamp plus unique ID; avoid offset-only pagination for mutable feeds.

Search indexing and notification fan-out should use durable outbox jobs. Every job must be idempotent, retryable, observable, and safe if the originating content becomes hidden before processing.

## 30. API contracts, feature flags, and backward compatibility

### 30.1 Server-owned actions

All mutations go through authenticated server/database actions that enforce authorization and return canonical state. This includes username selection, friend request/response, block, group membership/roles, post create/edit/archive, comment, reaction, report, moderator decision, appeal, media reservation/finalization, and account deletion.

For retry-prone actions, accept an idempotency key scoped to actor and action. A repeated successful call returns the original result. Errors use stable categories the iOS app can map to useful messages: validation, unauthenticated, unauthorized, conflict, rate limited, unavailable, unsupported media, and content no longer available.

### 30.2 Server-controlled flags

At minimum, maintain these independently controlled capabilities:

- Social profiles.
- Friends/people discovery.
- Groups and group creation.
- Community text posts/comments.
- Community photo uploads.
- Community video uploads — **off** for this release.
- General-purpose automated post moderation — **off** for routine text publication in this release.
- Required specialist image safeguard — controlled separately and fail-safe according to approved policy.
- First-valid-report auto-hide — **on**.
- Events — off until its phase.

The server is authoritative. The app uses capabilities to hide or explain unavailable UI, but an old/custom client receives the same enforcement. Flag changes are audited, environment-specific, and safe to roll back without a new App Store binary.

Implement flags in service-only database records, for example `product_feature_flags`, keyed by environment and stable flag code, plus an append-only flag-change audit table. Each record has enabled state, optional rollout scope, reason, actor, version, and update time. Only an explicitly granted release/safety administrator can change production values.

Expose a read-only authenticated `/api/capabilities` response with the effective flag version and only client-relevant capabilities. The iOS app refreshes it at sign-in, app foreground, and short expiry; it uses the result for presentation, while every mutation endpoint independently checks the current server value. Cache propagation must be 60 seconds or less for ordinary changes and synchronously invalidatable for emergency kill switches. A separate environment-level emergency master-off can override database state, defaults to the safer disabled state when missing, and is documented in the rollback runbook.

### 30.3 Old clients and migrations

- Older apps attempting video upload receive a clear unsupported-media response, not a generic crash.
- Older feeds that know only `active/hidden/archived` must safely treat new restrictive states as hidden.
- Backfill existing completed users, then enforce the `pending` versus `claimed` username-state constraint without breaking the auth trigger's temporary onboarding row.
- Backfill post revisions before reports require revision IDs.
- Do not rewrite prior moderation history to “approved” merely because launch publication policy changed.
- Database migrations must be forward-only, transactional where possible, retry-safe, and tested on a production-shaped copy.
- If minimum-version enforcement becomes necessary for a security/privacy reason, provide a graceful update-required screen and record the rationale.

## 31. Privacy, security, and trust requirements

### 31.1 Privacy defaults

- New vehicle records, maintenance records, receipts, complete inspection details, and precise locations default to private.
- Public profiles do not make every vehicle or historical post public automatically.
- City/region is the most precise default public location.
- Strip EXIF location and unnecessary metadata from public photos.
- Redact VIN, plate, addresses, document IDs, signatures, and personal contact details from social and share surfaces.
- Show a prepublication audience/privacy summary for every post and group.
- Data export and account deletion include social data and explain preserved moderation exceptions accurately.

Update Privacy Policy and in-app privacy copy to describe friends, groups, reports, evidence retention, moderator access, media processing, and public sharing before production launch. Do not describe paused AI/video processing as active, or active photo scanning as paused.

### 31.2 Security controls

- RLS/service authorization denies direct client writes that bypass state transitions.
- Sensitive moderator tables and private evidence are service-only with least-privileged roles.
- Community media is delivered through the authenticated status/audience-checking endpoint in Section 19.2; no permanent direct object URL or evidence URL is logged in analytics.
- Upload reservations bind owner, entity, type, count, size, and expiry.
- Validate declared MIME, magic bytes, decoded format, dimensions, size, and media count.
- Rate-limit account creation, username checks, search, requests, posts, comments, messages, uploads, reports, and share-link access.
- Normalize and safely render text; links must not allow script injection or deceptive custom schemes.
- Do not include secrets, tokens, full post bodies, report details, or private media URLs in routine logs.
- Audit access to report evidence and alerts for bulk/unusual moderator access.
- Apply dependency, backup, incident-response, key-rotation, and deletion-tombstone procedures already required elsewhere in the project.

### 31.3 Blocking semantics

Blocking is bidirectional for product visibility, even though only the blocker owns the setting:

- Neither person can find or open the other's social profile, posts, comments, groups-as-member discovery, or direct-message entry point.
- Existing friendship/request is removed/cancelled.
- Existing shared-group posts may be replaced by neutral unavailable placeholders when thread continuity requires it, but content is not shown.
- Marketplace transactions with an active safety/payment obligation may retain a restricted support channel; ordinary direct messages stop.
- The blocked person is not notified.
- Unblocking does not restore friendship, requests, message acceptance, or prior notification subscriptions.

Mute is one-way and less severe: it hides feed/notification content without changing friendship or group membership. Reporting never automatically blocks; the user is offered the choice.

### 31.4 Policy and support surfaces

Publish and link:

- Community Guidelines with examples specific to vehicle safety, scams, harassment, privacy, illegal content, and unsafe events.
- Terms and Privacy Policy reflecting actual behavior.
- A visible **Help & Safety** screen with contact method, response expectations, report/block guidance, appeals, emergency disclaimer, and copyright process.
- The same safety/contact information on the public website and App Store support URL.

Someone must own and monitor the support/moderation inbox. An unstaffed address does not satisfy the product requirement.

## 32. Accessibility, localization, and inclusive use

### 32.1 Accessibility acceptance level

Every new flow must be manually tested with VoiceOver and the largest supported Dynamic Type sizes. Also test Increase Contrast, Reduce Transparency, Reduce Motion, Button Shapes, light/dark mode, keyboard/pointer use on iPad, and landscape where supported.

Specific requirements:

- All icon-only controls have descriptive labels/hints; never announce “button, flag” without purpose.
- Feed actions have stable reading order and do not require swipe gestures alone.
- Text reflows without clipping; sheets scroll above the keyboard.
- Images include author-supplied alt text or a marked decorative state. Do not generate misleading certainty from automatic captions.
- Statuses include text/icon, not only color.
- Error messages identify the field and recovery action.
- Focus moves predictably when a report sheet closes or a hidden card disappears.
- Time, numbers, distance, currency, and measurements use locale-aware formatting.
- User-entered Unicode display names/bios are supported safely even though usernames use a restricted ASCII format.

Do not claim WCAG conformance until the manual and automated audit in the compliance open-questions register is complete.

### 32.2 Localization readiness

All user-facing text, reason labels, policies, notifications, and accessibility strings must be localized resources rather than embedded literals. Backend moderation categories use stable codes; the client supplies localized labels. Text expansion must not break card layouts, and username rules remain explicit regardless of device language.

## 33. Reliability and performance

- Load feeds/search with cursor pagination and bounded page sizes.
- Cache only permission-safe DTOs and key caches by viewer/audience where needed.
- A status/permission check occurs when opening detail even if the card came from cache.
- Images use appropriately sized variants, placeholders, cancellation, and memory-aware loading.
- Prefetch sparingly; never prefetch private evidence or an entire long feed.
- Optimistic likes/saves reconcile on failure. Reports, friendship, group roles, and moderation decisions require server confirmation before claiming global success.
- Preserve post drafts locally and make post finalization idempotent.
- Realtime updates are additive; correctness does not depend on a websocket staying connected.
- Background jobs have retry/dead-letter visibility and alerts for stuck media cleanup, notifications, search removal, retention, and moderation SLA.
- Instrument slow feed/search queries and storage failures without logging sensitive content.
- Test poor connectivity, airplane-mode recovery, background/foreground transitions, expired sessions, and clock skew.

Set performance budgets after measuring a production-shaped dataset. At minimum, scrolling must remain smooth on the oldest supported iPhone and the first feed page should show skeletons immediately rather than a blank screen.

## 34. Analytics and success measures

Measure whether the product helps car owners, not only whether it creates scrolling:

**North-star measure:** weekly users who complete at least two meaningful vehicle actions. A meaningful action is one of: add/update a Garage vehicle, view an authorized inspection report, save a listing, request an inspection, join or post in a relevant group, publish a vehicle-tagged question/build/maintenance update, or give/receive an accepted useful answer. Passive feed views and raw likes alone do not count.

**Activation:** username completion plus at least one Garage vehicle, relevant group join, saved listing, or inspection action within the first seven days.

### 34.1 Product measures

- Completed profiles and Garages.
- Friend requests that become accepted connections.
- Group discovery-to-join conversion and retained group participation.
- Questions receiving a useful response and accepted-answer rate.
- Saves of technical posts/builds/listings.
- Build and maintenance updates.
- Inspection requests/opens from Community and Marketplace.
- Listing inquiries that reach an appropriate next step.
- Seven- and thirty-day return use tied to meaningful vehicle activity.
- Marketplace funnel: listing view -> inspection card/report view -> seller message -> inspection request -> completed inspection.
- Questions answered within 24 hours and accepted-answer rate.
- D7/D30 retention segmented by declared/observed intent: shopper, owner, enthusiast, or technician.

### 34.2 Safety/quality measures

- Reports per thousand views/posts, separated by reason and surface.
- Time from first report to global hide; expected to be immediate after commit.
- Median and 95th-percentile human-review time.
- Restore rate, confirmed-violation rate, and appeal overturn rate.
- Repeat violations and malicious-report patterns.
- Percentage of hidden media still retrievable from a public URL; target zero.
- Moderator queue backlog and overdue cases.
- Block/mute adoption and repeated-contact failures.
- Notification opt-out rate and reports caused by unwanted contact.
- Feed/detail latency, upload completion rate, stale-hidden-content exposure, and crash-free sessions.

Do not store raw report text, private message bodies, full VINs, or exact locations in general analytics. Use stable event names, coarse properties, consent/opt-out behavior, and retention that match the privacy disclosures.

Instrumentation is part of Phase 0. Product, engineering, and Trust & Safety each own named dashboards and alerts. Establish conversion/retention release targets after the controlled beta produces a documented baseline; the zero-tolerance safety invariants—authorization leaks, hidden public content, and restricted-evidence exposure—do not wait for a baseline.

## 35. Implementation phases and priorities

The phases below are dependency order, not permission to ship an unsafe partial social system.

### Phase 0 — Correct the safety and identity foundation

Must complete first:

- Required unique usernames, OAuth completion gate, existing-user backfill, and permanent launch behavior.
- Sign in with Apple in the iOS production build while Google sign-in remains, unless an approved current Guideline 4.8 exception is documented.
- Authenticated viewer-aware feed/detail APIs with narrow redacted DTOs; remove unauthenticated service-role broad joins.
- Canonical visibility service and RLS/API tests.
- Block/mute foundations.
- Atomic report-and-hide transaction for posts/comments.
- Immutable post/comment revisions plus canonical moderation cases, stable reason/entity codes, capability grants, and audited evidence reads.
- Red flag UI and report sheet.
- Moderator queue/detail/Restore/Remove/Escalate actions.
- Evidence snapshots, private status-aware Community media delivery, removal of legacy public URLs, retention fields, and account-deletion protection.
- Community video disabled in UI and backend.
- Auto-publication mode configured for ordinary text/comments with required deterministic safeguards.
- Server-authoritative feature flags/capability endpoint and tested emergency kill switches.
- Community Guidelines, safety contact, privacy/terms updates, moderation staffing, alerts, and feature kill switches.
- Report/block coverage for every other UGC surface enabled in the beta; any uncovered profile, group-metadata, listing, message, or review surface remains disabled or read-only.
- Privacy-safe product, safety, reliability, and moderation instrumentation.

### Phase 1A — Small car-native social beta

- Social profile separated from account settings.
- Public/private profiles with safe default post/vehicle privacy.
- People search and mutual friend requests.
- All/Friends feeds with post detail, comments, likes, essential in-app notifications, and report/block paths.
- Vehicle/model tagging and one structured Question/Troubleshooting type with Accepted Answer.
- A curated set of public/open make/model/topic groups suggested from Garage vehicles, with join/leave and group posting.
- Minimum Garage upgrade: real/placeholder photo, nickname, ownership state, mileage/update date, and inspection status.
- Basic inspected-listing badge and Request Inspection action where the listing/inspection authorization permits it.
- Photo posts if required safeguards/storage are production-ready.
- Community promoted to bottom navigation.
- Empty/loading/error/accessibility polish.

Launch this phase as a controlled beta with real moderator coverage and server flags. It should already feel like a car product, not a generic profile/feed clone.

### Phase 1B — Engagement and discovery

- My Cars feed filter and improved unified discovery across people, curated groups, questions, vehicles, and listings.
- One-tap private Save/Unsave.
- Notification aggregation, preferences, and complete deep links.
- More group resources, pinned posts, search, rules, and moderator/member tools.
- Marketplace/Garage/Community cross-navigation and saved-listing activity.

### Phase 1C — Full social/group breadth

- User-created groups.
- Private and unlisted groups, request/invite-only joining, invitations, ownership transfer, bans, and advanced roles.
- External permission-aware sharing.
- Expanded message-request controls and group-member requests.
- Granular profile discovery/message/mention settings and advanced privacy controls.

### Phase 2 — Car-community differentiation

- Full Garage/Vehicle Passport tabs and ownership-transfer behavior.
- Remaining structured automotive post types, Helpful reactions, and question outcome history.
- Advanced structured automotive search.
- Build journals/fitment and maintenance timeline.
- Marketplace listing/detail/filter improvements and inspection-native trust cards.
- Technician identity and clearly scoped verification.
- Named saved collections and build-update subscriptions.

### Phase 3 — Expanded ecosystem

- Advanced reputation based on useful contributions.
- Events/meets after safety/location/organizer rules.
- Transaction-linked technician reviews after dispute policy.
- Smarter explainable discovery/ranking after enough usage data.
- Community video only after upload security, transcoding, moderation, reporting, accessibility, storage cost, and operations are deliberately re-approved.

## 36. Acceptance criteria

The work is not complete merely because screens render. The following behavior must pass on iOS and every enabled web/API surface.

### 36.1 Identity and privacy

- A new email, Google, Apple, or other OAuth account cannot enter social features until it has a valid available username.
- A `pending` onboarding profile can exist with no username without breaking signup, but every ordinary product endpoint rejects it until the one-time claim commits.
- Username rules are identical in client validation, server validation, and the database; case-variant duplicates cannot race through.
- Generic profile updates and direct RLS writes cannot change a claimed username; only the audited correction capability can.
- Existing accounts receive collision-safe usernames and can sign in without a broken migration state.
- Private-profile posts, private vehicles, and private-group content never leak through search, share links, notifications, counts, cache, or media URLs.
- Changing privacy immediately affects future reads without rewriting unrelated content incorrectly.
- Blocking prevents discovery/contact/content in both directions and does not announce itself.
- While Google sign-in remains in the iOS production build, Sign in with Apple works through the same username/account-deletion flow unless a documented current exemption exists.

### 36.2 Friends and groups

- Crossed friend requests create one relationship, and accept/decline/cancel/unfriend transitions are authorized and idempotent.
- Private profiles still require an accepted friendship for restricted content.
- A group owner cannot strand a group with no owner.
- Join mode, membership role, posting permission, and private-group media are server-enforced.
- Leaving/removal immediately revokes private-group reads and future notification hydration.

### 36.3 Publishing

- A normal authorized text post/comment publishes immediately and is visible only to the intended audience.
- Anonymous and pending-onboarding callers cannot read the authenticated Community feed; feed/detail DTOs contain only explicit redacted vehicle/listing/inspection fields, never broad joined rows or full VIN.
- Duplicate retries create one post/comment.
- Failed media/finalization never exposes a partial post.
- Photo-only publication succeeds only when the finalize transaction verifies an allowed attachment; an empty text-and-attachment post fails at the server/database.
- New Community video selection is absent and server video attempts fail with the expected unsupported response.
- Photo posts cannot bypass reservation, validation, metadata, storage, and approved safety controls.
- Editing creates a revision, shows Edited, and preserves any revision already referenced by a report.

### 36.4 Reporting and moderation

- Every eligible post surface has the red outline `flag` control with a 44-point hit target and correct VoiceOver text.
- Self-authored cards show Manage instead of Report.
- A report requires a reason and does nothing until Submit.
- One valid first report atomically creates the report/evidence/event/outbox and changes the underlying content to hidden/pending review.
- The reported content disappears from all ordinary surfaces and public media URLs, not only the reporter's feed.
- Community media has no permanent public object URL; the authenticated delivery endpoint denies the hidden parent immediately on a new request.
- Simultaneous and duplicate reports do not create duplicate state transitions.
- A failed transaction leaves both report and visibility state unchanged.
- Reporting a comment hides only that comment unless the post is separately acted on.
- Reporter identity never reaches the author, group moderator, public logs, analytics, push payload, or ordinary API.
- Restore returns content only to its original currently valid audience.
- Remove keeps the row/evidence and public media inaccessible.
- Legal hold restricts evidence and blocks application/account-deletion purges.
- Appeals and enforcement events are immutable/audited and cannot be decided by an unauthorized role.
- A restored unchanged revision re-hides immediately for the four severe codes or after three new distinct eligible reporters in seven days for other codes; an edited revision returns to the first-report rule.
- Every enabled profile, group-metadata, listing, review, message, and media surface exposes its specified report/block path and entity-specific immediate behavior; uncovered surfaces remain disabled/read-only.

### 36.5 Admin and operations

- A moderator can see the full reported revision/context and choose Restore, Remove from Community, or authorized escalation.
- Queue, reporter identity, content decision, account enforcement, evidence export, and legal-hold capabilities are independently enforced; production developer role switching grants none of them.
- Concurrent moderator decisions conflict safely rather than overwriting one another.
- Queue age/SLA alerts and durable notifications survive a worker retry.
- Public physical-delete controls are removed; only the retention worker can purge eligible closed data.
- Account deletion anonymizes public identity while preserving only authorized report evidence.
- Retention expiry purges eligible database/media data and never purges an active legal hold.
- Every restricted-evidence access and decision is logged and reviewable.

### 36.6 UX, accessibility, and resilience

- Screens work at the largest Dynamic Type setting without clipped text/actions.
- VoiceOver can create a post, report it from another account, block the author, and understand the result.
- Statuses remain distinguishable without color.
- Keyboard, sheet, safe-area, and custom tab-bar interactions work on supported iPhone/iPad sizes.
- Empty, loading, error, offline, retry, pagination, and no-longer-available states are designed, not blank.
- Old-client attempts cannot bypass new server restrictions.
- Stale cached content becomes unavailable after hide/block/privacy change.

## 37. Required test matrix

Automated unit/integration tests and manual end-to-end tests should cover combinations, not only happy paths:

- Viewer: anonymous, author, public stranger, friend, blocked/muted user, group member/moderator/owner, platform moderator, legal-hold reviewer.
- Profile: public/private/deleted/suspended.
- Destination: general, friends, public group, private group.
- Content: active, hidden/pending review, rejected, archived, legal hold, restored.
- Media: none, photo, old approved video, quarantined video, missing object, revoked public object.
- Device: current app, supported older app, offline/retry, two simultaneous devices.
- Report: first, duplicate, simultaneous, invalid reason, self-report, rate-limited, restored revision, edited revision, reporter deletion, author deletion.
- Reportable entity: post, comment, profile/avatar, group metadata/cover, listing, review when enabled, message/attachment, and standalone media; verify each entity-specific immediate effect.
- Admin: claim conflict, restore, remove, escalation, appeal, hold release, retention expiry.

Add targeted security tests for RLS bypass, IDOR/entity guessing, signed-URL reuse, private-group indexing, notification preview leakage, malicious file types, Unicode/HTML/link rendering, rate-limit evasion, and authorization after role/relationship changes.

Before release, run a production-like scenario from account creation through username, vehicle, friendship, group, post, report, global hide, moderator restore/removal, appeal, account deletion, and eventual eligible retention purge.

## 38. Deferred or explicitly out of scope

These are not part of the initial social release:

- New Community video uploads or autoplay video feeds.
- Stories, Reels, livestreaming, streaks, and creator monetization.
- One-way follower/following relationships.
- Public popularity leaderboards.
- Live vehicle/member location or route sharing.
- Paid events, ticketing, escrow, or marketplace payments.
- Unverified public technician ratings/reviews.
- Automatic law-enforcement reports without the authorized legal/safety workflow.
- Automatic transfer of private vehicle history to a buyer.
- A universal vehicle condition score or pass/fail label.
- A claim that AI, automated moderation, encryption, credentials, ownership, inspections, or App Store approval provides more assurance than it actually does.

## 39. Launch checklist and definition of done

Before the social beta flag is enabled in production, the responsible owners must confirm:

- Product/engineering sign-off on this state model and phased scope.
- Trust & Safety owner, moderator roster, escalation contacts, coverage, and SLA alerts.
- Counsel/business approval for policies, age approach, ordinary moderation retention, legal-hold release, copyright, emergency/law-enforcement, and any required reporting workflow.
- Privacy/Terms/Community Guidelines/AI disclosure accurately match enabled features.
- App Store support URL and monitored contact information are live.
- Server flags are correct, especially Community video off and report auto-hide on.
- Removal of legacy public Community URLs, authenticated status-aware media denial, and private evidence access have been end-to-end verified.
- Physical community-content deletion is unavailable to routine users/admins.
- RLS, migration, restore, backup/deletion-tombstone, rate-limit, accessibility, and old-client test suites pass.
- Dashboards/alerts cover report failures, hidden-content leakage, moderator backlog, storage cleanup, notification outbox, and retention jobs.
- A rollback/kill-switch runbook exists and has been practiced.

**Definition of done:** a normal user can safely complete the intended social loop, an abusive user cannot bypass server rules with an old/custom client, one valid report removes the exact content from every ordinary surface, an authorized moderator can make and audit the final decision, removed evidence remains restricted and recoverable for its approved purpose, and the product can later dispose of it through an approved retention process.

## 40. Implementation references

Repository references:

- [`2026-08-04-updates/social-media-user-image-upload-compliance.md`](../2026-08-04-updates/social-media-user-image-upload-compliance.md) — existing moderation architecture and future automated-moderation plan.
- [`docs/compliance/retention-schedule.md`](compliance/retention-schedule.md) — current retention decision register.
- [`docs/compliance/open-questions.md`](compliance/open-questions.md) — legal, operational, accessibility, and launch decisions still requiring owners.
- [`mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift`](../mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift) — current native Community/report UI.
- [`src/app/(admin)/admin/moderation/page.tsx`](<../src/app/(admin)/admin/moderation/page.tsx>) — current admin moderation queue.
- [`src/app/(admin)/admin/community/page.tsx`](<../src/app/(admin)/admin/community/page.tsx>) — current Community admin screen containing physical deletion behavior that must change.
- [`src/features/community/actions.ts`](../src/features/community/actions.ts) — current Community server actions.
- [`supabase/migrations/20260901013712_social_media_moderation_hardening.sql`](../supabase/migrations/20260901013712_social_media_moderation_hardening.sql) — current reporting/moderation database functions and controls.

External operational references:

- [Apple App Review Guidelines, including User-Generated Content guideline 1.2](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Review Guideline 4.8 for login services](https://developer.apple.com/app-store/review/guidelines/#login-services)
- [NCMEC CyberTipline](https://www.ncmec.org/gethelpnow/cybertipline)
- [18 U.S.C. § 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)

External links are context for the responsible reviewer; they do not replace product-specific legal advice or an approved operational runbook.
