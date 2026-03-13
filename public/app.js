// State
let calls = [];
let activeCallId = null;
let activeTab = 'transcript';
const cache = { scorecard: {}, 'ideal-script': {} };

// DOM refs
const callList = document.getElementById('call-list');
const syncBtn = document.getElementById('sync-btn');
const emptyState = document.getElementById('empty-state');
const callView = document.getElementById('call-view');
const callTitle = document.getElementById('call-title');
const callMeta = document.getElementById('call-meta');
const transcriptText = document.getElementById('transcript-text');
const scorecardContent = document.getElementById('scorecard-content');
const idealScriptContent = document.getElementById('ideal-script-content');
const scorecardLoading = document.getElementById('scorecard-loading');
const idealScriptLoading = document.getElementById('ideal-script-loading');
const toast = document.getElementById('toast');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadCalls();
  bindEvents();
}

function bindEvents() {
  syncBtn.addEventListener('click', syncCalls);

  document.getElementById('import-btn').addEventListener('click', importLocal);
  document.getElementById('import-path').addEventListener('keydown', e => {
    if (e.key === 'Enter') importLocal();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

async function importLocal() {
  const input = document.getElementById('import-path');
  const filePath = input.value.trim();
  if (!filePath) return;

  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.textContent = '...';

  // Detect file vs folder by extension
  const isFile = /\.(rtf|txt|md)$/i.test(filePath);
  const endpoint = isFile ? '/api/import/file' : '/api/import/folder';
  const body = isFile ? { filePath } : { folderPath: filePath };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const msg = isFile
      ? `Imported: ${data.title}`
      : `Imported ${data.imported}/${data.total} files`;

    showToast(msg, 'success');
    input.value = '';
    await loadCalls();
  } catch (err) {
    showToast(`Import failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
  }
}

// ── Calls ─────────────────────────────────────────────────────────────────────
async function loadCalls() {
  try {
    const res = await fetch('/api/calls');
    calls = await res.json();
    renderCallList();
  } catch (err) {
    showToast('Failed to load calls', 'error');
  }
}

async function syncCalls() {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  try {
    const res = await fetch('/api/calls/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`Synced ${data.synced} calls`, 'success');
    await loadCalls();
  } catch (err) {
    showToast(`Sync failed: ${err.message}`, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = '⟳ Sync';
  }
}

function renderCallList() {
  if (calls.length === 0) {
    callList.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px;">No calls yet. Hit Sync to load from Fireflies.</div>';
    return;
  }

  callList.innerHTML = calls.map(call => {
    const date = call.date ? new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';
    const duration = call.duration ? formatDuration(call.duration) : '';
    const attendee = primaryAttendee(call.attendees);
    return `
      <div class="call-item ${call.id === activeCallId ? 'active' : ''}" data-id="${call.id}">
        <div class="call-item-title">${escHtml(call.title || 'Untitled Call')}</div>
        <div class="call-item-meta">
          <span>${date}</span>
          ${attendee ? `<span>${escHtml(attendee)}</span>` : ''}
          ${duration ? `<span>${duration}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  callList.querySelectorAll('.call-item').forEach(el => {
    el.addEventListener('click', () => selectCall(el.dataset.id));
  });
}

async function selectCall(id) {
  activeCallId = id;
  activeTab = 'transcript';

  // Update sidebar active state
  document.querySelectorAll('.call-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  // Fetch call data
  try {
    const res = await fetch(`/api/calls/${id}`);
    const call = await res.json();

    callTitle.textContent = call.title || 'Untitled Call';

    const date = call.date ? new Date(call.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const duration = call.duration ? formatDuration(call.duration) : '';
    const attendees = (call.attendees || []).map(a => a.displayName || a.email).join(', ');

    callMeta.innerHTML = [
      date && `<span>${date}</span>`,
      duration && `<span>${duration}</span>`,
      attendees && `<span>${escHtml(attendees)}</span>`
    ].filter(Boolean).join('');

    transcriptText.textContent = call.transcript || 'No transcript available.';

    // Reset generated content
    scorecardContent.textContent = '';
    idealScriptContent.textContent = '';

    // Show call view, activate transcript tab
    emptyState.classList.add('hidden');
    callView.classList.remove('hidden');
    activateTabUI('transcript');

  } catch (err) {
    showToast('Failed to load call', 'error');
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  activateTabUI(tab);

  if (tab === 'scorecard' && !cache.scorecard[activeCallId]) {
    loadGenerated('scorecard');
  } else if (tab === 'ideal-script' && !cache['ideal-script'][activeCallId]) {
    loadGenerated('ideal-script');
  }
}

function activateTabUI(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
}

async function loadGenerated(type) {
  const contentEl = type === 'scorecard' ? scorecardContent : idealScriptContent;
  const loadingEl = type === 'scorecard' ? scorecardLoading : idealScriptLoading;

  loadingEl.classList.remove('hidden');
  contentEl.textContent = '';

  try {
    const res = await fetch(`/api/generate/${activeCallId}/${type}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    cache[type][activeCallId] = data.content;
    contentEl.textContent = data.content;
  } catch (err) {
    contentEl.textContent = `Error: ${err.message}`;
    showToast(`Failed to generate ${type}`, 'error');
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function primaryAttendee(attendees) {
  if (!attendees || attendees.length === 0) return '';
  // Return the first non-Jason attendee, or just first attendee
  const other = attendees.find(a => {
    const name = (a.displayName || '').toLowerCase();
    return !name.includes('jason') && !name.includes('bondi');
  });
  return (other || attendees[0])?.displayName || '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = type;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
