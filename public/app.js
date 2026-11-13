const KEY = "scale-reset-session";
const $ = (selector, root = document) => root.querySelector(selector);
const view = $("#view");
const stepMeta = $("#stepMeta");
const toastEl = $("#toast");

const state = {
  session: null,
  error: null,
  loading: false,
  submitting: false,
  draft: {},
  errors: {},
  editingContact: false,
  pollTimer: null,
  focus: "",
};

const ICONS = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>',
  invoice:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  handoff:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13M13 6l6 6-6 6"/><path d="M4 6v12"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-7"/></svg>',
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function fmt(value) {
  return esc(value).replace(/\n/g, "<br>");
}

function firstSentence(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  return (match?.[0] ?? trimmed).trim();
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function naira(value) {
  return `₦${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

function nairaRange(min, max) {
  return `${naira(min)} – ${naira(max)}`;
}

async function api(path, options = {}) {
  const init = { method: options.method || "GET", headers: {} };
  if (options.body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const error = new Error(apiMessage(data, response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function apiMessage(data, status) {
  if (data && typeof data.message === "string" && data.message) return data.message;
  const messages = {
    session_not_found: "This link is no longer valid.",
    session_not_in_progress: "This conversation is already finished.",
    session_locked: "This conversation is locked.",
    out_of_order: "Out of order — reload the page and try again.",
    invalid_step: "A few answers still need attention.",
    invalid_contact: "Check the contact details.",
    contact_required: "Add your contact details first.",
    unknown_step: "That question is no longer available.",
    step_not_asked: "That step is not open for editing.",
    call_not_booked: "The booking has not been opened yet.",
  };
  return (data && messages[data.error]) || (data && data.error) || `Request failed (${status}).`;
}

function storageGet() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function forget() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    return;
  }
}

function remember(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    return;
  }
  try {
    const url = new URL(location.href);
    url.searchParams.set("s", id);
    history.replaceState(null, "", url);
  } catch {
    return;
  }
}

let toastTimer = null;
function toast(message) {
  if (!toastEl || !message) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
}

function showNote(message) {
  const el = $("#fieldNote");
  if (!el) {
    toast(message);
    return;
  }
  el.textContent = message;
  el.classList.add("show");
}

function viewName(session) {
  if (!session) return "welcome";
  switch (session.status) {
    case "in_progress":
      return session.pending?.length ? "step" : "booking";
    case "brief_ready":
    case "booking":
      return "booking";
    case "call_booked":
    case "call_done":
    case "booked":
      return "booked";
    case "proposal_ready":
    case "approved":
    case "sent":
    case "paid":
    case "client":
      return "proposal";
    default:
      return "booked";
  }
}

function totalSteps(session) {
  return session?.stepBank?.length || session?.total || 4;
}

function metaFor(session, name) {
  if (!session || name === "welcome") return "Private check";
  if (name === "step") {
    const step = session.currentStep;
    const total = totalSteps(session);
    return `Question ${session.answered + 1} of ${total}${step?.kicker ? ` · ${step.kicker}` : ""}`;
  }
  if (name === "booking") return "Pick a time";
  if (name === "booked") {
    return session.call?.status === "requested" ? "Request received" : "Call booked";
  }
  if (name === "proposal") {
    if (session.status === "client") return "Onboarding started";
    if (session.paidAt) return "Paid · onboarding next";
    return "Your plan";
  }
  return "";
}

function draftFor(session) {
  const step = session?.currentStep;
  const draft = {};
  if (!step) return draft;
  for (const field of step.fields) {
    const answer = session.answers?.[field.id] ?? "";
    if (!answer && state.focus && field.id === "bottleneck" && (field.options || []).includes(state.focus)) {
      draft[field.id] = state.focus;
      continue;
    }
    draft[field.id] = field.kind === "multi" ? listOf(answer) : answer;
  }
  return draft;
}

function fieldError(field) {
  const message = state.errors?.[field.id];
  return `<span class="field-error${message ? " show" : ""}">${message ? esc(message) : ""}</span>`;
}

function fieldView(field) {
  const raw = state.draft[field.id];
  const value = Array.isArray(raw) ? raw : String(raw ?? "");

  if (field.kind === "chips" || field.kind === "multi") {
    const picked = field.kind === "multi" ? listOf(value) : value;
    const chips = (field.options || [])
      .map((option) => {
        const on = field.kind === "multi" ? picked.includes(option) : picked === option;
        return `<button type="button" class="chip${on ? " on" : ""}" data-pick="${
          esc(field.id)
        }" data-value="${esc(option)}" aria-pressed="${on}">${esc(option)}</button>`;
      })
      .join("");
    return `<div class="field" data-field-block="${esc(field.id)}">
      <span class="field-label">${esc(field.label)}</span>
      <div class="chips${field.kind === "multi" ? " multi" : ""}">${chips}</div>
      ${fieldError(field)}
    </div>`;
  }

  if (field.kind === "longtext") {
    return `<label class="field field-long">
      <span class="field-label">${esc(field.label)}</span>
      <textarea class="text-input text-area" data-field="${esc(field.id)}" rows="3"
        placeholder="${esc(field.placeholder || "")}">${esc(value)}</textarea>
      ${fieldError(field)}
    </label>`;
  }

  if (field.kind === "guided") {
    return `<label class="guided-row">
      <span class="guided-prefix">${esc(field.label)}</span>
      <input class="guided-input" data-field="${esc(field.id)}" type="text" autocomplete="off"
        placeholder="${esc(field.placeholder || "")}" value="${esc(value)}" />
      ${fieldError(field)}
    </label>`;
  }

  return `<label class="field">
    <span class="field-label">${esc(field.label)}</span>
    <input class="text-input" data-field="${esc(field.id)}" type="${esc(
      field.inputType || "text",
    )}" autocomplete="${esc(field.autocomplete || "off")}"
      placeholder="${esc(field.placeholder || "")}" value="${esc(value)}" />
    ${fieldError(field)}
  </label>`;
}

