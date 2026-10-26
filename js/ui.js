'use strict';
// Input (keyboard, touch d-pad, buttons) and DOM overlays: dialog, menus, banners.

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const speed = () => (typeof G !== 'undefined' && G.speed) || 1;
const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed()));
const easeOut = (k) => 1 - (1 - k) * (1 - k);

function tween(obj, key, to, ms, ease = easeOut) {
  const from = obj[key], t0 = performance.now();
  ms /= speed();
  return new Promise((res) => {
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      obj[key] = from + (to - from) * ease(k);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

const Input = (() => {
  const held = [];
  const downs = new Set();
  let fallback = null;

  function press(btn) {
    Sound.unlock();
    if (UI.handle(btn)) return;
    if (fallback) fallback(btn);
  }
  function dirDown(d) {
    if (held.includes(d)) return;
    held.push(d);
    press(d);
  }
  function dirUp(d) {
    const i = held.indexOf(d);
    if (i >= 0) held.splice(i, 1);
  }

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    z: 'a', j: 'a', Enter: 'a', ' ': 'a',
    x: 'b', k: 'b', Escape: 'b', Backspace: 'b',
    m: 'start', q: 'start',
  };
  const DIRS = new Set(['up', 'down', 'left', 'right']);

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const btn = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!btn) return;
    e.preventDefault();
    if (DIRS.has(btn)) { if (!e.repeat) dirDown(btn); }
    else if (!e.repeat) { downs.add(btn); press(btn); }
  });
  window.addEventListener('keyup', (e) => {
    const btn = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (btn && DIRS.has(btn)) dirUp(btn);
    else if (btn) downs.delete(btn);
  });
  window.addEventListener('blur', () => { held.length = 0; downs.clear(); });

  function bindPad() {
    const pad = $('#dpad');
    let active = null;
    const dirFrom = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * .12) return null;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    };
    const set = (d) => {
      if (d === active) return;
      if (active) dirUp(active);
      active = d;
      if (d) dirDown(d);
      pad.dataset.active = d || '';
    };
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); set(dirFrom(e)); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) set(dirFrom(e)); });
    const end = () => set(null);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', end);

    document.querySelectorAll('[data-btn]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); downs.add(b.dataset.btn); press(b.dataset.btn); });
      const up = () => { b.classList.remove('down'); downs.delete(b.dataset.btn); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    });
    // Block double-tap zoom and long-press menus on the controller.
    $('#pad').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  return {
    bindPad,
    press,
    onPress(fn) { fallback = fn; },
    get dir() { return held[held.length - 1] || null; },
    isDown: (btn) => downs.has(btn),
    clear() { held.length = 0; downs.clear(); },
  };
})();

