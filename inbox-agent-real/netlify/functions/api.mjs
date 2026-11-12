// Inbox Agent (v1, real) — Netlify Functions v2, plain JavaScript.
// One file, zero dependencies except @netlify/blobs (server-side storage,
// provided by the Netlify functions runtime; see package.json).
// No build step. No Python.
//
// The engine (triage / priority / draft / task / pipeline) and the 20 seed
// emails below are copied VERBATIM from the verified prototype
// (~/workspace/inbox-agent-netlify/netlify/functions/api.mjs). The seed
// data is used ONLY by the mock Gmail fetcher (MOCK_GMAIL=true, local
// verification); the real app runs the engine on the user's Gmail messages
// fetched via OAuth + the Gmail API.
//
// Env vars required:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — Google OAuth web client
//   REMIND_SECRET — shared secret for POST /api/remind (GitHub Actions)
//   MOCK_GMAIL=true — local verification only; never set in production
// Netlify provides URL automatically (used for the OAuth redirect URI).

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

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

// --- Real backend: Gmail OAuth + Blobs persistence -----------------------
//
// This section replaces the prototype's in-memory state with a real
// backend. The engine above (triage / priority / draft / task / pipeline)
// is copied VERBATIM from the prototype and runs on the user's real
// Gmail messages, fetched via the Gmail API.
//
// AUTH — OAuth 2.0 authorization-code flow, refresh token required so
// reminders can run while the user is away:
//   GET /api/auth/start    -> 302 to Google's consent screen
//   GET /api/auth/callback -> exchanges code, stores refresh token in
//                             Netlify Blobs, creates a random session
//                             token, redirects to /?session=<token>.
//                             The frontend saves that token to
//                             localStorage and sends it as
//                             `Authorization: Bearer <token>` on every
//                             /api call (except the auth endpoints).
//   Session token -> user id mapping lives in Blobs; unknown token = 401.
//
// SCOPES — gmail.send is ONLY used for (a) a draft the user explicitly
// approves AND confirms in the UI, and (b) the reminder digest email to
// the user themself. Nothing is ever sent without the user's explicit
// approve + confirm, and nothing is ever deleted.
//
// STORAGE — Netlify Blobs, store "inbox-agent":
//   oauth-state:<token>      short-lived CSRF state (10 min)
//   user:<googleUserId>      {id, email, refreshToken, createdAt}
//   session:<token>          {userId, createdAt}
//   users:index              [userId, ...] (for the hourly reminder sweep)
//   run:<userId>             last pipeline run {results, tasks, counts,
//                             needs_you_now, meta, lastRunSeconds, ranAt}
//   draftstate:<userId>      {approved:{}, editedDrafts:{}, sent:{}}
//   settings:<userId>        reminder settings
//   reminded:<userId>:<hour> {at} — idempotency marker for /api/remind
//   mock-sent:<userId>       [recorded mock sends] (mock mode only)
//
// MOCK MODE — if env MOCK_GMAIL=true (local verification ONLY, never set
// in production): the Gmail fetcher returns the 20 seed emails shaped as
// Gmail API messages, token refresh returns a fake token, and the send
// path records the message instead of calling Google. Auth is also
// bypassed in mock mode (mock user "mock-user"). The OAuth *code
// exchange* is deliberately NOT mocked: a fake code must fail cleanly,
// because the real handshake cannot be tested locally.


const STORE_NAME = "inbox-agent";
const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

const isMock = () => process.env.MOCK_GMAIL === "true";

function siteUrl(req) {
  const base =
    process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin;
  return String(base).replace(/\/$/, "");
}

function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