function briefPane(session) {
  const brief = session.brief;
  const match = session.matches?.[0];
  const confidence = match?.confidence ?? "low";
  const confidenceClass = confidence === "high" ? "high" : confidence === "low" ? "low" : "";
  const confidenceLabel =
    confidence === "high" ? "Strong signal" : confidence === "medium" ? "Likely fit" : "Still listening";
  const sink = [session.answers?.bottleneck, session.answers?.frequency]
    .filter(Boolean)
    .join(" · ");

  return `<aside class="brief-pane">
    <div class="brief-card">
      <div class="brief-head">
        <div>
          <p class="brief-kicker">Live brief</p>
          <h2 class="brief-title">${esc(brief?.clientName || "Your business")}</h2>
        </div>
        <div class="brief-ring" style="--p:${Number(session.progress) || 0}"><span>${Number(
          session.progress,
        ) || 0}%</span></div>
      </div>
      <div class="brief-section">
        <span class="signal ${confidenceClass}"><span class="dot"></span>${confidenceLabel}</span>
      </div>
      <div class="brief-section">
        <span class="brief-label">What we've heard</span>
        <p class="brief-value">${
          brief?.summary
            ? fmt(brief.summary)
            : "Start with the business name — the brief builds as you go."
        }</p>
      </div>
      <div class="brief-section">
        <span class="brief-label">The bottleneck</span>
        ${
          sink
            ? `<p class="brief-quote">“${esc(sink)}”</p>`
            : '<p class="brief-value muted">Not named yet.</p>'
        }
      </div>
      <div class="brief-section">
        <span class="brief-label">Suggested first play</span>
        ${
          match
            ? `<p class="brief-value">${esc(match.play.name)}</p>
               <p class="brief-value muted">${esc(match.play.timeline)} · ${nairaRange(
                 match.play.priceMin,
                 match.play.priceMax,
               )} indicative</p>`
            : '<p class="brief-value muted">We\'ll suggest one once the picture is clearer.</p>'
        }
      </div>
    </div>
    <p class="brief-foot">The brief updates after every answer. Nothing is shared until you book.</p>
  </aside>`;
}

function stepView() {
  const session = state.session;
  const step = session.currentStep;
  if (!step) return bookingView();

  const total = totalSteps(session);
  const index = session.answered;
  const segments = Array.from(
    { length: total },
    (_, position) => `<span class="seg ${position < session.answered ? "on" : ""}"></span>`,
  ).join("");

  return `<section class="stage">
    <div>
      <div class="progress">${segments}</div>
      <p class="eyebrow">${esc(step.kicker)} <span class="step-count">· ${index + 1} / ${total}</span></p>
      <h1 class="question-title">${esc(step.title)}</h1>
      ${step.hint ? `<p class="question-hint">${esc(step.hint)}</p>` : ""}
      <form class="answer-form" id="stepForm" novalidate>
        <div class="fields">${step.fields.map((field) => fieldView(field)).join("")}</div>
        <p class="field-note" id="fieldNote"></p>
        ${step.why ? `<p class="why"><span>Why we ask</span>${esc(step.why)}</p>` : ""}
        <div class="actions sticky-actions">
          <button class="btn primary" type="submit" ${
            state.submitting ? "disabled" : ""
          }>${index === total - 1 ? "Finish and book" : "Continue"} <span class="arrow">→</span></button>
          <button class="btn ghost small" type="button" data-action="explain" ${
            state.submitting ? "disabled" : ""
          }>I'd rather explain on WhatsApp</button>
        </div>
      </form>
    </div>
    ${briefPane(session)}
  </section>`;
}

