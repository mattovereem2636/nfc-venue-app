// ─────────────────────────────────────────────────────────────────────────────
// NFC Venue App — server.js
// Main Express application entry point
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const helmet       = require('helmet');
const session      = require('express-session');
const flash        = require('connect-flash');
const rateLimit    = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure uploads directory exists ──────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Security headers (helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // inline scripts for admin UI
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      objectSrc:   ["'self'"],                       // allows PDF embed
      frameSrc:    ["'self'"],                       // allows PDF iframe
      connectSrc:  ["'self'"],
      imgSrc:      ["'self'", "data:"],
    }
  },
  // Allow PDF embedding in iframes on our own domain
  frameguard: false
}));

// Force HTTPS in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session configuration ─────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000  // 2 hours
  }
}));

app.use(flash());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Admin login: strict limit to prevent brute force
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts per window
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// General admin routes: moderate limit
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

// Public routes: generous limit
const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/static', express.static(path.join(__dirname, 'public')));

// ── View engine ───────────────────────────────────────────────────────────────
// We use plain HTML templates with a simple render helper rather than a
// templating engine dependency — keeps the stack lean and deployable everywhere
app.set('views', path.join(__dirname, 'views'));

// ── Template rendering helper ─────────────────────────────────────────────────
// Reads an HTML file and replaces {{VARIABLE}} placeholders
app.locals.render = function(res, templateName, vars = {}) {
  const filePath = path.join(__dirname, 'views', `${templateName}.html`);
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error(`Template not found: ${templateName}`, err);
      return res.status(500).send('Internal server error');
    }
    // Replace all {{KEY}} placeholders
    let html = content;
    // Built-in vars available to all templates
    const allVars = {
      VENUE_NAME:       process.env.VENUE_NAME || 'Venue',
      VENUE_TAGLINE:    process.env.VENUE_TAGLINE || 'Tap for information',
      ACTIVE_DOC_LABEL: process.env.ACTIVE_DOC_LABEL || 'Document',
      ACCENT_COLOR:     process.env.ACCENT_COLOR || '1A6FA8',
      YEAR:             new Date().getFullYear(),
      ...vars
    };
    Object.entries(allVars).forEach(([key, val]) => {
      html = html.replaceAll(`{{${key}}}`, val ?? '');
    });
    res.send(html);
  });
};

// ── Routes ────────────────────────────────────────────────────────────────────
const publicRoutes = require('./routes/public');
const adminRoutes  = require('./routes/admin');
const apiRoutes    = require('./routes/api');

app.use('/', publicLimiter, publicRoutes);
app.use('/admin', adminLimiter, adminRoutes);
app.use('/api', apiRoutes);

// Admin login POST gets stricter limiting
app.use('/admin/login', adminLoginLimiter);

// ── Serve uploaded PDFs ────────────────────────────────────────────────────────
// Only the active PDF is publicly accessible by a stable URL
// Individual files are served with cache-busting headers
app.use('/uploads', (req, res, next) => {
  // Only allow direct access to active.pdf — not the full upload history
  if (!req.path.startsWith('/active.pdf') && !req.path.startsWith('/active-')) {
    return res.status(404).send('Not found');
  }
  next();
}, express.static(UPLOADS_DIR, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/pdf');
  }
}));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404);
  app.locals.render(res, '404', {});
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Something went wrong. Please try again.');
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🟢 NFC Venue App running on port ${PORT}`);
  console.log(`   Public:  http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin`);
  console.log(`   Env:     ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
