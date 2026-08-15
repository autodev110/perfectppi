# Social Media User Image Upload Compliance Brainstorm

Date: 2026-08-04

Purpose: define a practical moderation system for PerfectPPI community posts, comments, and user-uploaded media so posts can publish quickly when clearly safe while still blocking, quarantining, or escalating illegal, obscene, abusive, or off-policy content.

This is a product and engineering brainstorming note, not legal advice. The final policy, enforcement wording, retention rules, and reporting obligations should be reviewed by counsel before launch.

## Current Project Surface

The repo already has a lightweight social/community layer:

- `community_posts` and `community_comments` exist in `supabase/migrations/029_community.sql`.
- Current statuses are `active`, `hidden`, and `archived`.
- `src/features/community/actions.ts` inserts posts and comments as `active` immediately after basic validation.
- Upload routes accept image/video/file uploads through R2-backed APIs:
  - `src/app/api/upload/direct/route.ts`
  - `src/app/api/upload/presigned-url/route.ts`
- Community posts currently attach vehicles/listings rather than arbitrary post images, but user image compliance still matters because public posts can expose vehicle photos, media packages, avatars, inspection media, and future post attachments.

Main gap: there is no content moderation state machine, no automated scan, no human review queue, no user enforcement/audit history, and no way to prevent public exposure before uploaded media is checked.

## Recommended Direction

Build a native PerfectPPI moderation system and keep third-party services as replaceable classifiers, not as the source of truth.

Best practical plan:

1. Add native moderation state, audit tables, admin queues, account enforcement, and user warning flows in Supabase/Next.js.
2. Run a fast synchronous check before text posts/comments publish.
3. Quarantine images/videos/files on upload and only make them public after automated review passes.
4. Use a cascade:
   - cheap deterministic checks first
   - fast AI moderation second
   - stronger multimodal/vision review only when uncertain or flagged
   - human review for gray-area cases
5. Auto-block the highest-risk categories, auto-approve clearly safe content, and route uncertain content to a manual queue.
6. Never rely on "delete and forget" for suspected illegal material. Lock it, hide it, preserve the evidence path, restrict access, and follow the reporting process approved by counsel.

The important product principle: users should not wait for manual approval on normal, on-topic posts. They should only be interrupted when risk is detected.

## Proposed Moderation States

Extend content statuses beyond `active`, `hidden`, and `archived`.

Recommended content lifecycle:

- `draft`: user is still editing.
- `pending_scan`: accepted by the server but not visible yet.
- `active`: visible because it passed automated checks or manual review.
- `needs_user_confirmation`: the post may be okay, but the user should edit or confirm manual review.
- `pending_review`: hidden from public view and waiting for admin/moderator review.
- `rejected`: not visible because it violates policy.
- `hidden`: removed from public view after publication.
- `archived`: user removed or expired content.
- `legal_hold`: locked down because it may involve illegal material or law-enforcement/reporting requirements.

Use separate status fields for content and moderation:

- `content_status`: whether the post/media is visible.
- `moderation_status`: moderation workflow state.
- `moderation_reason`: normalized reason code.
- `moderation_score`: highest risk score.
- `moderation_checked_at`: timestamp.
- `moderation_version`: policy/model version used.

This avoids mixing "user archived it" with "platform hid it."

## Native Data Model

Add a small moderation layer instead of stuffing everything into `community_posts`.

Suggested tables:

### `moderation_items`

One row for every post, comment, image, video, profile photo, media package, and future UGC surface.

Fields:

- `id`
- `entity_type`: `community_post`, `community_comment`, `vehicle_media`, `media_package_item`, `profile_avatar`, etc.
- `entity_id`
- `author_id`
- `status`: `pending_scan`, `active`, `pending_review`, `rejected`, `legal_hold`
- `risk_level`: `none`, `low`, `medium`, `high`, `critical`
- `decision`: `allow`, `warn`, `review`, `block`, `legal_hold`
- `reason_codes`: array or jsonb
- `model_provider`: `native_rules`, `openai`, `aws_rekognition`, `google_vision`, `local_model`, etc.
- `model_name`
- `model_version`
- `raw_result`: jsonb, access restricted to admins/service role
- `created_at`, `updated_at`, `decided_at`

