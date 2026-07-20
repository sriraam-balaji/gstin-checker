# GSTIN Validator

Validates an Indian GSTIN offline, then checks it against the GST registry and scores the result for fraud risk.

## What it can and cannot tell you

| Question | Answer |
|---|---|
| Is this a well-formed GSTIN? | **Yes** — structure, state code, embedded PAN, mod-36 check digit. Free, offline, instant. |
| Does this GSTIN actually exist? | **Yes**, with live lookup enabled. A fabricated number with a valid check digit is caught here and nowhere else. |
| Is the registration active? | **Yes** — Active / Cancelled / Suspended, plus filing history. |
| Does it belong to who I think? | **Yes**, if you supply the expected name. |
| Is this specific invoice genuine? | **No.** No API can tell you this. A real, active GSTIN can still appear on a fabricated invoice. |

A `pass` verdict means *no adverse signals were found* — not *this counterparty is trustworthy*. Treat it as one input to a decision, not the decision.

## Verdicts

| Verdict | Meaning |
|---|---|
| `reject` | Malformed, unregistered, cancelled, or suspended. Do not transact without resolving. |
| `caution` | Real and registered, but carries risk — name mismatch, dormant filing, very new, or wrong state. |
| `pass` | Registered, active, no adverse signals. |
| `unverified` | Well-formed, but the registry could not be reached. **Never** treated as fraud. |

That last distinction is deliberate: an API outage must never be reported to you as "this GSTIN is fake".

## Risk signals

| Code | Level | Trigger |
|---|---|---|
| `MALFORMED` | critical | Fails offline validation |
| `NOT_REGISTERED` | critical | Well-formed but absent from the registry |
| `STATUS_CANCELLED` | critical | Registration cancelled |
| `STATUS_SUSPENDED` | critical | Registration suspended |
| `STATUS_NOT_ACTIVE` | high | Provisional or inactive |
| `NAME_MISMATCH` | high | Registry name differs from the name you expected |
| `NO_FILING_HISTORY` | high | Active registration with no returns on record |
| `DORMANT_FILING` | high | No return filed in 180+ days |
| `NAME_PARTIAL_MATCH` | medium | Name partially matches |
| `STALE_FILING` | medium | No return filed in 90+ days |
| `NEWLY_REGISTERED` | medium | Registered under 90 days ago |
| `STATE_MISMATCH` | medium | Registered in a different state than expected |
| `LOOKUP_UNAVAILABLE` | medium | Registry could not be reached |

## Getting started

```bash
npm install
npm test          # 69 tests, no network, no API credits
npm run dev       # UI only, offline validation
```

For the full stack including the API and auth gate:

```bash
cp .dev.vars.example .dev.vars     # then edit it
npm run build
npx wrangler pages dev dist
```

Ships with `GST_PROVIDER=mock`, so everything above is free and offline. The mock has fixtures for every verdict:

| GSTIN | Verdict |
|---|---|
| `27AAPFU0939F1ZV` | pass |
| `29AAGCB7383J1Z4` | reject — not registered |
| `07AAACI1195H1ZO` | reject — cancelled |
| `33AAAAP0267H2ZU` | reject — suspended |
| `06AABCT3518Q1Z0` | caution — dormant |
| `24AAACC1206D1ZM` | caution — newly registered |

## Going live

1. Sign up at [appyflow.in](https://appyflow.in/verify-gst/) — 50 free requests, then ₹0.50 each (₹0.40 above ₹1,000).
2. Create the KV namespace and uncomment the binding in `wrangler.toml`:
   ```bash
   npx wrangler kv namespace create GST_CACHE
   ```
3. Set secrets:
   ```bash
   npx wrangler pages secret put APP_PASSWORD
   npx wrangler pages secret put AUTH_SECRET   # any long random string
   npx wrangler pages secret put GST_API_KEY
   ```
4. Set `GST_PROVIDER = "appyflow"` in `wrangler.toml`.
5. `npm run deploy`

### Using a different provider

Implement `LookupProvider` (one method, `lookup(gstin)`) in `src/lookup/`, and add a branch to `resolveProvider` in `functions/api/verify.ts`. Nothing in the core or risk layers changes.

## Cost protection

Each live lookup costs money, so three things guard the endpoint:

- **Passphrase gate** on all `/api/*` routes, HMAC-signed HttpOnly cookie
- **24h KV cache** — repeat lookups of the same GSTIN are free
- **Daily cap** (`DAILY_LOOKUP_CAP`, default 200) — fails closed to `unverified` rather than draining credit

Offline validation always runs first, so a malformed number never reaches a paid call.

For stronger auth, put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in front of the project and the passphrase becomes a second layer.

## A note on scraping

The official [GST portal search](https://services.gst.gov.in/services/searchtp) is CAPTCHA-gated specifically to prevent automated bulk access. This project does not scrape it and does not attempt to bypass that. GSTN exposes verification data through licensed GSPs and their resellers; that is the route used here.

## Layout

```
src/core/     offline validation — charset, checksum, state codes, parsing
src/risk/     signal rules, verdict derivation, name matching
src/lookup/   provider interface, mock, Appyflow adapter
src/web/      UI
functions/    Cloudflare Pages Functions — auth, cache, rate cap, verify
tests/        69 tests
```
