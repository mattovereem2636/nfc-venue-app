// ─────────────────────────────────────────────────────────────────────────────
// routes/public.js
// Guest-facing routes — the page guests see when they tap the NFC tag
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { getState, getActivePDFPath, formatDate, formatBytes, UPLOADS_DIR } = require('../middleware/pdfState');

// ── GET / — Main guest landing page ──────────────────────────────────────────
router.get('/', (req, res) => {
  const state = getState();
  const hasPDF = !!getActivePDFPath();

  // Build cache-busting timestamp for PDF URL
  const cacheBust = state.updatedAt
    ? new Date(state.updatedAt).getTime()
    : Date.now();

  res.app.locals.render(res, 'guest', {
    HAS_PDF:         hasPDF ? 'true' : 'false',
    PDF_URL:         hasPDF ? `/uploads/${state.active}?v=${cacheBust}` : '',
    DOC_LABEL:       state.docLabel || 'Document',
    UPDATED_AT:      state.updatedAt ? formatDate(state.updatedAt) : '',
    FILE_SIZE:       formatBytes(state.history[0]?.sizeBytes || 0),
    SHOW_NO_DOC_MSG: hasPDF ? 'none' : 'block',
    SHOW_VIEWER:     hasPDF ? 'block' : 'none',
  });
});

// ── GET /view — Direct PDF viewer page (full screen) ─────────────────────────
router.get('/view', (req, res) => {
  const pdfPath = getActivePDFPath();
  if (!pdfPath) {
    return res.redirect('/');
  }
  const state = getState();
  const cacheBust = state.updatedAt ? new Date(state.updatedAt).getTime() : Date.now();

  res.app.locals.render(res, 'viewer', {
    PDF_URL:   `/uploads/${state.active}?v=${cacheBust}`,
    DOC_LABEL: state.docLabel || 'Document',
  });
});

// ── GET /privacy — Privacy policy ────────────────────────────────────────────
router.get('/privacy', (req, res) => {
  res.app.locals.render(res, 'privacy', {});
});

// ── GET /health — Health check for hosting platforms ─────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
