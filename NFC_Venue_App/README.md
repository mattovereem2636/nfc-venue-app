# NFC Venue App

A lightweight Node.js web application for delivering venue maps, event schedules, and PDF documents via NFC tag tap. Guests tap → document opens instantly. Staff update content in seconds from a passcode-protected admin panel. No app required on guest devices.

---

## Stack

- **Node.js / Express** — web server
- **Multer** — PDF upload handling
- **bcrypt** — passcode hashing
- **express-rate-limit** — brute-force protection
- **helmet** — security headers
- **express-session** — admin session management

No database required. Document state is stored in a local JSON file (`uploads/state.json`).

---

## Project Structure

```
nfc-venue-app/
├── server.js                  # Main Express app
├── package.json
├── .env.example               # Config template — copy to .env
├── routes/
│   ├── public.js              # Guest-facing routes
│   ├── admin.js               # Admin panel routes (protected)
│   └── api.js                 # JSON status API
├── middleware/
│   ├── auth.js                # Session auth guard
│   └── pdfState.js            # PDF state manager (active doc, history)
├── views/
│   ├── guest.html             # Guest landing page
│   ├── admin-login.html       # Admin login page
│   ├── admin-dashboard.html   # Admin dashboard
│   ├── viewer.html            # Full-screen PDF viewer
│   ├── privacy.html           # Privacy policy
│   └── 404.html               # 404 page
├── uploads/                   # PDF storage (git-ignored)
│   └── state.json             # Active document state
└── scripts/
    └── generate-hash.js       # Passcode hash generator
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your venue name, passcode hash, and session secret.

### 3. Generate your admin passcode hash

```bash
node scripts/generate-hash.js
```

Enter your desired passcode. Copy the output `ADMIN_PASSCODE_HASH=...` line into your `.env` file.

**Never store your passcode in plaintext.** The hash is all the app needs.

### 4. Generate a session secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `SESSION_SECRET` in your `.env` file.

### 5. Start the app

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

App runs on `http://localhost:3000` by default.

---

## Routes

| Route               | Access | Description                        |
|---------------------|--------|------------------------------------|
| `GET /`             | Public | Guest landing page                 |
| `GET /view`         | Public | Full-screen PDF viewer             |
| `GET /privacy`      | Public | Privacy policy                     |
| `GET /health`       | Public | Health check (returns JSON)        |
| `GET /api/status`   | Public | Current document status (JSON)     |
| `GET /admin`        | Staff  | Redirect to login or dashboard     |
| `GET /admin/login`  | Staff  | Login page                         |
| `POST /admin/login` | Staff  | Login form submit                  |
| `GET /admin/dashboard` | Staff (auth) | Admin dashboard             |
| `POST /admin/upload`   | Staff (auth) | Upload new PDF              |
| `POST /admin/rollback` | Staff (auth) | Restore previous version    |
| `POST /admin/logout`   | Staff (auth) | End session                 |

---

## NFC Tag Setup

Once deployed, write the public URL to your NFC tags:

1. Install **NFC Tools** (free, iOS & Android)
2. Open app → **Write** → **Add a Record** → **URL / URI**
3. Enter: `https://your-deployed-url.com`
4. Hold phone to tag — write completes in under 3 seconds
5. Test by tapping tag with a different phone

**Lock the tag after writing** (NFC Tools Pro) to prevent tampering.

---

## Deployment

### Render.com (recommended for free tier)

1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add all `.env` values as Environment Variables in the Render dashboard
6. Deploy

**Note:** Render free tier spins down after 15 minutes of inactivity. For always-on, use the $7/month paid tier.

### Railway

Similar to Render. Add env vars in the Railway dashboard. Deploy from GitHub.

### VPS (DigitalOcean, Linode, etc.)

```bash
git clone your-repo
cd nfc-venue-app
npm install
cp .env.example .env
# edit .env
# Use PM2 for process management:
npm install -g pm2
pm2 start server.js --name nfc-venue
pm2 save
```

---

## PDF Optimization

Before uploading, optimize PDFs for mobile delivery:

- **Target:** Under 2MB per file
- **Tool:** [Smallpdf.com](https://smallpdf.com/compress-pdf) (free)
- **Resolution:** 72–96 DPI is sufficient for screen viewing
- **Orientation:** Portrait preferred for mobile

---

## Security Notes

- Passcode is bcrypt-hashed (never stored plaintext)
- Admin login is rate-limited: 5 attempts per 15 minutes per IP
- Sessions expire after 2 hours of inactivity
- HTTPS is enforced in production (redirect from HTTP)
- Security headers via Helmet
- Upload directory is not directly browsable (only active PDF accessible)
- File uploads are validated for PDF MIME type before storage

---

## Updating Content (Staff Quick Reference)

1. Navigate to `https://your-url.com/admin`
2. Enter passcode
3. Set the **Document Label** (e.g. "Day 2 Schedule")
4. Click **Choose File** and select your PDF
5. Optionally add a staff note
6. Click **Upload & Publish**
7. Tap any NFC tag to confirm the new document is live

Takes under 60 seconds. NFC tags never need to be reprogrammed.

---

## License

MIT — free to use, modify, and deploy.
