// Inbox Agent — Netlify Function (plain JavaScript, no dependencies).
//
// Faithful port of the Python backend (~/workspace/inbox-agent-hf/:
// engine.py + inbox_app.py) to a single Netlify Functions v2 file.
// Same deterministic rule engine, same routes, same JSON shapes.
// No LLM: Groq is inert without a key, so this behaves exactly like
// the Python reference with no GROQ_API_KEY set (deterministic-only).
//
// The 20 seed emails are embedded verbatim below (from
// data/emails.json) — no file reads, so there is no bundling/path risk.
// State is in-memory at module level: the pipeline runs once at import
// and approve/edit state lives per container, same as the Python version.

const EMAILS = [{"body":"Dear student, this is a reminder that your semester fee of Rs 48,500 is due. The deadline to pay is 15 Nov 2026. If you miss it, a late fine of Rs 500 per day applies and your exam hall ticket will be blocked. Please pay through the fee portal and keep the receipt. Regards, Accounts Office.","date":"2026-11-11T10:15:00","from":"accounts@iitb-demo.edu","from_name":"Accounts Office","id":"E01","subject":"Semester fee payment deadline — 15 Nov"},{"body":"Hi, please confirm by today, 12 Nov, 6 PM, or your slot will go to the next candidate. Your internship interview with TechWorks has been rescheduled to tomorrow, 13 Nov, at 10:00 AM in the placement office. Carry your resume and ID card. Regards, Placement Cell.","date":"2026-11-12T08:40:00","from":"placements@iitb-demo.edu","from_name":"Placement Cell","id":"E02","subject":"Interview rescheduled to tomorrow 10 AM — please confirm"},{"body":"ALERT: your website shopdemo.in has been down since 2 AM today. Customers are unable to place orders and the server is not responding. This is an outage — please check your hosting dashboard and contact support urgently. Site Monitor.","date":"2026-11-12T02:05:00","from":"monitor@hostdemo.in","from_name":"Site Monitor","id":"E03","subject":"ALERT: Your shop website is down"},{"body":"Dear customer, your electricity bill for November is Rs 1,842. Please pay by 18 Nov 2026 to avoid a late fee. You can pay on our app or website. Thank you, City Power.","date":"2026-11-10T14:20:00","from":"bills@powerdemo.in","from_name":"City Power","id":"E04","subject":"Your November electricity bill Rs 1,842 is due 18 Nov"},{"body":"Hi, could you please approve my leave by 14 Nov? I am writing to request leave from 14 to 16 Nov for a family function. I have finished my pending work and briefed Aisha on the handover. Thanks, Rohan.","date":"2026-11-11T16:45:00","from":"rohan.sharma@demo-mail.in","from_name":"Rohan Sharma","id":"E05","subject":"Leave approval needed — 14 to 16 Nov"},{"body":"Hello, for your October GST filing we need copies of all sales invoices for the month. Please submit the invoice copies by 16 Nov 2026. You can upload them on the client portal. Regards, FinTax CA.","date":"2026-11-09T11:30:00","from":"ca@fintax-demo.in","from_name":"FinTax CA","id":"E06","subject":"Please submit GST invoice copies by 16 Nov"},{"body":"Hi, thank you for your order of 50 steel brackets at Rs 120 each, total Rs 6,000. Please reply and confirm the order by 14 Nov so we can start cutting. Delivery takes 3 days after confirmation. Regards, SteelMart.","date":"2026-11-11T13:05:00","from":"orders@steelmart-demo.in","from_name":"SteelMart","id":"E07","subject":"Confirm your order of 50 steel brackets"},{"body":"Dear student, you have 3 books issued from the Central Library. Please return them by 14 Nov 2026. A fine of Rs 10 per book per day applies after the due date. Regards, Central Library.","date":"2026-11-10T09:00:00","from":"library@iitb-demo.edu","from_name":"Central Library","id":"E08","subject":"Library books return due 14 Nov"},{"body":"Dear all, Assignment 3 on linear algebra is due on 17 Nov 2026, 11:59 PM. Please submit your solutions as a single PDF on the course portal. Late submissions lose 10 percent per day. Regards, Prof. Mehta.","date":"2026-11-10T18:30:00","from":"prof.mehta@iitb-demo.edu","from_name":"Prof. Mehta","id":"E09","subject":"Assignment 3 submission — due 17 Nov"},{"body":"Hello, please find the vendor agreement attached. Kindly sign it and send the signed copy back to us by 15 Nov 2026 so we can release your first payment. Regards, Vendor Legal.","date":"2026-11-11T12:00:00","from":"legal@vendordemo.in","from_name":"Vendor Legal","id":"E10","subject":"Sign the vendor agreement — send signed copy by 15 Nov"},{"body":"Good news! Your order #8821 has been shipped and will reach you in 2-3 days. You can track it on our website with the tracking ID shared below. Thank you for shopping with us.","date":"2026-11-11T19:20:00","from":"shipping@shopdemo.in","from_name":"ShopDemo Shipping","id":"E11","subject":"Your order has been shipped"},{"body":"Dear student, the mid-semester scores have been declared. You can check your scores on the academic portal under the Results section. Best wishes, Exam Office.","date":"2026-11-09T15:00:00","from":"results@iitb-demo.edu","from_name":"Exam Office","id":"E12","subject":"Results declared: mid-semester scores"},{"body":"Hello reader, here is your weekly roundup: AI agents are now writing their own code reviews, a new chip claims 40 percent faster inference, and a student satellite team won a national prize. Read the full stories on our website. Tech Weekly.","date":"2026-11-08T07:00:00","from":"news@techweekly-demo.in","from_name":"Tech Weekly","id":"E13","subject":"Tech news this week: AI agents, chips and space"},{"body":"Dear all, the institute will remain closed on 14 Nov 2026 on account of the local festival. Classes resume on 15 Nov. The library will also stay closed. Regards, Institute Admin.","date":"2026-11-08T12:00:00","from":"admin@iitb-demo.edu","from_name":"Institute Admin","id":"E14","subject":"Holiday notice: institute closed on 14 Nov"},{"body":"Hi, your refund of Rs 499 for the cancelled order has been processed. The money will reach your bank account in 3-5 working days. No action is needed from your side. Thank you, PayDemo.","date":"2026-11-07T10:40:00","from":"refunds@paydemo.in","from_name":"PayDemo","id":"E15","subject":"Your refund of Rs 499 has been processed"},{"body":"Big sale! Get 50% OFF on all shirts and shoes. The sale ends tonight at midnight. Use code FEST50 at checkout. Shop now before prices go back up!","date":"2026-11-11T20:00:00","from":"deals@fashiondemo.in","from_name":"FashionDemo Deals","id":"E16","subject":"50% OFF sale ends tonight!"},{"body":"Hi, upgrade to our yearly plan and save 30% on your subscription. You also get extra storage and priority support. This is a limited-time offer for existing users. Team CloudDemo.","date":"2026-11-09T09:15:00","from":"plans@clouddemo.in","from_name":"CloudDemo","id":"E17","subject":"Upgrade and save 30% on yearly plans"},{"body":"Hungry? Enjoy free delivery on all orders this weekend with our festive offer. Order your favourite food and pay nothing extra for delivery. Tasty wishes, FoodDemo.","date":"2026-11-10T17:30:00","from":"offers@fooddemo.in","from_name":"FoodDemo","id":"E18","subject":"Festive offer: free delivery this weekend"},{"body":"Dear customer, your bank account will be closed today if you do not verify it now. Click here to verify your account and enter your OTP and card details. Do it immediately or your money will be blocked. Bank Security Team.","date":"2026-11-12T06:10:00","from":"support@secure-bank-alerts.xyz","from_name":"Bank Security","id":"E19","subject":"URGENT: Verify your bank account now"},{"body":"Congratulations! You have won Rs 5,00,000 in our international lottery. To claim your prize, send a processing fee of Rs 2,000 and share your bank details. Claim your prize now before it expires!","date":"2026-11-11T22:45:00","from":"prizes@luckywinner-demo.xyz","from_name":"Lucky Winner","id":"E20","subject":"Congratulations! You have won Rs 5,00,000"}];

