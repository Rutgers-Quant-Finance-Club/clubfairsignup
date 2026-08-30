/* =========================================================================
   Rutgers QFC — Link hub logic
   - Email gate (Rutgers-only) -> reveals link hub
   - Optional "cookie banner" intake form
   - Async submission to a Google Apps Script Web App (no backend needed)
   ========================================================================= */

'use strict';

/* -------------------------------------------------------------------------
   1. CONFIG  —  PASTE YOUR VALUES HERE
   ------------------------------------------------------------------------- */

const CONFIG = {
  /* Deploy Code.gs as a Web App (Deploy > New deployment > Web app,
     "Execute as: Me", "Who has access: Anyone") and paste the /exec URL: */
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycby2jDQDPi2e_zTcvTHpJvB01pIWPedZ-2GndofbMgtpN99BC-bdYzlwgXxL265eRUHXVw/exec',

  /* Domains accepted by the email gate. Add 'rutgers.edu' subdomains here
     if you want to loosen it (e.g. 'eden.rutgers.edu'). */
  ALLOWED_EMAIL_DOMAINS: ['scarletmail.rutgers.edu', 'rutgers.edu'],

  /* If true, a returning visitor who already verified skips the gate. */
  REMEMBER_UNLOCK: true,

  /* Delay (ms) before the intake banner slides up after unlock. */
  INTAKE_DELAY_MS: 900,
};

/* -------------------------------------------------------------------------
   2. LINK DATA  —  edit freely
   ------------------------------------------------------------------------- */

const LINKS = [
  {
    label: 'Join the Mailing List',
    sub: 'Every meeting, event & opportunity by email',
    url: 'http://eepurl.com/ceUP_z',
  },
  {
    label: 'Club Website',
    sub: 'rutgersqfc.com',
    url: 'https://rutgersqfc.com',
  },
  {
    label: 'Trade the Knight',
    sub: 'Algorithmic trading competition',
    url: 'https://rutgersqfc.com/competition',
  },
  {
    label: 'Road to Quant Finance',
    sub: 'Quant challenge series',
    url: 'https://rutgersqfc.com/quant-challenge',
  },
  {
    label: 'Research Teams on GitHub',
    sub: 'ML pricing · RL trading · rough volatility · LOB models',
    // NOTE: verify this org URL — replace if the club uses a different handle.
    url: 'https://github.com/RutgersQFC',
  },
  {
    label: 'Get Involved @ Rutgers',
    sub: 'Official student organization page',
    url: 'https://rutgers.campuslabs.com/engage/organization/qfc',
  },
];

const SOCIALS = [
  { label: 'Instagram', url: 'https://www.instagram.com/rutgersqfc', icon: 'instagram' },
  { label: 'LinkedIn',  url: 'https://www.linkedin.com/company/rutgersqfc', icon: 'linkedin' },
  { label: 'Discord',   url: 'https://discord.gg/3D6FHTFfYp', icon: 'discord' },
  { label: 'GroupMe',   url: 'https://groupme.com/join_group/62574721/hoPK9PwN', icon: 'groupme' },
  { label: 'Email',     url: 'mailto:rutgersqfc@gmail.com', icon: 'email' },
];

/* -------------------------------------------------------------------------
   3. Storage keys / helpers
   ------------------------------------------------------------------------- */

