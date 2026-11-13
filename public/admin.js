const TOKEN_KEY = "scale-reset-admin-token";
const $ = (selector, root = document) => root.querySelector(selector);
const view = $("#view");
const conn = $("#conn");
const toastEl = $("#toast");

const state = {
  token: "",
  list: [],
  selectedId: null,
  detail: null,
  runs: {},
  loading: false,
};

const STATUS_LABELS = {
  in_progress: "Live",
  booking: "Booking",
  call_booked: "Call booked",
  call_done: "Call done",
  brief_ready: "Brief ready",
  proposal_ready: "In review",
  approved: "Approved",
  sent: "Sent",
  booked: "Booked",
  paid: "Paid",
  client: "Client",
};

const CALL_LABELS = {
  not_booked: "Not booked",
  requested: "WhatsApp opened",
  booked: "Booked",
  cancelled: "Cancelled",
  completed: "Completed",
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

function relTime(iso) {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - stamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function storageGet() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function storageSet(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
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

async function apiAdmin(path, options = {}) {
  const init = { method: options.method || "GET", headers: {} };
  if (state.token) init.headers["x-admin-token"] = state.token;
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
    const error = new Error(data.message || data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function clientLink(id) {
  return `${location.origin}/start?s=${encodeURIComponent(id)}`;
}

function emailLink(id) {
  const query = state.token ? `?token=${encodeURIComponent(state.token)}` : "";
  return `/api/admin/discoveries/${encodeURIComponent(id)}/email${query}`;
}

function statusBadge(status) {
  return `<span class="status-badge ${esc(status)}">${esc(
    STATUS_LABELS[status] || status,
  )}</span>`;
}

function renderLayout() {
  view.innerHTML = `<div class="admin-toolbar">
    <div>
      <p class="admin-kicker">Operator desk / live queue</p>
      <h1 class="admin-title">Discoveries</h1>
      <p class="admin-sub">Every conversation, from first answer to paid client.</p>
    </div>
    <div class="admin-actions">
      <button class="admin-btn" type="button" data-action="reload">Refresh</button>
      <button class="admin-btn" type="button" data-action="new-client">New check</button>
      <button class="admin-btn danger" type="button" data-action="clear-open">Clear test data</button>
    </div>
  </div>
  <div class="admin-stats" id="adminStats"></div>
  <div class="token-bar">
    <label for="adminToken">Admin token</label>
    <input id="adminToken" type="password" autocomplete="off" placeholder="Only needed when ADMIN_TOKEN is set" value="${esc(
      state.token,
    )}" />
    <button class="admin-btn" type="button" data-action="save-token">Save token</button>
  </div>
  <div class="admin-grid">
    <div class="admin-list" id="adminList"></div>
    <div id="adminDetail"></div>
  </div>`;
  renderStats();
  renderList();
  renderDetail();
}

function renderStats() {
  const stats = $("#adminStats");
  if (!stats) return;
  const total = state.list.length;
  const live = state.list.filter((item) =>
    ["in_progress", "booking"].includes(item.status),
  ).length;
  const proposals = state.list.filter((item) =>
    ["brief_ready", "proposal_ready", "approved", "sent"].includes(item.status),
  ).length;
  const clients = state.list.filter((item) => item.status === "client").length;
  const cells = [
    ["Total", total],
    ["Live", live],
    ["Proposals", proposals],
    ["Clients", clients],
  ];
  stats.innerHTML = cells
    .map(
      ([label, value]) =>
        `<div class="admin-stat"><span>${esc(label)}</span><strong>${value}</strong></div>`,
    )
    .join("");
}

function renderList() {
  const list = $("#adminList");
  if (!list) return;

  if (state.list.length === 0) {
    list.innerHTML = `<div class="admin-empty">No discoveries yet. Open the client view to start one.</div>`;
    return;
  }

  list.innerHTML = state.list
    .map((item, index) => {
      const on = item.id === state.selectedId ? " on" : "";
      const meta = [item.industry, item.location].filter(Boolean).join(" · ");
      return `<button class="admin-item${on}" type="button" data-action="select" data-id="${esc(
        item.id,
      )}">
        <div class="admin-item-head">
          <h3><span class="admin-index">${String(index + 1).padStart(2, "0")}</span>${esc(
            item.clientName,
          )}</h3>
          ${statusBadge(item.status)}
        </div>
        <p>${esc(meta || "Details pending")}</p>
        <div class="admin-meta">
          <span>${item.matched ? esc(item.matched) : "No play yet"}</span>
          <span>${item.range ? esc(item.range) : "—"}</span>
          <span>${esc(relTime(item.updatedAt))}</span>
        </div>
      </button>`;
    })
    .join("");
}

function kvRow(label, value) {
  if (!value) return "";
  return `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
}

function transcriptBlock(session) {
  if (!session.transcript?.length) return "";
  const bubbles = session.transcript
    .map(
      (entry) =>
        `<div class="bubble ${esc(entry.role)}">${esc(entry.text)}</div>`,
    )
    .join("");
  return `<div class="admin-section"><h3>Transcript</h3><div class="transcript">${bubbles}</div></div>`;
}

function briefBlock(session) {
  const brief = session.brief;
  if (!brief) return "";
  const rows = [
    ["Summary", brief.summary],
    ["What they do", brief.whatTheyDo],
    ["Today's process", brief.currentProcess],
    ["Bottleneck", brief.bottleneck],
    ["Bottleneck detail", brief.bottleneckDetail],
    ["Tools", brief.tools],
    ["90-day goal", brief.goal],
    ["Guardrails", brief.offLimits],
  ].filter(([, value]) => value);

  const body = rows
    .map(
      ([label, value]) =>
        `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`,
    )
    .join("");

  return `<div class="admin-section"><h3>Brief</h3>${body || "<p>Not captured yet.</p>"}</div>`;
}

function callBlock(session) {
  const call = session.call || { status: "not_booked" };
  const status = CALL_LABELS[call.status] || call.status;
  const source = call.source === "whatsapp" || call.source === "request" ? "WhatsApp" : call.source === "cal" ? "Legacy calendar" : "";
  const when = call.startTime ? new Date(call.startTime).toLocaleString() : "";
  const canFinish = ["call_booked", "call_done", "booking"].includes(session.status) ||
    call.status === "requested";

  return `<div class="admin-section">
    <h3>The booking</h3>
    <div class="admin-call">
      <p><strong>${esc(status)}</strong>${source ? ` · ${esc(source)}` : ""}${when ? ` · ${esc(when)}` : ""}</p>
      ${session.needsCall ? '<p class="admin-tag warn">Wants to explain on WhatsApp</p>' : ""}
      ${
        session.contactLabel
          ? `<p><strong>Contact:</strong> ${esc(session.contactLabel)}</p>`
          : "<p>No contact captured yet.</p>"
      }
      ${
        session.answers.bottleneck
          ? `<p><strong>Bottleneck:</strong> ${esc(session.answers.bottleneck)} · ${esc(
              session.answers.frequency || "frequency not set",
            )} · ${esc(session.answers.timeCost || "time cost not set")}</p>`
          : ""
      }
      <textarea id="adminCallNotes" class="admin-textarea" rows="4" placeholder="What was agreed on the call — scope, price, who approves the customer-facing replies">${esc(
        session.callNotes || "",
      )}</textarea>
      <div class="admin-actions">
        <button class="admin-btn primary" type="button" data-action="call-done" data-id="${esc(
          session.id,
        )}" ${canFinish ? "" : "disabled"}>Call done &amp; prepare proposal</button>
      </div>
      <p class="admin-note">The pre-call draft stays hidden until the call notes are saved.</p>
    </div>
  </div>`;
}

function matchesBlock(session) {
  if (!session.matches?.length) return "";
  const rows = session.matches
    .map(
      (match) =>
        `<p><strong>${esc(match.play.name)}</strong> · ${esc(match.confidence)} · ${esc(
          match.play.timeline,
        )} · ${esc(match.rationale)}</p>
         <p class="admin-small">${match.play.build.map(esc).join(" · ")}</p>`,
    )
    .join("");
  return `<div class="admin-section"><h3>Matched plays</h3>${rows}</div>`;
}

function proposalBlock(session) {
  const proposal = session.proposal;
  if (!proposal) return "";
  const plays = proposal.plays
    .map(
      (play) =>
        `<p><strong>${esc(play.name)}</strong> · ${esc(play.timeline)}</p>
         <p class="admin-small">${play.scope.map(esc).join(" · ")}</p>`,
    )
    .join("");
  const assumptions = proposal.assumptions.map((item) => `- ${item}`).join("\n");

  return `<div class="admin-section">
    <h3>Proposal</h3>
    <div class="admin-pricing"><strong>${esc(proposal.rangeLabel)}</strong><span>indicative · ${esc(
      proposal.timeline,
    )}</span></div>
    <p>${esc(proposal.headline)}</p>
    <p>Status: <strong>${esc(proposal.status)}</strong> · ${
      proposal.source === "post_call" ? "post-call" : "pre-call draft"
    }${proposal.approvedBy ? ` · approved by ${esc(proposal.approvedBy)}` : ""}</p>
    ${plays}
    <pre class="admin-pre">${esc(assumptions)}</pre>
    <p class="admin-note"><a class="admin-link" href="${emailLink(session.id)}" target="_blank" rel="noopener">Open email preview</a></p>
  </div>`;
}

function decisionBlock(session) {
  if (!session.proposal) return "";
  return `<div class="admin-section">
    <h3>Decision</h3>
    <textarea id="adminNotes" class="admin-textarea" rows="3" placeholder="Notes for the record (optional)">${esc(
      session.notes || "",
    )}</textarea>
    <p class="admin-note">Approve before sending. The client never sees a draft as final.</p>
  </div>`;
}

function runBlock(session) {
  const run = state.runs[session.id];
  if (!session.runId && !run) return "";
  const status = run?.status ? ` · ${run.status}` : "";
  const reason = run?.suspension?.reason
    ? `<p class="admin-note">Suspended: ${esc(run.suspension.reason)}</p>`
    : "";
  return `<div class="admin-section"><h3>Onboarding run</h3><p><code>${esc(
    session.runId || "—",
  )}</code>${esc(status)}</p>${reason}</div>`;
}

function renderDetail() {
  const container = $("#adminDetail");
  if (!container) return;

  if (!state.selectedId) {
    container.innerHTML = `<div class="admin-detail"><div class="admin-empty">Pick a discovery to review the brief, approve the plan, and start onboarding.</div></div>`;
    return;
  }

  const session = state.detail;
  if (!session) {
    container.innerHTML = `<div class="admin-detail"><div class="admin-empty">Loading…</div></div>`;
    return;
  }

  const proposal = session.proposal;
  const postCall = proposal?.source === "post_call";
  const canApprove = Boolean(proposal) && proposal.status === "draft" && postCall;
  const canSend = Boolean(proposal) && proposal.status !== "draft";
  const canPay = !session.paidAt && session.status !== "client";
  const canOnboard = Boolean(session.paidAt) && session.status !== "client";

  const business = [
    ["Website", session.answers.website],
    ["Contact", session.contactLabel || session.answers.contact],
    ["Industry", session.answers.industry],
    ["Location", session.answers.location],
    ["Bottleneck", session.answers.bottleneck],
    ["Tell me more", session.answers.businessDetail],
    ["The work", session.answers.workDetail],
    ["The week", session.answers.weekDetail],
    ["Bottleneck note", session.answers.bottleneckNote],
    ["Status", STATUS_LABELS[session.status] || session.status],
    ["Updated", relTime(session.updatedAt)],
  ]
    .map(([label, value]) => kvRow(label, value))
    .join("");

  container.innerHTML = `<div class="admin-detail">
    <p class="admin-kicker">Discovery / ${esc(session.id.slice(0, 8))}</p>
    <h2>${esc(session.brief?.clientName || session.answers.businessName || "Unnamed discovery")}</h2>
    <p class="admin-detail-sub">${statusBadge(session.status)} ${
      session.call?.status
        ? `· ${esc(CALL_LABELS[session.call.status] || session.call.status)}`
        : ""
    } · ${esc(relTime(session.updatedAt))}</p>

    <div class="admin-actions">
      <button class="admin-btn primary" type="button" data-action="approve" data-id="${esc(
        session.id,
      )}" ${canApprove ? "" : "disabled"}>Approve plan</button>
      <button class="admin-btn" type="button" data-action="send" data-id="${esc(
        session.id,
      )}" ${canSend ? "" : "disabled"}>Send email</button>
      <button class="admin-btn" type="button" data-action="paid" data-id="${esc(
        session.id,
      )}" ${canPay ? "" : "disabled"}>Mark paid</button>
      <button class="admin-btn" type="button" data-action="onboard" data-id="${esc(
        session.id,
      )}" ${canOnboard ? "" : "disabled"}>Start onboarding</button>
      <button class="admin-btn" type="button" data-action="open-client" data-id="${esc(
        session.id,
      )}">Client view</button>
      <button class="admin-btn" type="button" data-action="copy-client" data-id="${esc(
        session.id,
      )}">Copy link</button>
    </div>

    ${callBlock(session)}
    ${decisionBlock(session)}

    <div class="admin-section"><h3>Business</h3><dl class="admin-kv">${business}</dl></div>
    ${transcriptBlock(session)}
    ${briefBlock(session)}
    ${matchesBlock(session)}
    ${proposalBlock(session)}
    ${runBlock(session)}
  </div>`;
}

async function loadList(silent = false) {
  try {
    const data = await apiAdmin("/api/admin/discoveries");
    state.list = data.discoveries || [];
    if (conn) conn.textContent = `${state.list.length} ${
      state.list.length === 1 ? "discovery" : "discoveries"
    }`;
    renderStats();
    renderList();
  } catch (error) {
    if (conn) conn.textContent = error.status === 401 ? "Check token" : "Offline";
    if (!silent) toast(error.message);
  }
}

async function select(id) {
  state.selectedId = id;
  state.detail = null;
  renderList();
  renderDetail();
  try {
    const session = await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}`);
    if (state.selectedId !== id) return;
    state.detail = session;
    renderDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshDetail() {
  if (!state.selectedId) return;
  await select(state.selectedId);
}

