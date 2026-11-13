# Onboarding a Client into the Engine

This is the operator playbook for running the engine with a real client.

## 0. Interactive studio (two-phase)

```powershell
npm run studio        # client at /, operator at /admin
npm run studio:demo   # same, seeded with 4 example discoveries
```

Send the client their link (`http://127.0.0.1:8790/?s=<id>`). The client answers four
questions, adds contact details, picks a preferred time in the booking modal, and continues
to WhatsApp. In `/admin`: review the brief and booking block, add the call notes and press
**Call done & prepare proposal**, then **Approve plan**, **Send email**, **Mark paid**, and
**Start onboarding**. Discovery answers become the onboarding intake, so the client is never
asked twice.

The pre-call proposal is drafted when the call is booked but stays hidden. Only
`call-done` promotes it to a post-call proposal and reveals it at the client link.

- Set `WHATSAPP_NUMBER` (default `2348035248296`). The booking modal redirects to
  `https://wa.me/<WHATSAPP_NUMBER>` after `request-call`.
- Set `INSFORGE_URL` + `INSFORGE_API_KEY` to persist discoveries in InsForge; without them
  the studio uses local files under `DISCOVERY_ROOT`.
- Without `RESEND_API_KEY` + `RESEND_FROM`, proposals and booking notes are written to
  `.data/outbox` instead of sent. Set `OPERATOR_EMAIL` to receive booking notes.
- Set `ADMIN_TOKEN` before exposing `/admin` beyond localhost.
- `CALL_URL`, `PAYMENT_URL`, and `WHATSAPP_URL` are optional; `CALL_URL` falls back to
  `https://wa.me/<WHATSAPP_NUMBER>` when blank.

## 1. Configure

Copy `.env.example` to `.env` and fill in:
- `MODEL_PROVIDER` + `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL_NAME`
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, and `NOTIFIER=telegram`
- `DATABASE_URL` for the `client` profile (leave blank to stay in `demo`)

Never commit `.env`.

## 2. Start the runner

```powershell
npm run serve
```

Check `GET /health` returns `{ ok: true }`.

## 3. Submit an intake

```powershell
$body = Get-Content .\fixtures\sample-intake.full.json -Raw
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8790/webhooks/intake `
  -ContentType "application/json" -Body $body
```

The response is either:
- `status: "suspended"` with a `suspension.reason` — a human must act (thin intake or approval), or
- `status: "completed"` with the final result and document paths.

## 4. Handle suspensions

```powershell
Invoke-RestMethod http://127.0.0.1:8790/suspensions
```

**Thin intake** — send the missing information back:
```json
{ "action": "supplement", "decidedBy": "sam",
  "supplements": { "targetAudience": "...", "goals": "..." } }
```

**Ready for approval** — sign off:
```json
{ "action": "approve", "decidedBy": "sam", "notes": "looks right" }
```

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8790/runs/<executionId>/resume `
  -ContentType "application/json" -Body '<json above>'
```

## 5. Deliver

On approval, the engine writes the documents and notifies the operator. Hand the
`ONBOARDING-REPORT.md`, `CLIENT-AVATAR.md`, and `TONE-OF-VOICE.md` to the client (or wire the
Drive adapter).

## Quality gate

Every draft is checked for:
- unverified markers (`[[UNVERIFIED: ...]]`)
- template placeholders (`[X]`, `TODO`, `TBD`)
- emojis
- unsupported figures (a number/$ amount with no `(source: ...)` on the same line)
- banned AI-slop phrases

A failing draft is re-drafted with the issues fed back, up to `MAX_DRAFT_ATTEMPTS`. If it
still fails, the approval screen shows exactly what is wrong so the operator decides.
