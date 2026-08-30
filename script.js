/* =========================================================================
   Rutgers QFC — Link hub logic
   - One sign-up form (Rutgers NetID + details) gates the links
   - On submit: one row goes to the Google Sheet, then the links are revealed
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

  /* NetIDs are turned into an email as `<netid>@<SCARLETMAIL_DOMAIN>`. */
  SCARLETMAIL_DOMAIN: 'scarletmail.rutgers.edu',

  /* Graduation years shown in the dropdown — edit yearly. */
  GRAD_YEARS: ['2026', '2027', '2028', '2029', '2030', '2031'],

  /* If true, a returning visitor who already signed up skips the form. */
  REMEMBER_UNLOCK: true,
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
    url: 'https://rutgersqfc.com/rtqf',
  },
  {
    label: 'Research Teams on GitHub',
    sub: 'ML pricing · RL trading · rough volatility · LOB models',
    url: 'https://github.com/Rutgers-Quant-Finance-Club',
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

/** Stable per-visitor id stamped on the submission row. */
function getSid() {
  let sid = store.get(KEY.sid);
  if (!sid) { sid = uuid(); store.set(KEY.sid, sid); }
  return sid;
}

const $ = (sel, root = document) => root.querySelector(sel);

/* -------------------------------------------------------------------------
   4. Field validation
   ------------------------------------------------------------------------- */

/** Accept a bare NetID or a full Rutgers address; return the lowercased NetID. */
function normalizeNetid(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/@(scarletmail\.)?rutgers\.edu$/, '');
}

function isValidNetid(netid) {
  // Rutgers NetIDs are alphanumeric, ~2-6 letters + digits. Stay forgiving.
  return /^[a-z0-9]{2,20}$/.test(netid) && /[a-z]/.test(netid);
}

function emailFromNetid(netid) {
  return netid + '@' + CONFIG.SCARLETMAIL_DOMAIN;
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
  discord: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
  groupme: '<svg viewBox="-1.5 -1.5 27 27" fill="currentColor" aria-hidden="true"><path d="M11.1597 6.57419H12.8398V8.16898H11.1597V6.57419ZM18.1997 0H5.80011C3.14898 0 1 2.03979 1 4.55577V16.3243C1 18.8402 3.14898 20.88 5.80011 20.88H9.92715L11.9786 24L14.0306 20.88H18.1997C20.8506 20.88 23 18.8402 23 16.3243V4.55574C23 2.03976 20.8506 0 18.1997 0ZM7.56833 8.16895H9.34755V6.57416H7.56833V4.85447H9.34755V3.16587H11.1597V4.85447H12.8398V3.16587H14.6519V4.85447H16.4308V6.57416H14.6519V8.16895H16.4308V9.88852H14.6519V11.5772H12.8398V9.88852H11.1597V11.5772H9.34755V9.88852H7.56833V8.16895ZM20.3122 13.4321C20.3122 13.4321 17.9202 17.708 12.2406 17.708C12.1619 17.708 12.0843 17.707 12.007 17.7057C11.9299 17.707 11.8522 17.708 11.7737 17.708C6.09416 17.708 3.70211 13.4321 3.70211 13.4321C3.70211 13.4321 3.54729 13.1536 3.54729 12.8534C3.53754 12.6368 3.64915 12.3263 3.9421 12.1433C4.105 12.0417 4.259 11.9914 4.40179 11.9757C5.08566 11.9069 5.48202 12.3295 5.80794 12.8121C6.16788 13.3447 8.24445 15.678 12.007 15.7672C15.7698 15.678 17.8464 13.3447 18.2063 12.8121C18.5322 12.3295 18.9429 11.9062 19.6125 11.9757C19.7553 11.9914 19.9094 12.0417 20.0722 12.1433C20.3652 12.3263 20.4792 12.5839 20.469 12.8532C20.446 13.2494 20.3122 13.4321 20.3122 13.4321Z"/></svg>',
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
}

/** Fill the graduation-year <select> from CONFIG.GRAD_YEARS. */
function populateGradYears() {
  const sel = $('#gradYear');
  if (!sel || sel.options.length > 1) return;
  CONFIG.GRAD_YEARS.forEach((y) => {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    sel.appendChild(o);
  });
}

/* -------------------------------------------------------------------------
   7. Reveal transition
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

/* -------------------------------------------------------------------------
   8. Sign-up form
   ------------------------------------------------------------------------- */

function initGate() {
  const form = $('#gate-form');
  const errEl = $('#gate-error');
  const btn = $('#gate-submit');

  const fields = {
    netid: $('#netid'),
    firstName: $('#firstName'),
    lastName: $('#lastName'),
    major: $('#major'),
    gradYear: $('#gradYear'),
    goals: $('#goals'),
    meetTime: $('#meetTime'),
  };

  const clearError = () => {
    errEl.textContent = '';
    Object.values(fields).forEach((el) => el && el.setAttribute('aria-invalid', 'false'));
  };
  const fail = (msg, el) => {
    errEl.textContent = msg;
    if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
  };

  form.addEventListener('input', clearError);
  form.addEventListener('change', clearError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot tripped -> pretend success, send nothing.
    if ($('#company') && $('#company').value.trim() !== '') {
      store.set(KEY.unlocked, '1');
      revealHub();
      return;
    }

    const netid = normalizeNetid(fields.netid.value);
    const data = {
      type: 'signup',
      netid: netid,
      email: netid ? emailFromNetid(netid) : '',
      firstName: fields.firstName.value.trim(),
      lastName: fields.lastName.value.trim(),
      major: fields.major.value.trim(),
      gradYear: fields.gradYear.value,
      goals: fields.goals.value.trim(),
      meetTime: fields.meetTime.value.trim(),
    };

    // --- validation (all required except "goals" and "meetTime") ---
    if (!netid) return fail('Enter your Rutgers NetID.', fields.netid);
    if (!isValidNetid(netid))
      return fail('That doesn’t look like a NetID (e.g. abc123).', fields.netid);
    if (!data.firstName) return fail('Enter your first name.', fields.firstName);
    if (!data.lastName) return fail('Enter your last name.', fields.lastName);
    if (!data.major) return fail('Enter your major.', fields.major);
    if (!data.gradYear) return fail('Select your graduation year.', fields.gradYear);

    clearError();
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    // Persist + reveal immediately; never block the user on the network.
    store.set(KEY.email, data.email);
    if (CONFIG.REMEMBER_UNLOCK) store.set(KEY.unlocked, '1');

    revealHub();

    sendToSheet(data)
      .then((r) => {
        if (r.skipped) console.warn('[QFC] signup not stored (WEB_APP_URL missing).');
        else if (!r.ok && !r.opaque) console.warn('[QFC] signup POST did not confirm.');
      })
      .catch((err) => console.error('[QFC] signup error', err));
  });
}

/* -------------------------------------------------------------------------
   9. Boot
   ------------------------------------------------------------------------- */

function boot() {
  // ?reset  ->  clear saved state (handy for testing the form)
  if (/(^|[?&#])reset\b/.test(location.search + location.hash)) {
    Object.values(KEY).forEach(store.del);
  }

  populateGradYears();
  initGate();

  const alreadyUnlocked = CONFIG.REMEMBER_UNLOCK && store.get(KEY.unlocked) === '1';
  if (alreadyUnlocked) {
    revealHub({ animate: false });
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