async function callDone(id) {
  const notes = $("#adminCallNotes")?.value?.trim() || "";
  if (!notes) {
    toast("Add the call notes first.");
    return;
  }
  try {
    await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}/call-done`, {
      method: "POST",
      body: { notes, decidedBy: "Samuel" },
    });
    toast("Call saved. The post-call proposal is drafted.");
    await loadList(true);
    await refreshDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function approve(id) {
  const notes = $("#adminNotes")?.value?.trim() || undefined;
  try {
    await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: { decidedBy: "Samuel", notes },
    });
    toast("Proposal approved. It can be sent now.");
    await loadList(true);
    await refreshDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function send(id) {
  try {
    const result = await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}/send`, {
      method: "POST",
      body: {},
    });
    const delivery = result.delivery;
    const email = result.email;
    if (delivery?.delivered) toast(`Proposal emailed to ${email || "the client"}.`);
    else if (delivery?.mode === "outbox")
      toast("Saved to the outbox. Add RESEND_API_KEY to send for real.");
    else toast(delivery?.error || "Queued in the outbox.");
    await loadList(true);
    await refreshDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function markPaid(id) {
  try {
    await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}/paid`, {
      method: "POST",
      body: {},
    });
    toast("Payment recorded. Onboarding can start.");
    await loadList(true);
    await refreshDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function onboard(id) {
  try {
    const result = await apiAdmin(`/api/admin/discoveries/${encodeURIComponent(id)}/onboard`, {
      method: "POST",
      body: {},
    });
    state.runs[id] = result.run;
    const status = result.run?.status || "started";
    toast(`Onboarding ${status}.`);
    await loadList(true);
    await refreshDetail();
  } catch (error) {
    toast(error.message);
  }
}

async function copyClient(id) {
  try {
    await navigator.clipboard.writeText(clientLink(id));
    toast("Client link copied.");
  } catch {
    toast("Copy failed — use the client view link.");
  }
}

function openClearDialog() {
  const dialog = $("#clearDialog");
  const confirm = $("#clearConfirm");
  const run = $("#clearRun");
  if (confirm) confirm.checked = false;
  if (run) run.disabled = true;
  if (dialog && !dialog.open) dialog.showModal();
}

function closeClearDialog() {
  const dialog = $("#clearDialog");
  if (dialog?.open) dialog.close();
}

async function clearData() {
  const confirm = $("#clearConfirm");
  if (!confirm?.checked) {
    toast("Tick the confirmation first.");
    return;
  }
  const run = $("#clearRun");
  if (run) {
    run.disabled = true;
    run.textContent = "Clearing…";
  }
  try {
    const result = await apiAdmin("/api/admin/reset", {
      method: "POST",
      body: { confirm: "clear-all" },
    });
    state.list = [];
    state.selectedId = null;
    state.detail = null;
    closeClearDialog();
    renderLayout();
    toast(
      `Cleared ${result.cleared || 0} ${
        result.cleared === 1 ? "discovery" : "discoveries"
      } and the outbox.`,
    );
  } catch (error) {
    toast(error.message);
  } finally {
    if (run) {
      run.disabled = false;
      run.textContent = "Clear data";
    }
  }
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  switch (action) {
    case "reload":
      await loadList();
      break;
    case "save-token": {
      state.token = $("#adminToken")?.value?.trim() || "";
      storageSet(state.token);
      toast(state.token ? "Token saved." : "Token cleared.");
      await loadList();
      break;
    }
    case "select":
      await select(id);
      break;
    case "call-done":
      await callDone(id);
      break;
    case "approve":
      await approve(id);
      break;
    case "send":
      await send(id);
      break;
    case "paid":
      await markPaid(id);
      break;
    case "onboard":
      await onboard(id);
      break;
    case "copy-client":
      await copyClient(id);
      break;
    case "open-client":
      window.open(clientLink(id), "_blank", "noopener");
      break;
    case "new-client":
      window.open(`${location.origin}/start?new=1`, "_blank", "noopener");
      break;
    case "clear-open":
      openClearDialog();
      break;
    case "clear-cancel":
      closeClearDialog();
      break;
    case "clear-run":
      await clearData();
      break;
    default:
      break;
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (token) {
    state.token = token;
    storageSet(token);
  } else {
    state.token = storageGet();
  }

  renderLayout();
  await loadList();

  const selected = params.get("id");
  if (selected) await select(selected);

  setInterval(() => {
    void loadList(true);
  }, 15000);
}

view.addEventListener("click", (event) => {
  void onClick(event);
});

$("#clearConfirm")?.addEventListener("change", (event) => {
  const run = $("#clearRun");
  if (run) run.disabled = !event.target.checked;
});

$("#clearDialog")?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (target) {
    void onClick(event);
    return;
  }
  if (event.target === event.currentTarget) closeClearDialog();
});

void boot();