function contactSummary(session) {
  const contact = session.contact;
  if (!contact) return "";
  return [contact.name, contact.phone, contact.email].filter(Boolean).map(esc).join(" · ");
}

function contactForm(session) {
  const contact = session.contact || {};
  const hasContact = Boolean(session.contact);

  return `<form class="contact-form" id="contactForm" novalidate>
    <p class="brief-label">Your details</p>
    <div class="field">
      <span class="field-label">Name</span>
      <input class="text-input" data-contact="name" type="text" autocomplete="name"
        placeholder="Ada Okafor" value="${esc(contact.name || "")}" />
      ${state.errors?.name ? `<span class="field-error show">${esc(state.errors.name)}</span>` : ""}
    </div>
    <div class="field">
      <span class="field-label">Email</span>
      <input class="text-input" data-contact="email" type="email" autocomplete="email"
        placeholder="ada@lagosbloom.com" value="${esc(contact.email || "")}" />
      ${state.errors?.email ? `<span class="field-error show">${esc(state.errors.email)}</span>` : ""}
    </div>
    <div class="field">
      <span class="field-label">WhatsApp</span>
      <input class="text-input" data-contact="phone" type="tel" autocomplete="tel"
        placeholder="0803 555 0142" value="${esc(contact.phone || "")}" />
      ${state.errors?.phone ? `<span class="field-error show">${esc(state.errors.phone)}</span>` : ""}
    </div>
    <p class="micro">Email or WhatsApp is enough. Next, the booking window opens and hands you to WhatsApp.</p>
    <div class="actions">
      <button class="btn primary" type="submit" ${state.submitting ? "disabled" : ""}>Save and book <span class="arrow">→</span></button>
      ${
        hasContact
          ? '<button class="btn ghost small" type="button" data-action="cancel-contact">Cancel</button>'
          : ""
      }
    </div>
  </form>`;
}

function bookingCard(session) {
  return `<div class="calendar-card booking-card">
    <div class="calendar-head">
      <div>
        <span class="brief-label">Your details</span>
        <p class="calendar-contact">${contactSummary(session)}</p>
      </div>
      <button class="edit-btn" type="button" data-action="edit-contact">Edit</button>
    </div>
    <div class="booking-invite">
      <span class="booking-mark">${ICONS.calendar}</span>
      <h2>Book your time on WhatsApp.</h2>
      <p>Open the booking window, choose a rough time, and continue. Your brief is filled into the WhatsApp message for you.</p>
      <button class="btn primary" type="button" data-action="open-booking" ${
        state.submitting ? "disabled" : ""
      }>Open booking window <span class="arrow">→</span></button>
      <p class="micro">No calendar. No extra form after this. You finish in WhatsApp.</p>
    </div>
  </div>`;
}

