# Retention Schedule Decision Register

Status: engineering-enforced periods and disposition rules are recorded below. Contract, transaction, tax, backup, and provider-specific periods remain pending the named owner or licensed counsel and are not guessed.

| Record class | Retention trigger | Proposed disposition | Required approver | Implemented enforcement |
|---|---|---|---|---|
| Supabase Auth/profile/identities | Authenticated deletion request | Delete account-owned application data, sessions, device registrations, links, and managed media; pause only for a documented legal hold | Privacy counsel + product | Durable worker claims requests every 15 minutes, retries failures, and normally starts within 24 hours |
| Terms assent evidence | Superseded version/account closure | Preserve for approved contract/dispute period | Litigation/contract counsel | Versioned immutable row |
| Vehicle/VIN | Vehicle removal/account closure | Delete with the account unless an approved transaction/legal hold applies | Privacy + product | Account cascade and managed-object cleanup implemented |
| Inspection/OBD/report/media | Completion/cancellation/account closure | Delete with the account unless an approved transaction/legal hold applies; standalone transaction period still requires approval | Inspection counsel | Account cascade and managed-object cleanup implemented |
| Public UGC/listings/reviews | User deletion/removal/moderation action | Delete/anonymize with fraud/legal-hold exception | UGC/privacy counsel | Per-feature only |
| Messages/attachments | Conversation/account deletion | Delete the account's records and managed attachment objects, subject to participant and legal-hold rules | Privacy/UGC counsel | Account deletion and owner-prefix cleanup implemented |
| Moderation evidence/appeals | Final action | Keep while a restricted case or appeal is active; release only through the restricted workflow | Trust & Safety + counsel | Legal-hold deletion triggers and restricted reviewer access implemented; general closed-case period pending |
| CyberTipline-reported evidence | CyberTipline report | Preserve the reported contents for at least one year from the report, restrict access, and follow any preservation extension | Trust & Safety + counsel | Legal-hold storage/access exists; reporting vendor/workflow and report-date tracking require operational approval |
| Share links | Expiry/revocation/account deletion | Revoke immediately; delete artifact later per source record | Product/privacy | Per-package revoke exists |
| APNs tokens | Logout, invalid token, account deletion | Delete promptly | Security/product | Invalid-token pruning and account cascade implemented |
| Security/audit logs | Event date | Rotate/delete after approved security period | Security + counsel | Provider dependent |
| Privacy requests | Completion | Keep minimized request evidence for 24 months, then delete | Privacy counsel | `retention_expires_at` plus worker pruning; identifiers/details are minimized after account deletion |
| Unattached quarantined uploads | Reservation expiry | Expire after 30 minutes and delete through the retry queue | Security/product | Enforced by reservation expiry and storage-cleanup worker |
| Payments/receipts/refunds | Transaction date | Retain as tax/payment law requires | Tax/payment counsel | Provider dependent |
| Contracts/signatures | Execution/termination | Preserve and deliver as E-SIGN/state law requires | Contract counsel | Provider dependent |
| VSC/warranty/claims | Contract/claim close | State/product-specific schedule | VSC counsel/provider | Launch blocked |
| Partner delivery/webhooks | Disconnect/delivery close | Delete/minimize under partner agreement | Partner counsel | Not complete |
| Backups | Production deletion | Expire by verified provider cycle; prevent restore to active use | Security/privacy | Not verified |

## Enforcement requirements

- Every approved period must have an owner, legal basis, system of record, deletion mechanism, processor propagation, backup behavior, test, alert and exception/hold path.
- Deletion jobs must be idempotent, auditable, least-privileged and safe to retry.
- A legal hold must suspend only affected data, record authority/reason/scope, restrict access and be reviewed for release.
- Restores must replay deletion tombstones before restored data becomes available.

The 24-month privacy-request period follows the California privacy-request recordkeeping baseline. The one-year reported-content minimum follows 18 U.S.C. § 2258A(h); it applies after a CyberTipline report and does not authorize general access to restricted evidence.
