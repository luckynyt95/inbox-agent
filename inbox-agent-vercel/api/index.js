// Inbox Agent (v1, real) — Vercel Functions (Node.js runtime), plain JavaScript.
// One file, zero dependencies except @vercel/blob (server-side storage;
// see package.json). No build step. No Python.
// Deployed as a single Vercel Function at api/index.js handling all
// /api/* routes (see vercel.json for the rewrite); the entry point is
// the fetch Web Standard export at the bottom of this file.
// Ported from the original single-file backend: same engine, auth,
// reminders and per-user state — only the runtime wiring and the
// storage backend changed (see the Vercel Blob wrapper below).
//
// The engine (triage / priority / draft / task / pipeline) and the 20 seed
// emails below are copied VERBATIM from the verified prototype
// — EXCEPT the
// Draft Agent's trigger groups, tightened 13 Nov 2026 (see the
// ANTI-FABRICATION RULE above DRAFT_TEMPLATES): the bare "sign" trigger
// attached a vendor-agreement reply to real security-alert / activation /
// verification emails. Triage, priority and task logic remain verbatim.
// The seed data is used ONLY by the mock Gmail fetcher (MOCK_GMAIL=true, local
// verification); the real app runs the engine on the user's Gmail messages
// fetched via OAuth + the Gmail API.
//
// Env vars required:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — Google OAuth web client
//   REMIND_SECRET — shared secret for POST /api/remind (GitHub Actions)
//   BLOB_READ_WRITE_TOKEN — Vercel Blob read-write token (or connect the
//     Blob store for OIDC: VERCEL_OIDC_TOKEN + BLOB_STORE_ID, which
//     Vercel provides automatically; the SDK prefers OIDC when present)
//   MOCK_GMAIL=true — local verification only; never set in production
// Vercel provides VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL automatically
// (used for the OAuth redirect URI — see siteUrl()).