function bookingAside(session) {
  const answers = session.answers || {};
  const rows = [
    ["Business", answers.businessName],
    ["Bottleneck", answers.bottleneck],
    ["How often", answers.frequency],
    ["Time each time", answers.timeCost],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`)
    .join("");

  return `<aside class="booking-aside">
    <div class="brief-card">
      <p class="brief-kicker">What happens next</p>
      <div class="mini-timeline">
        <div class="mini-step done"><span class="dotmark">1</span><div><strong>Four answers</strong><span>Done</span></div></div>
        <div class="mini-step"><span class="dotmark">2</span><div><strong>The conversation</strong><span>Confirm the first fix</span></div></div>
        <div class="mini-step"><span class="dotmark">3</span><div><strong>The plan</strong><span>Sent after the conversation</span></div></div>
      </div>
      <div class="brief-section">
        <span class="brief-label">The brief so far</span>
        <dl class="recap-list">${rows || "<dt>Business</dt><dd>Not captured</dd>"}</dl>
      </div>
      <p class="micro">The conversation is a working session, not a pitch. If it is not a fit, Samuel says so.</p>
    </div>
  </aside>`;
}

function bookingView() {
  const session = state.session;
  const hasContact = Boolean(session.contact);
  const editing = state.editingContact || !hasContact;

  return `<section class="booking">
    <p class="eyebrow">Last step · Book on WhatsApp</p>
    <h1 class="review-title">Send the brief. Pick your time on WhatsApp.</h1>
    <p class="review-lede">The four answers are in. Open the booking window, choose a rough time, then finish the message in WhatsApp. Samuel confirms the exact time there.</p>
    <div class="booking-grid">
      <div class="booking-main">
        ${editing ? contactForm(session) : bookingCard(session)}
      </div>
      ${bookingAside(session)}
    </div>
  </section>`;
}

const BOOKING_SLOTS = [
  "This week",
  "Next week",
  "Weekday morning",
  "Weekday afternoon",
  "I'm flexible",
];

function bookingModal(session) {
  const answers = session.answers || {};
  const slots = BOOKING_SLOTS.map(
    (slot) => `<label class="slot">
      <input type="radio" name="bookingSlot" value="${esc(slot)}" data-booking-slot />
      <span>${esc(slot)}</span>
    </label>`,
  ).join("");

  return `<form id="bookingForm" class="booking-modal-card" novalidate>
    <div class="modal-head">
      <div>
        <p class="eyebrow">Book your time</p>
        <h2 id="bookingModalTitle">Finish on WhatsApp.</h2>
      </div>
      <button class="modal-close" type="button" data-action="close-booking" aria-label="Close booking window">×</button>
    </div>
    <p class="modal-lede">Choose a rough time and add anything useful. The next button opens WhatsApp with your brief already filled in.</p>
    <div class="modal-summary">
      <div><span>Business</span><strong>${esc(answers.businessName || "Your business")}</strong></div>
      <div><span>Bottleneck</span><strong>${esc(answers.bottleneck || "To confirm")}</strong></div>
      <div><span>Contact</span><strong>${esc(contactSummary(session) || "Not captured")}</strong></div>
    </div>
    <div class="field">
      <span class="field-label">When works best?</span>
      <div class="slot-grid">${slots}</div>
      <input class="text-input" data-booking-preferred type="text"
        placeholder="Or type a specific time, e.g. Tuesday afternoon, Lagos time" />
    </div>
    <div class="field">
      <span class="field-label">Anything to add? (optional)</span>
      <textarea class="textarea small" data-booking-note rows="3"
        placeholder="A detail that helps Samuel prepare"></textarea>
    </div>
    <p class="micro">This opens WhatsApp with your answers and chosen time. Nothing is sent until you press send there.</p>
    <div class="modal-actions">
      <button class="btn primary" type="submit" ${state.submitting ? "disabled" : ""}>Continue to WhatsApp <span class="arrow">→</span></button>
      <button class="btn ghost small" type="button" data-action="close-booking">Not yet</button>
    </div>
  </form>`;
}

function ensureBookingModal() {
  let dialog = document.getElementById("bookingModal");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "bookingModal";
  dialog.className = "booking-modal";
  dialog.setAttribute("aria-labelledby", "bookingModalTitle");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("submit", onSubmit);
  document.body.appendChild(dialog);
  return dialog;
}

function openBookingModal() {
  const session = state.session;
  if (!session) return;
  if (!session.contact) {
    state.editingContact = true;
    render();
    return;
  }

  const dialog = ensureBookingModal();
  dialog.innerHTML = bookingModal(session);
  if (!dialog.open) dialog.showModal();
}

function closeBookingModal() {
  const dialog = document.getElementById("bookingModal");
  if (dialog?.open) dialog.close();
}

function callTimeLabel(call) {
  if (!call?.startTime) return "";
  try {
    return new Date(call.startTime).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return call.startTime;
  }
}

function bookedView() {
  const session = state.session;
  const call = session.call || {};
  const requested = call.status === "requested";
  const when = callTimeLabel(call);
  const answers = session.answers || {};

  const headline = requested ? "WhatsApp is ready." : "You're booked.";
  const lede = requested
    ? "Finish the message in WhatsApp to lock in your time. If WhatsApp did not open, use the button below."
    : when
      ? `Your time is set for ${when}.`
      : "Your booking is confirmed. The details are on the way.";

  return `<section class="booked">
    <p class="eyebrow">${requested ? "Booking opened" : "Booked"}</p>
    <h1 class="review-title">${headline}</h1>
    <p class="review-lede">${esc(lede)}</p>
    <div class="booked-card">
      <div class="mini-timeline">
        <div class="mini-step done"><span class="dotmark">1</span><div><strong>Four answers</strong><span>Done</span></div></div>
        <div class="mini-step done"><span class="dotmark">2</span><div><strong>${requested ? "WhatsApp opened" : "Time booked"}</strong><span>${esc(when || "Finish in WhatsApp")}</span></div></div>
        <div class="mini-step"><span class="dotmark">3</span><div><strong>The conversation</strong><span>Confirm the first fix</span></div></div>
        <div class="mini-step"><span class="dotmark">4</span><div><strong>The plan</strong><span>Sent after the conversation</span></div></div>
      </div>
      <div class="brief-section">
        <span class="brief-label">What Samuel has</span>
        <dl class="recap-list">
          <dt>Business</dt><dd>${esc(answers.businessName || "Not captured")}</dd>
          <dt>Bottleneck</dt><dd>${esc(answers.bottleneck || "To confirm")}</dd>
          <dt>How often</dt><dd>${esc(answers.frequency || "To confirm")}</dd>
          <dt>Contact</dt><dd>${contactSummary(session) || "Not captured"}</dd>
        </dl>
      </div>
      ${
        session.whatsappUrl
          ? `<a class="btn primary" href="${esc(session.whatsappUrl)}" target="_blank" rel="noopener">Open WhatsApp <span class="arrow">→</span></a>`
          : ""
      }
      <p class="micro">Your plan is drafted after the conversation. This page updates on its own.</p>
      <button class="btn ghost small" type="button" data-action="refresh">Check for updates</button>
    </div>
  </section>`;
}

function playIcon(play) {
  return ICONS[play.icon] || ICONS.bolt;
}

function playFull(play) {
  return `<div class="play-card full">
    <div class="play-head"><span class="play-icon">${playIcon(play)}</span><h3>${esc(
      play.name,
    )}</h3></div>
    <p>${esc(play.strapline)}</p>
    <ul>${play.scope.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    <p class="micro"><strong>What you get:</strong> ${play.outcomes.map(esc).join(" · ")}</p>
    <p class="micro"><strong>What we need:</strong> ${esc(play.clientPart)}</p>
  </div>`;
}

function proposalBadge(session) {
  if (session.status === "client") return '<span class="badge paid">Client</span>';
  if (session.status === "paid") return '<span class="badge paid">Paid</span>';
  if (session.status === "sent") return '<span class="badge sent">Sent</span>';
  if (session.status === "approved") return '<span class="badge approved">Approved</span>';
  return '<span class="badge draft">Draft</span>';
}

function proposalView() {
  const session = state.session;
  const proposal = session.proposal;

  if (!proposal) {
    return `<section class="review">
      <p class="eyebrow">Plan in progress</p>
      <h1 class="review-title">The plan lands after the call.</h1>
      <p class="review-lede">Your call is booked. Samuel adds notes, then the plan appears here. This page updates on its own.</p>
      <div class="review-actions">
        <button class="btn primary" data-action="refresh" type="button">Check for updates</button>
      </div>
    </section>`;
  }

  const plays = proposal.plays.map((play) => playFull(play)).join("");
  const assumptions = proposal.assumptions.map((item) => `<li>${esc(item)}</li>`).join("");
  const nextSteps = proposal.nextSteps.map((item) => `<li>${esc(item)}</li>`).join("");
  const bottleneck = session.answers?.bottleneck
    ? `<p><strong>Bottleneck you named:</strong> ${esc(session.answers.bottleneck)}</p>`
    : "";
  const postCall = proposal.source === "post_call";

  const payButton = session.paidAt
    ? ""
    : proposal.paymentUrl
      ? `<a class="btn dark block" href="${esc(
          proposal.paymentUrl,
        )}" target="_blank" rel="noopener">Approve &amp; pay</a>`
      : '<span class="price-note">Payment details are shared by email.</span>';

  const callLink =
    postCall && proposal.whatsappUrl
      ? `<a class="btn ghost block small" href="${esc(
          proposal.whatsappUrl,
        )}" target="_blank" rel="noopener">Ask a question</a>`
      : "";

  return `<section class="proposal">
    <div class="proposal-hero">
      <p class="eyebrow">Indicative proposal ${
        session.status === "client" ? "· onboarding started" : ""
      }</p>
      <h1 class="review-title">${esc(proposal.headline)}</h1>
      <p class="review-lede">${fmt(proposal.summary)}</p>
      <div class="proposal-meta">
        ${proposalBadge(session)}
        <span class="dot"></span>
        <span>Prepared for ${esc(proposal.clientName)}</span>
        <span class="dot"></span>
        <span>${esc(proposal.timeline)}</span>
      </div>
    </div>
    <div class="proposal-grid">
      <div>
        <div class="doc-section">
          <h2>What we heard</h2>
          <p>${fmt(proposal.summary)}</p>
          ${bottleneck}
        </div>
        <div class="doc-section">
          <h2>Recommended scope</h2>
          ${plays}
        </div>
        <div class="doc-section">
          <h2>Timeline</h2>
          <p>${esc(
            proposal.timeline,
          )} from the day we get access. The first working version lands inside that window; we tune it with you after.</p>
        </div>
        <div class="doc-section">
          <h2>Assumptions</h2>
          <ul class="check-list">${assumptions}</ul>
        </div>
        <div class="doc-section">
          <h2>Next step</h2>
          <ol>${nextSteps}</ol>
        </div>
      </div>
      <aside class="proposal-side">
        <div class="price-card">
          <span class="price-label">Indicative investment</span>
          <div class="price-range">${esc(proposal.rangeLabel)}</div>
          <span class="price-note">A range, not a final quote. Final scope and price are confirmed on the call.</span>
          <div class="price-divider"></div>
          <span class="price-label">Timeline</span>
          <div class="price-value">${esc(proposal.timeline)}</div>
          <div class="price-divider"></div>
          ${payButton}
          ${callLink}
          ${
            session.paidAt
              ? '<div class="paid-banner">Payment received. Onboarding has started.</div>'
              : ""
          }
          ${
            session.status === "client"
              ? '<div class="client-banner">You\'re a client. Phase 2 onboarding is running.</div>'
              : ""
          }
          <p class="micro">Nothing is charged until you approve.</p>
        </div>
        <div class="next-steps">
          <span class="brief-label">What happens next</span>
          <ol>${nextSteps}</ol>
        </div>
      </aside>
    </div>
    <div class="proposal-actions no-print">
      <button class="btn ghost" data-action="print" type="button">Print / save as PDF</button>
      <button class="btn ghost" data-action="copy-link" type="button">Copy my link</button>
    </div>
  </section>`;
}

