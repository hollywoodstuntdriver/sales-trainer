// ── State ──────────────────────────────────────────────────────────────────────
let calls = [];
let activeCallId = null;
let activeTab = 'transcript';
const cache = { scorecard: {}, 'ideal-script': {} };

// ── DOM refs ───────────────────────────────────────────────────────────────────
const sidebar       = document.getElementById('sidebar');
const callList      = document.getElementById('call-list');
const syncBtn       = document.getElementById('sync-btn');
const toggleBtn     = document.getElementById('toggle-btn');
const tabsEl        = document.getElementById('tabs');
const tabContent    = document.getElementById('tab-content');
const emptyState    = document.getElementById('empty-state');
const callTitle     = document.getElementById('call-title');
const callMeta      = document.getElementById('call-meta');
const transcriptBody       = document.getElementById('transcript-body');
const scorecardContent     = document.getElementById('scorecard-content');
const idealScriptContent   = document.getElementById('ideal-script-content');
const scorecardLoading     = document.getElementById('scorecard-loading');
const idealScriptLoading   = document.getElementById('ideal-script-loading');
const toast         = document.getElementById('toast');

// ── Editable title ─────────────────────────────────────────────────────────────
let titleBeforeEdit = '';

callTitle.addEventListener('focus', () => {
  titleBeforeEdit = callTitle.textContent;
  // Select all on focus
  const range = document.createRange();
  range.selectNodeContents(callTitle);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

callTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); callTitle.blur(); }
  if (e.key === 'Escape') { callTitle.textContent = titleBeforeEdit; callTitle.blur(); }
});

