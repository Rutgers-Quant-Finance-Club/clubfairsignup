# Rutgers QFC — Link Hub

Static, single-page Linktree-style site for the Rutgers Quantitative Finance Club.
A single sign-up form (Rutgers email + first/last name, phone, major, grad year,
and an optional "what do you hope to get out of QFC?") gates the links. On submit
one row is written to a Google Sheet and the links are revealed.
No build step — plain `index.html` + `styles.css` + `script.js`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup: sign-up form + link hub |
| `styles.css` | Styling (light + dark, mobile-first, Rutgers scarlet accent) |
| `script.js` | Form validation, reveal transition, `fetch()` submission |
| `Code.gs` | Google Apps Script Web App that appends rows to your Sheet |

## Setup

### 1. Google Sheet + Apps Script
1. Create a Google Sheet (tabs are auto-created on first submit).
2. **Extensions → Apps Script**, paste all of `Code.gs`, save.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the `…/exec` URL.

### 2. Wire up the frontend
In `script.js`, set:
```js
const CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
  ...
};
```

### 3. Deploy to GitHub Pages
Push these files to the repo root (or `/docs`) and enable Pages in
**Settings → Pages**. That's it — the site is fully static.

## Notes
- **Edit links** in the `LINKS` / `SOCIALS` arrays in `script.js`.
- **Allowed email domains** live in `CONFIG.ALLOWED_EMAIL_DOMAINS`.
- **Make a field optional:** remove its `required` attribute in `index.html` and
  delete its check in `initGate()` in `script.js`. `goals` is already optional.
- Rows land in the **Signups** tab, one per submission, stamped with a
  `Submission ID`.
- Add `?reset` to the URL to clear the saved sign-up state while testing.
- The club's official QFC monogram lives in `assets/` (`logo_black.png` for
  light mode, `logo_white.png` swapped in for dark mode via `<picture>`), pulled
  from rutgersqfc.com. It's also the favicon / OG image.
- Re-run **Deploy → Manage deployments → New version** in Apps Script after any
  edit to `Code.gs`.

### Why it works from a static host (CORS)
`script.js` sends the body as `text/plain`, which is a CORS "simple request",
so the browser skips the preflight `OPTIONS` call that Apps Script can't answer.
Apps Script web apps return `Access-Control-Allow-Origin: *` on the real
response, so `fetch()` can read the JSON result. If the primary call ever
throws, the code retries once as a fire-and-forget `no-cors` POST so a sign-up
is never lost. The links are revealed immediately on submit — the network call
never blocks the user.
