# Perfect PPI ↔ ShopOwl Integration — Perfect PPI side

ShopOwl uses the same partner contract as DealerSpace
([`DEALERSPACE_INTEGRATION.md`](DEALERSPACE_INTEGRATION.md)): the same credentials,
signed webhooks, four required deliverables, and authenticated manifest and artifact
routes. This page covers only what differs. What varies between partners lives in
one table, `src/features/partner/systems.ts`.

| | DealerSpace | ShopOwl |
| --- | --- | --- |
| Connecting | Manager generates a code and an admin pastes it | One click from ShopOwl, approved at `/connect/shopowl` |
| Who is linked first | Nobody; each person links separately | The person who connected, in the same step |
| Reconnecting | Rotate, then paste both new values | Connect again, which rotates in place |
| Delivering reports | The technician presses Send | Automatic when all four artifacts exist |
| Disconnecting | Revoke in Perfect PPI | Either side, including `DELETE /connections/self` |

## Browser connect

1. ShopOwl sends the browser to
   `/connect/shopowl?state=…&code_challenge=…&shop=…`. The shop name is only a label.
2. The consent page requires sign-in as an organization manager. Someone with no
   organization can create one there and continues automatically.
3. Approving mints an ordinary row in `partner_installation_codes`, with a
   `code_challenge`, the partner's `source_system` and a five-minute expiry, and
   redirects to the fixed callback from `PARTNER_SHOPOWL_APP_URL`. A request can never
   choose the destination.
4. ShopOwl's backend calls `POST /api/v1/partner/connections/exchange` with the code
   and `codeVerifier`.

The exchange endpoint behaves as it does for DealerSpace, with these additions when
a code has a challenge:

- A missing or wrong verifier returns `invalid_installation_code`, the same answer as
  an unknown code.
- `webhookUrl` and `userLinkRedirectUri` must be on the partner's configured origin.
- `connectingExternalUserId` links the approving manager and is returned as
  `connectingUser`. An existing link to a different person is left alone.
- A live connection to the same organization and external account is rotated in
  place and returned with `reconnected: true`. A different account still gets
  `connection_already_exists`. A manual code can never rotate.

## Automatic delivery

`requestPartnerAutoDelivery` runs at the end of the output pipeline, only after all
four artifacts are stored and checksummed. It calls the same
`partner_request_delivery` the Send button uses, so the worker, retries, signing and
the manifest gate are unchanged. A report held for admin review has no artifacts, so
it cannot be sent early.

`sweepPartnerAutoDeliveries` runs on each delivery tick and requests any complete
version that was never requested, in case the pipeline's own call failed. It never
re-arms a failed delivery. That needs the retry button, which an automatic partner
still shows. DealerSpace is unaffected.

## Configuration

`PARTNER_SHOPOWL_APP_URL` is optional and only for staging or local use, defaulting to
`https://my.shopowl.io`. Loopback HTTP also needs `PARTNER_ALLOW_INSECURE_CALLBACKS=true`.

Apply `20261105120000_partner_shopowl_browser_connect.sql` before deploying. It is
additive, and DealerSpace behaviour is unchanged.

ShopOwl's side is documented in its repository at `docs/perfectppi-integration.md`.
