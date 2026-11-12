/* Inbox Agent — dashboard client. No dependencies, same-origin /api calls.
   Auth: session token in localStorage, sent as Bearer on every request.
   The backend may be the prototype (seed data, no auth) or the real app
   (Gmail OAuth, reminders, send). Endpoints that do not exist yet fail
   gracefully and the UI says so instead of breaking. */

'use strict';

var TOKEN_KEY = 'inbox_agent_token';
var EMAIL_KEY = 'inbox_agent_email';
var THEME_KEY = 'ia-theme';

var CATEGORIES = ['urgent', 'action', 'fyi', 'promo', 'spam'];
var CAT_LABELS = { urgent: 'Urgent', action: 'Action', fyi: 'FYI', promo: 'Promo', spam: 'Spam' };

/* Collections, in precedence order (government > work-institute >
   shopping > apps > tech-brands > other). The backend assigns each
   email one collection; the frontend only displays and filters by it. */
var COLLECTIONS = ['shopping', 'tech-brands', 'work-institute', 'government', 'apps', 'other'];
var COL_LABELS = {
  shopping: 'Shopping', 'tech-brands': 'Tech & Brands', 'work-institute': 'Work & Institute',
  government: 'Government', apps: 'Apps', other: 'Other'
};

/* Default reminder hours when frequency rises: a spread, never a
   duplicated 09:00. Index i of SPREAD_HOURS is the default hour for
   reminder slot i+1. */
var SPREAD_HOURS = ['09:00', '13:00', '18:00', '20:00', '21:00'];

var RECONNECT_MSG = 'Reconnect to enable mark-as-read — Disconnect, then Connect Gmail again.';

var token = localStorage.getItem(TOKEN_KEY) || '';
var accountEmail = localStorage.getItem(EMAIL_KEY) || '';

var allEmails = [];
var doLaterEmails = [];
var counts = { urgent: 0, action: 0, fyi: 0, promo: 0, spam: 0 };
var tasks = [];
var currentFilter = '';
var currentCollection = 'all';
var selectedId = null;
var selectedEmail = null;
var settingsLoaded = false;
var needsReconnect = false;
var cachedRun = null;
var urlErrorMsg = '';

/* ---------- helpers ---------- */

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDateLong(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showError(msg) {
  // Never render an empty banner: a real failure always gets a message.
  msg = String(msg == null ? '' : msg).trim();
  if (!msg) msg = 'Something went wrong. Please try again.';
  $('errorText').textContent = msg;
  $('errorBar').hidden = false;
}

function hideError() { $('errorBar').hidden = true; }

/* ---------- theme ---------- */

function applyTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') theme = 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  var btn = $('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* storage unavailable */ }
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/* ---------- auth ---------- */

function readTokenFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var t = params.get('token') || params.get('session') || params.get('session_token') || '';
  if (!t) return false;
  token = t;
  localStorage.setItem(TOKEN_KEY, token);
  var em = params.get('email') || '';
  if (em) {
    accountEmail = em;
    localStorage.setItem(EMAIL_KEY, em);
  }
  // Clean the token out of the address bar.
  var url = new URL(window.location.href);
  url.searchParams.delete('token');
  url.searchParams.delete('session');
  url.searchParams.delete('session_token');
  url.searchParams.delete('email');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return true;
}

/* OAuth errors arrive as /?error=<urlencoded text>. Surface that exact
   text in the error bar — never a blank banner — then clean it out of
   the address bar. */
function readErrorFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var err = params.get('error');
  if (!err) return;
  urlErrorMsg = err;
  showError(err);
  var url = new URL(window.location.href);
  url.searchParams.delete('error');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function renderAuth() {
  var area = $('authArea');
  if (!token) {
    area.innerHTML = '';
    var a = document.createElement('a');
    a.className = 'btn btn-primary';
    a.href = '/api/auth/start';
    a.textContent = 'Connect Gmail';
    area.appendChild(a);
    return;
  }
  area.innerHTML = '';
  if (accountEmail) {
    var span = document.createElement('span');
    span.className = 'account';
    span.textContent = accountEmail;
    area.appendChild(span);
  }
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.textContent = 'Disconnect';
  btn.addEventListener('click', disconnect);
  area.appendChild(btn);
}

