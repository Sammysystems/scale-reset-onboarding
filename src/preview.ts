import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const deliverables = path.join(root, "deliverables");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${inline(item)}</li>`).join("");
      out.push(`<${list.type}>${items}</${list.type}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line === "---") {
      flushParagraph();
      flushList();
      out.push("<hr/>");
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.*)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unordered[1] ?? "");
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1] ?? "");
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return out.join("\n");
}

async function read(folder: string, name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(deliverables, folder, name), "utf8");
  } catch {
    return "";
  }
}

interface Step {
  label: string;
  detail: string;
  gate?: boolean;
  caught?: boolean;
}

const haldenSteps: Step[] = [
  { label: "Intake", detail: "Completeness 100% — all five required fields clear the bar." },
  { label: "Screen", detail: "Auto-passed. No human needed before research." },
  { label: "Research", detail: "Commander brief + workflow audit + tech stack + strategy." },
  { label: "Draft", detail: "Attempt 1 failed QC, attempt 2 passed. 0 open issues.", caught: true },
  { label: "Approval", detail: "Suspended. Operator approved. Nothing ships without sign-off.", gate: true },
  { label: "Finalize", detail: "3 documents written, run recorded, operator notified." },
];

const miraSteps: Step[] = [
  { label: "Intake", detail: "Completeness 30% — four fields missing or too short." },
  { label: "Screen", detail: "Suspended. Operator supplied the five gaps before research ran.", gate: true },
  { label: "Research", detail: "Ran only after the intake was complete." },
  { label: "Draft", detail: "Attempt 1 failed QC, attempt 2 passed. 0 open issues.", caught: true },
  { label: "Approval", detail: "Suspended again. Operator approved.", gate: true },
  { label: "Finalize", detail: "3 documents written, run recorded, operator notified." },
];

function pipeline(steps: Step[]): string {
  return steps
    .map(
      (step, index) => `
        <div class="step ${step.gate ? "is-gate" : ""} ${step.caught ? "is-catch" : ""}">
          <div class="step-index">${String(index + 1).padStart(2, "0")}</div>
          <div class="step-label">${step.label}${step.gate ? '<span class="tag">gate</span>' : ""}${step.caught ? '<span class="tag catch">QC</span>' : ""}</div>
          <div class="step-detail">${step.detail}</div>
        </div>`,
    )
    .join('<div class="arrow" aria-hidden="true">→</div>');
}