callTitle.addEventListener('blur', async () => {
  const newTitle = callTitle.textContent.trim();
  if (!newTitle) { callTitle.textContent = titleBeforeEdit; return; }
  if (newTitle === titleBeforeEdit) return;

  try {
    const res = await fetch(`/api/calls/${activeCallId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    // Update sidebar item title
    const el = callList.querySelector(`.call-item[data-id="${CSS.escape(activeCallId)}"] .call-item-title`);
    if (el) el.textContent = newTitle;
  } catch (err) {
    callTitle.textContent = titleBeforeEdit;
    showToast('Failed to save title', 'error');
  }
});

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  await loadCalls();
  bindEvents();
}

function bindEvents() {
  syncBtn.addEventListener('click', syncCalls);
  toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

  document.getElementById('import-btn').addEventListener('click', importLocal);
  document.getElementById('import-path').addEventListener('keydown', e => {
    if (e.key === 'Enter') importLocal();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// ── Import ─────────────────────────────────────────────────────────────────────
async function importLocal() {
  const input = document.getElementById('import-path');
  const filePath = input.value.trim();
  if (!filePath) return;

  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.textContent = '...';

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

// ── Calls ──────────────────────────────────────────────────────────────────────
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
    callList.innerHTML = `<div style="padding:16px;color:var(--text-muted);font-size:12px;font-family:var(--font-mono);">No calls yet. Hit Sync.</div>`;
    return;
  }

  // Group by month + year
  const groups = {};
  for (const call of calls) {
    const d = new Date(call.date);
    const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(call);
  }

  let html = '';
  for (const [month, monthCalls] of Object.entries(groups)) {
    html += `<div class="calls-section-label">${month}</div>`;
    for (const call of monthCalls) {
      const date = call.date
        ? new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      const duration = call.duration ? formatDuration(call.duration) : '';
      const isActive = call.id === activeCallId;
      const dotStyle = isActive ? '' : 'background:#C8C3B8;';
      html += `
        <div class="call-item ${isActive ? 'active' : ''}" data-id="${escHtml(call.id)}">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <div class="call-dot" style="${dotStyle}margin-top:4px;"></div>
            <div style="flex:1;min-width:0;">
              <div class="call-item-title${isActive ? '' : ' inactive'}">${escHtml(call.title || 'Untitled Call')}</div>
              <div class="call-item-meta">
                ${date ? `<span>${date}</span>` : ''}
                ${duration ? `<span>${duration}</span>` : ''}
              </div>
            </div>
          </div>
        </div>`;
    }
  }

  callList.innerHTML = html;
  callList.querySelectorAll('.call-item').forEach(el => {
    el.addEventListener('click', () => selectCall(el.dataset.id));
  });
}

async function selectCall(id) {
  activeCallId = id;
  activeTab = 'transcript';

  document.querySelectorAll('.call-item').forEach(el => {
    const isActive = el.dataset.id === id;
    el.classList.toggle('active', isActive);
    const dot = el.querySelector('.call-dot');
    if (dot) dot.style.background = isActive ? '' : '#C8C3B8';
    const title = el.querySelector('.call-item-title');
    if (title) title.classList.toggle('inactive', !isActive);
  });

  try {
    const res = await fetch(`/api/calls/${id}`);
    const call = await res.json();

    callTitle.textContent = call.title || 'Untitled Call';
    callTitle.setAttribute('contenteditable', 'true');

    const date = call.date
      ? new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const duration = call.duration ? formatDuration(call.duration) : '';
    const speakerCount = countSpeakers(call.transcript);

    callMeta.innerHTML = [
      date     && `<span class="chip">${date}</span>`,
      duration && `<span class="chip">${duration}</span>`,
      speakerCount && `<span class="chip">${speakerCount} speaker${speakerCount !== 1 ? 's' : ''}</span>`
    ].filter(Boolean).join('');

    transcriptBody.innerHTML = renderTranscript(call.transcript);

    // Reset generated content
    scorecardContent.textContent = '';
    idealScriptContent.textContent = '';
    resetIdealScriptTab();

    // Restore override if cached for this call
    if (idealOverrideCache[id]) {
      idealAiContent.classList.add('hidden');
      idealUserRows.innerHTML = idealOverrideCache[id];
      idealUserRows.classList.remove('hidden');
      idealOverrideLabel.innerHTML = 'Using <span>your script &#x2713;</span>';
      idealOverrideBtn.textContent = 'Edit your script';
    }

    // Show call view
    emptyState.classList.add('hidden');
    tabContent.classList.remove('hidden');
    tabsEl.classList.remove('hidden');
    activateTabUI('transcript');

  } catch (err) {
    showToast('Failed to load call', 'error');
  }
}

// ── Transcript rendering ───────────────────────────────────────────────────────
function renderTranscript(text) {
  if (!text) return '<p style="padding:20px;color:var(--text-muted);">No transcript available.</p>';

  // Try timestamped format: "Speaker Name: MM:SS  text"
  // Entries may be concatenated without newlines (e.g. "...text.NextSpeaker: 00:26  Hi")
  const tsRe = /([A-Za-z][A-Za-z\s]{0,40}?):\s+(\d{1,2}:\d{2})\s+([\s\S]*?)(?=\s*[A-Za-z][A-Za-z\s]{0,40}?:\s+\d{1,2}:\d{2}|$)/g;
  const tsRows = [...text.matchAll(tsRe)];

  if (tsRows.length > 0) {
    return tsRows.map(m => {
      const speaker = m[1].trim();
      const ts = m[2];
      const content = m[3].trim();
      const isHighlight = !speaker.toLowerCase().includes('jason');
      return `<div class="speaker-row">
        <div class="row-ts">${escHtml(ts)}</div>
        <div class="row-speaker${isHighlight ? ' highlight' : ''}">${escHtml(speaker)}</div>
        <div class="row-text">${escHtml(content)}</div>
      </div>`;
    }).join('');
  }

  // Fallback: newline-separated "Speaker: text" (Fireflies without timestamps)
  const rows = text.split('\n').filter(l => l.trim()).map(line => {
    const m = line.match(/^(.+?):\s+(.*)/);
    if (m) {
      const isHighlight = !m[1].toLowerCase().includes('jason');
      return `<div class="speaker-row">
        <div class="row-ts"></div>
        <div class="row-speaker${isHighlight ? ' highlight' : ''}">${escHtml(m[1].trim())}</div>
        <div class="row-text">${escHtml(m[2].trim())}</div>
      </div>`;
    }
    return `<div class="speaker-row"><div class="row-ts"></div><div class="row-speaker"></div><div class="row-text">${escHtml(line)}</div></div>`;
  });
  return rows.join('');
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
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
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? 'var(--bg)' : 'var(--sidebar-bg)';
    btn.style.borderBottom = isActive ? '2px solid var(--bg)' : 'none';
    btn.style.position = isActive ? 'relative' : '';
    btn.style.zIndex = isActive ? '1' : '0';
  });
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
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

// ── Helpers ────────────────────────────────────────────────────────────────────
function countSpeakers(transcript) {
  if (!transcript) return 0;
  const speakers = new Set();
  // Use the same full-entry regex as renderTranscript to avoid false matches inside dialogue
  const re = /([A-Za-z][A-Za-z\s]{0,40}?):\s+(\d{1,2}:\d{2})\s+([\s\S]*?)(?=\s*[A-Za-z][A-Za-z\s]{0,40}?:\s+\d{1,2}:\d{2}|$)/g;
  for (const m of transcript.matchAll(re)) speakers.add(m[1].trim());
  if (speakers.size === 0) {
    for (const m of transcript.matchAll(/^(.+?):\s+.+/gm)) speakers.add(m[1].trim());
  }
  return speakers.size;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

// ── Ideal script override ──────────────────────────────────────────────────────
const idealOverrideModal  = document.getElementById('ideal-override-modal');
const idealOverrideText   = document.getElementById('ideal-override-text');
const idealOverrideSave   = document.getElementById('ideal-override-save');
const idealOverrideLabel  = document.getElementById('ideal-override-label');
const idealOverrideBtn    = document.getElementById('ideal-override-btn');
const idealAiContent      = document.getElementById('ideal-ai-content');
const idealUserRows       = document.getElementById('ideal-user-rows');
const idealOverrideCache  = {}; // { [callId]: renderedHtml }

document.getElementById('ideal-override-btn').addEventListener('click', () => {
  idealOverrideText.value = '';
  idealOverrideModal.classList.remove('hidden');
  idealOverrideText.focus();
});

document.getElementById('ideal-override-cancel').addEventListener('click', () => {
  idealOverrideModal.classList.add('hidden');
});

idealOverrideModal.addEventListener('click', e => {
  if (e.target === idealOverrideModal) idealOverrideModal.classList.add('hidden');
});

idealOverrideSave.addEventListener('click', async () => {
  const raw = idealOverrideText.value.trim();
  if (!raw) { idealOverrideText.focus(); return; }

  idealOverrideSave.disabled = true;
  idealOverrideSave.textContent = 'Reformatting...';

  try {
    const res = await fetch('/api/generate/reformat-ideal-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawScript: raw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const rows = renderTranscript(data.content);
    idealOverrideCache[activeCallId] = rows;

    idealAiContent.classList.add('hidden');
    idealUserRows.innerHTML = rows;
    idealUserRows.classList.remove('hidden');

    idealOverrideLabel.innerHTML = 'Using <span>your script &#x2713;</span>';
    idealOverrideBtn.textContent = 'Edit your script';

    idealOverrideModal.classList.add('hidden');
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    idealOverrideSave.disabled = false;
    idealOverrideSave.textContent = 'Save & reformat';
  }
});

function resetIdealScriptTab() {
  idealAiContent.classList.remove('hidden');
  idealUserRows.classList.add('hidden');
  idealUserRows.innerHTML = '';
  idealOverrideLabel.innerHTML = 'Generated by <span>AI &#x2713;</span>';
  idealOverrideBtn.textContent = 'Use your own script instead';
}

// ── Manual entry modal ─────────────────────────────────────────────────────────
const modalOverlay  = document.getElementById('modal-overlay');
const modalCallName = document.getElementById('modal-call-name');
const modalDate     = document.getElementById('modal-date');
const modalTranscript = document.getElementById('modal-transcript');
const modalSaveBtn  = document.getElementById('modal-save');

document.getElementById('manual-btn').addEventListener('click', () => {
  modalCallName.value = '';
  modalDate.value = '';
  modalTranscript.value = '';
  modalOverlay.classList.remove('hidden');
  modalCallName.focus();
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});

modalSaveBtn.addEventListener('click', async () => {
  const callName = modalCallName.value.trim();
  const rawTranscript = modalTranscript.value.trim();
  if (!callName) { modalCallName.focus(); return; }
  if (!rawTranscript) { modalTranscript.focus(); return; }

  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = 'Reformatting...';

  try {
    const res = await fetch('/api/import/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callName, date: modalDate.value.trim(), rawTranscript })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    modalOverlay.classList.add('hidden');
    showToast(`Saved: ${data.title}`, 'success');
    await loadCalls();
    selectCall(data.id);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = 'Save & reformat';
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