async function disconnect() {
  if (token) {
    try {
      await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch (e) {
      // Backend may not have a disconnect endpoint; local clear is enough.
    }
  }
  token = '';
  accountEmail = '';
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  } catch (e) { /* sessionStorage unavailable */ }
  allEmails = [];
  doLaterEmails = [];
  tasks = [];
  counts = { urgent: 0, action: 0, fyi: 0, promo: 0, spam: 0 };
  currentFilter = '';
  currentCollection = 'all';
  selectedId = null;
  selectedEmail = null;
  settingsLoaded = false;
  needsReconnect = false;
  cachedRun = null;
  urlErrorMsg = '';
  $('reconnectBanner').hidden = true;
  $('emailList').innerHTML = '<p class="muted pad">Loading…</p>';
  $('detailContent').innerHTML = '<p class="muted pad">Select an email to read it.</p>';
  $('detailPane').classList.remove('open');
  $('detailBackBtn').hidden = true;
  renderCounts();
  renderFilters();
  renderCollectionTabs();
  renderDoLater();
  hideError();
  renderAuth();
  showConnectState();
}

function showConnectState() {
  $('connectPanel').hidden = false;
  $('dashboard').hidden = true;
}

function showDashboard() {
  $('connectPanel').hidden = true;
  $('dashboard').hidden = false;
}

/* ---------- api ---------- */