const KEY = {
  unlocked: 'qfc_unlocked',
  email: 'qfc_email',
  sid: 'qfc_sid',
  intakeDone: 'qfc_intake_done',
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable per-visitor id that ties the email row to the intake row. */
function getSid() {
  let sid = store.get(KEY.sid);
  if (!sid) { sid = uuid(); store.set(KEY.sid, sid); }
  return sid;
}

const $ = (sel, root = document) => root.querySelector(sel);

/* -------------------------------------------------------------------------
   4. Email validation
   ------------------------------------------------------------------------- */

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isRutgersEmail(email) {
  const m = /^[^\s@]+@([^\s@]+)$/.exec(email);
  if (!m) return false;
  const domain = m[1];
  return CONFIG.ALLOWED_EMAIL_DOMAINS.some(
    (d) => domain === d || domain.endsWith('.' + d)
  );
}

/* -------------------------------------------------------------------------
   5. Network — send to Google Apps Script
   ------------------------------------------------------------------------- */

/**
 * POSTs JSON as a "simple request" (text/plain) so the browser skips the
 * CORS preflight that Apps Script cannot answer. Apps Script web apps return
 * Access-Control-Allow-Origin:* on the actual response, so this works from
 * GitHub Pages. Falls back to a fire-and-forget no-cors POST if anything
 * throws, so a signup is never lost to a transient error.
 *
 * @returns {Promise<{ok:boolean, skipped?:boolean, opaque?:boolean, error?:string}>}
 */
async function sendToSheet(payload) {
  const url = CONFIG.WEB_APP_URL;
  if (!url || url.indexOf('PASTE_YOUR') === 0) {
    console.warn('[QFC] CONFIG.WEB_APP_URL is not set — skipping network call.', payload);
    return { ok: false, skipped: true };
  }

  const body = JSON.stringify({
    ...payload,
    sid: getSid(),
    ts: new Date().toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    page: location.href,
    referrer: document.referrer || '',
    ua: navigator.userAgent,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      keepalive: true,
    });
    return { ok: res.ok };
  } catch (err) {
    // Opaque fallback — we can't read the response but the row still lands.
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        keepalive: true,
      });
      return { ok: true, opaque: true };
    } catch (err2) {
      console.error('[QFC] submission failed', err2);
      return { ok: false, error: String(err2) };
    }
  }
}

/* -------------------------------------------------------------------------
   6. Rendering the hub
   ------------------------------------------------------------------------- */

const ICONS = {
  arrow: '<svg class="link__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.4" fill="currentColor"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C20.4 8.65 21 11.2 21 14.3V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21H9z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 5.3A17 17 0 0 0 15.7 4l-.2.4a13 13 0 0 1 3.7 1.9 12 12 0 0 0-10.4 0A13 13 0 0 1 12.5 4.4L12.3 4A17 17 0 0 0 8 5.3C5.2 9.4 4.5 13.4 4.8 17.3A17 17 0 0 0 10 20l.9-1.5a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.9 0l.4.3c-.6.4-1.2.7-1.8.9L20 20a17 17 0 0 0 5.2-2.7c.4-4.6-.7-8.5-3.2-12zM9.7 15c-.9 0-1.6-.9-1.6-1.9S8.8 11 9.7 11s1.7.9 1.6 1.9c0 1-.7 1.9-1.6 1.9zm5.6 0c-.9 0-1.6-.9-1.6-1.9S14.4 11 15.3 11s1.7.9 1.6 1.9c0 1-.7 1.9-1.6 1.9z"/></svg>',
  groupme: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8a11 11 0 0 1-3.4-.5L4 20l1.2-3.3A7.3 7.3 0 0 1 3 11c0-4.4 4-8 9-8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function buildHub() {
  const linksRoot = $('#links');
  const socialRoot = $('#socials');
  if (linksRoot && !linksRoot.childElementCount) {
    linksRoot.innerHTML = LINKS.map((l) => `
      <a class="link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">
        <span class="link__label">${escapeHtml(l.label)}</span>
        ${l.sub ? `<span class="link__sub">${escapeHtml(l.sub)}</span>` : ''}
        ${ICONS.arrow}
      </a>`).join('');
  }
  if (socialRoot && !socialRoot.childElementCount) {
    socialRoot.innerHTML = SOCIALS.map((s) => `
      <li>
        <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(s.label)}" title="${escapeAttr(s.label)}">
          ${ICONS[s.icon] || ''}
        </a>
      </li>`).join('');
  }
  const yr = $('#year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  // Graduation-year options: this year .. +6
  const sel = $('#gradYear');
  if (sel && sel.options.length <= 1) {
    const now = new Date().getFullYear();
    for (let y = now; y <= now + 6; y++) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      sel.appendChild(o);
    }
  }
}

/* -------------------------------------------------------------------------
   7. Reveal / conceal transitions
   ------------------------------------------------------------------------- */

function revealHub({ animate = true } = {}) {
  const gate = $('#gate');
  const hub = $('#hub');
  buildHub();

  if (!animate) {
    gate.hidden = true;
    hub.hidden = false;
    hub.classList.add('is-in');
    return;
  }

  gate.classList.add('is-out');
  const done = () => {
    gate.hidden = true;
    hub.hidden = false;
    // next frame so the transition actually plays
    requestAnimationFrame(() => requestAnimationFrame(() => {
      hub.classList.add('is-in');
      const h = $('#hub-title');
      if (h) h.focus();
    }));
  };
  gate.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 500); // fallback if transitionend never fires
}

