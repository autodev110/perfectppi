# PerfectPPI Data Inventory

Status: implemented as an engineering inventory pending business-owner and licensed-counsel approval. Last reviewed: September 2, 2026.

| Data | Source and purpose | Primary storage/access | Disclosures | Deletion/retention state |
|---|---|---|---|---|
| Auth ID, email, name, avatar, role, Google identity | User/Google; authentication, profile, authorization | Supabase Auth and `profiles`; user, authorized staff, service processes | Supabase, Google for OAuth | Account deletion workflow records a request; Auth/provider revocation and final schedule remain open |
| Legal assent evidence | Signup or post-OAuth clickwrap; prove versioned assent | `legal_acceptances`; owner select, service-role write | Supabase | Preserve according to counsel-approved dispute/contract schedule |
| Organization and technician profile | User/org; directory, assignment, permissions | Supabase organization, membership, technician tables | Public fields when profile is public; relevant organization members | Verification evidence and credential schedule not implemented |
| Vehicle, VIN, make/model, mileage | User, scanner, NHTSA vPIC, partner; identify vehicle and support inspection | Supabase vehicle/inspection tables | NHTSA vPIC, Gemini where feature requires, inspectors/org/partner | VIN minimization and final schedule open |
| Inspection answers, notes, OBD codes/readings | User, technician, OBD adapter; inspection and report | Supabase; report artifacts in R2 | Gemini, inspection participants, approved partner | Transaction/dispute schedule and R2 propagation open |
| Inspection/listing/community photos and video | Camera/library/user; evidence and UGC | Cloudflare R2 public or private paths depending feature; references in Supabase | Public for approved public content; participants for private content; Gemini for moderation stills | iOS still-image metadata stripped; video metadata and legacy objects require review |
| Community posts/comments/reports/appeals | User/moderation; social features and safety | Supabase; quarantine media in private R2 | Public after approval; Gemini moderation; admins | Moderation evidence/legal-hold schedule open |
| Marketplace listings, price, location, seller | User; public listing and contact | Supabase/public R2 | Public visitors and transaction participants | Listing closure/deletion rules open |
| Reviews | User; reputation and feedback | Supabase | Public | Consumer Review Rule/CRFA preservation and fraud controls require operational review |
| Messages and attachments | Conversation participants; communication | Supabase/private or authorized media route | Participants, authorized safety/legal review | Conversation deletion and recipient-copy rules open |
| Share links | User; share report/media package | Supabase token metadata and R2 artifacts | Anyone holding bearer link | Revocation exists for media packages; account-wide invalidation test remains open |
| Device/APNs token, app version | iOS/device; push delivery and reliability | Supabase device-token table | Apple APNs | Invalid tokens pruned; account-deletion propagation must be tested |
| IP, user agent, request/security logs | Hosting/network/application; security and evidence | Vercel/Cloudflare/Supabase logs; optional hashed IP in assent evidence | Hosting/security providers | Provider log schedules not verified; raw IP is not stored in assent table |
| Stripe IDs, order/payment status, receipts | User/Stripe; transaction | Supabase references and Stripe | Stripe, authorized account/admin | Card number is not stored by app; refund and retention policy open |
| DocuSeal contract/signature status | User/DocuSeal; e-signature | Supabase references; DocuSeal; private artifact handling | DocuSeal, parties, authorized staff | Signed-document storage and E-SIGN retention/delivery must be verified before launch |
| VSC/warranty options and generated outputs | Inspection context/Gemini; preview workflow | Supabase, Gemini output, DocuSeal/Stripe if enabled | Providers/processors if launched | Launch blocked pending role, licensing, forms, cancellation, and state approval |
| AI inputs/outputs | Feature-selected VIN/vehicle/inspection/OBD/text/image | Gemini during processing; outputs/evidence in Supabase/R2 | Google Gemini | Vendor training/retention contractual settings require owner review |
| DealerSpace IDs, snapshots, events, deliverables | Connected organization/partner; integration | Supabase and private/public artifacts by route | Connected DealerSpace tenant | Disconnect exists; downstream deletion/contract schedule open |
| Privacy requests | Account user/support; exercise rights | `privacy_requests`; user read/service-role processing | Authorized staff/processors needed to fulfill | Keep under counsel-approved request-evidence schedule |

## Public exposure map

- Public by design: public profiles, approved marketplace listings, approved community posts/comments, reviews, and approved media referenced by those surfaces.
- Bearer access: active share links. Possession may be sufficient for access until revocation/expiry.
- Private by design: messages, contracts, moderation quarantine, private report artifacts, account/legal/privacy records.
- Requires remediation evidence: anonymous denial tests for every private R2 object class and deletion tests across both R2 buckets.

## Data minimization decisions implemented

- Google OAuth remains basic identity only; no Gmail, Drive, Contacts, or sensitive scopes are requested.
- Legal assent stores a hashed IP only when a server-only salt is configured; it does not store raw IP.
- Native still-image library uploads are re-encoded to remove EXIF/GPS metadata.
- Public marketing claims unsupported by repository evidence were removed.
