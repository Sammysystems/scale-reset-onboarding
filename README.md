# Client Onboarding Research Engine

Turns a new-client intake form into a finished, source-checked **Client Avatar**,
**Tone of Voice**, and **Onboarding Report** — with a human approval gate before anything is
delivered.

Built on `@studio/workflow` (the Studio VoltAgent workflow kit). One named workflow, six
steps, LLM only where judgment is needed.

```
intake -> screen -> research -> draft (+QC loop) -> approval -> finalize
```

- `intake` (deterministic): validate the form, compute a completeness score.
- `screen` (conditional): if the intake is thin, suspend and ask the operator for the gap.
- `research` (agentic): Commander + Workflow Auditor + Tech Stack Mapper + Strategy Drafter.
- `draft` (agentic): draft avatar/tone/report into templates, with a bounded quality loop.
- `approval` (conditional): human approve/reject (resume gate).
- `finalize` (deterministic): write artifacts, persist, notify.

## Quick start (offline demo)

```powershell
npm run demo
```

Uses the `mock` model provider, in-memory state, and writes real Markdown documents to
`deliverables/<client>/`:
- `CLIENT-AVATAR.md`
- `TONE-OF-VOICE.md`
- `ONBOARDING-REPORT.md`
- `RUN-LOG.md`

## HTTP runner

```powershell
npm run serve
```

Endpoints:
- `GET  /health`
- `POST /webhooks/intake`  — start a run
- `GET  /runs?status=`      — list runs
- `GET  /runs/:id`          — run detail (steps, suspension)
- `GET  /suspensions`       — queue of runs awaiting a human
- `POST /runs/:id/resume`   — `{ "action": "approve", "decidedBy": "sam" }`

## Studio (discovery → proposal → onboarding)

The interactive front door. A client opens their invite link, answers four quick questions,
then books a call. The scoped, indicative automation plan is drafted after the call. Nothing is sent or charged without a human.

```powershell
npm run studio        # http://127.0.0.1:8790  (client)  ·  /admin (operator)
npm run studio:demo   # same, seeded with 4 example discoveries
```

Two phases, one record:

1. **Discovery (pre-payment).** `POST /api/discovery/start` creates a session. Four steps of
   taps and short answers build a live brief, and a deterministic play matcher suggests 1–2
   automation plays. A pre-call proposal is drafted but hidden from the client. The model
   never chooses the play or sets the price.
2. **The call.** The client adds contact details and books through the Cal.com inline embed
   (or requests a time when `CAL_LINK` is blank). `BOOKING_CREATED`, `BOOKING_RESCHEDULED`,
   `BOOKING_CANCELLED`, and `MEETING_ENDED` keep the session in sync via the signed webhook.
3. **Human gate.** In `/admin` you review the brief and call notes, save the notes to build
   the post-call proposal, approve it, and send the email. The client sees the resolved
   proposal at the same link, then approves and pays.
4. **Onboarding (post-payment).** Mark paid, then start onboarding. Discovery answers become
   the existing six-step engine's intake, so the client is never asked again.

Client routes:
- `POST /api/discovery/start`
- `GET  /api/discovery/:id`
- `POST /api/discovery/:id/step|edit|contact|request-call|booked`
- `POST /api/webhooks/cal` — signed Cal.com events (`x-cal-signature-256`)

Operator routes (gated by `ADMIN_TOKEN` when set):
- `GET  /api/admin/discoveries` · `GET /api/admin/discoveries/:id`
- `POST /api/admin/discoveries/:id/call-done|approve|send|paid|onboard`
- `GET  /api/admin/discoveries/:id/email` — rendered email preview

Sessions persist to `DISCOVERY_ROOT` (default `.data/discovery`); emails always write an
outbox copy under `OUTBOX_DIR` (default `.data/outbox`) and send through Resend only when
`RESEND_API_KEY` + `RESEND_FROM` are set. `CALL_URL`, `PAYMENT_URL`, and `WHATSAPP_URL` are
optional; the proposal adapts when they are blank.

Set `CAL_LINK` (e.g. `scale-reset/intro`) to mount the inline calendar, and
`CAL_WEBHOOK_SECRET` to accept signed webhooks. `CALL_URL` falls back to
`https://cal.com/<CAL_LINK>`. Cal Cloud cannot reach `http://localhost`, so local webhook
testing uses signed fixtures or a tunnel. `OPERATOR_EMAIL` receives a "call booked" note
(written to the outbox when Resend is not configured).

## Real model

Set the provider in `.env`:

```
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://<appkey>.<region>.insforge.app/api/ai/v1   # or http://127.0.0.1:20128/v1
MODEL_API_KEY=...
MODEL_NAME=...
```

## Profiles

- `demo` — in-memory state, local artifacts, console notifier. Default when `DATABASE_URL`
  is unset.
- `client` — persistent state via the workflow kit's Postgres memory adapter, InsForge
  tables (`src/db/schema.sql`), Telegram notifier.

Same workflow code. Only state, triggers, notifications, and operations change.

## Tests

```powershell
npm run typecheck
npm run test
```