function showIntake() {
  if (store.get(KEY.intakeDone) === '1') return;
  const el = $('#intake');
  if (!el || !el.hidden) return;
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
}

function hideIntake(markDone) {
  const el = $('#intake');
  if (!el) return;
  el.classList.remove('is-in');
  const finish = () => { el.hidden = true; };
  el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 600);
  if (markDone) store.set(KEY.intakeDone, '1');
}

/* -------------------------------------------------------------------------
   8. Wiring
   ------------------------------------------------------------------------- */

function initGate() {
  const form = $('#gate-form');
  const input = $('#email');
  const errEl = $('#gate-error');
  const btn = $('#gate-submit');

  const clearErr = () => { errEl.textContent = ''; input.setAttribute('aria-invalid', 'false'); };
  input.addEventListener('input', clearErr);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot tripped -> pretend success, send nothing.
    if ($('#company') && $('#company').value.trim() !== '') {
      revealHub();
      return;
    }

    const email = normalizeEmail(input.value);
    if (!email) {
      errEl.textContent = 'Enter your Rutgers email to continue.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (!isRutgersEmail(email)) {
      errEl.textContent = 'Use a @scarletmail.rutgers.edu or @rutgers.edu address.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }

    clearErr();
    btn.disabled = true;
    btn.textContent = 'Verifying…';

    // Persist + reveal immediately; never block the user on the network.
    store.set(KEY.email, email);
    if (CONFIG.REMEMBER_UNLOCK) store.set(KEY.unlocked, '1');

    revealHub();
    setTimeout(showIntake, CONFIG.INTAKE_DELAY_MS);

    // Fire the signup row in the background.
    sendToSheet({ type: 'email', email })
      .then((r) => {
        if (r.skipped) console.warn('[QFC] signup not stored (WEB_APP_URL missing).');
      })
      .catch((err) => console.error('[QFC] signup error', err));
  });
}

function initIntake() {
  const form = $('#intake-form');
  const statusEl = $('#intake-status');

  $('#intake-dismiss').addEventListener('click', () => hideIntake(true));
  $('#intake-skip').addEventListener('click', () => hideIntake(true));

  const openBtn = $('#open-intake');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      store.del(KEY.intakeDone);
      showIntake();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if ($('#website') && $('#website').value.trim() !== '') { hideIntake(true); return; }

    const data = {
      type: 'intake',
      email: store.get(KEY.email) || '',
      firstName: $('#firstName').value.trim(),
      lastName: $('#lastName').value.trim(),
      major: $('#major').value.trim(),
      gradYear: $('#gradYear').value,
      goals: $('#goals').value.trim(),
    };

    if (!data.firstName || !data.lastName || !data.major || !data.gradYear) {
      statusEl.textContent = 'Please fill in name, major, and graduation year (or hit Skip).';
      return;
    }

    const submitBtn = $('#intake-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    statusEl.textContent = '';

    const r = await sendToSheet(data);
    store.set(KEY.intakeDone, '1');

    if (r.ok || r.opaque) {
      statusEl.textContent = 'Thanks — see you at a meeting!';
    } else if (r.skipped) {
      statusEl.textContent = 'Saved locally (form endpoint not configured yet).';
    } else {
      statusEl.textContent = 'Could not reach the server, but no worries — you still have the links.';
    }
    setTimeout(() => hideIntake(true), 1100);
  });
}

/* -------------------------------------------------------------------------
   9. Boot
   ------------------------------------------------------------------------- */

function boot() {
  // ?reset  ->  clear everything (handy for testing the gate)
  if (/(^|[?&#])reset\b/.test(location.search + location.hash)) {
    Object.values(KEY).forEach(store.del);
  }

  initGate();
  initIntake();

  const alreadyUnlocked = CONFIG.REMEMBER_UNLOCK && store.get(KEY.unlocked) === '1';
  if (alreadyUnlocked) {
    revealHub({ animate: false });
    if (store.get(KEY.intakeDone) !== '1') {
      setTimeout(showIntake, CONFIG.INTAKE_DELAY_MS);
    }
  }
}

/* -------------------------------------------------------------------------
   10. Tiny HTML escapers (link data is trusted, but be safe)
   ------------------------------------------------------------------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