async function api(path, options) {
  options = options || {};
  var headers = Object.assign({}, options.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var res = await fetch(path, Object.assign({}, options, { headers: headers }));
  if (res.status === 401) {
    // Session expired or revoked: back to the connect state.
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    renderAuth();
    showConnectState();
    throw new Error('Session expired — please connect Gmail again.');
  }
  if (!res.ok) {
    var detail = '';
    try {
      var data = await res.json();
      detail = data.detail || data.error || data.message || '';
    } catch (e) { /* non-JSON error body */ }
    var err = new Error(detail || ('Request failed (' + res.status + ')'));
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ---------- loading ---------- */

async function loadAll() {
  // An OAuth ?error= message from the URL survives the load: it is the
  // reason the user is here, so loading must not clear it.
  if (!urlErrorMsg) hideError();
  var results = await Promise.allSettled([
    api('/api/status'),
    api('/api/emails'),
    api('/api/tasks'),
    api('/api/do-later')
  ]);
  var statusFailed = results[0].status === 'rejected';
  var emailsFailed = results[1].status === 'rejected';
  var tasksFailed = results[2].status === 'rejected';
  var doLaterFailed = results[3].status === 'rejected';

  if (statusFailed) {
    renderEngine(null);
  } else {
    renderEngine(results[0].value);
  }
  if (!emailsFailed) {
    var em = results[1].value || {};
    allEmails = em.emails || [];
    counts = em.counts || counts;
  }
  if (!tasksFailed) {
    var tk = results[2].value || {};
    tasks = tk.tasks || [];
  }
  if (!doLaterFailed) {
    var dl = results[3].value || {};
    doLaterEmails = dl.emails || dl.do_later || [];
    // Keep the doLater flag on the list copies in sync.
    var dlIds = {};
    doLaterEmails.forEach(function (e) { dlIds[e.id] = true; });
    allEmails.forEach(function (e) { e.doLater = !!dlIds[e.id]; });
  } else {
    // Fall back to the flag on the email objects themselves.
    doLaterEmails = allEmails.filter(function (e) { return e.doLater; });
  }
  renderCounts();
  renderNeeds();
  renderFilters();
  renderCollectionTabs();
  renderEmails();
  renderTasks();
  renderDoLater();

  if (urlErrorMsg) {
    showError(urlErrorMsg);
  } else if (statusFailed && emailsFailed && tasksFailed) {
    showError('Could not load the inbox: ' + results[0].reason.message);
  } else if (emailsFailed) {
    showError('Could not load emails: ' + results[1].reason.message);
  } else if (tasksFailed) {
    showError('Could not load tasks: ' + results[2].reason.message);
  }
}

/* First paint from the cached run (if /api/status reports one), then
   refresh in the background: run the agents automatically so the
   cached counts are replaced by a live run. */
async function bootLoad() {
  try {
    var st = await api('/api/status');
    renderEngine(st);
    if (st && st.cachedRun) {
      cachedRun = st.cachedRun;
      if (cachedRun.counts) {
        counts = cachedRun.counts;
        renderCounts();
        renderFilters();
        renderCollectionTabs();
      }
      if (cachedRun.lastRunAt) {
        $('lastRun').textContent = 'Last run: ' + fmtDateLong(cachedRun.lastRunAt);
      }
    }
  } catch (e) {
    renderEngine(null);
  }
  await loadAll();
  loadSettings();
  // Background refresh on every connected load: re-run the agents
  // quietly, replacing the cached view (or filling an empty one when
  // there is no cached run yet). Quiet failures stay silent.
  runAgents({ quiet: true });
}

function renderEngine(st) {
  if (!st) {
    $('engineLine').textContent = 'Engine: unavailable';
    return;
  }
  var parts = [];
  if (st.engine) parts.push('Engine: ' + st.engine);
  if (st.note) parts.push(st.note);
  if (st.scopeVersion) parts.push('Scope: ' + st.scopeVersion);
  $('engineLine').textContent = parts.join('  ·  ');
  if (st.last_run_seconds != null) {
    $('lastRun').textContent = 'Last run: ' + st.last_run_seconds + 's';
  }
  if (st.cachedRun && st.cachedRun.lastRunAt) {
    $('lastRun').textContent = 'Last run: ' + fmtDateLong(st.cachedRun.lastRunAt);
  }
  // Mark-as-read needs the current Gmail scope. If the token predates
  // it, say so calmly and block nothing else.
  needsReconnect = !!st.needsReconnect;
  $('reconnectBanner').hidden = !needsReconnect;
}

async function runAgents(opts) {
  opts = opts || {};
  var btn = $('runBtn');
  btn.disabled = true;
  btn.textContent = 'Running…';
  if (!opts.quiet) hideError();
  try {
    var res = await api('/api/run', { method: 'POST' });
    if (res && res.seconds != null) {
      $('lastRun').textContent = 'Last run: ' + res.seconds + 's · just now';
    } else {
      $('lastRun').textContent = 'Last run: just now';
    }
    await loadAll();
  } catch (e) {
    if (!opts.quiet) showError('Run failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Organize now';
  }
}

/* ---------- counts / filters ---------- */

function totalCount() {
  return CATEGORIES.reduce(function (n, c) { return n + (counts[c] || 0); }, 0);
}

function renderCounts() {
  var box = $('counts');
  box.innerHTML = '';
  CATEGORIES.forEach(function (cat) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'count' + (currentFilter === cat ? ' active' : '');
    var n = counts[cat] || 0;
    b.innerHTML = '<span class="num' + (cat === 'urgent' && n > 0 ? ' accent' : '') + '">' + n + '</span>' +
      '<span class="lbl">' + CAT_LABELS[cat] + '</span>';
    b.addEventListener('click', function () {
      currentFilter = (currentFilter === cat) ? '' : cat;
      renderCounts();
      renderFilters();
      renderEmails();
    });
    box.appendChild(b);
  });
  var total = document.createElement('div');
  total.className = 'count';
  total.style.cursor = 'default';
  total.innerHTML = '<span class="num">' + totalCount() + '</span><span class="lbl">Total</span>';
  box.appendChild(total);
}

function renderFilters() {
  var box = $('filters');
  box.innerHTML = '';
  var mk = function (label, cat) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = label;
    if (currentFilter === cat) b.className = 'active';
    b.addEventListener('click', function () {
      currentFilter = cat;
      renderCounts();
      renderFilters();
      renderEmails();
    });
    box.appendChild(b);
  };
  mk('All (' + totalCount() + ')', '');
  CATEGORIES.forEach(function (cat) {
    mk(CAT_LABELS[cat] + ' (' + (counts[cat] || 0) + ')', cat);
  });
}

/* Collection tabs ("windows") combine with the triage filter above:
   shown emails must match both. */
function renderCollectionTabs() {
  var box = $('collectionTabs');
  if (!box) return;
  box.innerHTML = '';
  var mk = function (label, key) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = label;
    if (currentCollection === key) b.className = 'active';
    b.addEventListener('click', function () {
      currentCollection = key;
      renderCollectionTabs();
      renderEmails();
    });
    box.appendChild(b);
  };
  mk('All collections', 'all');
  COLLECTIONS.forEach(function (key) {
    var n = allEmails.filter(function (e) { return e.collection === key; }).length;
    mk(COL_LABELS[key] + ' (' + n + ')', key);
  });
}

function collectionLabel(e) {
  return COL_LABELS[e.collection] || (e.collection ? e.collection : 'Other');
}

/* ---------- needs you now ---------- */

function renderNeeds() {
  var box = $('needsList');
  var urgent = allEmails
    .filter(function (e) { return e.category === 'urgent'; })
    .sort(function (a, b) { return b.priority - a.priority; });
  box.innerHTML = '';
  if (!urgent.length) {
    box.innerHTML = '<p class="muted">Nothing urgent.</p>';
    return;
  }
  urgent.forEach(function (e) {
    var d = document.createElement('div');
    d.className = 'need-item';
    d.innerHTML = '<div class="need-subject">' + esc(e.subject) + '</div>' +
      '<div class="need-meta">' + esc(e.from_name || e.from || '') +
      ' · <span class="prio">P' + e.priority + '</span> — ' + esc(e.triage_reason || '') + '</div>';
    d.addEventListener('click', function () { openEmail(e.id); });
    box.appendChild(d);
  });
}

/* ---------- inbox list ---------- */

function renderEmails() {
  var box = $('emailList');
  box.innerHTML = '';
  // Deferred emails live in the Do later section, not in the main list.
  var list = allEmails
    .filter(function (e) { return !e.doLater; })
    .filter(function (e) { return !currentFilter || e.category === currentFilter; })
    .filter(function (e) { return currentCollection === 'all' || (e.collection || 'other') === currentCollection; })
    .sort(function (a, b) { return b.priority - a.priority; });
  if (!list.length) {
    box.innerHTML = '<p class="muted pad">' +
      ((currentFilter || currentCollection !== 'all') ? 'No emails match these filters.' : 'No emails yet. Organize now to triage your inbox.') +
      '</p>';
    return;
  }
  list.forEach(function (e) {
    var d = document.createElement('div');
    d.className = 'row' + (e.id === selectedId ? ' selected' : '') + (e.read === false ? ' unread' : '');
    d.innerHTML =
      '<div><div class="sender">' + esc(e.from_name || '') + ' &lt;' + esc(e.from || '') + '&gt; · ' + esc(fmtDate(e.date)) + '</div>' +
      '<div class="subject">' + esc(e.subject) + '</div></div>' +
      '<span class="collection-tag">' + esc(collectionLabel(e)) + '</span>' +
      '<span class="cat-label">' + esc(CAT_LABELS[e.category] || e.category) + '</span>' +
      '<span class="prio' + (e.priority >= 4 ? ' high' : '') + '">P' + e.priority + '</span>' +
      '<div class="reason">' + esc(e.triage_reason || '') + '</div>' +
      '<div class="row-actions">' +
      (e.read === false
        ? '<button type="button" class="btn btn-secondary btn-small row-action" data-act="read">Mark as read</button>'
        : '<button type="button" class="btn btn-secondary btn-small row-action" data-act="unread">Mark unread</button>') +
      '<button type="button" class="btn btn-secondary btn-small row-action" data-act="later">Do later</button>' +
      '</div>';
    d.addEventListener('click', function () { openEmail(e.id); });
    d.querySelectorAll('.row-action').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var act = btn.getAttribute('data-act');
        if (act === 'read') markAsRead(e.id, true);
        else if (act === 'unread') markAsRead(e.id, false);
        else if (act === 'later') toggleDoLater(e.id, true);
      });
    });
    box.appendChild(d);
  });
}

