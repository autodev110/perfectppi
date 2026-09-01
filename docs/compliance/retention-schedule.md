# Retention Schedule Decision Register

Status: periods intentionally unset pending owner and counsel approval. This is the control document; a production deletion job must not be enabled from guesses.

| Record class | Retention trigger | Proposed disposition | Required approver | Implemented enforcement |
|---|---|---|---|---|
| Supabase Auth/profile/identities | Verified deletion or inactivity | Delete/anonymize except approved hold | Privacy counsel + product | Request intake only |
| Terms assent evidence | Superseded version/account closure | Preserve for approved contract/dispute period | Litigation/contract counsel | Versioned immutable row |
| Vehicle/VIN | Vehicle removal/account closure | Delete or unlink unless inspection/transaction requires | Privacy + product | Not complete |
| Inspection/OBD/report/media | Completion/cancellation/account closure | Delete after approved transaction/safety/dispute period | Inspection counsel | Not complete |
| Public UGC/listings/reviews | User deletion/removal/moderation action | Delete/anonymize with fraud/legal-hold exception | UGC/privacy counsel | Per-feature only |
| Messages/attachments | Conversation/account deletion | Apply sender/recipient and safety rules | Privacy/UGC counsel | Not complete |
| Moderation evidence/appeals | Final action | Preserve for approved safety/appeal period | Trust & Safety + counsel | Records exist; lifecycle absent |
| Share links | Expiry/revocation/account deletion | Revoke immediately; delete artifact later per source record | Product/privacy | Per-package revoke exists |
| APNs tokens | Logout, invalid token, account deletion | Delete promptly | Security/product | Invalid-token pruning; deletion test open |
| Security/audit logs | Event date | Rotate/delete after approved security period | Security + counsel | Provider dependent |
| Privacy requests | Completion | Preserve evidence for approved regulatory period | Privacy counsel | Status table exists |
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