// --- Engine (port of engine.py) -----------------------------------------

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const DATE_RE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(\s+\d{4})?/i;

// Rules are checked in order: spam first (never act on spam), then urgent,
// then promo, then action, then FYI as the default.
const SPAM_SIGNALS = [
  ["won", "lottery"], ["won", "claim"], ["claim your prize"],
  ["verify your bank"], ["account will be closed"],
  ["processing fee", "claim"], ["bank details", "won"],
];
const SPAM_SENDERS = [".xyz", "luckywinner", "secure-bank-alerts"];

const URGENT_SIGNALS = [
  ["website", "down"], ["server", "down"], ["outage"],
  ["rescheduled"], ["deadline"], ["hall ticket", "blocked"],
];
const PROMO_SIGNALS = [
  ["% off"], ["sale ends"], ["big sale"], ["on sale"],
  ["discount"], ["free delivery"],
  ["upgrade", "save"], ["offer"],
];
const ACTION_SIGNALS = [
  ["pay"], ["submit"], ["approve"], ["approval"],
  ["confirm"], ["sign"], ["return"], ["due"],
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True if ALL words of any phrase group appear as whole words in text.
// Word-boundary matching matters: without it, 'pay' matches 'PayDemo',
// 'sale' matches 'sales invoices', and 'won a prize' looks like a scam.
function hasWord(text, word) {
  return new RegExp("(?<!\\w)" + escapeRegExp(word) + "(?!\\w)").test(text);
}
function has(text, phrases) {
  return phrases.some((group) => group.every((w) => hasWord(text, w)));
}

// Agent 1 — classify one email. Returns [category, reason].
function triage(email) {
  const text = (email.subject + " " + email.body).toLowerCase();
  const sender = email.from.toLowerCase();

  if (SPAM_SENDERS.some((s) => sender.includes(s)) || has(text, SPAM_SIGNALS)) {
    return ["spam", "Looks like a scam: prize/bank-verify wording from an unknown sender. Never click its links."];
  }
  if (has(text, URGENT_SIGNALS)) {
    if (text.includes("down") || text.includes("outage")) {
      return ["urgent", "Service is down / outage — needs attention right now."];
    }
    if (text.includes("rescheduled")) {
      return ["urgent", "Something changed at short notice (rescheduled) — reply needed today."];
    }
    return ["urgent", "Has a hard deadline with a penalty if missed."];
  }
  if (has(text, PROMO_SIGNALS)) {
    return ["promo", "Marketing message: sale, discount or offer. Nothing to do."];
  }
  if (has(text, ACTION_SIGNALS)) {
    return ["action", "Needs a reply or an action from you (pay, submit, approve, confirm…)."];
  }
  return ["fyi", "Information only — no reply or action needed."];
}

// Agent 2 — score urgency 1 (lowest) to 5 (highest).
function priority(email, category) {
  const text = (email.subject + " " + email.body).toLowerCase();
  if (category === "spam" || category === "promo") {
    return [1, "Low value: spam or marketing."];
  }
  if (category === "fyi") {
    return [2, "Informational only."];
  }
  if (category === "action") {
    return [3, "Needs action, but no immediate penalty."];
  }
  // urgent: 5 if it is happening today/tomorrow or a service is down
  if (text.includes("down") || text.includes("outage") || text.includes("tomorrow")) {
    return [5, "Happening now or tomorrow — act first."];
  }
  return [4, "Urgent, with a deadline a few days away."];
}

// --- Deadline parsing ----------------------------------------------------

function pad(n, w) {
  return String(n).padStart(w, "0");
}
function fmtDate(d) {
  return pad(d.getFullYear(), 4) + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
}
// Parse "2026-11-11T10:15:00" as a naive local datetime, like Python's
// datetime.fromisoformat — components are used as-is, no timezone shift.
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

// Find a due date in the body. Returns [dateStr, source] or [null, null].
function parseDeadline(email) {
  const body = email.body;
  const ref = parseDate(email.date);
  const low = body.toLowerCase();
  const m = DATE_RE.exec(body);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    const year = m[3] ? parseInt(m[3].trim(), 10) : ref.getFullYear();
    return [pad(year, 4) + "-" + pad(month, 2) + "-" + pad(day, 2), "date written in the email"];
  }
  if (low.includes("tomorrow")) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return [fmtDate(d), "word 'tomorrow' in the email"];
  }
  if (low.includes("today")) {
    return [fmtDate(ref), "word 'today' in the email"];
  }
  return [null, null];
}

