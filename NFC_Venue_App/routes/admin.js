// ─────────────────────────────────────────────────────────────────────────────
// routes/admin.js
// Passcode-protected admin routes — login, dashboard, upload, rollback, logout
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');

const { requireAuth, redirectIfAuthenticated } = require('../middleware/auth');
const {
  getState, activatePDF, rollbackToPDF,
  formatDate, formatBytes, UPLOADS_DIR
} = require('../middleware/pdfState');

// ── Multer configuration ──────────────────────────────────────────────────────
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || '15', 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    // Timestamp-prefixed filename, sanitized
    const timestamp = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

// ── GET /admin — redirect to login or dashboard ───────────────────────────────
router.get('/', (req, res) => {
  if (req.session && req.session.adminAuthenticated) {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/admin/login');
});

// ── GET /admin/login ──────────────────────────────────────────────────────────
router.get('/login', redirectIfAuthenticated, (req, res) => {
  const errorMsg = req.flash('error')[0] || '';
  res.app.locals.render(res, 'admin-login', {
    ERROR_MSG:   errorMsg,
    SHOW_ERROR:  errorMsg ? 'block' : 'none',
  });
});

// ── POST /admin/login ─────────────────────────────────────────────────────────
router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { passcode } = req.body;

  if (!passcode) {
    req.flash('error', 'Please enter the admin passcode.');
    return res.redirect('/admin/login');
  }

  try {
    const hash = process.env.ADMIN_PASSCODE_HASH;

    // In development without a hash, fall back to plaintext comparison
    let valid = false;
    if (hash && hash.startsWith('$2b$')) {
      valid = await bcrypt.compare(passcode, hash);
    } else {
      // Dev mode: plaintext comparison (log a warning)
      const devPasscode = process.env.ADMIN_PASSCODE || 'admin123';
      valid = passcode === devPasscode;
      if (valid) {
        console.warn('⚠️  WARNING: Using plaintext passcode comparison. Set ADMIN_PASSCODE_HASH in production.');
      }
    }

    if (!valid) {
      console.warn(`Failed admin login attempt from IP: ${req.ip}`);
      req.flash('error', 'Incorrect passcode. Please try again.');
      return res.redirect('/admin/login');
    }

    // Success — create authenticated session
    req.session.adminAuthenticated = true;
    req.session.loginTime = new Date().toISOString();
    console.log(`Admin login successful from IP: ${req.ip}`);
    return res.redirect('/admin/dashboard');

  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'An error occurred. Please try again.');
    return res.redirect('/admin/login');
  }
});

// ── GET /admin/dashboard ──────────────────────────────────────────────────────
router.get('/dashboard', requireAuth, (req, res) => {
  const state   = getState();
  const hasPDF  = !!state.active;
  const history = state.history || [];

  // Build history rows HTML
  const historyRows = history.map((item, i) => `
    <tr class="${item.active ? 'active-row' : ''}">
      <td>
        ${item.active ? '<span class="badge-live">LIVE</span>' : `
          <form method="POST" action="/admin/rollback" style="display:inline">
            <input type="hidden" name="filename" value="${escHtml(item.filename)}">
            <button type="submit" class="btn-rollback"
              onclick="return confirm('Restore this version?')">Restore</button>
          </form>
        `}
      </td>
      <td>${escHtml(item.label || 'Document')}</td>
      <td class="mono">${escHtml(formatDate(item.uploadedAt))}</td>
      <td class="mono">${escHtml(formatBytes(item.sizeBytes))}</td>
      <td class="filename-cell">${escHtml(item.filename)}</td>
    </tr>
  `).join('');

  res.app.locals.render(res, 'admin-dashboard', {
    HAS_PDF:           hasPDF ? 'true' : 'false',
    CURRENT_LABEL:     escHtml(state.docLabel || '—'),
    CURRENT_UPDATED:   escHtml(formatDate(state.updatedAt)),
    CURRENT_FILENAME:  escHtml(state.active || '—'),
    SHOW_CURRENT:      hasPDF ? 'block' : 'none',
    SHOW_NO_DOC:       hasPDF ? 'none' : 'block',
    HISTORY_ROWS:      historyRows || '<tr><td colspan="5" class="empty-msg">No uploads yet</td></tr>',
    MAX_MB:            MAX_MB,
    SUCCESS_MSG:       req.flash('success')[0] || '',
    ERROR_MSG:         req.flash('error')[0] || '',
    SHOW_SUCCESS:      req.flash('success')[0] ? 'flex' : 'none',
    SHOW_ERROR_BANNER: req.flash('error')[0] ? 'flex' : 'none',
    LOGIN_TIME:        escHtml(formatDate(req.session.loginTime)),
  });
});

// ── POST /admin/upload ────────────────────────────────────────────────────────
router.post('/upload', requireAuth, (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.flash('error', `File too large. Maximum size is ${MAX_MB}MB. Compress the PDF and try again.`);
      } else {
        req.flash('error', err.message || 'Upload failed. Please try again.');
      }
      return res.redirect('/admin/dashboard');
    }

    if (!req.file) {
      req.flash('error', 'No file selected. Please choose a PDF to upload.');
      return res.redirect('/admin/dashboard');
    }

    try {
      const label     = (req.body.docLabel || process.env.ACTIVE_DOC_LABEL || 'Document').trim();
      const staffNote = (req.body.staffNote || '').trim().substring(0, 100);

      activatePDF(req.file.filename, label, req.file.size, staffNote);

      console.log(`PDF updated: ${req.file.filename} (${req.file.size} bytes) by staff: "${staffNote}"`);
      req.flash('success', `✓ "${label}" is now live. All NFC taps will receive the new document.`);
    } catch (err) {
      console.error('Error activating PDF:', err);
      req.flash('error', 'Upload succeeded but activation failed. Please try again.');
    }

    return res.redirect('/admin/dashboard');
  });
});

// ── POST /admin/rollback ──────────────────────────────────────────────────────
router.post('/rollback', requireAuth, (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    req.flash('error', 'Invalid rollback request.');
    return res.redirect('/admin/dashboard');
  }

  try {
    const state = rollbackToPDF(filename);
    req.flash('success', `✓ Restored to previous version: "${state.docLabel}"`);
  } catch (err) {
    console.error('Rollback error:', err);
    req.flash('error', `Rollback failed: ${err.message}`);
  }

  return res.redirect('/admin/dashboard');
});

// ── POST /admin/logout ────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.redirect('/admin/login');
  });
});

// ── Helper: escape HTML to prevent XSS in template interpolation ──────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = router;
