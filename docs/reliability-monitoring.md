# Reliability Monitoring

This runbook covers the privacy-safe reliability signals implemented for the
PerfectPPI social surfaces. It does not authorize logging user content.

## Database Reads

The Admin > Product Analytics page shows aggregate execution statistics for
the allowlisted feed, search, group, saved-content, People, and Marketplace
read functions. Values are cumulative since the `pg_stat_statements` reset
shown on the page.

Use the Supabase Query Performance dashboard or these CLI commands for deeper
investigation by an authorized operator:

```bash
supabase inspect db outliers --linked
supabase inspect db long-running-queries --linked
supabase inspect db index-usage --linked
```

Do not reset `pg_stat_statements` until the relevant baseline has been saved.
Do not paste representative SQL into tickets when it could reveal schema or
operational details; refer to the closed operation code shown in PerfectPPI.

## Storage Operations

R2 requests emit `operational service event` only when an operation fails or
takes at least five seconds. The structured payload contains only:

- `event`: `operation_failed` or `operation_slow`
- `operationCode`: a closed storage operation code
- `durationMs`: rounded elapsed time

It never includes an object key, URL, bucket, account identifier, content,
provider response, or exception text. Configure the deployment log provider
to alert on `operation_failed`; use a sustained threshold for `operation_slow`
to avoid paging on isolated network variance.

Community still images are served through the authenticated display endpoint.
Web defers off-screen image loading and decoding. iOS downscales feed images to
a 1,280-pixel decode bound, cancels work when a card leaves the screen, and
uses a 96 MiB cost-limited memory cache. Network-size tuning remains pending a
production-shaped media baseline; do not weaken status checks or expose direct
R2 URLs to optimize delivery.

## Baseline Procedure

1. Seed staging with production-shaped counts and media dimensions using
   synthetic records only.
2. Exercise first-page and continuation reads for every feed/search/filter.
3. Record average and maximum database execution time plus API response time.
4. Test R2 upload, delivery, range requests, promotion, and deletion under
   ordinary and degraded connectivity.
5. Set release budgets only after the oldest supported iPhone and staging
   database have both been measured.
6. Record the approved budgets and alert thresholds in this document.

Production-shaped counts, approved budgets, and alert thresholds are still
pending. Never use real private messages, reports, VINs, or restricted media
as load-test fixtures.