// --- Draft Agent ---------------------------------------------------------

// (word-groups, draft template) — a draft is written only when ALL words
// of one group appear as whole words. ("website","down") means the
// website must actually be down, not just mentioned (E04's bill says
// "pay on our app or website" — that is NOT an outage.)
const DRAFT_TEMPLATES = [
  [[["rescheduled"]], "Hi,\n\nThanks for the update. Confirming I will attend the rescheduled interview tomorrow, 13 Nov, at 10:00 AM, and I will carry my resume and ID card.\n\nThanks,\nRonnie"],
  [[["approve"]], "Hi,\n\nApproved — your leave from 14 to 16 Nov is fine. Thanks for sorting the handover.\n\nThanks,\nRonnie"],
  [[["confirm your order"]], "Hi,\n\nConfirming the order of 50 steel brackets. Please go ahead with cutting.\n\nThanks,\nRonnie"],
  [[["sign"]], "Hi,\n\nI have signed the vendor agreement and will send the signed copy back by 15 Nov 2026.\n\nThanks,\nRonnie"],
  [[["website", "down"], ["outage"]], "Hi team,\n\nOur website shopdemo.in appears to be down since 2 AM and customers cannot place orders. Could you please share an ETA for fixing it?\n\nThanks,\nRonnie"],
  [[["semester fee"]], "Hi,\n\nI will pay the semester fee of Rs 48,500 by 15 Nov 2026 through the fee portal. Please confirm once it is received.\n\nThanks,\nRonnie"],
];

