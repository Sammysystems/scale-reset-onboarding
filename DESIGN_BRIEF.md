# Design brief: The Scale Reset landing page

Status: draft for approval
Date: 2026-11-11
Owner: Samuel
Project: `client-onboarding-engine`
Route split: marketing at `/`, intake at `/start`

## 1. The job

Turn the current invite-only welcome screen into a page that earns a stranger's
attention in one screen, makes the offer concrete, and sends the right owner into
the four-question check.

Primary conversion: complete the check and book the 20-minute call.
Secondary conversion: view the recent builds, then start the check.
Not the job: explain every service, list every tool, or look like an AI agency.

## 2. Who it is for

Owners of service businesses in Nigeria, roughly 3 to 30 people, who already get
enquiries and still lose work in the gaps between message, quote, booking, and
payment. Clinics, property firms, studios, consultancies, and training businesses.

They run on WhatsApp, Instagram DMs, email, a calendar, and a notebook. The owner
or one admin answers everything. They have tried a tool, an intern, or ChatGPT.
None of it holds the whole path together.

They are not looking for more leads first. They are looking for the follow-up they
keep doing by hand.

## 3. Positioning

Category: automation studio for service businesses.
One-line promise: **The follow-up, handled.**
What it is: a two-week build that connects the path from first message to paid job,
then hands over the controls.
Proof style: working builds, shown plainly.
Voice: Samuel. Direct, specific, unexcited by technology, focused on the work that
gets dropped.

Offer: a two-week automation sprint. One fixed price, scoped on a 20-minute call.
No retainer. The owner keeps the system and the written SOP.

Differentiators, in order:
1. Narrow scope. One path, fixed in two weeks.
2. Operator-built. Samuel builds it, not a sales team.
3. Handover. Admin view plus written SOP, so it runs without him.
4. No retainer. The work ends; the system stays.

## 4. Message hierarchy

1. Name the outcome: follow-up handled, enquiries answered, jobs booked.
2. Show where the work leaks today.
3. Show the mechanism: capture, answer, book, follow up.
4. Make the two weeks and the fixed price concrete.
5. Prove it with builds that exist.
6. Qualify: who this is for and who it is not for.
7. Remove risk: the call produces a written scope either way.
8. Answer the expensive objections.
9. Ask for the check.

## 5. Page map and word budget

Each 900px window stays around 80 words. The full page carries about 550 words of prose, with the FAQ read as a scannable list.

| # | Section | Job | Words |
|---|---|---|---|
| 1 | Hero | Promise, picker, primary action | 40 |
| 2 | The leak | Make the cost concrete without invented stats | 60 |
| 3 | The reset | Show the four jobs and what the owner stops doing | 80 |
| 4 | The two weeks | Timeline, scope, fixed price | 75 |
| 5 | Recent builds | Show working systems, labelled honestly | 60 |
| 6 | Fit | Qualify in and out | 45 |
| 7 | The call | Explain the 20 minutes and the written scope | 45 |
| 8 | FAQ | Price, tools, data, after, location, VA | 80 |
| 9 | Final CTA | Repeat the action | 20 |

## 6. Design direction: The Work Order

The page is a work order for the job the owner would pay to lose. The hero is a
blank docket. The visitor picks the job that costs them most, and that choice
follows them into the check.

This is editorial in structure and Lagos-specific in content, but it avoids the
cream paper, high-contrast serif, and clay accent that Hallmark flags as the
default "editorial" costume. The material is a service docket: ruled lines,
numbered rows, checkboxes, stamps, and real screenshots.

### Visual system

Palette, all defined once at `:root`:

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#E4E7E2` | Page ground, cool grey-green |
| `--paper-2` | `#EFF2ED` | Raised docket sheet, inputs |
| `--ink` | `#14160F` | Text, rules, primary surfaces |
| `--muted` | `#596056` | Secondary text (5.2:1 on paper) |
| `--line` | `#C6CBC3` | Hairlines and row dividers |
| `--accent` | `#E2541F` | Safety orange, selection and action |
| `--accent-ink` | `#8A2E10` | Small accent text and links (6.8:1) |

Contrast rules:
- Body text is `--ink` on `--paper` (14.6:1) or `--muted` (5.2:1).
- Orange on paper is 3.1:1, so it is never small text. Use it for rules, fills,
  selected states, and large display type only.
- Primary button: orange fill with ink label (4.8:1). Hover: `--accent-ink` fill
  with paper label.
- No lime. No terracotta. No second accent.

Type:
- Display: **Archivo Expanded** 700/800, variable width. Tight tracking, 0.95
  line-height. Headlines are roman, never italic.
- Body: **Public Sans** 400/500/600.
- Figures and docket numbers: **IBM Plex Mono** 500, used only where the material
  calls for it (row numbers, dates, counts). Never for section eyebrows.
- Scale: 12, 14, 16, 18, 22, 28, 40, 56, 80, 112. Hero `clamp(44px, 7vw, 112px)`.
- No eyebrow labels. No tracked caps. No italic emphasis inside a heading.
- Self-host the WOFF2 files. Display fallback is `Archivo, Arial Narrow, sans-serif`;
  body fallback is `Public Sans, Segoe UI, sans-serif`. The fallbacks are for slow
  loads only, not the intended look.