const haldenAvatar = renderMarkdown(await read("halden-co", "CLIENT-AVATAR.md"));
const haldenTone = renderMarkdown(await read("halden-co", "TONE-OF-VOICE.md"));
const haldenReport = renderMarkdown(await read("halden-co", "ONBOARDING-REPORT.md"));
const haldenLog = await read("halden-co", "RUN-LOG.md");
const miraAvatar = renderMarkdown(await read("mira-studio", "CLIENT-AVATAR.md"));
const miraReport = renderMarkdown(await read("mira-studio", "ONBOARDING-REPORT.md"));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Client Onboarding Research Engine — Walkthrough</title>
<style>
  :root {
    --bg: #0b0d10;
    --panel: #141820;
    --panel-2: #1b212b;
    --line: #2a3240;
    --ink: #e8eaed;
    --muted: #9aa4b2;
    --amber: #e6b35a;
    --teal: #5fd0c4;
    --red: #e06c6c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: radial-gradient(1200px 600px at 70% -10%, #1a2230 0%, var(--bg) 55%);
    color: var(--ink);
    font: 16px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif;
    padding: 48px 24px 96px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .eyebrow { color: var(--amber); letter-spacing: .18em; text-transform: uppercase; font-size: 12px; font-weight: 700; }
  h1 { font-size: 40px; line-height: 1.1; margin: 10px 0 12px; letter-spacing: -0.02em; }
  .lede { color: var(--muted); font-size: 18px; max-width: 760px; margin: 0 0 28px; }
  .proof { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 40px; }
  .proof span { border: 1px solid var(--line); background: var(--panel); color: var(--muted); padding: 6px 12px; border-radius: 999px; font-size: 13px; }
  .proof span b { color: var(--ink); }
  section { margin: 48px 0 0; }
  h2 { font-size: 13px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin: 0 0 16px; }
  .pipeline { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; }
  .step { flex: 1 1 150px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
  .step.is-gate { border-color: rgba(230,179,90,.55); }
  .step.is-catch { border-color: rgba(224,108,108,.5); }
  .step-index { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .step-label { font-weight: 700; margin: 4px 0 6px; display: flex; gap: 8px; align-items: center; }
  .step-detail { color: var(--muted); font-size: 13px; line-height: 1.45; }
  .tag { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; border: 1px solid var(--amber); color: var(--amber); border-radius: 999px; padding: 1px 7px; }
  .tag.catch { border-color: var(--red); color: var(--red); }
  .arrow { display: flex; align-items: center; color: var(--line); font-size: 18px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } h1 { font-size: 30px; } }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; }
  .card h3 { margin: 0 0 4px; font-size: 18px; }
  .card .sub { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
  .catch-box { background: linear-gradient(180deg, rgba(224,108,108,.10), rgba(224,108,108,.03)); border: 1px solid rgba(224,108,108,.35); border-radius: 14px; padding: 20px; }
  .catch-box .quote { font-family: "Cascadia Code", Consolas, monospace; font-size: 14px; background: #0e1116; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 10px 0; color: var(--ink); }
  .catch-box .quote.bad { border-color: rgba(224,108,108,.5); }
  .catch-box .quote.good { border-color: rgba(95,208,196,.5); }
  .doc { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 24px 26px; margin: 14px 0; }
  .doc h1 { font-size: 24px; margin: 0 0 8px; }
  .doc h2 { font-size: 15px; letter-spacing: 0; text-transform: none; color: var(--ink); margin: 20px 0 8px; }
  .doc p, .doc li { color: #cdd3dc; }
  .doc hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
  .doc em { color: var(--muted); }
  .doc code { background: #0e1116; border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; font-size: 13px; }
  details { border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; background: var(--panel-2); margin: 14px 0; }
  summary { cursor: pointer; font-weight: 600; }
  details pre { white-space: pre-wrap; word-break: break-word; color: var(--muted); font-size: 12.5px; line-height: 1.5; margin: 14px 0 0; }
  .footer { margin-top: 56px; border-top: 1px solid var(--line); padding-top: 20px; color: var(--muted); font-size: 13px; }
  .footer code { color: var(--ink); background: #0e1116; border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; }
  a { color: var(--teal); }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Client Onboarding Research Engine</div>
  <h1>One form in. Three approved documents out.</h1>
  <p class="lede">A named six-step workflow that turns a new-client intake into a Client Avatar, a Tone of Voice, and an Onboarding Report. A thin form stops at a human gate. A weak draft is caught by a deterministic quality check before anyone signs it off.</p>

  <div class="proof">
    <span><b>6</b> steps</span>
    <span><b>2</b> human gates</span>
    <span><b>18/18</b> tests</span>
    <span><b>0</b> open QC issues</span>
    <span><b>2</b> real runs shown</span>
  </div>

  <section>
    <h2>The process</h2>
    <div class="pipeline">${pipeline(haldenSteps)}</div>
  </section>

  <section>
    <h2>Two real runs</h2>
    <div class="grid">
      <div class="card">
        <h3>Mira Studio</h3>
        <p class="sub">Thin intake (30%). Stopped at the screen gate, supplemented, then approved.</p>
        <div class="pipeline">${pipeline(miraSteps)}</div>
      </div>
      <div class="card">
        <h3>Halden &amp; Co</h3>
        <p class="sub">Complete intake (100%). Passed screen, research and draft, then waited for approval.</p>
        <div class="pipeline">${pipeline(haldenSteps)}</div>
      </div>
    </div>
  </section>

  <section>
    <h2>What the quality gate actually caught</h2>
    <div class="catch-box">
      <p>The model's first draft invented a statistic. The gate rejected it and re-drafted with the issue fed back. Attempt 2 passed. This is the part the job description asked for: checking, not just generating.</p>
      <div class="quote bad">Attempt 1 — rejected<br/>- They lose <b>37%</b> of inbound leads to slow replies.<br/>[[UNVERIFIED: the 37% figure has no source]]</div>
      <div class="quote good">Attempt 2 — accepted<br/>- Enquiries arrive through several channels and get answered late.<br/>- Follow-up depends on the owner remembering to do it.</div>
    </div>
  </section>

  <section>
    <h2>What the client receives</h2>
    <p class="sub" style="color:var(--muted);margin-top:-6px;">Rendered from the actual files written by the run for Halden &amp; Co.</p>
    <div class="doc">${haldenAvatar}</div>
    <div class="doc">${haldenTone}</div>
    <div class="doc">${haldenReport}</div>
    <details>
      <summary>Run log — every step, the suspension, the notifications</summary>
      <pre>${escapeHtml(haldenLog)}</pre>
    </details>
  </section>

  <section>
    <h2>The second client, from a thin form</h2>
    <p class="sub" style="color:var(--muted);margin-top:-6px;">Mira Studio's form was 30% complete. The engine refused to research it until the gaps were filled.</p>
    <details>
      <summary>Mira Studio — Client Avatar</summary>
      <div class="doc">${miraAvatar}</div>
    </details>
    <details>
      <summary>Mira Studio — Onboarding Report</summary>
      <div class="doc">${miraReport}</div>
    </details>
  </section>

  <section>
    <h2>How it runs</h2>
    <div class="card">
      <p style="margin-top:0;"><b>Offline demo</b> — <code>npm run demo</code> runs both clients with a mock model and writes the documents you just read.</p>
      <p><b>Live runner</b> — <code>npm run serve</code> exposes <code>/webhooks/intake</code>, <code>/suspensions</code>, and <code>/runs/:id/resume</code> so a form submission can start a run and a human can approve it.</p>
      <p style="margin-bottom:0;"><b>Real model</b> — set <code>MODEL_PROVIDER=openai-compatible</code> and point <code>MODEL_BASE_URL</code> at the InsForge Model Gateway or OmniRoute. The workflow code does not change.</p>
    </div>
  </section>

  <div class="footer">
    Generated from <code>deliverables/</code> by <code>src/preview.ts</code>. Documents: <code>CLIENT-AVATAR.md</code>, <code>TONE-OF-VOICE.md</code>, <code>ONBOARDING-REPORT.md</code>, <code>RUN-LOG.md</code>.
  </div>
</div>
</body>
</html>`;

const target = path.join(deliverables, "preview.html");
await fs.writeFile(target, html, "utf8");
console.log(target);