// Agent 3 — write a short reply draft, or null if no reply is needed.
// Drafts are only written when a reply is genuinely expected.
// Portal payments and form submissions need no email reply.
function draft(email, category) {
  if (category !== "urgent" && category !== "action") {
    return [null, "No reply needed for this category."];
  }
  const text = (email.subject + " " + email.body).toLowerCase();
  for (const [groups, template] of DRAFT_TEMPLATES) {
    // groups is a list of word-groups; any one group matching wins.
    if (has(text, groups)) {
      return [template, "Drafted from the email's ask."];
    }
  }
  return [null, "No reply expected — the action happens on a portal, not by email."];
}

// --- Task Agent ----------------------------------------------------------

const TASK_VERBS = [
  ["pay", "Pay"], ["submit", "Submit"], ["approve", "Approve"],
  ["confirm", "Confirm"], ["return", "Return"], ["sign", "Send"],
  ["send", "Send"], ["website", "Follow up on"],
];

// Agent 4 — pull one task + due date out of an email, or null.
function extractTask(email, category) {
  if (category !== "urgent" && category !== "action") {
    return null;
  }
  const text = (email.subject + " " + email.body).toLowerCase();
  let [due, source] = parseDeadline(email);
  if (due === null) {
    // No date found: only urgent items still become tasks, due today.
    if (category !== "urgent") {
      return null;
    }
    due = fmtDate(parseDate(email.date));
    source = "no date in the email — set to today";
  }
  for (const [keyword, verb] of TASK_VERBS) {
    if (has(text, [[keyword]])) {
      let short = email.subject.split("—")[0].trim();
      if (short.toLowerCase().startsWith("please ")) {
        short = short.slice(7);
      }
      if (short.toLowerCase().startsWith(verb.toLowerCase() + " ")) {
        short = short.slice(verb.length + 1);
      }
      short = short.charAt(0).toUpperCase() + short.slice(1);
      return {
        email_id: email.id,
        title: verb + ": " + short,
        due,
        due_source: source,
        owner: "You",
        priority: category === "urgent" ? 5 : 3,
      };
    }
  }
  return null;
}

// --- Full pipeline -------------------------------------------------------

