/* Inbox Agent — dashboard client. No dependencies, same-origin /api calls.
   Auth: session token in localStorage, sent as Bearer on every request.
   The backend may be the prototype (seed data, no auth) or the real app
   (Gmail OAuth, reminders, send). Endpoints that do not exist yet fail
   gracefully and the UI says so instead of breaking. */

'use strict';

var TOKEN_KEY = 'inbox_agent_token';
var EMAIL_KEY = 'inbox_agent_email';

var CATEGORIES = ['urgent', 'action', 'fyi', 'promo', 'spam'];
var CAT_LABELS = { urgent: 'Urgent', action: 'Action', fyi: 'FYI', promo: 'Promo', spam: 'Spam' };

var token = localStorage.getItem(TOKEN_KEY) || '';
var accountEmail = localStorage.getItem(EMAIL_KEY) || '';

var allEmails = [];
var counts = { urgent: 0, action: 0, fyi: 0, promo: 0, spam: 0 };
var tasks = [];
var currentFilter = '';
var selectedId = null;
var selectedEmail = null;
var settingsLoaded = false;

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
  allEmails = [];
  tasks = [];
  selectedId = null;
  selectedEmail = null;
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
  hideError();
  var results = await Promise.allSettled([
    api('/api/status'),
    api('/api/emails'),
    api('/api/tasks')
  ]);
  var statusFailed = results[0].status === 'rejected';
  var emailsFailed = results[1].status === 'rejected';
  var tasksFailed = results[2].status === 'rejected';

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
  renderCounts();
  renderNeeds();
  renderFilters();
  renderEmails();
  renderTasks();

  if (statusFailed && emailsFailed && tasksFailed) {
    showError('Could not load the inbox: ' + results[0].reason.message);
  } else if (emailsFailed) {
    showError('Could not load emails: ' + results[1].reason.message);
  } else if (tasksFailed) {
    showError('Could not load tasks: ' + results[2].reason.message);
  }
}

function renderEngine(st) {
  if (!st) {
    $('engineLine').textContent = 'Engine: unavailable';
    return;
  }
  var parts = [];
  if (st.engine) parts.push('Engine: ' + st.engine);
  if (st.note) parts.push(st.note);
  $('engineLine').textContent = parts.join('  ·  ');
  if (st.last_run_seconds != null) {
    $('lastRun').textContent = 'Last run: ' + st.last_run_seconds + 's';
  }
}

async function runAgents() {
  var btn = $('runBtn');
  btn.disabled = true;
  btn.textContent = 'Running…';
  hideError();
  try {
    var res = await api('/api/run', { method: 'POST' });
    if (res && res.seconds != null) {
      $('lastRun').textContent = 'Last run: ' + res.seconds + 's · just now';
    } else {
      $('lastRun').textContent = 'Last run: just now';
    }
    await loadAll();
  } catch (e) {
    showError('Run failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run the agents';
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
  var list = allEmails
    .filter(function (e) { return !currentFilter || e.category === currentFilter; })
    .sort(function (a, b) { return b.priority - a.priority; });
  if (!list.length) {
    box.innerHTML = '<p class="muted pad">' +
      (currentFilter ? 'No emails in this category.' : 'No emails yet. Run the agents to triage your inbox.') +
      '</p>';
    return;
  }
  list.forEach(function (e) {
    var d = document.createElement('div');
    d.className = 'row' + (e.id === selectedId ? ' selected' : '');
    d.innerHTML =
      '<div><div class="sender">' + esc(e.from_name || '') + ' &lt;' + esc(e.from || '') + '&gt; · ' + esc(fmtDate(e.date)) + '</div>' +
      '<div class="subject">' + esc(e.subject) + '</div></div>' +
      '<span class="cat-label">' + esc(CAT_LABELS[e.category] || e.category) + '</span>' +
      '<span class="prio' + (e.priority >= 4 ? ' high' : '') + '">P' + e.priority + '</span>' +
      '<div class="reason">' + esc(e.triage_reason || '') + '</div>';
    d.addEventListener('click', function () { openEmail(e.id); });
    box.appendChild(d);
  });
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
  var pane = $('detailPane');
  pane.innerHTML = '<p class="muted pad">Loading…</p>';
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
      pane.innerHTML = '<p class="muted pad">Could not load this email: ' + esc(e.message) + '</p>';
    }
  }
}

function renderDetail(e) {
  var pane = $('detailPane');
  var html = '';
  html += '<h2>' + esc(e.subject) + '</h2>';
  html += '<p class="d-meta">' + esc(e.from_name || '') + ' &lt;' + esc(e.from || '') + '&gt; · ' + esc(fmtDateLong(e.date)) +
    ' · <span class="cat-label">' + esc(CAT_LABELS[e.category] || e.category) + '</span> · P' + e.priority + '</p>';
  html += '<h3>Original email</h3>';
  html += '<div class="body-text">' + esc(e.body || '') + '</div>';
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
  pane.innerHTML = html;

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
  while (hours.length < freq) hours.push('09:00');
  hours = hours.slice(0, freq);
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
  var freq = parseInt($('remFrequency').value, 10) || 1;
  var payload = {
    enabled: $('remEnabled').checked,
    frequency_per_day: freq,
    hours: collectHours().slice(0, freq),
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

/* ---------- boot ---------- */

function init() {
  readTokenFromUrl();
  renderAuth();

  $('retryBtn').addEventListener('click', function () {
    hideError();
    if (!token) { showConnectState(); return; }
    loadAll();
  });
  $('dismissErrorBtn').addEventListener('click', hideError);
  $('runBtn').addEventListener('click', runAgents);
  $('settingsForm').addEventListener('submit', saveSettings);
  $('remFrequency').addEventListener('change', function () {
    var freq = parseInt($('remFrequency').value, 10) || 1;
    var hours = collectHours();
    while (hours.length < freq) hours.push('09:00');
    renderHours(hours.slice(0, freq));
  });

  if (!token) {
    showConnectState();
    return;
  }
  showDashboard();
  loadAll();
  loadSettings();
}

document.addEventListener('DOMContentLoaded', init);