// --- Blobs wrapper -------------------------------------------------------
// getStore() throws outside the Netlify functions runtime (e.g. plain
// `node` locally), so every op falls back to an in-memory store with the
// same get/set/delete/list shape. On Netlify the real store is used.
const _memoryStores = new Map();
function _memoryStore(name) {
  if (!_memoryStores.has(name)) _memoryStores.set(name, new Map());
  const m = _memoryStores.get(name);
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => void m.set(k, typeof v === "string" ? v : String(v)),
    delete: async (k) => void m.delete(k),
    list: async (opts = {}) => {
      const prefix = opts.prefix || "";
      return {
        blobs: [...m.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => ({ key: k })),
      };
    },
  };
}

function blobStore(name) {
  let real = null;
  let tried = false;
  const getReal = () => {
    if (!tried) {
      tried = true;
      try {
        real = getStore(name);
      } catch {
        real = null;
      }
    }
    return real;
  };
  const mem = _memoryStore(name);
  return {
    async get(key) {
      const r = getReal();
      if (r) {
        try {
          const v = await r.get(key);
          if (v !== null && v !== undefined) return v;
        } catch {
          /* fall through to memory */
        }
      }
      return mem.get(key);
    },
    async set(key, value) {
      const r = getReal();
      if (r) {
        try {
          await r.set(key, value);
          return;
        } catch {
          /* fall through to memory */
        }
      }
      return mem.set(key, value);
    },
    async delete(key) {
      const r = getReal();
      if (r) {
        try {
          await r.delete(key);
          return;
        } catch {
          /* fall through to memory */
        }
      }
      return mem.delete(key);
    },
    async list(opts) {
      const r = getReal();
      if (r) {
        try {
          return await r.list(opts);
        } catch {
          /* fall through to memory */
        }
      }
      return mem.list(opts);
    },
  };
}

const store = blobStore(STORE_NAME);

async function storeGetJSON(key) {
  const v = await store.get(key);
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
async function storeSetJSON(key, obj) {
  await store.set(key, JSON.stringify(obj));
}

async function addUserToIndex(userId) {
  const idx = (await storeGetJSON("users:index")) || [];
  if (!idx.includes(userId)) {
    idx.push(userId);
    await storeSetJSON("users:index", idx);
  }
}

// --- HTTP helpers ---------------------------------------------------------

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(title, message, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:sans-serif;max-width:560px;margin:40px auto">` +
      `<h1>${title}</h1><p>${message}</p>` +
      `<p><a href="/">Back to Inbox Agent</a></p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// --- Base64url helpers -----------------------------------------------------

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf-8");
}
function b64urlEncode(s) {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- Gmail message parsing -------------------------------------------------

function gmailHeader(msg, name) {
  const h = (msg.payload?.headers || []).find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h ? h.value : "";
}

function findTextPart(part) {
  if (!part) return null;
  if (part.mimeType === "text/plain" && part.body?.data) return part.body.data;
  for (const p of part.parts || []) {
    const found = findTextPart(p);
    if (found) return found;
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
// Engine's parseDate expects "YYYY-MM-DDTHH:MM:SS" (naive local).
function toEngineDate(dateRaw) {
  const d = dateRaw ? new Date(dateRaw) : new Date();
  const dt = Number.isNaN(d.getTime()) ? new Date() : d;
  return (
    dt.getFullYear() +
    "-" +
    pad2(dt.getMonth() + 1) +
    "-" +
    pad2(dt.getDate()) +
    "T" +
    pad2(dt.getHours()) +
    ":" +
    pad2(dt.getMinutes()) +
    ":" +
    pad2(dt.getSeconds())
  );
}

function extractAddr(fromRaw) {
  const m = /<([^>]+)>/.exec(fromRaw || "");
  return m ? m[1].trim() : (fromRaw || "").trim();
}
function extractName(fromRaw) {
  const m = /^"?([^"<]+)"?\s*<[^>]+>/.exec(fromRaw || "");
  return m ? m[1].trim() : "";
}

// Convert one Gmail API message (format=full) into the engine's email
// shape plus thread/message metadata (kept out of the engine shape and
// stored alongside the run, for replies).
function parseGmailMessage(msg) {
  const fromRaw = gmailHeader(msg, "From") || "";
  const data = findTextPart(msg.payload);
  const body = data ? b64urlDecode(data) : msg.snippet || "";
  return {
    email: {
      id: msg.id,
      subject: gmailHeader(msg, "Subject") || "(no subject)",
      body,
      from: extractAddr(fromRaw),
      from_name: extractName(fromRaw),
      date: toEngineDate(gmailHeader(msg, "Date")),
    },
    meta: {
      threadId: msg.threadId || null,
      messageId: gmailHeader(msg, "Message-ID") || null,
      references: gmailHeader(msg, "References") || null,
    },
  };
}

// --- Mock Gmail (MOCK_GMAIL=true only) ------------------------------------
// Seed emails shaped as Gmail API messages, so they flow through the
// exact same parseGmailMessage converter as real Gmail messages.
function mockGmailMessage(e) {
  const date = new Date(e.date).toUTCString();
  return {
    id: e.id,
    threadId: "thread-" + e.id,
    snippet: e.body.slice(0, 100),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: e.subject },
        {
          name: "From",
          value: e.from_name ? `${e.from_name} <${e.from}>` : e.from,
        },
        { name: "Date", value: date },
        { name: "Message-ID", value: `<${e.id}@mock.inbox-agent>` },
      ],
      body: { data: b64urlEncode(e.body) },
    },
  };
}

// --- Google token helpers --------------------------------------------------

async function exchangeCode(code, redirectUri) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || `token exchange failed (${res.status})`,
    );
  }
  return data;
}

async function refreshAccessToken(refreshToken) {
  if (isMock()) return "mock-access-token";
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || `token refresh failed (${res.status})`,
    );
  }
  return data.access_token;
}

// --- Gmail fetching ---------------------------------------------------------

async function gmailApi(accessToken, path, options = {}) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gmail API ${path} failed (${res.status})`);
  }
  return data;
}