function welcomeView() {
  return `<section class="welcome">
    <p class="eyebrow">Client onboarding · The Scale Reset</p>
    <h1 class="welcome-title">More growth shouldn't mean more manual work.</h1>
    <p class="welcome-lede">Four quick questions about how your business runs. Then book a time on WhatsApp. The plan follows the conversation — not a sales pitch before it.</p>
    <div class="welcome-actions">
      <button class="btn primary" data-action="begin" type="button">Start the intake <span class="arrow">→</span></button>
      <span class="welcome-time">≈ 3 minutes · 4 questions</span>
    </div>
    <div class="welcome-grid">
      <div class="welcome-card"><span class="num">01</span><h3>Tell us the basics</h3><p>Your business, what you do, and who it is for. Taps and short answers.</p></div>
      <div class="welcome-card"><span class="num">02</span><h3>Show us the week</h3><p>Where the time goes, what you use, and the one task you'd pay to never do again.</p></div>
      <div class="welcome-card"><span class="num">03</span><h3>Book on WhatsApp</h3><p>Pick a rough time. WhatsApp opens with your brief; the plan is sent after the conversation.</p></div>
    </div>
    <p class="welcome-note">Your answers stay between you and The Scale Reset. This link is yours, and you can edit anything before the call.</p>
  </section>`;
}

