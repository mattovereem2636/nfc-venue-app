// ─────────────────────────────────────────────────────────────────────────────
// routes/api.js
// JSON API endpoints — document status, used by the landing page JS
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { getState, getActivePDFPath, formatDate, formatBytes } = require('../middleware/pdfState');

// ── GET /api/status — current document status ─────────────────────────────────
router.get('/status', (req, res) => {
  const state   = getState();
  const hasPDF  = !!getActivePDFPath();
  const cacheBust = state.updatedAt ? new Date(state.updatedAt).getTime() : null;

  res.json({
    hasDocument:  hasPDF,
    docLabel:     state.docLabel || null,
    updatedAt:    state.updatedAt || null,
    updatedAtFmt: state.updatedAt ? formatDate(state.updatedAt) : null,
    pdfUrl:       hasPDF ? `/uploads/${state.active}?v=${cacheBust}` : null,
  });
});

module.exports = router;