// Returns [{email, meta}, ...] — the engine shape plus reply metadata.
async function fetchInbox(user) {
  if (isMock()) {
    return EMAILS.map((e) => parseGmailMessage(mockGmailMessage(e)));
  }
  const accessToken = await refreshAccessToken(user.refreshToken);
  const list = await gmailApi(
    accessToken,
    `/users/me/messages?maxResults=50&q=${encodeURIComponent("in:inbox")}`,
  );
  const messages = list.messages || [];
  const out = [];
  for (const m of messages) {
    const full = await gmailApi(
      accessToken,
      `/users/me/messages/${encodeURIComponent(m.id)}?format=full`,
    );
    out.push(parseGmailMessage(full));
  }
  return out;
}

// --- Pipeline run + per-user state -------------------------------------------

async function runPipelineForUser(user) {
  const start = Date.now();
  const fetched = await fetchInbox(user);
  const emails = fetched.map((f) => f.email);
  const result = runPipeline(emails);
  const meta = {};
  for (const f of fetched) meta[f.email.id] = f.meta;
  const record = {
    ...result,
    meta,
    lastRunSeconds: Math.round((Date.now() - start) / 10) / 100,
    ranAt: new Date().toISOString(),
  };
  await storeSetJSON(`run:${user.id}`, record);
  return record;
}

async function getStoredRun(userId) {
  return storeGetJSON(`run:${userId}`);
}

async function ensureRun(user) {
  const stored = await getStoredRun(user.id);
  if (stored) return stored;
  return runPipelineForUser(user);
}

async function getDraftState(userId) {
  return (
    (await storeGetJSON(`draftstate:${userId}`)) || {
      approved: {},
      editedDrafts: {},
      sent: {},
    }
  );
}
async function setDraftState(userId, s) {
  await storeSetJSON(`draftstate:${userId}`, s);
}