function errorView(message) {
  return `<section class="error-view">
    <div class="error-card">
      <p class="eyebrow">Something went wrong</p>
      <h1 class="error-title">That link didn't load.</h1>
      <p class="error-lede">${esc(message)}</p>
      <div class="actions" style="justify-content:center">
        <button class="btn primary" data-action="retry" type="button">Try again</button>
        <button class="btn ghost" data-action="begin" type="button">Start fresh</button>
      </div>
    </div>
  </section>`;
}

function loadingView() {
  return `<section class="welcome">
    <div class="skeleton" style="height:14px;width:160px;margin-bottom:18px"></div>
    <div class="skeleton" style="height:58px;max-width:640px;margin-bottom:14px"></div>
    <div class="skeleton" style="height:18px;max-width:420px;margin-bottom:30px"></div>
    <div class="skeleton" style="height:140px;max-width:520px"></div>
  </section>`;
}

function captureDraft() {
  const step = state.session?.currentStep;
  if (!step) return;
  for (const field of step.fields) {
    if (field.kind === "chips" || field.kind === "multi") continue;
    const input = document.querySelector(`[data-field="${field.id}"]`);
    if (input) state.draft[field.id] = input.value;
  }
}

function afterRender() {
  const input = document.querySelector("[data-field]");
  if (input) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

}