### `moderation_events`

Append-only audit log.

Fields:

- `id`
- `moderation_item_id`
- `actor_type`: `system`, `admin`, `user`, `appeal`
- `actor_id`
- `event_type`: `submitted`, `auto_allowed`, `auto_blocked`, `escalated`, `manual_approved`, `manual_rejected`, `user_warned`, `appeal_opened`, `appeal_resolved`
- `previous_status`
- `next_status`
- `notes`
- `metadata`
- `created_at`

### `user_enforcement_actions`

Account-level consequences.

Fields:

- `id`
- `profile_id`
- `action_type`: `warning`, `temporary_posting_hold`, `media_upload_hold`, `suspension`, `ban`
- `reason_code`
- `related_moderation_item_id`
- `starts_at`
- `ends_at`
- `created_by`
- `created_at`

### `moderation_hashes`

Stores hashes and dedupe signals for uploaded files.

Fields:

- `id`
- `entity_type`
- `entity_id`
- `sha256`
- `perceptual_hash`
- `mime_type`
- `file_size`
- `width`
- `height`
- `duration_seconds`
- `scan_status`
- `created_at`

Do not store raw illegal material in moderation logs. Store enough metadata for audit and reporting, with strict access control.

## Content Categories To Define In Policy

The policy should become machine-readable. Start with categories like:

- Illegal content
- Child sexual abuse material or sexual content involving minors
- Non-consensual intimate imagery
- Explicit sexual content
- Graphic violence or gore
- Threats, harassment, hate, or targeted abuse
- Fraud, scams, phishing, impersonation
- Doxxing, private personal information, license plates if policy forbids it, documents, addresses
- Regulated goods/services
- Spam, irrelevant promotion, bot activity
- Off-topic content not related to vehicles, PPIs, ownership, marketplace, or community discussion
- Copyright or stolen media claims

Each category should define:

- `allow`
- `warn`
- `manual_review`
- `block`
- `legal_hold`
- user-facing message
- moderator instructions
- escalation severity
- repeat-offender enforcement

## Recommended Cascade Flow

### Text Post Or Comment Flow

1. User submits text.
2. Server performs deterministic validation:
   - auth/session check
   - length limits
   - excessive links
   - repeated characters/spam patterns
   - banned terms list
   - account age/reputation/rate limits
3. Run fast AI text moderation.
4. If clearly safe and on-topic:
   - insert as `active`
   - log `auto_allowed`
   - show normal success state
5. If low or ambiguous risk:
   - return a warning UI:

```text
This post may not follow PerfectPPI community guidelines.
You can edit it now, or submit it for manual review.
Repeated violations may limit posting.
```

6. If user submits anyway:
   - save as `pending_review`
   - do not publish
   - enqueue for manual review
7. If high-risk:
   - block submission
   - log `auto_blocked`
   - optionally warn or restrict the user
8. If critical/illegal-risk:
   - save only the minimum required record
   - set `legal_hold`
   - hide content
   - restrict access
   - trigger counsel-approved reporting workflow

### Image Upload Flow

Important: do not put unreviewed uploads at public URLs.

Current R2 flow should evolve to:

1. Upload goes to a private/quarantine prefix:
   - `quarantine/{profile_id}/{entity}/{uuid}`
2. Server validates:
   - MIME type
   - magic bytes
   - file size
   - image dimensions
   - video duration
   - metadata stripping plan
   - duplicate hash
3. Compute:
   - SHA-256 exact hash
   - perceptual image hash
   - basic metadata
4. Run image moderation:
   - first pass: fast image classifier
   - second pass only if needed: stronger vision analysis and/or OCR
5. If allowed:
   - move/copy object to approved prefix
   - create or activate the media DB record
   - expose public URL or signed proxy URL