const UI = (() => {
  const stack = [];
  const push = (h) => stack.push(h);
  const pop = (h) => { const i = stack.lastIndexOf(h); if (i >= 0) stack.splice(i, 1); };

  function handle(btn) {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top(btn);
    return true;
  }

  // ---- Dialog ----
  const dlg = () => $('#dialog');
  let typing = null;

  function typeText(el, text, cps, done) {
    el.textContent = '';
    let i = 0;
    const startT = performance.now();
    clearInterval(typing);
    typing = setInterval(() => {
      const n = Math.min(text.length, Math.floor((performance.now() - startT) / 1000 * cps));
      if (n !== i) { i = n; el.textContent = text.slice(0, i); }
      if (i >= text.length) { clearInterval(typing); typing = null; done(); }
    }, 16);
    return () => { clearInterval(typing); typing = null; el.textContent = text; done(); };
  }

  // opts: { name, auto: ms to auto-advance, keep: leave the box open when done }
  function say(text, opts = {}) {
    const pages = String(text).split('\n');
    const box = dlg();
    return new Promise((resolve) => {
      let p = 0, finish = null, ready = false, autoT = null;
      const nameEl = $('#dlg-name'), textEl = $('#dlg-text');
      const close = () => {
        pop(handler);
        box.onclick = null;
        clearTimeout(autoT);
        if (!opts.keep) box.hidden = true;
        resolve();
      };
      const show = () => {
        ready = false;
        box.classList.remove('more');
        nameEl.textContent = opts.name || '';
        nameEl.hidden = !opts.name;
        finish = typeText(textEl, pages[p], (G.textSpeed || 55) * speed(), () => {
          ready = true;
          box.classList.add('more');
          if (opts.auto) autoT = setTimeout(advance, opts.auto / speed());
          if (opts.keep && p === pages.length - 1) close();
        });
      };
      const advance = () => {
        clearTimeout(autoT);
        if (!ready) { finish(); return; }
        p++;
        if (p >= pages.length) { Sound.play('blip'); close(); } else { Sound.play('blip'); show(); }
      };
      const handler = (btn) => { if (btn === 'a' || btn === 'b') advance(); };
      push(handler);
      box.hidden = false;
      box.onclick = advance;
      show();
    });
  }

  function hideDialog() { dlg().hidden = true; }

  // ---- Menus ----
  // opts: { items: [{label, sub, value, disabled, icon, color, right}], title, header (html), cancel, layout: list|grid|side|full, where: 'layer'|'dock', start }
  function menu(opts) {
    return new Promise((resolve) => {
      const host = opts.where === 'dock' ? $('#dock') : $('#layer');
      const el = document.createElement('div');
      el.className = `menu menu-${opts.layout || 'list'}`;
      el.setAttribute('role', 'menu');
      if (opts.title) {
        const h = document.createElement('div');
        h.className = 'menu-title';
        h.innerHTML = `<span>${esc(opts.title)}</span>` + (opts.cancel ? '<button class="menu-x" aria-label="Back">BACK</button>' : '');
        el.appendChild(h);
        const x = h.querySelector('.menu-x');
        if (x) x.onclick = () => { Sound.play('cancel'); done(null); };
      }
      if (opts.header) {
        const h = document.createElement('div');
        h.className = 'menu-header';
        if (typeof opts.header === 'string') h.innerHTML = opts.header; else h.appendChild(opts.header);
        el.appendChild(h);
      }
      const list = document.createElement('div');
      list.className = 'menu-items';
      el.appendChild(list);
      const btns = opts.items.map((it, i) => {
        const b = document.createElement('button');
        b.className = 'mi';
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        if (it.disabled) b.classList.add('off');
        if (it.color) { b.style.setProperty('--mc', it.color); b.classList.add('tinted'); }
        let inner = '';
        if (it.icon) inner += '<canvas class="mi-icon" width="48" height="48" aria-hidden="true"></canvas>';
        inner += `<span class="mi-main"><span class="mi-label">${it.html || esc(it.label)}</span>`;
        if (it.sub) inner += `<span class="mi-sub">${it.subHtml ? it.sub : esc(it.sub)}</span>`;
        inner += '</span>';
        if (it.right) inner += `<span class="mi-right">${esc(it.right)}</span>`;
        b.innerHTML = inner;
        if (it.icon) {
          const c = b.querySelector('canvas');
          const d = Math.min(3, window.devicePixelRatio || 1);
          c.width = 48 * d; c.height = 48 * d;
          const x = c.getContext('2d');
          x.scale(d, d);
          Sprites.drawBot(x, it.icon, 24, 44, 38, { sil: it.iconSil, mods: it.iconMods });
        }
        b.onclick = () => activate(i);
        b.onpointerenter = () => focus(i, true);
        list.appendChild(b);
        return b;
      });
      host.appendChild(el);
      host.classList.add('on');

      let sel = Math.max(0, Math.min(opts.start || 0, btns.length - 1));
      const cols = opts.layout === 'grid' ? 2 : 1;
      function focus(i, quiet) {
        if (i < 0 || i >= btns.length) return;
        if (i !== sel && !quiet) Sound.play('blip');
        btns[sel] && btns[sel].classList.remove('sel');
        sel = i;
        btns[sel].classList.add('sel');
        btns[sel].focus({ preventScroll: true });
        btns[sel].scrollIntoView({ block: 'nearest' });
        if (opts.onFocus) opts.onFocus(opts.items[sel], sel);
      }
      function activate(i) {
        const it = opts.items[i];
        if (!it) return; // empty list: nothing to pick
        if (it.disabled) { Sound.play('bump'); focus(i, true); return; }
        Sound.play('select');
        done(it.value !== undefined ? it.value : i);
      }
      function done(v) {
        pop(handler);
        el.remove();
        if (!host.children.length) host.classList.remove('on');
        resolve(v);
      }
      const handler = (btn) => {
        if (btn === 'up') focus(sel - cols);
        else if (btn === 'down') focus(sel + cols);
        else if (btn === 'left' && cols > 1 && sel % cols) focus(sel - 1);
        else if (btn === 'right' && cols > 1 && sel % cols < cols - 1) focus(sel + 1);
        else if (btn === 'a') activate(sel);
        else if (btn === 'b' && opts.cancel) { Sound.play('cancel'); done(null); }
      };
      push(handler);
      if (btns.length) focus(sel, true);
    });
  }

  // Yes/no style question shown with the dialog box.
  async function ask(text, choices = ['Yes', 'No'], opts = {}) {
    await say(text, { ...opts, keep: true });
    const v = await menu({ items: choices.map((c, i) => ({ label: c, value: i })), layout: 'side', cancel: true });
    hideDialog();
    return v === null ? choices.length - 1 : v;
  }

  function prompt(title, value) {
    return new Promise((resolve) => {
      const host = $('#layer');
      const el = document.createElement('form');
      el.className = 'menu menu-side menu-prompt';
      el.innerHTML = `<label class="menu-title" for="name-input"><span>${esc(title)}</span></label>
        <input id="name-input" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(value)}">
        <button class="mi sel" type="submit">Confirm</button>`;
      host.appendChild(el);
      host.classList.add('on');
      const inp = el.querySelector('input');
      const handler = () => {};
      push(handler);
      setTimeout(() => inp.focus(), 50);
      el.onsubmit = (e) => {
        e.preventDefault();
        const v = inp.value.trim().toUpperCase().replace(/[^A-Z0-9 \-]/g, '').slice(0, 10) || value;
        pop(handler);
        el.remove();
        if (!host.children.length) host.classList.remove('on');
        Sound.play('select');
        resolve(v);
      };
    });
  }

  // A free-form panel (link codes and the like). `build(el, done)` wires its own controls and calls
  // done(value) to close it. Game buttons are swallowed while it's open, and B closes it with null.
  function panel(html, build) {
    return new Promise((resolve) => {
      const host = $('#layer'), el = document.createElement('form');
      el.className = 'menu menu-full menu-panel';
      el.innerHTML = html;
      host.appendChild(el);
      host.classList.add('on');
      const handler = (btn) => { if (btn === 'b') { Sound.play('cancel'); done(null); } };
      const done = (v) => { pop(handler); el.remove(); if (!host.children.length) host.classList.remove('on'); resolve(v); };
      push(handler);
      el.onsubmit = (e) => e.preventDefault();
      build(el, done);
    });
  }

  let bannerT = null;
  function banner(name, sub) {
    const b = $('#banner');
    b.innerHTML = `<strong>${esc(name)}</strong>` + (sub ? `<span>${esc(sub)}</span>` : '');
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => { b.hidden = true; }, 2600);
  }

  return { handle, say, ask, menu, prompt, panel, banner, hideDialog, get busy() { return stack.length > 0; } };
})();