function render() {
  const update = () => {
    if (state.loading) {
      stepMeta.textContent = "Loading";
      view.innerHTML = loadingView();
      return;
    }

    if (!state.session) {
      stepMeta.textContent = "Invite only";
      view.innerHTML = state.error ? errorView(state.error) : welcomeView();
      return;
    }

    const name = viewName(state.session);
    stepMeta.textContent = metaFor(state.session, name);

    const renderers = {
      step: stepView,
      booking: bookingView,
      booked: bookedView,
      proposal: proposalView,
    };

    view.innerHTML = (renderers[name] || welcomeView)();
    afterRender();
  };

  const canTransition =
    !state.loading &&
    state.session &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (canTransition) document.startViewTransition(update);
  else update();
}

function stopPoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function maybePoll() {
  stopPoll();
  if (!state.session) return;
  const name = viewName(state.session);
  if (name === "booked") {
    state.pollTimer = setInterval(() => {
      void refreshSession(false);
    }, 12000);
  }
}

function adopt(session) {
  stopPoll();
  state.session = session;
  state.error = null;
  state.loading = false;
  state.errors = {};
  state.draft = draftFor(session);
  if (session) remember(session.id);
  render();
  maybePoll();
}

async function start() {
  if (state.submitting) return;
  state.submitting = true;
  state.error = null;
  try {
    const session = await api("/api/discovery/start", { method: "POST", body: {} });
    adopt(session);
  } catch (error) {
    state.loading = false;
    state.session = null;
    state.error = error.message;
    render();
  } finally {
    state.submitting = false;
  }
}

async function load(id) {
  state.loading = true;
  state.error = null;
  render();
  try {
    const session = await api(`/api/discovery/${encodeURIComponent(id)}`);
    adopt(session);
    return "ok";
  } catch (error) {
    state.loading = false;
    state.session = null;
    state.error =
      error.status === 404
        ? "This link is no longer valid. Start a fresh intake below."
        : error.message;
    if (error.status === 404) {
      forget();
      render();
      return "missing";
    }
    render();
    return "error";
  }
}

async function submitStep(explainOnCall) {
  if (state.submitting || !state.session) return;
  const step = state.session.currentStep;
  if (!step) return;

  captureDraft();

  state.submitting = true;
  state.errors = {};
  try {
    const values = {};
    for (const field of step.fields) {
      const raw = state.draft[field.id];
      values[field.id] = Array.isArray(raw) ? raw : String(raw ?? "");
    }
    const session = await api(`/api/discovery/${state.session.id}/step`, {
      method: "POST",
      body: { stepId: step.id, values, explainOnCall: Boolean(explainOnCall) },
    });
    state.submitting = false;
    adopt(session);
    if (session.status === "booking") {
      toast("That's the four. Book your time on WhatsApp.");
    }
  } catch (error) {
    state.submitting = false;
    state.errors = error.data?.errors || {};
    render();
    showNote(error.message);
  }
}

async function submitContact(event) {
  event.preventDefault();
  if (state.submitting || !state.session) return;

  const form = event.target;
  const valueOf = (name) => form.querySelector(`[data-contact="${name}"]`)?.value?.trim() || "";

  state.submitting = true;
  state.errors = {};
  try {
    const session = await api(`/api/discovery/${state.session.id}/contact`, {
      method: "POST",
      body: { name: valueOf("name"), email: valueOf("email"), phone: valueOf("phone") },
    });

    state.submitting = false;
    state.editingContact = false;
    adopt(session);
    openBookingModal();
  } catch (error) {
    state.submitting = false;
    state.errors = error.data?.errors || {};
    render();
    showNote(error.message);
  }
}

async function submitBooking(event) {
  event.preventDefault();
  if (state.submitting || !state.session) return;

  const form = event.target;
  const slot = form.querySelector("[data-booking-slot]:checked")?.value || "";
  const typed = form.querySelector("[data-booking-preferred]")?.value?.trim() || "";
  const note = form.querySelector("[data-booking-note]")?.value?.trim() || "";
  const preferred = [slot, typed, note].filter(Boolean).join(" · ");

  state.submitting = true;
  try {
    const session = await api(`/api/discovery/${state.session.id}/request-call`, {
      method: "POST",
      body: { preferred },
    });
    state.submitting = false;
    adopt(session);
    closeBookingModal();

    if (session.whatsappUrl) {
      toast("Opening WhatsApp…");
      window.location.assign(session.whatsappUrl);
    } else {
      toast("Booking saved. Use the WhatsApp button on the page.");
    }
  } catch (error) {
    state.submitting = false;
    const dialog = document.getElementById("bookingModal");
    if (dialog) dialog.innerHTML = bookingModal(state.session);
    toast(error.message);
  }
}