Layout:
- Max width 1240px, 12 columns, 24px gutters, outer margin `clamp(20px, 5vw, 72px)`.
- A 56px left rail carries docket numbers and a continuous hairline. Sections are
  rows on the same sheet, not floating cards.
- Hero fills the first viewport at 1280x800: headline, one sentence, picker, CTA,
  and one real phone screenshot attached as a docket exhibit.
- No rounded cards. Radius is 0 except inputs (2px) and buttons (2px).
- Hairlines do the work that shadows would do elsewhere.

Imagery:
- Real captures of the check, the admin view, and the booking confirmation.
- Redact names, emails, and phone numbers.
- One flat caption per image, 12 to 14px mono.
- No stock photos, no fake browser chrome, no fake phone frames, no logo wall.
- Founder portrait if Samuel supplies one. Until then, a typed signature, no
  placeholder silhouette.

Motion:
- 160 to 220ms, ease-out. One entrance per section, opacity plus 12px rise.
- The picker responds instantly. No scroll-jacking, no parallax, no animated
  width, height, top, or left.
- `prefers-reduced-motion`: no transforms, no entrance animation.

Signature interaction:
- Four radio chips under the hero: Enquiries, Bookings, Invoices, Onboarding.
- Each maps to the exact intake value:
  `Replying to new enquiries`, `Booking appointments and reminders`,
  `Invoices and payment chasing`, `Onboarding new clients`.
- Selecting one updates the CTA label and appends `?focus=<value>` to `/start`.
- The check reads `focus` and preselects that bottleneck. The owner can change it.
- Keyboard: a real radio group, arrow keys, visible focus. `aria-live` announces
  the selection and the CTA change.
- With JavaScript off, the CTA still goes to `/start` with no focus.

## 7. Proof inventory

Only these claims are allowed. No invented metrics, logos, testimonials, or
"trusted by" lines.

| Build | Industry | What it does | Status | Public link |
|---|---|---|---|---|
| ClearSmile reactivation | Dental | Reactivates dormant patients and books them back in | Demonstration build, deployed | `https://clear-smile-reactivation.vercel.app` |
| LandsandHousing lead follow-up | Real estate | Answers tenant and buyer enquiries, routes the serious ones | Demonstration build, deployed | Screenshot only until URL confirmed |
| ProofGate payment verification | Service businesses paid by transfer | Reads a transfer receipt, checks amount and reference, holds fulfilment until it matches | Shipped build | Repo on request |
| DMI booking concierge | Hospitality | Handles booking questions in chat, hands confirmed jobs to the team | Demonstration build | Screenshot only |
| Client onboarding studio | Agencies | Screens thin intake answers, drafts avatar and tone documents, holds for sign-off | Working demo | This app, seeded demo |

Caption on the section: "Demonstration builds. Live links where available."
Do not imply paying clients.

## 8. What the current page fails

Baseline Hallmark `sloplint --url http://127.0.0.1:8790/ --genre editorial --render`:
6 FAIL, 2 REFLEX, 1 WARN.

| Finding | Fix in this direction |
|---|---|
| Four text elements at 2.61:1 contrast | New palette verified at 4.5:1 or better |
| 142 words on one screen | 80 words max per screen, one idea |
| Three text blocks before any action | Headline, one sentence, picker, action |
| Footer text at 10px | 14px minimum for all copy |
| 170px of empty space above the fold | Hero uses the first viewport with a real exhibit |
| Only one section | Nine sections, each with one job |

Also removed: the invite-only frame, the italic word in the heading, the lime
accent, Georgia, Segoe UI, and the "welcome" tone.

## 9. Assets and inputs

Ready:
- Running demo at `http://127.0.0.1:8790` for real screenshots.
- ClearSmile live demo.
- Case study material for ClearSmile, LandsandHousing, ProofGate, DMI.
- Cal link and webhook already configured in the app.

Needed before launch:
- Founder photo, or approval to use a typed signature only.
- WhatsApp number for the footer and the "ask a question" link.
- Price range, if Samuel wants one shown. Copy currently avoids a number.
- Approval of the response-time promise and the "written scope either way" line.
- Approval of the privacy note for collected business data.
- Confirmation that the demonstration captures may be shown publicly.

## 10. Scope

In:
- Marketing page at `/`.
- Existing check moved to `/start`, unchanged in logic.
- UTM and `focus` capture, passed into the session.
- Shared tokens, self-hosted fonts, real screenshots.
- Analytics events: `picker_select`, `cta_click`, `step_complete`,
  `booking_confirmed`.

Out:
- New intake questions.
- Email capture or newsletter.
- Chat widget.
- Pricing calculator.
- Blog.
- Dark mode.
- Any claim that needs a client result we cannot show.

## 11. Success measures

- Hero CTA click rate.
- Check start to completion rate.
- Completion to booking rate.
- Call show rate.
- Mobile completion rate, since most traffic will be WhatsApp and Instagram.

Instrumentation is Vercel Analytics or a privacy-light equivalent. No third-party
ad pixels on the page.

## 12. Approval

This brief and `LANDING_COPY.md` are approved before any landing HTML or CSS is
written. After the build, the page must pass `npm run check`, Hallmark `sloplint`
with zero FAIL, and a mobile pass at 360px and 390px.