/* ---------- do later ---------- */

function renderDoLater() {
  var section = $('doLaterSection');
  var box = $('doLaterList');
  $('doLaterCount').textContent = doLaterEmails.length ? '(' + doLaterEmails.length + ')' : '';
  box.innerHTML = '';
  if (!doLaterEmails.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  doLaterEmails.forEach(function (e) {
    var d = document.createElement('div');
    d.className = 'row' + (e.id === selectedId ? ' selected' : '');
    d.innerHTML =
      '<div><div class="sender">' + esc(e.from_name || '') + ' &lt;' + esc(e.from || '') + '&gt; · ' + esc(fmtDate(e.date)) + '</div>' +
      '<div class="subject">' + esc(e.subject) + '</div></div>' +
      '<span class="collection-tag">' + esc(collectionLabel(e)) + '</span>' +
      '<span class="cat-label">' + esc(CAT_LABELS[e.category] || e.category) + '</span>' +
      '<div class="row-actions">' +
      '<button type="button" class="btn btn-secondary btn-small row-action" data-act="restore">Restore</button>' +
      '</div>';
    d.addEventListener('click', function () { openEmail(e.id); });
    d.querySelector('[data-act="restore"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleDoLater(e.id, false);
    });
    box.appendChild(d);
  });
}

/* ---------- mark as read / do later ---------- */