async function refreshSession(manual) {
  if (!state.session || state.submitting) return;
  try {
    const session = await api(`/api/discovery/${state.session.id}`);
    const changed =
      session.status !== state.session.status || session.updatedAt !== state.session.updatedAt;
    if (changed) {
      const previous = state.session.status;
      adopt(session);
      if (previous !== "proposal_ready" && session.status === "proposal_ready") {
        toast("Your plan is ready to view.");
      }
    } else if (manual) {
      toast("Nothing new yet — check again shortly.");
    }
  } catch (error) {
    if (manual) toast(error.message);
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied.");
  } catch {
    toast("Copy failed — select the address bar instead.");
  }
}

function pickChip(target) {
  if (!state.session?.currentStep) return;
  captureDraft();
  const id = target.dataset.pick;
  const value = target.dataset.value;
  const field = state.session.currentStep.fields.find((entry) => entry.id === id);
  if (!field) return;

  if (field.kind === "multi") {
    const list = listOf(state.draft[id]);
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
    else list.push(value);
    state.draft[id] = list;
  } else {
    state.draft[id] = state.draft[id] === value ? "" : value;
  }
  render();
}

async function onClick(event) {
  const chip = event.target.closest("[data-pick]");
  if (chip && view.contains(chip)) {
    pickChip(chip);
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (state.submitting && target.dataset.action !== "refresh") return;

  const action = target.dataset.action;

  switch (action) {
    case "begin":
      await start();
      break;
    case "retry":
      await boot();
      break;
    case "explain":
      await submitStep(true);
      break;
    case "edit-contact":
      closeBookingModal();
      state.editingContact = true;
      render();
      break;
    case "cancel-contact":
      state.editingContact = false;
      render();
      break;
    case "open-booking":
      openBookingModal();
      break;
    case "close-booking":
      closeBookingModal();
      break;
    case "refresh":
      await refreshSession(true);
      break;
    case "print":
      window.print();
      break;
    case "copy-link":
      await copyLink();
      break;
    default:
      break;
  }
}

function onSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;

  if (event.target.id === "stepForm") {
    void submitStep(false);
    return;
  }
  if (event.target.id === "contactForm") {
    void submitContact(event);
    return;
  }
  if (event.target.id === "bookingForm") {
    void submitBooking(event);
  }
}

function onInput(event) {
  const input = event.target;
  if (input.matches("[data-field]")) {
    state.draft[input.dataset.field] = input.value;
    const note = $("#fieldNote");
    if (note) note.classList.remove("show");
  }
}

function onKeydown(event) {
  if (event.key !== "Enter") return;
  const input = event.target.closest("[data-field]");
  if (!input) return;

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    void submitStep(false);
    return;
  }

  if (input.tagName !== "TEXTAREA") {
    const fields = [...document.querySelectorAll("[data-field]")];
    const index = fields.indexOf(input);
    if (index >= 0 && index < fields.length - 1) {
      event.preventDefault();
      fields[index + 1].focus();
    }
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  state.focus = params.get("focus") || "";
  const startPath = location.pathname === "/start" || location.pathname === "/start/";

  if (params.get("new") === "1") {
    forget();
    if (startPath) {
      try {
        const url = new URL(location.href);
        url.searchParams.delete("new");
        url.searchParams.delete("s");
        url.searchParams.delete("session");
        history.replaceState(null, "", url);
      } catch {
        state.loading = false;
      }
      await start();
      return;
    }
  }

  const explicitId = params.get("s") || params.get("session");
  const id = explicitId || storageGet();
  if (!id) {
    if (startPath) {
      await start();
      return;
    }
    state.loading = false;
    render();
    return;
  }

  const result = await load(id);
  if (result === "missing" && !explicitId && startPath) {
    await start();
  }
}

document.addEventListener("click", (event) => {
  void onClick(event);
});
view.addEventListener("submit", onSubmit);
view.addEventListener("input", onInput);
view.addEventListener("keydown", onKeydown);

void boot();