6. If review needed:
   - keep private
   - create `pending_review` item
7. If blocked:
   - keep hidden
   - record reason
   - optionally delete non-illegal content after retention window
8. If illegal-risk:
   - apply `legal_hold`
   - do not expose publicly
   - preserve according to approved process

### Video Upload Flow

Video should always be async:

1. Upload to quarantine.
2. Extract representative frames plus metadata.
3. Run image moderation on sampled frames.
4. Run OCR on frames if text overlays matter.
5. If sound becomes user-generated later, transcribe audio and moderate transcript.
6. Only publish after the async job passes.

For an MVP, consider blocking video uploads in community/social contexts until the image pipeline is stable.

## Suggested Decision Thresholds

Use policy thresholds that can be changed without deploying code.

Example:

- `allow`: all scores below low threshold, no hard rule hits, on-topic confidence high.
- `warn`: mild profanity, mild hostility, off-topic uncertainty, low confidence.
- `review`: sexual/racy ambiguity, unclear violence, potential personal data, suspicious spam/scam content, uncertain image result.
- `block`: explicit sexual content, threats, hate/threatening, graphic violence, fraud/scam, repeated policy evasion.
- `legal_hold`: suspected CSAM, credible threat, trafficking/sexual exploitation indicators, non-consensual intimate imagery, or other category counsel designates.

Avoid instant permanent bans from one automated result unless it is an extremely high-confidence critical category. Safer enforcement:

1. First minor issue: warning.
2. Repeated minor issues: temporary posting cooldown.
3. Serious issue: immediate posting hold plus manual review.
4. Critical issue: account suspension pending review.
5. Confirmed severe or illegal abuse: ban plus reporting workflow.

## Native-First Architecture

Recommended components:

### 1. Moderation Policy Config

Store policy rules in a versioned config file or database table:

- category
- thresholds
- default action
- user message
- moderator guidance
- retention behavior
- appeal availability

This creates a real internal policy system before the legal Terms of Use are finalized.

### 2. Moderation Service Module

Add a server-only module:

- `src/lib/moderation/index.ts`
- `src/lib/moderation/text.ts`
- `src/lib/moderation/image.ts`
- `src/lib/moderation/policy.ts`
- `src/lib/moderation/enforcement.ts`

It should expose:

```ts
moderateText({ text, authorId, entityType, entityId })
moderateImage({ objectKey, publicOrSignedUrl, authorId, entityType, entityId })
applyModerationDecision(decision)
```

### 3. Queue

Use Supabase Queues or a simple `moderation_jobs` table first. Supabase Queues is attractive because it is Postgres-native and durable.

Jobs:

- `moderate_text`
- `moderate_image`
- `moderate_video`
- `recheck_content`
- `appeal_review`
- `account_enforcement_review`

### 4. Worker

For MVP:

- Vercel cron or API route worker can process queued jobs.

Better:

- Supabase Edge Function worker for moderation jobs.
- Cloudflare R2 event notifications can enqueue media scan work when objects are created.

### 5. Admin Review UI

Add `/admin/moderation` with:

- queue filters: priority, risk, type, age
- side-by-side content preview
- model reasons and scores
- prior user history
- approve/reject/hide/legal-hold actions
- canned moderator notes
- appeal state

### 6. User-Facing UX

States:

- Clean content: no extra friction.
- Warning content: user can edit or submit for review.
- Manual review: "Your post is being reviewed and is not public yet."
- Blocked content: short policy message, no model details that help evasion.
- Repeat offender: cooldown or posting restriction message.

## AI And Vendor Options

### Best MVP Classifier

Use OpenAI `omni-moderation-latest` as the first external classifier because it supports text and image moderation through one API and returns categories/scores. The moderation endpoint accepts text and image inputs, with `omni-moderation-latest` as the default model in the API reference. OpenAI also documents `omni-moderation-latest` as a multimodal moderation model for text and image inputs.

Why this fits:

- easy to integrate into Next.js server routes
- good first pass for text and images
- no need to build model hosting immediately
- native PerfectPPI policy engine can interpret the scores

Risk:

- still a third-party dependency
- not a legal authority
- should not be the only line of defense for illegal content
- still needs human review for gray areas

### Strong Image/Video Vendor Options

AWS Rekognition:

- Mature image and stored-video moderation APIs.
- Supports moderation labels, confidence thresholds, and async video moderation.
- Good fallback or second opinion for images/video.
- AWS explicitly notes image/video moderation APIs do not detect whether an image includes illegal content such as CSAM, so do not treat it as sufficient for legal compliance.

Google Cloud Vision SafeSearch:

- Simple image classification for adult, spoof, medical, violence, and racy categories.
- Useful as a second-pass or fallback, but less policy-rich than a full moderation workflow.

### Native/Open-Source Direction

Self-hosted or local model options are possible, but they are not the fastest MVP:

- text rules and spam detection can be native immediately
- image metadata, MIME validation, SHA-256 hashing, perceptual hashing, and OCR can be native
- self-hosted vision classifiers can reduce vendor reliance later
- Llama Guard 3 Vision can classify multimodal safety categories, but its own model card says it is not meant to be used as a pure image safety classifier and has limitations

Best compromise: build the orchestration, policy, audit, queue, review UI, and enforcement natively now. Use replaceable AI adapters. Start with a third-party classifier for speed, then add self-hosted classifiers once you have real moderation data and a policy taxonomy.

## Illegal Material And CSAM Handling

This needs special treatment. Do not make this a normal "moderator sees it and decides" workflow.

For suspected CSAM or child exploitation:

- immediately hide/quarantine content
- prevent public access
- restrict internal access
- preserve required records and evidence path according to counsel-approved retention policy
- do not delete before legal/reporting review
- escalate to a locked critical queue
- follow reporting obligations

NCMEC operates the CyberTipline, the centralized U.S. reporting system for online child exploitation. NCMEC also describes that U.S.-based electronic service providers are required to report apparent CSAM they become aware of to NCMEC. PerfectPPI should get counsel input on whether it is an electronic service provider for these purposes, who files reports, what metadata is included, and how evidence is preserved.

Hash matching:

- Store SHA-256 for exact duplicate detection in your own system.
- Store perceptual hashes for near-duplicate review, but do not auto-ban on perceptual hash alone.
- Explore trusted hash-list programs if PerfectPPI becomes eligible.
- Microsoft describes PhotoDNA/hash matching as a way to detect known illegal/harmful image content without reconstructing the original file.
- NCMEC Take It Down uses hashes to help participating platforms detect and remove sexual images/videos of minors without uploading the image to NCMEC.

## Initial MVP Implementation Plan

### Phase 1: Stop Public-First Posting

Goal: no unreviewed suspicious content goes public.

Tasks:

1. Add moderation enums and tables.
2. Change `createCommunityPostFromInput` and `createCommunityCommentFromInput` to call `moderateText`.
3. Auto-publish only `allow`.
4. Add `pending_review` support to community posts/comments.
5. Add `/admin/moderation`.
6. Add report buttons on posts/comments.
7. Add rate limits and account-level cooldowns.

### Phase 2: Media Quarantine

Goal: images never become public before scan.

Tasks:

1. Change upload flow to write to R2 `quarantine/`.
2. Stop returning public URLs for unscanned uploads.
3. Add hash/metadata extraction.
4. Add image moderation job.
5. Promote approved uploads to public/approved path.
6. Show upload state: scanning, approved, rejected, pending review.

### Phase 3: Better Review And Enforcement

Goal: reduce manual work without losing control.

Tasks:

1. Build reviewer workflow.
2. Add decisions, notes, and audit trail.
3. Add user warnings and appeals.
4. Add repeat-offender enforcement.
5. Add admin metrics:
   - auto-approve rate
   - auto-block rate
   - manual queue volume
   - false positive rate
   - time to review
   - repeat offender count