function handleReconnectError(err) {
  if (err && (err.status === 409 || /reconnect/i.test(err.message || ''))) {
    showError(RECONNECT_MSG);
    return true;
  }
  return false;
}

async function markAsRead(id, read) {
  try {
    await api('/api/emails/' + encodeURIComponent(id) + '/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: !!read })
    });
    var listEmail = allEmails.find(function (x) { return x.id === id; });
    if (listEmail) listEmail.read = !!read;
    if (selectedEmail && selectedEmail.id === id) {
      selectedEmail.read = !!read;
      renderDetail(selectedEmail);
    }
    renderEmails();
  } catch (err) {
    if (!handleReconnectError(err)) showError('Mark as read failed: ' + err.message);
  }
}

async function toggleDoLater(id, doLater) {
  try {
    await api('/api/emails/' + encodeURIComponent(id) + '/do-later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doLater: !!doLater })
    });
    var listEmail = allEmails.find(function (x) { return x.id === id; });
    if (listEmail) listEmail.doLater = !!doLater;
    if (selectedEmail && selectedEmail.id === id) {
      selectedEmail.doLater = !!doLater;
      renderDetail(selectedEmail);
    }
    if (doLater) {
      if (listEmail && doLaterEmails.indexOf(listEmail) === -1) doLaterEmails.push(listEmail);
    } else {
      doLaterEmails = doLaterEmails.filter(function (x) { return x.id !== id; });
    }
    renderEmails();
    renderDoLater();
  } catch (err) {
    if (!handleReconnectError(err)) showError('Do later failed: ' + err.message);
  }
}

/* ---------- tasks ---------- */

function renderTasks() {
  $('taskCount').textContent = tasks.length ? '(' + tasks.length + ')' : '';
  var box = $('taskList');
  box.innerHTML = '';
  if (!tasks.length) {
    box.innerHTML = '<p class="muted">No tasks found.</p>';
    return;
  }
  tasks.forEach(function (t) {
    var d = document.createElement('div');
    d.className = 'task-item';
    d.innerHTML = '<div class="task-title">' + esc(t.title) + '</div>' +
      '<div class="task-meta">Due <span class="due">' + esc(t.due || '—') + '</span>' +
      (t.due_source ? ' · ' + esc(t.due_source) : '') +
      ' · Owner: ' + esc(t.owner || 'You') +
      ' · P' + (t.priority != null ? t.priority : '—') +
      (t.email_id ? ' · from ' + esc(t.email_id) : '') + '</div>';
    box.appendChild(d);
  });
}

/* ---------- email detail ---------- */

async function openEmail(id) {
  selectedId = id;
  renderEmails();
  renderDoLater();
  var pane = $('detailPane');
  var content = $('detailContent');
  content.innerHTML = '<p class="muted pad">Loading…</p>';
  pane.classList.add('open');
  $('detailBackBtn').hidden = false;
  // Bring the detail into view: on desktop it is the sticky right
  // column; on narrow screens it is a full overlay.
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    var detail = await api('/api/emails/' + encodeURIComponent(id));
    selectedEmail = detail;
    renderDetail(detail);
  } catch (e) {
    // Fall back to the list copy if the detail endpoint is unavailable.
    var local = allEmails.find(function (x) { return x.id === id; });
    if (local) {
      selectedEmail = local;
      renderDetail(local);
    } else {
      content.innerHTML = '<p class="muted pad">Could not load this email: ' + esc(e.message) + '</p>';
    }
  }
}

function closeDetail() {
  $('detailPane').classList.remove('open');
  $('detailBackBtn').hidden = true;
}