function withDraftState(result, draftState) {
  return result.results.map((r) => {
    const out = { ...r };
    if (r.id in draftState.editedDrafts) out.draft = draftState.editedDrafts[r.id];
    out.approved = !!draftState.approved[r.id];
    out.sent = !!draftState.sent[r.id];
    return out;
  });
}

// --- Auth -------------------------------------------------------------------

const MOCK_USER = { id: "mock-user", email: "mock@example.test", refreshToken: "mock-refresh" };

// Returns {user, userId} or null. In mock mode (local verification only)
// any request acts as the mock user — production mode requires a valid
// session token.
async function getAuth(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (token) {
    const session = await storeGetJSON(`session:${token}`);
    if (session?.userId) {
      const user = await storeGetJSON(`user:${session.userId}`);
      if (user) return { user, userId: session.userId };
    }
  }
  if (isMock()) {
    return { user: MOCK_USER, userId: "mock-user" };
  }
  return null;
}

async function requireAuth(req) {
  const auth = await getAuth(req);
  if (!auth) return { error: jsonResponse({ detail: "Not signed in — connect Gmail first." }, 401) };
  return { auth };
}

// --- Sending ------------------------------------------------------------------
// Mock mode records the message instead of calling Google.
const mockSent = [];

async function sendGmailRaw(user, accessToken, { to, subject, body, threadId, inReplyTo, references }) {
  if (isMock()) {
    const record = {
      to,
      subject,
      body,
      threadId: threadId || null,
      messageId: "mock-" + crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    mockSent.push(record);
    const prev = (await storeGetJSON(`mock-sent:${user.id}`)) || [];
    prev.push(record);
    await storeSetJSON(`mock-sent:${user.id}`, prev);
    return { id: record.messageId, mock: true };
  }
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  else if (inReplyTo) lines.push(`References: ${inReplyTo}`);
  const raw = b64urlEncode(lines.join("\r\n") + "\r\n\r\n" + body);
  const data = await gmailApi(accessToken, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });
  return { id: data.id, mock: false };
}

// --- Reminders -----------------------------------------------------------------

function nowPartsInTz(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour, minute: parts.minute };
}

const DEFAULT_SETTINGS = {
  frequency: 1,
  hours: ["09:00"],
  timezone: "Asia/Kolkata",
  enabled: false,
};

function validateSettings(body) {
  if (!body || typeof body !== "object") return "Settings must be a JSON object.";
  const { frequency, hours, timezone, enabled } = body;
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 5) {
    return "frequency must be an integer from 1 to 5.";
  }
  if (!Array.isArray(hours) || hours.length !== frequency) {
    return "hours must be an array with exactly `frequency` entries.";
  }
  for (const h of hours) {
    if (typeof h !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) {
      return `each hour must be a valid "HH:MM" string (got ${JSON.stringify(h)}).`;
    }
  }
  if (typeof timezone !== "string" || !timezone) return "timezone must be a non-empty string.";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return `unknown timezone: ${timezone}`;
  }
  if (typeof enabled !== "boolean") return "enabled must be a boolean.";
  return null;
}

// --- Routes ---------------------------------------------------------------------

const EMAIL_RE = /^\/api\/emails\/([^/]+)$/;
const APPROVE_RE = /^\/api\/drafts\/([^/]+)\/approve$/;
const EDIT_RE = /^\/api\/drafts\/([^/]+)\/edit$/;
const SEND_RE = /^\/api\/drafts\/([^/]+)\/send$/;

function isKnownPath(path) {
  return (
    path === "/api/status" ||
    path === "/api/run" ||
    path === "/api/emails" ||
    path === "/api/tasks" ||
    path === "/api/auth/start" ||
    path === "/api/auth/callback" ||
    path === "/api/auth/disconnect" ||
    path === "/api/reminders/settings" ||
    path === "/api/remind" ||
    EMAIL_RE.test(path) ||
    APPROVE_RE.test(path) ||
    EDIT_RE.test(path) ||
    SEND_RE.test(path)
  );
}

