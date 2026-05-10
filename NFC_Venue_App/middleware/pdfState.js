// ─────────────────────────────────────────────────────────────────────────────
// middleware/pdfState.js
// Manages the active PDF state — which file is currently live,
// upload history, and document metadata
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const UPLOADS_DIR  = path.join(__dirname, '..', 'uploads');
const STATE_FILE   = path.join(UPLOADS_DIR, 'state.json');
const MAX_HISTORY  = parseInt(process.env.MAX_PDF_HISTORY || '5', 10);

// ── Default state shape ───────────────────────────────────────────────────────
const DEFAULT_STATE = {
  active: null,          // filename of currently active PDF
  docLabel: process.env.ACTIVE_DOC_LABEL || 'Document',
  updatedAt: null,       // ISO timestamp of last update
  updatedBy: 'system',   // free-text note (e.g. staff name, optional)
  history: []            // array of { filename, uploadedAt, label, sizeBytes }
};

// ── Read state from disk ──────────────────────────────────────────────────────
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Error reading PDF state file:', err);
  }
  return { ...DEFAULT_STATE };
}

// ── Write state to disk ───────────────────────────────────────────────────────
function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing PDF state file:', err);
    throw err;
  }
}

// ── Get current state ─────────────────────────────────────────────────────────
function getState() {
  return readState();
}

// ── Activate a new PDF ────────────────────────────────────────────────────────
// Called after a successful upload
function activatePDF(filename, label, sizeBytes, staffNote = '') {
  const state = readState();

  // Add previous active to history if exists
  if (state.active) {
    state.history.unshift({
      filename: state.active,
      uploadedAt: state.updatedAt,
      label: state.docLabel,
      sizeBytes: state.history[0]?.sizeBytes || 0
    });
  }

  // Set new active
  state.active    = filename;
  state.docLabel  = label || process.env.ACTIVE_DOC_LABEL || 'Document';
  state.updatedAt = new Date().toISOString();
  state.updatedBy = staffNote || 'admin';

  // Add to history
  state.history.unshift({
    filename,
    uploadedAt: state.updatedAt,
    label: state.docLabel,
    sizeBytes,
    active: true
  });

  // Prune history beyond max — delete old files from disk
  if (state.history.length > MAX_HISTORY) {
    const toRemove = state.history.splice(MAX_HISTORY);
    toRemove.forEach(item => {
      if (!item.active || item.filename !== state.active) {
        const filePath = path.join(UPLOADS_DIR, item.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            console.warn('Could not delete old PDF:', item.filename, e.message);
          }
        }
      }
    });
  }

  // Mark only current active in history
  state.history = state.history.map((item, i) => ({
    ...item,
    active: i === 0
  }));

  writeState(state);
  return state;
}

// ── Rollback to a previous version ───────────────────────────────────────────
function rollbackToPDF(filename) {
  const state = readState();
  const historyItem = state.history.find(h => h.filename === filename);

  if (!historyItem) {
    throw new Error(`PDF not found in history: ${filename}`);
  }

  // Verify file still exists on disk
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file no longer exists on disk: ${filename}`);
  }

  state.active    = filename;
  state.docLabel  = historyItem.label;
  state.updatedAt = new Date().toISOString();
  state.updatedBy = 'rollback';

  // Move to front of history
  state.history = [
    { ...historyItem, active: true, uploadedAt: state.updatedAt },
    ...state.history.filter(h => h.filename !== filename).map(h => ({ ...h, active: false }))
  ];

  writeState(state);
  return state;
}

// ── Get active PDF path ───────────────────────────────────────────────────────
function getActivePDFPath() {
  const state = readState();
  if (!state.active) return null;
  const filePath = path.join(UPLOADS_DIR, state.active);
  return fs.existsSync(filePath) ? filePath : null;
}

// ── Format file size for display ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Format date for display ───────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

module.exports = {
  getState,
  activatePDF,
  rollbackToPDF,
  getActivePDFPath,
  formatBytes,
  formatDate,
  UPLOADS_DIR
};