function renderDetail(e) {
  var pane = $('detailPane');
  var content = $('detailContent');
  var html = '';
  html += '<h2>' + esc(e.subject) + '</h2>';
  html += '<p class="d-meta">' + esc(e.from_name || '') + ' &lt;' + esc(e.from || '') + '&gt; · ' + esc(fmtDateLong(e.date)) +
    ' · <span class="cat-label">' + esc(CAT_LABELS[e.category] || e.category) + '</span> · P' + e.priority +
    ' · <span class="collection-tag">' + esc(collectionLabel(e)) + '</span></p>';
  html += '<div class="detail-actions">' +
    '<button type="button" class="btn btn-secondary btn-small" id="detailReadBtn">' +
    (e.read === false ? 'Mark as read' : 'Mark as unread') + '</button>' +
    '<button type="button" class="btn btn-secondary btn-small" id="detailLaterBtn">' +
    (e.doLater ? 'Remove from Do later' : 'Do later') + '</button>' +
    '</div>';
  html += '<h3>Original email</h3>';
  if (e.bodyHtml) {
    // bodyHtml arrives sanitized from the backend; render as HTML.
    html += '<div class="body-html">' + e.bodyHtml + '</div>';
  } else {
    html += '<div class="body-text">' + esc(e.bodyText != null ? e.bodyText : (e.body || '')) + '</div>';
  }
  html += '<h3>Triage</h3>';
  html += '<p class="reason-line"><b>Category:</b> ' + esc(CAT_LABELS[e.category] || e.category) + ' — ' + esc(e.triage_reason || '') + '</p>';
  html += '<p class="reason-line"><b>Priority:</b> P' + e.priority + ' — ' + esc(e.priority_reason || '') + '</p>';
  if (e.task) {
    html += '<p class="task-note">Task found: <b>' + esc(e.task.title) + '</b> — due ' + esc(e.task.due) +
      (e.task.due_source ? ' <span class="muted">(' + esc(e.task.due_source) + ')</span>' : '') + '</p>';
  }
  html += '<h3>Draft reply</h3>';
  if (e.draft) {
    html += '<div class="draft-box">' +
      '<div class="draft-text" id="draftText">' + esc(e.draft) + '</div>' +
      '<div id="draftEditArea"></div>' +
      '<p class="reason-line" style="margin-top:8px">' + esc(e.draft_reason || '') + '</p>' +
      '<div class="draft-actions">' +
      '<button type="button" class="btn btn-primary btn-small" id="approveBtn">Approve</button>' +
      '<button type="button" class="btn btn-secondary btn-small" id="editBtn">Edit</button>' +
      '<button type="button" class="btn btn-primary btn-small" id="sendBtn">Approve &amp; Send</button>' +
      '</div>' +
      '<div id="sendConfirm"></div>' +
      '<p class="draft-status" id="draftStatus"></p>' +
      '</div>';
  } else {
    html += '<p class="reason-line">No draft — ' + esc(e.draft_reason || 'no reply needed for this email.') + '</p>';
  }
  content.innerHTML = html;
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  $('detailReadBtn').addEventListener('click', function () {
    markAsRead(e.id, e.read !== false ? false : true);
  });
  $('detailLaterBtn').addEventListener('click', function () {
    toggleDoLater(e.id, !e.doLater);
  });

  if (!e.draft) return;

  var statusEl = $('draftStatus');
  if (e.sent) {
    statusEl.textContent = 'Sent';
    statusEl.className = 'draft-status sent';
    setDraftButtonsDisabled(true);
  } else if (e.approved) {
    statusEl.textContent = 'Approved';
    statusEl.className = 'draft-status approved';
  }

  $('approveBtn').addEventListener('click', function () { approveDraft(e.id, statusEl); });
  $('editBtn').addEventListener('click', function () { startEditDraft(e.id); });
  $('sendBtn').addEventListener('click', function () { askSendConfirm(e); });
}

function setDraftButtonsDisabled(disabled) {
  ['approveBtn', 'editBtn', 'sendBtn'].forEach(function (id) {
    var b = $(id);
    if (b) b.disabled = disabled;
  });
}

