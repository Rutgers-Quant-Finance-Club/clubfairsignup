# Rutgers QFC — Link Hub

Static, single-page Linktree-style site for the Rutgers Quantitative Finance Club.
Email-gated (Rutgers addresses only), with an optional slide-up intake form.
No build step — plain `index.html` + `styles.css` + `script.js`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup: email gate, link hub, intake banner |
| `styles.css` | Styling (light + dark, mobile-first, Rutgers scarlet accent) |
| `script.js` | Gate validation, reveal transitions, `fetch()` submission |
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
- Add `?reset` to the URL to clear the saved unlock/intake state while testing.
- The email row and the intake row share a `Submission ID` so you can join them.
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
throws, the code retries once as a fire-and-forget `no-cors` POST so a signup
is never lost.