import { put as blobPut, get as blobGet, del as blobDel, list as blobList } from "@vercel/blob";
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
//
// ANTI-FABRICATION RULE (fixed 13 Nov 2026): every template below asserts
// specific facts (a date, an amount, a name, a site), so its trigger group
// must include those facts. A bare word like "sign" used to match ANY
// email containing "sign in" — security alerts, account activations,
// email verifications — and attach a vendor-agreement reply that was
// wrong for all of them. If no group matches, draft() returns null and
// the UI shows "no draft" instead of a made-up reply.
const DRAFT_TEMPLATES = [
  [[["rescheduled", "interview", "13 nov", "10:00"]], "Hi,\n\nThanks for the update. Confirming I will attend the rescheduled interview tomorrow, 13 Nov, at 10:00 AM, and I will carry my resume and ID card.\n\nThanks,\nRonnie"],
  [[["approve", "leave", "16 nov"]], "Hi,\n\nApproved — your leave from 14 to 16 Nov is fine. Thanks for sorting the handover.\n\nThanks,\nRonnie"],
  [[["confirm your order", "steel brackets"]], "Hi,\n\nConfirming the order of 50 steel brackets. Please go ahead with cutting.\n\nThanks,\nRonnie"],
  [[["sign", "vendor agreement", "15 nov"]], "Hi,\n\nI have signed the vendor agreement and will send the signed copy back by 15 Nov 2026.\n\nThanks,\nRonnie"],
  [[["website", "down", "shopdemo.in", "2 am"], ["outage", "shopdemo.in"]], "Hi team,\n\nOur website shopdemo.in appears to be down since 2 AM and customers cannot place orders. Could you please share an ETA for fixing it?\n\nThanks,\nRonnie"],
  [[["semester fee", "48,500", "15 nov"]], "Hi,\n\nI will pay the semester fee of Rs 48,500 by 15 Nov 2026 through the fee portal. Please confirm once it is received.\n\nThanks,\nRonnie"],
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

// --- Collections ---------------------------------------------------------
// COLLECTIONS PRECEDENCE (highest first — first match wins):
//   government > work-institute > shopping > apps > tech-brands > other
// Collection is presentation-only: it never feeds triage, priority,
// drafts or tasks, so triage counts cannot change because of it.
function domainOf(addr) {
  const m = /@([^@\s>]+)/.exec(addr || "");
  return m ? m[1].toLowerCase().replace(/>$/, "") : "";
}
function domainHas(domain, ...tokens) {
  return tokens.some((t) => domain === t || domain.endsWith("." + t) || domain.includes(t));
}

const SHOPPING_DOMAINS = [
  "blinkit", "zomato", "amazon", "instamart", "swiggy", "zepto", "meesho",
  "snapdeal", "bigbasket", "jiomart", "decathlon", "myntra", "ajio", "nykaa",
  "walmart", "flipkart", "hm.com", "zara", "uniqlo", "shopify", "ebay",
  "aliexpress", "shein", "nike", "adidas", "puma", "lenskart", "firstcry",
  "licious", "dunzo", "dominos", "pizza hut", "kfc", "burger king", "mcdonald",
  "ola foods", "eatfit", "freshmenu", "grofers", "dmart", "reliance retail",
  "tatacliq", "croma", "vijay sales", "pepperfry", "urban ladder", "ikea",
  "lifestyle", "shoppers stop", "max fashion", "westside", "bata", "clovia",
  "purplle", "mamaearth", "pharmeasy", "1mg", "netmeds", "apollo pharmacy",
];
const SHOPPING_WORDS = [
  "blinkit", "zomato", "amazon", "instamart", "swiggy", "zepto", "meesho",
  "snapdeal", "bigbasket", "jiomart", "decathlon", "myntra", "ajio", "nykaa",
  "walmart", "flipkart", "order shipped", "order delivered", "order placed",
  "order has been shipped", "order is out for delivery", "tracking id",
  "track your order", "your refund", "refund processed", "cashback",
  "free delivery", "50% off", "% off", "big sale", "sale ends", "festive offer",
  "food delivery", "order now", "shop now", "add to cart",
];
const APP_DOMAINS = [
  "linkedin", "codeforces", "codechef", "hackerrank", "leetcode", "dukaan",
  "cashfree", "netlify", "render", "vercel", "github", "gitlab", "bitbucket",
  "slack", "notion", "figma", "zoom", "dropbox", "spotify", "canva", "atlassian",
  "jira", "trello", "asana", "monday", "hubspot", "salesforce", "stripe",
  "razorpay", "paytm", "phonepe", "gpay", "googlepay", "epic", "steam",
  "discord", "telegram", "whatsapp", "calendly", "airtable", "zapier",
  "heroku", "digitalocean", "aws", "azure", "firebase", "supabase",
  "clouddemo", "hostdemo",
];
const APP_WORDS = [
  "subscription", "your plan", "upgrade your plan", "trial ending",
  "trial expires", "hosting dashboard", "server down", "website is down",
  "outage", "deployment", "build failed", "build succeeded", "new sign-in",
  "security alert", "verify your email", "confirm your email",
  "password reset", "reset your password", "welcome to",
];
const TECH_DOMAINS = [
  "techcrunch", "theverge", "wired", "arstechnica", "hackernews", "ycombinator",
  "openai", "anthropic", "google", "microsoft", "apple", "samsung", "intel",
  "nvidia", "meta", "tesla", "producthunt", "stackoverflow", "medium",
  "substack", "techweekly",
];
const TECH_WORDS = [
  "tech news", "weekly roundup", "newsletter", "tech weekly", "new chip",
  "ai agents", "sponsor", "sponsored",
];

function classifyCollection(from, subject, body) {
  const addr = (from || "").toLowerCase();
  const domain = domainOf(addr);
  const text = ((subject || "") + " " + (body || "")).toLowerCase();
  const hasAny = (words) => words.some((w) => text.includes(w) || addr.includes(w));
  // 1. Government — govt domains, NSP scholarships, official govt mail.
  if (
    domain.endsWith(".gov.in") || domain.endsWith(".nic.in") ||
    domain.includes("gov.in") || domain.includes("govt") ||
    domainHas(domain, "uidai", "passportindia", "incometax", "epfindia", "mygov") ||
    /\bnsp\b/.test(text) || text.includes("national scholarship") ||
    text.includes("national scholarship portal") ||
    text.includes("government of india") || text.includes("govt of india") ||
    text.includes("passport seva") || text.includes("aadhaar")
  ) {
    return "government";
  }
  // 2. Work & Institute — college/institute domains, internships,
  // placements, opportunities.
  if (
    domain.endsWith(".edu") || domain.endsWith(".edu.in") ||
    domain.endsWith(".ac.in") || domain.endsWith(".ac.uk") ||
    domainHas(domain, "iitb.ac.in", "iit", "nit", "university", "college", "institute") ||
    text.includes("internship") || text.includes("placement") ||
    text.includes("job opportunity") || text.includes("career opportunity")
  ) {
    return "work-institute";
  }
  // 3. Shopping — shopping / food-delivery / clothing senders.
  if (domainHas(domain, ...SHOPPING_DOMAINS) || hasAny(SHOPPING_WORDS)) {
    return "shopping";
  }
  // 4. Apps — notifications from apps / services.
  if (domainHas(domain, ...APP_DOMAINS) || hasAny(APP_WORDS)) {
    return "apps";
  }
  // 5. Tech & Brands — tech-company mail, brand newsletters, sponsors.
  if (domainHas(domain, ...TECH_DOMAINS) || hasAny(TECH_WORDS)) {
    return "tech-brands";
  }
  return "other";
}

// --- Real backend: Gmail OAuth + Vercel Blob persistence ------------------
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
//                             Vercel Blob, creates a random session
//                             token, redirects to /?session=<token>.
//                             The frontend saves that token to
//                             localStorage and sends it as
//                             `Authorization: Bearer <token>` on every
//                             /api call (except the auth endpoints).
//   Session token -> user id mapping lives in Vercel Blob; unknown token = 401.
//
// SCOPES — a SINGLE scope constant (one-line changeable). gmail.modify
// supersedes gmail.readonly + gmail.send for this app: it grants read,
// send, and label modification (needed for mark-as-read/unread), but NOT
// delete — nothing is ever deleted. A separate verification against
// Google's docs is confirming that modify covers readonly+send; if it
// ever says otherwise, change OAUTH_SCOPES below and bump SCOPE_VERSION.
//   v1 = readonly + send (tokens stored before this change)
//   v2 = gmail.modify only (current)
// Stored per user as user.scopeVersion; /api/status reports
// needsReconnect when the stored version is older — as a prompt only,
// never by breaking the existing connection (read/send keep working
// on v1 tokens; only mark-as-read returns 409 until reconnect).
const SCOPE_VERSION = 2;
const OAUTH_SCOPES = "https://www.googleapis.com/auth/gmail.modify";
//
// STORAGE — Vercel Blob (private store; keys are mapped to pathnames
// with ':' -> '/', see the wrapper below — the keys listed here are the
// logical keys the code uses; the stored pathname is the key with every
// ':' replaced by '/'):
//   oauth-state:<token>      short-lived CSRF state (30 min TTL, see
//                             OAUTH_STATE_TTL_MS below)
//   user:<googleUserId>      {id, email, refreshToken, createdAt}
//   session:<token>          {userId, createdAt}
//   users:index              [userId, ...] (for the hourly reminder sweep)
//   run:<userId>             last pipeline run {results, tasks, counts,
//                             needs_you_now, meta, lastRunSeconds, ranAt}
//   cached:<userId>          last successful run summary {counts, total,
//                             needsYouNow, lastRunAt} (for /api/status)
//   draftstate:<userId>      {approved:{}, editedDrafts:{}, sent:{}}
//   readstate:<userId>       {emailId: bool} — read/unread overrides
//   dolater:<userId>         [emailId, ...] — deferred ("do later") ids
//   settings:<userId>        reminder settings (canonical shape)
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


const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

// CSRF state TTL: 30 minutes. Google's round-trip is slow when phone
// verification is involved (tap Yes + a number on the phone), and a
// 10-minute TTL expired on real users (13 Nov 2026, twice: once after
// ~1 hour, once while switching accounts) even though the flow was
// legitimate — the user landed on "state mismatch" with no recourse.
// 30 minutes still bounds replay risk: the state is single-use
// (deleted on first callback) and unguessable (2 UUIDs).
const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

const isMock = () => process.env.MOCK_GMAIL === "true";

function siteUrl(req) {
  // Vercel provides deployment hostnames WITHOUT a scheme:
  //   VERCEL_PROJECT_PRODUCTION_URL — the project's production domain
  //     (shortest production custom domain, else the .vercel.app
  //     domain; always set, even on preview deployments — this is the
  //     host the OAuth redirect URI is registered under in Google
  //     Cloud Console, so it is the stable choice for redirect URIs)
  //   VERCEL_URL — this deployment's own URL (on a production deploy
  //     it is the production domain; on a preview it is the preview
  //     URL, which Google has not registered — only a fallback)
  // Fall back to the request origin (local `vercel dev`, where neither
  // var is set). The "https://" prefix is added here because neither
  // Vercel var carries a scheme.
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null;
  const base = host
    ? "https://" + String(host).replace(/^https?:\/\//, "").replace(/\/$/, "")
    : new URL(req.url).origin;
  return String(base).replace(/\/$/, "");
}

function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

// --- Vercel Blob wrapper ---------------------------------------------------
// STORAGE — Vercel Blob (private store, connected to this project).
// The SDK resolves credentials itself, in this order: an explicit token
// option (never used here), OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID,
// issued by Vercel on every deployment), then BLOB_READ_WRITE_TOKEN
// (a long-lived token, added only when "Add a read-write token env var
// to this connection" is selected in the dashboard). No credential value
// ever appears in code; the names above are the only env vars involved.
//
// KEY -> PATHNAME MAPPING — the store keys use ':' as a separator
// (oauth-state:<token>, session:<token>, reminded:<id>:<hour>, ...).
// A ':' is legal in a URL path segment but fragile across CDNs and SDK
// URL handling, so keys are stored with ':' mapped to '/':
//   oauth-state:<token>  -> oauth-state/<token>
//   session:<token>      -> session/<token>
//   user:<id>            -> user/<id>
//   reminded:<id>:<hour> -> reminded/<id>/<hour>
//   users:index          -> users/index
// The mapping is reversible (no key in this app ever contains '/':
// user ids are Google emails / numeric ids, tokens are UUIDs + hex,
// hour keys are YYYY-MM-DDTHH), so list() can map pathnames back to
// the original keys and the wrapper's external interface is identical
// to the old one: get/set/delete take a key; list({prefix}) returns
// {blobs: [{key}]} filtered by key prefix. Prefix safety is preserved:
// prefix "session:" becomes "session/", which cannot match a key like
// "sessionX..."; prefix "reminded:<id>:" becomes "reminded/<id>/",
// which cannot match another user's "reminded/<other-id>/..." blobs.
//
// THREE VERCEL BLOB BEHAVIOURS THE WRAPPER DEPENDS ON (verified
// against the @vercel/blob JS SDK reference, 13 Nov 2026):
//   put(pathname, body, {access:'private', allowOverwrite:true}) —
//     put() REFUSES to overwrite an existing pathname by default, so
//     every write passes allowOverwrite:true (sessions, runs and
//     settings are rewritten constantly).
//   get(urlOrPathname, {access:'private', useCache:false}) — returns
//     null when the blob does not exist, else {statusCode, stream, ...}.
//     useCache:false is REQUIRED here: the default (true) serves reads
//     from the CDN cache, and a stale read right after a write would
//     resurrect the session bug (auth-start writes the OAuth state,
//     then reads it back to prove it persisted; callback does the
//     same for the session token).
//   del(urlOrPathname) — accepts a pathname as well as a URL, and does
//     NOT throw when the blob does not exist (same as the old delete).
//   list({prefix}) — prefix filters on the pathname; returns
//     {blobs:[{pathname, url, ...}], hasMore, cursor}. The wrapper
//     follows cursors (default page is 1000) and maps each pathname
//     back to its original key.
//
// ROOT CAUSE (fixed 13 Nov 2026 — "Session expired" seconds after a
// successful Google sign-in): the old wrapper silently fell back to a
// module-level in-memory Map whenever the real store threw or was
// unavailable. A session written on one function instance was then
// invisible to every other instance, so the callback's redirect handed
// the browser a token that existed only in the callback instance's
// memory — the very next API call 401'd, and the pre-existing
// connection died on every deploy / instance recycle.
// The fix is kept verbatim in spirit: in production the real store is
// mandatory. If it is unavailable, operations throw loudly (and the
// cause is logged to the function logs) instead of creating sessions
// that can never be read back. The memory fallback survives ONLY in
// mock mode (MOCK_GMAIL=true), where no Vercel Blob credentials are
// configured locally and local verification needs it.

const BLOB_ACCESS = "private";

// The store is selected by the connected Blob store (BLOB_STORE_ID /
// BLOB_READ_WRITE_TOKEN env vars) — Vercel Blob has no per-call store
// name, so there is no STORE_NAME constant any more.
function keyToPathname(key) {
  return String(key).replaceAll(":", "/");
}
function pathnameToKey(pathname) {
  return String(pathname).replaceAll("/", ":");
}

const _memoryStoreMap = new Map();
function _memoryStore() {
  if (!_memoryStoreMap.has("store")) _memoryStoreMap.set("store", new Map());
  const m = _memoryStoreMap.get("store");
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

// Fail loudly when no Blob credentials are configured. The SDK would
// throw on first use anyway; this preflight gives the specific,
// actionable error (and logs it once per instance) instead of a
// generic SDK error mid-request.
let _blobUnavailableLogged = false;
function assertBlobConfigured() {
  const hasReadWriteToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  const hasOidc = !!process.env.VERCEL_OIDC_TOKEN && !!process.env.BLOB_STORE_ID;
  if (hasReadWriteToken || hasOidc) return;
  if (!_blobUnavailableLogged) {
    _blobUnavailableLogged = true;
    console.error(
      "[inbox-agent] Vercel Blob unavailable: neither BLOB_READ_WRITE_TOKEN nor VERCEL_OIDC_TOKEN + BLOB_STORE_ID is set (connect a Blob store to this project).",
    );
  }
  throw new Error(
    "Blob store unavailable (no Vercel Blob credentials configured: set BLOB_READ_WRITE_TOKEN or connect a Blob store for OIDC)",
  );
}

// Production store: real Vercel Blob only. Any failure is logged and
// rethrown — never silently served from per-instance memory.
function realBackedStore() {
  const run = async (label, key, fn) => {
    assertBlobConfigured();
    try {
      return await fn();
    } catch (e) {
      console.error("[inbox-agent] Blob op failed:", label, key, e?.name, e?.message);
      throw e;
    }
  };
  return {
    get: (key) =>
      run("get", key, async () => {
        const res = await blobGet(keyToPathname(key), {
          access: BLOB_ACCESS,
          useCache: false,
        });
        if (!res || res.statusCode !== 200 || !res.stream) return null;
        return await new Response(res.stream).text();
      }),
    set: (key, value) =>
      run("set", key, () =>
        blobPut(keyToPathname(key), typeof value === "string" ? value : String(value), {
          access: BLOB_ACCESS,
          allowOverwrite: true,
          contentType: "application/json",
        }),
      ),
    delete: (key) => run("delete", key, () => blobDel(keyToPathname(key))),
    list: (opts) =>
      run("list", opts?.prefix || "", async () => {
        const prefix = opts?.prefix ? keyToPathname(opts.prefix) : undefined;
        const out = [];
        let cursor;
        do {
          const page = await blobList({
            ...(prefix ? { prefix } : {}),
            ...(cursor ? { cursor } : {}),
          });
          for (const b of page.blobs || []) out.push({ key: pathnameToKey(b.pathname) });
          cursor = page.hasMore ? page.cursor : undefined;
        } while (cursor);
        return { blobs: out };
      }),
  };
}

// Local verification only (MOCK_GMAIL=true): try the real store first,
// fall back to the in-memory store when no Blob credentials are
// configured locally (or the real op fails). A null from the real
// store also falls through to memory, exactly like the old wrapper.
function memoryBackedStore() {
  const real = realBackedStore();
  const mem = _memoryStore();
  return {
    async get(key) {
      try {
        const v = await real.get(key);
        if (v !== null && v !== undefined) return v;
      } catch {
        /* fall through to memory */
      }
      return mem.get(key);
    },
    async set(key, value) {
      try {
        await real.set(key, value);
        return;
      } catch {
        /* fall through to memory */
      }
      return mem.set(key, value);
    },
    async delete(key) {
      try {
        await real.delete(key);
        return;
      } catch {
        /* fall through to memory */
      }
      return mem.delete(key);
    },
    async list(opts) {
      try {
        return await real.list(opts);
      } catch {
        /* fall through to memory */
      }
      return mem.list(opts);
    },
  };
}

function blobStore() {
  return isMock() ? memoryBackedStore() : realBackedStore();
}

const store = blobStore();


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

// Auth failure page: plain-words explanation + a one-click retry that
// starts a FRESH OAuth flow (GET /api/auth/start). The old page was a
// dead end — "Invalid or expired sign-in attempt (state mismatch)" with
// only a back link — so users whose sign-in simply timed out (slow
// phone check) had no idea what happened or how to recover. Every auth
// failure now says, in plain words, that nothing is wrong with the
// Google account and offers the retry.
function authErrorResponse(title, message, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:sans-serif;background:#f7f7f5;color:#1c1c1a;margin:0">` +
      `<main style="max-width:560px;margin:80px auto;padding:32px;background:#fff;border:1px solid #e5e5e0;border-radius:12px">` +
      `<h1 style="font-size:24px;margin:0 0 12px">${title}</h1>` +
      `<p style="line-height:1.6;margin:0 0 24px">${message}</p>` +
      `<a href="/api/auth/start" style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Try connecting again</a> ` +
      `<a href="/" style="display:inline-block;margin-left:12px;color:#2f6b4f">Back to Inbox Agent</a>` +
      `</main></body>`,
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

// --- HTML sanitizing -----------------------------------------------------
// Why this exists (gibberish-email bug): findTextPart() only ever looked
// for a text/plain part, so for HTML-only mail (no text/plain part —
// common from LinkedIn, Codeforces, marketing senders) the body fell
// back to the truncated snippet, and for mail whose only text part IS
// raw HTML source (mislabeled / HTML dumped into a plain part) the raw
// source landed in `body` — which the frontend escapes and shows as
// visible tag gibberish. Fix: prefer the text/html part, sanitize it,
// and never let raw HTML source through as the body.

function decodeHtmlEntities(s) {
  if (!s) return "";
  let out = String(s);
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => {
        const c = parseInt(n, 10);
        return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
        const c = parseInt(n, 16);
        return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : "";
      });
    if (out === prev) break;
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tags the detail pane may render, and the only attributes kept on each.
const SAFE_TAGS = {
  a: ["href", "title"],
  b: [], strong: [], i: [], em: [], u: [], s: [], small: [],
  p: [], br: [], div: [], span: [], blockquote: [], pre: [], code: [],
  ul: [], ol: [], li: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  table: [], thead: [], tbody: [], tr: [], td: [], th: [], hr: [], img: ["src", "alt", "title"],
};
const DANGEROUS_SCHEMES = /^(javascript|vbscript|data|file):/i;

function sanitizeHtml(html) {
  if (!html) return "";
  // Decode entities first so encoded attacks (&lt;script&gt;) become real
  // tags here and get stripped, instead of surviving as text.
  let s = decodeHtmlEntities(String(html));
  // Strip comments, and whole dangerous elements including their content.
  // NOTE: html/head/body/title are NOT in this list — they are structural
  // wrappers, so only their tags are dropped (by the rebuild below) and
  // their inner text is kept. Putting them here once stripped the entire
  // document.
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(
    /<(script|style|iframe|object|embed|form|noscript|template|svg|math|video|audio|input|button|select|textarea)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi,
    "",
  );
  s = s.replace(/<(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, "");
  // Rebuild tag by tag: drop disallowed tags (keep their inner text),
  // keep allowed tags with only safe attributes; drop event handlers,
  // style attributes, and javascript:/data: URLs entirely.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (whole, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SAFE_TAGS, tag)) return "";
    if (whole.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    const allowed = SAFE_TAGS[tag];
    let attrs = "";
    const attrRe = /([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
    let m;
    while ((m = attrRe.exec(rawAttrs || "")) !== null) {
      const name = m[1].toLowerCase();
      if (!allowed.includes(name)) continue; // drops on*, style, etc.
      let value = m[2].replace(/^["']|["']$/g, "").trim();
      if ((name === "href" || name === "src") && (DANGEROUS_SCHEMES.test(value) || /^\s*\/\//.test(value))) continue;
      if (name === "href" && !/^(https?:|mailto:)/i.test(value)) continue;
      if (name === "src" && !/^https?:/i.test(value)) continue;
      attrs += ` ${name}="${escapeHtml(value).replace(/"/g, "&quot;")}"`;
    }
    return `<${tag}${attrs}>`;
  });
  return s.trim();
}

// Plain-text view of an HTML body: block boundaries become line breaks.
function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  // Never leak script/style content into the plain text.
  s = s.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeHtmlEntities(s);
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// True when a supposed "plain text" body is actually HTML source.
function looksLikeHtml(text) {
  return /<\s*(html|body|div|table|tr|td|span|p|a|head|!doctype)[\s>]/i.test(text || "");
}

function findPart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  for (const p of part.parts || []) {
    const found = findPart(p, mimeType);
    if (found) return found;
  }
  return null;
}

// Back-compat name: findTextPart now means "find a text/plain part".
function findTextPart(part) {
  return findPart(part, "text/plain");
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
// stored alongside the run, for replies). The engine runs on `body`
// (plain text). `bodyHtml`/`bodyText` are presentation fields: prefer
// the text/html part (sanitized), fall back to text/plain with line
// breaks preserved; a plain part that is actually HTML source is
// treated as HTML. Raw HTML source is NEVER returned as `body`.
function parseGmailMessage(msg) {
  const fromRaw = gmailHeader(msg, "From") || "";
  const htmlData = findPart(msg.payload, "text/html");
  const textData = findTextPart(msg.payload);
  let htmlRaw = htmlData ? b64urlDecode(htmlData) : null;
  let textRaw = textData ? b64urlDecode(textData) : null;
  // Mislabeled mail: the "plain" part is HTML source — treat it as HTML.
  if (!htmlRaw && textRaw && looksLikeHtml(textRaw)) {
    htmlRaw = textRaw;
    textRaw = null;
  }
  const bodyText = textRaw || (htmlRaw ? htmlToText(htmlRaw) : "") || msg.snippet || "";
  const bodyHtml = htmlRaw
    ? sanitizeHtml(htmlRaw)
    : escapeHtml(bodyText).replace(/\r?\n/g, "<br>");
  // `body` stays plain text so the engine (triage/draft/task) is unchanged.
  const body = bodyText;
  const labelIds = msg.labelIds || [];
  const read = !labelIds.includes("UNREAD");
  return {
    email: {
      id: msg.id,
      subject: gmailHeader(msg, "Subject") || "(no subject)",
      body,
      bodyText,
      bodyHtml: bodyHtml || null,
      from: extractAddr(fromRaw),
      from_name: extractName(fromRaw),
      date: toEngineDate(gmailHeader(msg, "Date")),
    },
    meta: {
      threadId: msg.threadId || null,
      messageId: gmailHeader(msg, "Message-ID") || null,
      references: gmailHeader(msg, "References") || null,
      read,
      labelIds,
    },
    read,
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
    // Seed mail has no read flag, so it is UNREAD (read: false) — the
    // contract default. A seed with `read: true` would list INBOX only.
    labelIds: e.read ? ["INBOX"] : ["INBOX", "UNREAD"],
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
  // Cached summary for /api/status: the frontend shows the last organized
  // state instantly without re-running the pipeline.
  await storeSetJSON(`cached:${user.id}`, {
    counts: result.counts,
    total: result.total,
    needsYouNow: result.needs_you_now,
    lastRunAt: record.ranAt,
  });
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

// Scope version of a stored token: v1 tokens predate the gmail.modify
// switch and have no scopeVersion field. Never defaults a real stored
// user to v2 — only the mock user carries v2 explicitly.
function userScopeVersion(user) {
  return user?.scopeVersion ?? 1;
}

// --- Read / do-later state (per user, Vercel Blob) ------------------------

async function getReadState(userId) {
  return (await storeGetJSON(`readstate:${userId}`)) || {};
}
async function setReadState(userId, s) {
  await storeSetJSON(`readstate:${userId}`, s);
}
async function getDoLaterSet(userId) {
  const ids = (await storeGetJSON(`dolater:${userId}`)) || [];
  return new Set(Array.isArray(ids) ? ids : []);
}
async function setDoLaterSet(userId, set) {
  await storeSetJSON(`dolater:${userId}`, [...set]);
}

// Attach the contract fields to pipeline results. Collection is computed
// from sender/subject/body at read time (so stored runs from before
// collections still get one); read prefers an explicit read-state
// override, then the Gmail UNREAD label captured at fetch time; doLater
// comes from the per-user Vercel Blob set. bodyHtml/bodyText fall back to the
// plain body for runs stored before they existed.
async function enrichEmails(result, userId) {
  const draftState = await getDraftState(userId);
  const readState = await getReadState(userId);
  const doLater = await getDoLaterSet(userId);
  return withDraftState(result, draftState).map((r) => {
    const metaRead = result.meta?.[r.id]?.read;
    const read = r.id in readState ? !!readState[r.id] : metaRead === undefined ? false : !!metaRead;
    const bodyText = r.bodyText ?? r.body ?? "";
    const bodyHtml = r.bodyHtml ?? (bodyText ? escapeHtml(bodyText).replace(/\r?\n/g, "<br>") : null);
    return {
      ...r,
      collection: classifyCollection(r.from, r.subject, r.body),
      read,
      doLater: doLater.has(r.id),
      bodyHtml,
      bodyText,
    };
  });
}

// --- Auth -------------------------------------------------------------------

const MOCK_USER = { id: "mock-user", email: "mock@example.test", refreshToken: "mock-refresh", scopeVersion: SCOPE_VERSION };

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
  enabled: false,
  frequency: 1,
  hours: ["09:00"],
  timezone: "Asia/Kolkata",
};

// The reminder digest — one builder shared by the hourly sweep and
// POST /api/reminders/test, so the test sends exactly what the sweep sends.
function buildReminderDigest(result, todayDate, baseUrl) {
  const dueToday = result.tasks.filter((t) => t.due <= todayDate);
  return {
    subject: "Inbox Agent: check your sorted mail",
    body: [
      "Hi,",
      "",
      "Your inbox, sorted:",
      `- ${result.counts.urgent} urgent`,
      `- ${result.counts.action} need action`,
      `- ${dueToday.length} task(s) due today or overdue`,
      `- ${result.tasks.length} tasks total`,
      "",
      `Open Inbox Agent: ${baseUrl}/`,
      "",
      "— Inbox Agent (you asked for this reminder; turn it off in Settings)",
    ].join("\n"),
  };
}

// Canonical settings shape (the contract — GET always returns this):
//   { enabled: bool, frequency: int 1-5,
//     hours: ["HH:MM", ...] (length == frequency, distinct),
//     timezone: string }
// ROOT CAUSE of the settings bug (verified in code): the frontend's
// saveSettings sends `frequency_per_day`, but this handler only read
// `body.frequency` — so `frequency` was undefined and validateSettings
// rejected every save with "frequency must be an integer from 1 to 5."
// Fix: accept `frequency_per_day` as an alias, normalize to the
// canonical shape, and validate with messages that say what was wrong
// and what to send instead.
function normalizeSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Settings must be a JSON object." };
  }
  const rawFreq = body.frequency !== undefined ? body.frequency : body.frequency_per_day;
  if (rawFreq === undefined) {
    return { error: "frequency is required — send an integer from 1 to 5 (frequency, or frequency_per_day)." };
  }
  if (typeof rawFreq === "string" || !Number.isInteger(rawFreq) || rawFreq < 1 || rawFreq > 5) {
    return { error: `frequency must be an integer from 1 to 5 (got ${JSON.stringify(rawFreq)} — send a number, e.g. 2, not "2 per day").` };
  }
  const frequency = rawFreq;
  const hours = body.hours;
  if (!Array.isArray(hours)) {
    return { error: `hours must be an array with exactly ${frequency} "HH:MM" entr${frequency === 1 ? "y" : "ies"} (one per daily reminder).` };
  }
  if (hours.length !== frequency) {
    return { error: `hours must have exactly ${frequency} entr${frequency === 1 ? "y" : "ies"} to match frequency ${frequency} (got ${hours.length}).` };
  }
  const seen = new Set();
  for (const h of hours) {
    if (typeof h !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.trim())) {
      return { error: `each hour must be a valid "HH:MM" string (got ${JSON.stringify(h)}).` };
    }
    const hh = h.trim();
    if (seen.has(hh)) {
      return { error: `hours must be distinct — ${hh} appears more than once.` };
    }
    seen.add(hh);
  }
  const timezone = body.timezone;
  if (typeof timezone !== "string" || !timezone.trim()) {
    return { error: 'timezone is required and must be a non-empty string (e.g. "Asia/Kolkata").' };
  }
  // "Asia/Mumbai" is not an IANA zone name (this Node/ICU build rejects
  // it), but it is what users type for Mumbai — it is the same zone as
  // Asia/Kolkata, so alias it instead of rejecting the save. The stored
  // value is the canonical name, so the reminder sweep can use it.
  const TIMEZONE_ALIASES = { "asia/mumbai": "Asia/Kolkata", "asia/bombay": "Asia/Kolkata", "asia/calcutta": "Asia/Kolkata" };
  const tz = TIMEZONE_ALIASES[timezone.trim().toLowerCase()] || timezone.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { error: `unknown timezone: ${JSON.stringify(timezone)}.` };
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { error: `enabled must be a boolean (got ${JSON.stringify(body.enabled)}).` };
  }
  // Saving settings opts in unless the caller explicitly disables them.
  return {
    settings: {
      enabled: body.enabled !== undefined ? body.enabled : true,
      frequency,
      hours: hours.map((h) => h.trim()),
      timezone: tz,
    },
  };
}

// Canonicalize a stored (possibly legacy) settings object for GET.
function canonicalSettings(saved) {
  if (!saved) return { ...DEFAULT_SETTINGS };
  const { settings, error } = normalizeSettings(saved);
  return error ? { ...DEFAULT_SETTINGS } : settings;
}

// --- Routes ---------------------------------------------------------------------

const EMAIL_RE = /^\/api\/emails\/([^/]+)$/;
const EMAIL_READ_RE = /^\/api\/emails\/([^/]+)\/read$/;
const EMAIL_DOLATER_RE = /^\/api\/emails\/([^/]+)\/do-later$/;
const APPROVE_RE = /^\/api\/drafts\/([^/]+)\/approve$/;
const EDIT_RE = /^\/api\/drafts\/([^/]+)\/edit$/;
const SEND_RE = /^\/api\/drafts\/([^/]+)\/send$/;

function isKnownPath(path) {
  return (
    path === "/api/status" ||
    path === "/api/run" ||
    path === "/api/emails" ||
    path === "/api/do-later" ||
    path === "/api/tasks" ||
    path === "/api/auth/start" ||
    path === "/api/auth/callback" ||
    path === "/api/auth/disconnect" ||
    path === "/api/reminders/settings" ||
    path === "/api/reminders/test" ||
    path === "/api/remind" ||
    EMAIL_RE.test(path) ||
    EMAIL_READ_RE.test(path) ||
    EMAIL_DOLATER_RE.test(path) ||
    APPROVE_RE.test(path) ||
    EDIT_RE.test(path) ||
    SEND_RE.test(path)
  );
}

async function handleRequest(req) {
  const url = new URL(req.url);
  let path = url.pathname;
  // Vercel routing: /api/* is rewritten to /api/index (see vercel.json),
  // so this function may see the rewritten pathname (/api/index) rather
  // than the path the browser asked for. The rewrite carries the
  // original path in the __route query param (destination
  // "/api/index?__route=/:path*"), which is authoritative exactly when
  // the pathname is the rewritten one. When the platform preserves the
  // original pathname (local `vercel dev` does), the pathname wins and
  // the param is ignored. Either way, routing below sees the path the
  // caller asked for.
  if (path === "/api/index" || path === "/api/index/") {
    const routed = url.searchParams.get("__route");
    if (routed) path = "/api/" + String(routed).replace(/^\/+/, "");
  }
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
    // Each start mints its own state key — a second Connect click (or a
    // second tab) does NOT invalidate the first: the callback accepts
    // any stored, unexpired state once, then consumes it. So double-start
    // is safe by construction; the fix for slow round-trips is the
    // 30-minute TTL, not single-state reuse (reusing one state would
    // make the second tab's callback fail after the first consumed it).
    const state = randomToken();
    // The state MUST be durably recorded before we redirect to Google:
    // if the write is lost, the callback can never validate it and the
    // user lands on a "state mismatch" dead end. Write, then read back;
    // retry once; if it still isn't there, fail here with a retry button
    // instead of sending the user to Google on a doomed flow.
    // The state MUST be durably recorded before we redirect to Google:
    // the callback compares the returned state against this record (and
    // against the in-memory copy). In production a store failure now
    // throws instead of silently landing in per-instance memory, so a
    // failure here fails the flow with a retry button — never a redirect
    // to Google on a doomed flow.
    let recorded = null;
    try {
      await storeSetJSON(`oauth-state:${state}`, { createdAt: Date.now() });
      recorded = await storeGetJSON(`oauth-state:${state}`);
      if (!recorded) {
        await storeSetJSON(`oauth-state:${state}`, { createdAt: Date.now() });
        recorded = await storeGetJSON(`oauth-state:${state}`);
      }
    } catch (e) {
      console.error("[inbox-agent] could not save OAuth state:", e?.message);
      recorded = null;
    }
    if (!recorded) {
      return authErrorResponse(
        "Google sign-in failed",
        "The sign-in could not be started because the security check could not be saved. Nothing is wrong with your Google account — please try again.",
        500,
      );
    }
    const authUrl = new URL(OAUTH_AUTH_URL);
    authUrl.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAUTH_SCOPES,
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
      // Google refused (e.g. access_denied — the account is not a test
      // user): send the user back to the app with the error visible,
      // instead of a blank failure page.
      const errText = url.searchParams.get("error_description") || err;
      return new Response(null, {
        status: 302,
        headers: { Location: siteUrl(req) + "/?error=" + encodeURIComponent(errText) },
      });
    }
    if (!code || !state) {
      return authErrorResponse(
        "Google sign-in failed",
        "The sign-in reply from Google was incomplete (missing code or state). Nothing is wrong with your Google account — please try again.",
      );
    }
    const saved = await storeGetJSON(`oauth-state:${state}`);
    if (!saved) {
      // Unknown state: already consumed (e.g. this link was already
      // used), or the attempt was started too long ago. Either way the
      // fix is the same — start a fresh flow.
      return authErrorResponse(
        "Google sign-in failed",
        "This sign-in link is no longer valid — it may already have been used, or the attempt was started too long ago. Nothing is wrong with your Google account — please try again.",
      );
    }
    // Single-use: consume the state now, before the code exchange.
    await store.delete(`oauth-state:${state}`);
    if (Date.now() - saved.createdAt > OAUTH_STATE_TTL_MS) {
      return authErrorResponse(
        "Google sign-in failed",
        "This sign-in attempt timed out — it took longer than 30 minutes (for example, the phone check took a while). Nothing is wrong with your Google account — please try again.",
      );
    }
    const redirectUri = siteUrl(req) + "/api/auth/callback";
    let tokens;
    try {
      tokens = await exchangeCode(code, redirectUri);
    } catch (e) {
      return authErrorResponse("Google sign-in failed", `Could not exchange the sign-in code: ${e.message}. Nothing is wrong with your Google account — please try again.`);
    }
    if (!tokens.refresh_token) {
      return authErrorResponse("Google sign-in failed", "Google did not return a refresh token. Please disconnect the app in your Google account and try again (offline access is required).");
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
      return authErrorResponse("Google sign-in failed", "Signed in, but the account email could not be read. Nothing is wrong with your Google account — please try again.");
    }
    const user = { id: googleId, email, refreshToken: tokens.refresh_token, createdAt: Date.now(), scopeVersion: SCOPE_VERSION };
    let sessionToken;
    try {
      await storeSetJSON(`user:${user.id}`, user);
      await addUserToIndex(user.id);
      sessionToken = randomToken();
      await storeSetJSON(`session:${sessionToken}`, { userId: user.id, createdAt: Date.now() });
      // The session MUST be readable back from the persistent store before
      // we hand the token to the browser: if the write did not persist,
      // the very next API call would 401 with a fake "Session expired"
      // (that was the 13 Nov bug). Retry once, then fail here with a
      // retry button instead of redirecting with a doomed token.
      const sessionPersisted = async () => {
        try {
          const back = await storeGetJSON(`session:${sessionToken}`);
          return back?.userId === user.id;
        } catch {
          return false;
        }
      };
      let persisted = await sessionPersisted();
      if (!persisted) {
        await new Promise((r) => setTimeout(r, 500));
        persisted = await sessionPersisted();
      }
      if (!persisted) {
        return authErrorResponse(
          "Google sign-in failed",
          "The sign-in could not be saved — the session did not persist. Nothing is wrong with your Google account — please try again.",
          500,
        );
      }
    } catch (e) {
      console.error("[inbox-agent] could not save session:", e?.message);
      return authErrorResponse(
        "Google sign-in failed",
        `The sign-in could not be saved: ${e.message}. Nothing is wrong with your Google account — please try again.`,
        500,
      );
    }
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

  // --- OAuth: disconnect ---
  // Old bug: only the bearer session token was deleted — the stored
  // refresh token (user:<id>) and the users:index entry survived, so
  // the old account stayed connected server-side (reminder sweep kept
  // mailing it) and a different Gmail could not cleanly take over.
  // Fix: clear the session(s), the stored token, and all per-user state.
  if (method === "POST" && path === "/api/auth/disconnect") {
    const h = req.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
    let userId = null;
    if (token) {
      const session = await storeGetJSON(`session:${token}`);
      if (session?.userId) userId = session.userId;
      await store.delete(`session:${token}`);
    }
    if (userId) {
      // Any other sessions for the same user (e.g. a second browser).
      try {
        const listed = await store.list({ prefix: "session:" });
        for (const b of listed.blobs || []) {
          const s = await storeGetJSON(b.key);
          if (s?.userId === userId) await store.delete(b.key);
        }
      } catch {
        /* session sweep is best-effort; the bearer token above is gone */
      }
      await store.delete(`user:${userId}`);
      const idx = (await storeGetJSON("users:index")) || [];
      if (idx.includes(userId)) {
        await storeSetJSON("users:index", idx.filter((id) => id !== userId));
      }
      // Per-user state tied to that Gmail account.
      for (const key of [
        `run:${userId}`,
        `cached:${userId}`,
        `draftstate:${userId}`,
        `readstate:${userId}`,
        `dolater:${userId}`,
        `settings:${userId}`,
        `mock-sent:${userId}`,
      ]) {
        await store.delete(key);
      }
      try {
        const reminded = await store.list({ prefix: `reminded:${userId}:` });
        for (const b of reminded.blobs || []) await store.delete(b.key);
      } catch {
        /* best-effort */
      }
    }
    return jsonResponse({ disconnected: true });
  }

  // --- Status (auth optional: reports connected + email when signed in) ---
  if (method === "GET" && path === "/api/status") {
    const auth = await getAuth(req);
    const run = auth ? await getStoredRun(auth.userId) : null;
    const cachedStored = auth ? await storeGetJSON(`cached:${auth.userId}`) : null;
    // Fall back to the stored run for accounts whose last run predates caching.
    const cachedRun = cachedStored ||
      (run
        ? { counts: run.counts, total: run.total, needsYouNow: run.needs_you_now, lastRunAt: run.ranAt }
        : null);
    const storedScope = auth ? userScopeVersion(auth.user) : SCOPE_VERSION;
    return jsonResponse({
      engine: "deterministic rules only (no LLM)",
      llm_available: false,
      total_emails: run ? run.total : 0,
      last_run_seconds: run ? run.lastRunSeconds : null,
      note: "Real Gmail via OAuth. Drafts are only sent after you approve AND confirm them; nothing is deleted.",
      connected: !!auth,
      email: auth ? auth.user.email : null,
      scopeVersion: SCOPE_VERSION,
      // Prompt only: a v1 token keeps working for read/send; only
      // mark-as-read needs the reconnect (it returns 409 until then).
      needsReconnect: auth ? storedScope < SCOPE_VERSION : false,
      cachedRun,
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
    let emails = await enrichEmails(result, auth.userId);
    const category = url.searchParams.get("category") || "";
    if (category) emails = emails.filter((r) => r.category === category);
    const collection = url.searchParams.get("collection") || "";
    if (collection) emails = emails.filter((r) => r.collection === collection);
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
    const found = (await enrichEmails(result, auth.userId)).find((r) => r.id === id);
    if (!found) return jsonResponse({ detail: "email not found" }, 404);
    return jsonResponse(found);
  }

  // --- Mark as read / unread (needs gmail.modify, i.e. scope v2) ---
  const readMatch = EMAIL_READ_RE.exec(path);
  if (method === "POST" && readMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    const id = decodeURIComponent(readMatch[1]);
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ detail: "Invalid JSON — expected {read: boolean}." }, 422);
    }
    if (typeof body.read !== "boolean") {
      return jsonResponse({ detail: "Expected JSON {read: boolean}." }, 422);
    }
    if (userScopeVersion(auth.user) < SCOPE_VERSION) {
      // Applies in mock mode too: the mock user is v2 (mock modify
      // succeeds), a stored v1 token gets the 409 here instead of a
      // misleading Gmail error.
      return jsonResponse(
        { detail: "Marking read/unread needs the updated Gmail permission (gmail.modify). Reconnect Gmail to grant it — reading and sending still work meanwhile.", needsReconnect: true },
        409,
      );
    }
    if (!isMock()) {
      try {
        const accessToken = await refreshAccessToken(auth.user.refreshToken);
        await gmailApi(accessToken, `/users/me/messages/${encodeURIComponent(id)}/modify`, {
          method: "POST",
          body: JSON.stringify(
            body.read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
          ),
        });
      } catch (e) {
        // Google refusing for permissions means the stored token predates
        // the modify scope even though it claims otherwise.
        if (/insufficient|forbidden|permission/i.test(e.message || "")) {
          return jsonResponse(
            { detail: "Gmail refused the label change — the stored token lacks the modify permission. Reconnect Gmail to grant it.", needsReconnect: true },
            409,
          );
        }
        return jsonResponse({ detail: `Mark as read failed: ${e.message}` }, 502);
      }
    }
    const readState = await getReadState(auth.userId);
    readState[id] = body.read;
    await setReadState(auth.userId, readState);
    return jsonResponse({ id, read: body.read });
  }

  // --- Do later: defer / un-defer an email (per-user Vercel Blob set) ---
  const doLaterMatch = EMAIL_DOLATER_RE.exec(path);
  if (method === "POST" && doLaterMatch) {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    const id = decodeURIComponent(doLaterMatch[1]);
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ detail: "Invalid JSON — expected {doLater: boolean}." }, 422);
    }
    if (typeof body.doLater !== "boolean") {
      return jsonResponse({ detail: "Expected JSON {doLater: boolean}." }, 422);
    }
    const set = await getDoLaterSet(auth.userId);
    if (body.doLater) set.add(id);
    else set.delete(id);
    await setDoLaterSet(auth.userId, set);
    return jsonResponse({ id, doLater: body.doLater });
  }

  // --- Do-later list ---
  if (method === "GET" && path === "/api/do-later") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await ensureRun(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    const emails = (await enrichEmails(result, auth.userId)).filter((r) => r.doLater);
    return jsonResponse({ emails, count: emails.length });
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
      return jsonResponse(canonicalSettings(saved));
    }
    if (method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ detail: "Invalid JSON" }, 422);
      }
      const { settings, error: problem } = normalizeSettings(body);
      if (problem) return jsonResponse({ detail: problem }, 422);
      await storeSetJSON(`settings:${auth.userId}`, settings);
      await addUserToIndex(auth.userId);
      return jsonResponse(settings);
    }
  }

  // --- Test reminder: the same digest the sweep sends, right now ---
  if (method === "POST" && path === "/api/reminders/test") {
    const { auth, error } = await requireAuth(req);
    if (error) return error;
    let result;
    try {
      result = await runPipelineForUser(auth.user);
    } catch (e) {
      return jsonResponse({ detail: `Gmail fetch failed: ${e.message}` }, 502);
    }
    const tz = (await storeGetJSON(`settings:${auth.userId}`))?.timezone || "Asia/Kolkata";
    const { date } = nowPartsInTz(tz);
    const digest = buildReminderDigest(result, date, siteUrl(req));
    try {
      const accessToken = await refreshAccessToken(auth.user.refreshToken);
      await sendGmailRaw(auth.user, accessToken, {
        to: auth.user.email,
        subject: digest.subject,
        body: digest.body,
        threadId: null,
        inReplyTo: null,
        references: null,
      });
    } catch (e) {
      return jsonResponse({ detail: `Test reminder failed: ${e.message}` }, 502);
    }
    return jsonResponse({ sent: true, email: auth.user.email });
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
        const digest = buildReminderDigest(result, now.date, siteUrl(req));
        const accessToken = await refreshAccessToken(user.refreshToken);
        await sendGmailRaw(user, accessToken, {
          to: user.email,
          subject: digest.subject,
          body: digest.body,
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
}

// Vercel entry point: the fetch Web Standard export
// (vercel.com/docs/functions/serverless-functions/runtimes/node-js and
// /docs/functions/functions-api-reference). One function handles every
// HTTP method and every /api/* route — handleRequest dispatches on the
// pathname. There is no `config = { path }` here: on Vercel, routing
// comes from the file's place in api/ plus the vercel.json rewrite
// (/api/* -> /api/index); the fetch export receives the request as a
// standard web Request. The thin wrapper below keeps its old job: a
// store outage (or any other unexpected throw) surfaces as a JSON 500
// with a clear detail — and is logged — instead of an unhandled
// rejection. Expected failures still return their own responses.
export default {
  fetch: async (request) => {
    try {
      return await handleRequest(request);
    } catch (e) {
      console.error("[inbox-agent] request failed:", e?.name, e?.message);
      return jsonResponse(
        { detail: `Server error — please try again. (${e?.message || "unknown error"})` },
        500,
      );
    }
  },
};

// Named exports for local verification only (the handler above stays the
// default export). Lets tests drive parseGmailMessage / classifyCollection
// / sanitizeHtml / normalizeSettings without a live Gmail account, and
// lets the disconnect test seed + inspect Vercel Blob state.
export {
  classifyCollection,
  sanitizeHtml,
  htmlToText,
  decodeHtmlEntities,
  parseGmailMessage,
  normalizeSettings,
  canonicalSettings,
  buildReminderDigest,
  runPipeline,
  SCOPE_VERSION,
  OAUTH_SCOPES,
  store as __testStore,
};