### Phase 4: Native Model Improvements

Goal: reduce vendor reliance.

Tasks:

1. Add local spam/scam classifiers.
2. Add OCR for image text.
3. Add pHash duplicate matching.
4. Evaluate self-hosted image moderation model.
5. Evaluate second-opinion model only for borderline cases.
6. Keep provider abstraction so the policy engine does not care which model produced the score.

## Product UX Copy Ideas

### Warning Before Manual Review

```text
This post may not follow PerfectPPI community guidelines.

You can edit it now, or submit it for manual review. Posts sent for review are not public until approved. Repeated violations may limit your ability to post.
```

Buttons:

- Edit post
- Submit for review

### Pending Review

```text
Your post was submitted for review. It is not visible to other users yet.
```

### Blocked

```text
This post cannot be published because it appears to violate PerfectPPI community guidelines.
```

### Upload Scanning

```text
Scanning upload before publishing.
```

### Upload Rejected

```text
This upload cannot be published because it appears to violate PerfectPPI community guidelines.
```

## What Not To Do

- Do not rely only on user reports.
- Do not publish all uploads first and scan later.
- Do not require manual approval for every normal post.
- Do not let client-side checks decide moderation.
- Do not expose raw moderation model scores to users.
- Do not immediately delete suspected illegal material without an approved retention/reporting process.
- Do not auto-ban from one uncertain model result.
- Do not let moderators freely browse high-risk illegal material without a strict access process.

## Best Final Recommendation

Use a native PerfectPPI moderation pipeline with a replaceable AI classifier layer.

For MVP:

1. Text posts/comments: synchronous moderation in the server action before insert.
2. Images/media: quarantine-first upload, async moderation, publish only after approval.
3. AI cascade:
   - native rules
   - OpenAI `omni-moderation-latest` for text/image first pass
   - second-pass vision provider or manual queue only for flagged/uncertain cases
4. Data model:
   - `moderation_items`
   - `moderation_events`
   - `user_enforcement_actions`
   - `moderation_hashes`
5. Admin UX:
   - `/admin/moderation`
   - manual review queue
   - audit trail
   - account enforcement controls
6. Legal workflow:
   - locked `legal_hold` path for suspected illegal material
   - counsel-reviewed CyberTipline/reporting process

This gives PerfectPPI the automation needed to avoid manually approving every post, but still leaves a human-controlled and auditable safety path for anything questionable.

## Sources And Integrations To Review

- [OpenAI Moderations API reference](https://platform.openai.com/docs/api-reference/moderations)
- [OpenAI omni-moderation-latest model](https://developers.openai.com/api/docs/models/omni-moderation-latest)
- [OpenAI Moderation endpoint cost note](https://help.openai.com/en/articles/4936833-is-the-moderation-endpoint-free-to-use)
- [AWS Rekognition content moderation docs](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html)
- [AWS Rekognition image/video moderation API docs](https://docs.aws.amazon.com/rekognition/latest/dg/moderation-api.html)
- [Google Cloud Vision SafeSearch docs](https://docs.cloud.google.com/vision/docs/detecting-safe-search)
- [Cloudflare R2 event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/)
- [Supabase Queues docs](https://supabase.com/docs/guides/queues)
- [Supabase Edge Functions docs](https://supabase.com/docs/guides/functions)
- [Supabase Background Tasks docs](https://supabase.com/docs/guides/functions/background-tasks)
- [NCMEC CyberTipline](https://www.ncmec.org/gethelpnow/cybertipline)
- [NCMEC CSAM issue page](https://www.ncmec.org/theissues/csam)
- [NCMEC Take It Down](https://takeitdown.ncmec.org/)
- [Microsoft Digital Safety content detection and PhotoDNA discussion](https://www.microsoft.com/en-us/DigitalSafety/moderation-and-enforcement/content-detection)
- [Llama Guard 3 Vision model card](https://huggingface.co/meta-llama/Llama-Guard-3-11B-Vision)
