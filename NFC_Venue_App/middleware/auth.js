// ─────────────────────────────────────────────────────────────────────────────
// middleware/auth.js
// Session-based authentication guard for admin routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireAuth — middleware that checks session for admin login
 * If not authenticated, redirects to /admin/login with a flash message
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminAuthenticated === true) {
    return next();
  }
  req.flash('error', 'You must be logged in to access the admin panel.');
  return res.redirect('/admin/login');
}

/**
 * redirectIfAuthenticated — for login page:
 * already logged in? send to dashboard
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.adminAuthenticated === true) {
    return res.redirect('/admin/dashboard');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