function runPipeline(emails) {
  const results = [];
  const tasks = [];
  for (const email of emails) {
    const [category, triageReason] = triage(email);
    const [score, prioReason] = priority(email, category);
    const [draftText, draftReason] = draft(email, category);
    const task = extractTask(email, category);
    if (task) {
      tasks.push(task);
    }
    results.push({
      ...email,
      category,
      triage_reason: triageReason,
      priority: score,
      priority_reason: prioReason,
      draft: draftText,
      draft_reason: draftReason,
      task,
    });
  }
  const counts = { urgent: 0, action: 0, fyi: 0, promo: 0, spam: 0 };
  for (const r of results) {
    counts[r.category] += 1;
  }
  // Agent 5 — Escalation: urgent items, highest priority first.
  const needsYou = results.filter((r) => r.category === "urgent");
  needsYou.sort((a, b) => b.priority - a.priority);
  tasks.sort((a, b) => {
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return b.priority - a.priority;
  });
  return {
    results,
    tasks,
    needs_you_now: needsYou.map((r) => r.id),
    counts,
    total: results.length,
    drafts_written: results.filter((r) => r.draft).length,
  };
}

// --- State + routes (port of inbox_app.py) -------------------------------

// In-memory state. Restarting the function resets everything — by design.
const state = { run: null, approved: {}, editedDrafts: {}, lastRunSeconds: null };

function doRun() {
  const start = Date.now();
  const result = runPipeline(EMAILS);
  state.run = result;
  state.lastRunSeconds = Math.round((Date.now() - start) / 10) / 100;
  return result;
}

doRun(); // dashboard opens with results already in place

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^\/api\/emails\/([^/]+)$/;
const APPROVE_RE = /^\/api\/drafts\/([^/]+)\/approve$/;
const EDIT_RE = /^\/api\/drafts\/([^/]+)\/edit$/;

function isKnownPath(path) {
  return (
    path === "/api/status" ||
    path === "/api/run" ||
    path === "/api/emails" ||
    path === "/api/tasks" ||
    EMAIL_RE.test(path) ||
    APPROVE_RE.test(path) ||
    EDIT_RE.test(path)
  );
}

export default async (req) => {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  const method = req.method;

  if (method === "GET" && path === "/api/status") {
    return jsonResponse({
      engine: "deterministic rules only (no GROQ_API_KEY set)",
      llm_available: false,
      total_emails: state.run ? state.run.total : 0,
      last_run_seconds: state.lastRunSeconds,
      note: "Demo data only — fictional inbox. Nothing is sent or deleted.",
    });
  }

  if (method === "POST" && path === "/api/run") {
    const result = doRun();
    return jsonResponse({
      counts: result.counts,
      total: result.total,
      drafts_written: result.drafts_written,
      tasks_found: result.tasks.length,
      needs_you_now: result.needs_you_now,
      seconds: state.lastRunSeconds,
      engine: "deterministic",
    });
  }

  if (method === "GET" && path === "/api/emails") {
    const category = url.searchParams.get("category") || "";
    let results = state.run.results;
    if (category) {
      results = results.filter((r) => r.category === category);
    }
    return jsonResponse({ emails: results, counts: state.run.counts });
  }

  const emailMatch = EMAIL_RE.exec(path);
  if (method === "GET" && emailMatch) {
    const id = decodeURIComponent(emailMatch[1]);
    const found = state.run.results.find((r) => r.id === id);
    if (!found) {
      return jsonResponse({ detail: "email not found" }, 404);
    }
    const out = { ...found };
    if (id in state.editedDrafts) {
      out.draft = state.editedDrafts[id];
    }
    out.approved = state.approved[id] || false;
    return jsonResponse(out);
  }

  if (method === "GET" && path === "/api/tasks") {
    return jsonResponse({ tasks: state.run.tasks, count: state.run.tasks.length });
  }

  const approveMatch = APPROVE_RE.exec(path);
  if (method === "POST" && approveMatch) {
    const id = decodeURIComponent(approveMatch[1]);
    state.approved[id] = true;
    return jsonResponse({ id, approved: true, note: "Local state only — nothing was sent." });
  }

  const editMatch = EDIT_RE.exec(path);
  if (method === "POST" && editMatch) {
    const id = decodeURIComponent(editMatch[1]);
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ detail: "Invalid JSON" }, 422);
    }
    state.editedDrafts[id] = body.text;
    return jsonResponse({ id, edited: true, note: "Local state only — nothing was sent." });
  }

  if (isKnownPath(path)) {
    return jsonResponse({ detail: "Method Not Allowed" }, 405);
  }
  return jsonResponse({ detail: "Not Found" }, 404);
};

export const config = { path: "/api/*" };