async function approveDraft(id, statusEl) {
  try {
    await api('/api/drafts/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
    statusEl.textContent = 'Approved';
    statusEl.className = 'draft-status approved';
    if (selectedEmail && selectedEmail.id === id) selectedEmail.approved = true;
    var listEmail = allEmails.find(function (x) { return x.id === id; });
    if (listEmail) listEmail.approved = true;
  } catch (err) {
    showError('Approve failed: ' + err.message);
  }
}

function startEditDraft(id) {
  var area = $('draftEditArea');
  var current = selectedEmail ? (selectedEmail.draft || '') : '';
  area.innerHTML = '';
  var ta = document.createElement('textarea');
  ta.id = 'draftEditor';
  ta.value = current;
  area.appendChild(ta);
  var actions = document.createElement('div');
  actions.className = 'draft-actions';
  var save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-primary btn-small';
  save.textContent = 'Save';
  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary btn-small';
  cancel.textContent = 'Cancel';
  actions.appendChild(save);
  actions.appendChild(cancel);
  area.appendChild(actions);
  $('draftText').style.display = 'none';
  $('editBtn').disabled = true;

  cancel.addEventListener('click', function () {
    area.innerHTML = '';
    $('draftText').style.display = '';
    $('editBtn').disabled = false;
  });
  save.addEventListener('click', async function () {
    var text = ta.value;
    save.disabled = true;
    try {
      await api('/api/drafts/' + encodeURIComponent(id) + '/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
      if (selectedEmail && selectedEmail.id === id) selectedEmail.draft = text;
      var listEmail = allEmails.find(function (x) { return x.id === id; });
      if (listEmail) listEmail.draft = text;
      $('draftText').textContent = text;
      $('draftText').style.display = '';
      area.innerHTML = '';
      $('editBtn').disabled = false;
    } catch (err) {
      showError('Save failed: ' + err.message);
      save.disabled = false;
    }
  });
}

function askSendConfirm(e) {
  var box = $('sendConfirm');
  box.innerHTML = '';
  var div = document.createElement('div');
  div.className = 'confirm-box';
  div.innerHTML = '<p>Send this reply to <b>' + esc(e.from_name || e.from || '') + '</b> &lt;' + esc(e.from || '') + '&gt;? ' +
    'This sends a real email. The draft text above is what will be sent.</p>';
  var actions = document.createElement('div');
  actions.className = 'draft-actions';
  var send = document.createElement('button');
  send.type = 'button';
  send.className = 'btn btn-primary btn-small';
  send.textContent = 'Send now';
  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-secondary btn-small';
  cancel.textContent = 'Cancel';
  actions.appendChild(send);
  actions.appendChild(cancel);
  div.appendChild(actions);
  box.appendChild(div);

  cancel.addEventListener('click', function () { box.innerHTML = ''; });
  send.addEventListener('click', async function () {
    send.disabled = true;
    cancel.disabled = true;
    try {
      // Approve first so the send is recorded as approved, then send.
      try {
        await api('/api/drafts/' + encodeURIComponent(e.id) + '/approve', { method: 'POST' });
      } catch (err) { /* approve may already be recorded; continue to send */ }
      await api('/api/drafts/' + encodeURIComponent(e.id) + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      });
      box.innerHTML = '';
      var statusEl = $('draftStatus');
      statusEl.textContent = 'Sent';
      statusEl.className = 'draft-status sent';
      setDraftButtonsDisabled(true);
      if (selectedEmail && selectedEmail.id === e.id) selectedEmail.sent = true;
    } catch (err) {
      if (err.status === 404 || err.status === 405) {
        showError('Send is not available on this backend yet — the draft was not sent.');
      } else {
        showError('Send failed: ' + err.message);
      }
      box.innerHTML = '';
    }
  });
}

/* ---------- reminder settings ---------- */

var DEFAULT_HOURS = ['09:00'];

/* Fill hour slots up to `freq` from the spread defaults, so a new slot
   never duplicates an existing hour. */
function padHours(hours, freq) {
  hours = (hours || []).slice(0, freq);
  for (var i = hours.length; i < freq; i++) {
    var candidate = SPREAD_HOURS[i] || '09:00';
    // If the spread value is already taken, nudge forward an hour.
    var tries = 0;
    while (hours.indexOf(candidate) !== -1 && tries < 24) {
      var parts = candidate.split(':');
      candidate = ('0' + ((parseInt(parts[0], 10) + 1) % 24)).slice(-2) + ':' + parts[1];
      tries++;
    }
    hours.push(candidate);
  }
  return hours;
}

function renderHours(hours) {
  var box = $('remHours');
  box.innerHTML = '';
  hours.forEach(function (h, i) {
    var row = document.createElement('div');
    row.className = 'hour-row';
    var label = document.createElement('label');
    label.textContent = 'Reminder ' + (i + 1);
    label.htmlFor = 'remHour' + i;
    var input = document.createElement('input');
    input.type = 'time';
    input.id = 'remHour' + i;
    input.value = h || '09:00';
    row.appendChild(label);
    row.appendChild(input);
    box.appendChild(row);
  });
}

function collectHours() {
  var inputs = $('remHours').querySelectorAll('input[type="time"]');
  var hours = [];
  inputs.forEach(function (input) { hours.push(input.value || '09:00'); });
  return hours;
}

function applySettings(s) {
  var freq = s.frequency_per_day || s.frequency || s.reminders_per_day || 1;
  freq = Math.min(5, Math.max(1, parseInt(freq, 10) || 1));
  var hours = s.hours || s.times || s.reminder_hours || null;
  if (!Array.isArray(hours) || !hours.length) {
    hours = DEFAULT_HOURS.slice();
  }
  hours = padHours(hours, freq);
  $('remFrequency').value = String(freq);
  $('remEnabled').checked = s.enabled !== false;
  $('remTimezone').value = s.timezone || 'Asia/Kolkata';
  renderHours(hours);
}

async function loadSettings() {
  if (settingsLoaded) return;
  try {
    var s = await api('/api/reminders/settings');
    applySettings(s || {});
  } catch (e) {
    // Settings endpoint may not exist yet on the prototype backend:
    // fall back to defaults and let Save create them.
    applySettings({});
  }
  settingsLoaded = true;
}

async function saveSettings(ev) {
  ev.preventDefault();
  var btn = $('saveSettingsBtn');
  var statusEl = $('settingsStatus');
  // frequency is a real integer: the select options carry numeric
  // values "1".."5", parsed here — never "2 per day".
  var freq = parseInt($('remFrequency').value, 10) || 1;
  freq = Math.min(5, Math.max(1, freq));
  var hours = collectHours().slice(0, freq);
  // Client-side validation: reminder hours must be distinct.
  var seen = {};
  var dup = null;
  hours.forEach(function (h) {
    if (seen[h]) dup = h;
    seen[h] = true;
  });
  if (dup) {
    statusEl.textContent = 'Reminder hours must be different — ' + dup + ' is used twice. Change one of them and save again.';
    statusEl.className = 'form-status err';
    return;
  }
  var payload = {
    enabled: $('remEnabled').checked,
    frequency: freq,
    hours: hours,
    timezone: $('remTimezone').value.trim() || 'Asia/Kolkata'
  };
  btn.disabled = true;
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status muted';
  try {
    await api('/api/reminders/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    statusEl.textContent = 'Settings saved.';
    statusEl.className = 'form-status ok';
  } catch (e) {
    if (e.status === 404 || e.status === 405) {
      statusEl.textContent = 'Reminder settings are not available on this backend yet.';
    } else {
      statusEl.textContent = 'Save failed: ' + e.message;
    }
    statusEl.className = 'form-status err';
  } finally {
    btn.disabled = false;
  }
}

async function sendTestReminder() {
  var btn = $('testReminderBtn');
  var statusEl = $('settingsStatus');
  btn.disabled = true;
  statusEl.textContent = 'Sending test reminder…';
  statusEl.className = 'form-status muted';
  try {
    await api('/api/reminders/test', { method: 'POST' });
    statusEl.textContent = 'Test reminder sent — check your inbox.';
    statusEl.className = 'form-status ok';
  } catch (e) {
    statusEl.textContent = e.message || 'Test reminder failed.';
    statusEl.className = 'form-status err';
  } finally {
    btn.disabled = false;
  }
}

/* ---------- boot ---------- */

function init() {
  initTheme();
  readTokenFromUrl();
  readErrorFromUrl();
  renderAuth();

  $('themeToggle').addEventListener('click', toggleTheme);
  $('detailBackBtn').addEventListener('click', closeDetail);
  $('retryBtn').addEventListener('click', function () {
    urlErrorMsg = '';
    hideError();
    if (!token) { showConnectState(); return; }
    loadAll();
  });
  $('dismissErrorBtn').addEventListener('click', function () {
    urlErrorMsg = '';
    hideError();
  });
  $('runBtn').addEventListener('click', function () { runAgents(); });
  $('settingsForm').addEventListener('submit', saveSettings);
  $('testReminderBtn').addEventListener('click', sendTestReminder);
  $('remFrequency').addEventListener('change', function () {
    var freq = parseInt($('remFrequency').value, 10) || 1;
    var hours = padHours(collectHours(), freq);
    renderHours(hours);
  });

  if (!token) {
    showConnectState();
    return;
  }
  showDashboard();
  renderCollectionTabs();
  bootLoad();
}

document.addEventListener('DOMContentLoaded', init);