export default async (req) => {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  const method = req.method;

  // --- OAuth: start ---
  if (method === "GET" && path === "/api/auth/start") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return jsonResponse({ detail: "Google OAuth is not configured on this site (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)." }, 500);
    }
    const redirectUri = siteUrl(req) + "/api/auth/callback";
    const state = randomToken();
    await storeSetJSON(`oauth-state:${state}`, { createdAt: Date.now() });
    const authUrl = new URL(OAUTH_AUTH_URL);
    authUrl.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: `${GMAIL_READONLY} ${GMAIL_SEND}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
  }

  // --- OAuth: callback ---
  if (method === "GET" && path === "/api/auth/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err = url.searchParams.get("error");
    if (err) {
      return htmlResponse("Google sign-in failed", `Google returned an error: ${err}. Please try connecting again.`, 400);
    }
    if (!code || !state) {
      return htmlResponse("Google sign-in failed", "Missing code or state in the callback. Please try connecting again.", 400);
    }
    const saved = await storeGetJSON(`oauth-state:${state}`);
    await store.delete(`oauth-state:${state}`);
    if (!saved || Date.now() - saved.createdAt > 10 * 60 * 1000) {
      return htmlResponse("Google sign-in failed", "Invalid or expired sign-in attempt (state mismatch). Please try connecting again.", 400);
    }
    const redirectUri = siteUrl(req) + "/api/auth/callback";
    let tokens;
    try {
      tokens = await exchangeCode(code, redirectUri);
    } catch (e) {
      return htmlResponse("Google sign-in failed", `Could not exchange the sign-in code: ${e.message}. Please try connecting again.`, 400);
    }
    if (!tokens.refresh_token) {
      return htmlResponse("Google sign-in failed", "Google did not return a refresh token. Please disconnect the app in your Google account and try again (offline access is required).", 400);
    }
    // Identify the user: Gmail profile first, OpenID userinfo as fallback.
    let googleId = null;
    let email = null;
    try {
      const profile = await gmailApi(tokens.access_token, "/users/me/profile");
      email = profile.emailAddress || null;
      googleId = email;
    } catch {
      /* try userinfo below */
    }
    if (!email) {
      try {
        const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const info = await res.json().catch(() => ({}));
        if (res.ok && info.sub) {
          googleId = info.sub;
          email = info.email || null;
        }
      } catch {
        /* fall through to error below */
      }
    }
    if (!googleId || !email) {
      return htmlResponse("Google sign-in failed", "Signed in, but the account email could not be read. Please try connecting again.", 400);
    }
    const user = { id: googleId, email, refreshToken: tokens.refresh_token, createdAt: Date.now() };
    await storeSetJSON(`user:${user.id}`, user);
    await addUserToIndex(user.id);
    const sessionToken = randomToken();
    await storeSetJSON(`session:${sessionToken}`, { userId: user.id, createdAt: Date.now() });
    // Session token travels as a query param (plus the account email, so
    // the frontend can show it immediately); the frontend saves the token
    // to localStorage and sends it as Authorization: Bearer on every call.
    return new Response(null, {
      status: 302,
      headers: {
        Location:
          siteUrl(req) +
          "/?session=" +
          encodeURIComponent(sessionToken) +
          "&email=" +
          encodeURIComponent(email),
      },
    });
  }

  // --- OAuth: disconnect (delete the session server-side) ---
  if (method === "POST" && path === "/api/auth/disconnect") {
    const h = req.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
    if (token) await store.delete(`session:${token}`);
    return jsonResponse({ disconnected: true });
  }

  // --- Status (auth optional: reports connected + email when signed in) ---
  if (method === "GET" && path === "/api/status") {
    const auth = await getAuth(req);
    const run = auth ? await getStoredRun(auth.userId) : null;
    return jsonResponse({
      engine: "deterministic rules only (no LLM)",
      llm_available: false,
      total_emails: run ? run.total : 0,
      last_run_seconds: run ? run.lastRunSeconds : null,
      note: "Real Gmail via OAuth. Drafts are only sent after you approve AND confirm them; nothing is deleted.",
      connected: !!auth,
      email: auth ? auth.user.email : null,
    });
  }

  // --- Run pipeline over the real inbox ---
  if (method === "POST" && path === "/api/run") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await runPipelineForUser(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    return jsonResponse({
      counts: result.counts,
      total: result.total,
      drafts_written: result.drafts_written,
      tasks_found: result.tasks.length,
      needs_you_now: result.needs_you_now,
      seconds: result.lastRunSeconds,
      engine: "deterministic",
    });
  }

  // --- Emails list ---
  if (method === "GET" && path === "/api/emails") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await ensureRun(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    const draftState = await getDraftState(auth.userId);
    let emails = withDraftState(result, draftState);
    const category = url.searchParams.get("category") || "";
    if (category) emails = emails.filter((r) => r.category === category);
    return jsonResponse({ emails, counts: result.counts });
  }

  // --- Email detail ---
  const emailMatch = EMAIL_RE.exec(path);
  if (method === "GET" && emailMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await ensureRun(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    const id = decodeURIComponent(emailMatch[1]);
    const draftState = await getDraftState(auth.userId);
    const found = withDraftState(result, draftState).find((r) => r.id === id);
    if (!found) return jsonResponse({ detail: "email not found" }, 404);
    return jsonResponse(found);
  }

  // --- Tasks ---
  if (method === "GET" && path === "/api/tasks") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await ensureRun(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    return jsonResponse({ tasks: result.tasks, count: result.tasks.length });
  }

  // --- Approve draft (local state only) ---
  const approveMatch = APPROVE_RE.exec(path);
  if (method === "POST" && approveMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    const id = decodeURIComponent(approveMatch[1]);
    const draftState = await getDraftState(auth.userId);
    draftState.approved[id] = true;
    await setDraftState(auth.userId, draftState);
    return jsonResponse({ id, approved: true, note: "Approved locally — nothing was sent. Confirm in the UI to send." });
  }

  // --- Edit draft (local state only) ---
  const editMatch = EDIT_RE.exec(path);
  if (method === "POST" && editMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    const id = decodeURIComponent(editMatch[1]);
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ detail: "Invalid JSON" }, 422);
    }
    if (typeof body.text !== "string") {
      return jsonResponse({ detail: "Expected JSON {text: string}" }, 422);
    }
    const draftState = await getDraftState(auth.userId);
    draftState.editedDrafts[id] = body.text;
    await setDraftState(auth.userId, draftState);
    return jsonResponse({ id, edited: true, note: "Local state only — nothing was sent." });
  }

  // --- Send draft: ONLY approved AND explicitly confirmed ---
  const sendMatch = SEND_RE.exec(path);
  if (method === "POST" && sendMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    const id = decodeURIComponent(sendMatch[1]);
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const draftState = await getDraftState(auth.userId);
    if (!draftState.approved[id]) {
      return jsonResponse({ detail: "Draft must be approved first (POST /api/drafts/:id/approve)." }, 400);
    }
    if (body.confirmed !== true) {
      return jsonResponse({ detail: "Send requires explicit confirmation: POST {confirmed: true}." }, 400);
    }
    let result;
    try {
      result = await ensureRun(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    const found = result.results.find((r) => r.id === id);
    if (!found) return jsonResponse({ detail: "email not found" }, 404);
    const draftText = draftState.editedDrafts[id] || found.draft;
    if (!draftText) {
      return jsonResponse({ detail: "No draft text for this email — nothing to send." }, 400);
    }
    const meta = (result.meta || {})[id] || {};
    const to = extractAddr(found.from);
    let sent;
    try {
      const accessToken = await refreshAccessToken(auth.user.refreshToken);
      sent = await sendGmailRaw(auth.user, accessToken, {
        to,
        subject: `Re: ${found.subject}`,
        body: draftText,
        threadId: meta.threadId || null,
        inReplyTo: meta.messageId || null,
        references: meta.references || null,
      });
    } catch (e) {
      return jsonResponse({ detail: `Send failed: ${e.message}` }, 502);
    }
    draftState.sent[id] = true;
    await setDraftState(auth.userId, draftState);
    return jsonResponse({ id, sent: true, messageId: sent.id, ...(sent.mock ? { mock: true } : {}) });
  }

  // --- Reminder settings ---
  if (path === "/api/reminders/settings") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    if (method === "GET") {
      const saved = await storeGetJSON(`settings:${auth.userId}`);
      return jsonResponse(saved || DEFAULT_SETTINGS);
    }
    if (method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ detail: "Invalid JSON" }, 422);
      }
      const problem = validateSettings(body);
      if (problem) return jsonResponse({ detail: problem }, 422);
      const settings = {
        frequency: body.frequency,
        hours: body.hours,
        timezone: body.timezone,
        enabled: body.enabled,
      };
      await storeSetJSON(`settings:${auth.userId}`, settings);
      await addUserToIndex(auth.userId);
      return jsonResponse(settings);
    }
  }

  // --- Hourly reminder sweep (called by GitHub Actions cron) ---
  if (method === "POST" && path === "/api/remind") {
    if (!process.env.REMIND_SECRET) {
      return jsonResponse({ detail: "REMIND_SECRET is not configured on this site." }, 500);
    }
    if (req.headers.get("x-remind-secret") !== process.env.REMIND_SECRET) {
      return jsonResponse({ detail: "Unauthorized" }, 401);
    }
    const userIds = (await storeGetJSON("users:index")) || [];
    const reminded = [];
    for (const userId of userIds) {
      try {
        let user = await storeGetJSON(`user:${userId}`);
        // Mock user is synthesized, never stored — resolve it here too.
        if (!user && isMock() && userId === MOCK_USER.id) user = MOCK_USER;
        const settings = await storeGetJSON(`settings:${userId}`);
        if (!user || !settings?.enabled) continue;
        const tz = settings.timezone || "Asia/Kolkata";
        const now = nowPartsInTz(tz);
        const hourKey = `${now.date}T${now.hour}`;
        const matches = (settings.hours || []).some((h) => h.split(":")[0] === now.hour);
        if (!matches) continue;
        // Idempotent per hour: skip users already reminded this hour.
        if (await storeGetJSON(`reminded:${userId}:${hourKey}`)) continue;
        const result = await runPipelineForUser(user);
        const dueToday = result.tasks.filter((t) => t.due <= now.date);
        const bodyLines = [
          "Hi,",
          "",
          "Your inbox, sorted:",
          `- ${result.counts.urgent} urgent`,
          `- ${result.counts.action} need action`,
          `- ${dueToday.length} task(s) due today or overdue`,
          `- ${result.tasks.length} tasks total`,
          "",
          `Open Inbox Agent: ${siteUrl(req)}/`,
          "",
          "— Inbox Agent (you asked for this reminder; turn it off in Settings)",
        ];
        const accessToken = await refreshAccessToken(user.refreshToken);
        await sendGmailRaw(user, accessToken, {
          to: user.email,
          subject: "Inbox Agent: check your sorted mail",
          body: bodyLines.join("\n"),
          threadId: null,
          inReplyTo: null,
          references: null,
        });
        await storeSetJSON(`reminded:${userId}:${hourKey}`, { at: new Date().toISOString() });
        reminded.push(user.email);
      } catch (e) {
        console.error(`remind failed for ${userId}:`, e.message);
      }
    }
    return jsonResponse({ reminded });
  }

  if (isKnownPath(path)) {
    return jsonResponse({ detail: "Method Not Allowed" }, 405);
  }
  return jsonResponse({ detail: "Not Found" }, 404);
};

export const config = { path: "/api/*" };
