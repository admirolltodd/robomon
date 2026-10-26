'use strict';
// Minimap (bottom-right overlay) and the full-screen area map with a legend.

const Minimap = (() => {
  const SIZES = { small: 64, medium: 88, large: 116 };

  // Location categories, each with a color and a drawn symbol.
  const CATS = {
    heal:  { n: 'Recharge Station', c: '#ff4fd8' },
    shop:  { n: 'NanoMart',         c: '#2ee6a0' },
    gym:   { n: 'Grid Node',        c: '#ffe14d' },
    doc:   { n: 'Ripperdoc',        c: '#5ee38a' },
    bar:   { n: 'Bar',              c: '#c46bff' },
    spire: { n: 'Syndicate Spire',  c: '#ff2e55' },
    house: { n: 'Building',         c: '#18f0ff' },
    exit:  { n: 'Route exit',       c: '#f2ecff' },
    up:    { n: 'Elevator',         c: '#18f0ff' },
    cache: { n: 'Loot cache',       c: '#ffb52e' },
    item:  { n: 'Item',             c: '#6ff3ff' },
    foe:   { n: 'Linker to battle', c: '#ff3d5a' },
    boss:  { n: 'Boss',             c: '#ff2e55' },
    you:   { n: 'You',              c: '#ffffff' },
  };
  const WARP_CAT = { center: 'heal', mart: 'shop', gym_chrome: 'gym', gym_pulse: 'gym', clinic: 'doc', bar: 'bar', spire1: 'spire' };

  const TILE_C = {
    '#': '#2a2440', 'D': '#2a2440', 'X': '#1d1830', '~': '#123a7a', ';': '#5a1f5e', 'T': '#155a45', '=': '#4a4020',
    'K': '#3a3546', 'l': '#3a3020', '.': '#15131f', ',': '#1d1a2c', ':': '#16131f', 'g': '#17161f', 'v': '#22202c', 'L': '#5a1020',
  };

  let baked = null, bakedFor = null;

  function bake(map, id) {
    const w = map.rows[0].length, h = map.rows.length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
      x.fillStyle = TILE_C[map.rows[r][q]] || '#0d0b16';
      x.fillRect(q, r, 1, 1);
    }
    baked = c; bakedFor = id;
  }

  // Points of interest for the current map, in tile coordinates.
  function pois(map, mapId, flags, ents) {
    const out = [];
    for (const wp of map.warps || []) {
      let cat = null;
      if (wp.inside) cat = WARP_CAT[wp.to] || 'house';
      else if (wp.to !== '$back' && map.rows[wp.y][wp.x] === 'u') cat = 'up';
      else if (wp.to !== '$back' && map.outdoor) cat = 'exit';
      if (cat && !out.some((p) => p.cat === cat && Math.abs(p.x - wp.x) + Math.abs(p.y - wp.y) <= 1)) out.push({ x: wp.x, y: wp.y, cat });
    }
    for (const e of ents) {
      if (e.kind === 'cache' && !flags[`cache_${mapId}_${e.id}`]) out.push({ x: e.x, y: e.y, cat: 'cache' });
      else if (e.kind === 'item') out.push({ x: e.x, y: e.y, cat: 'item' });
      else if (e.boss) { if (!flags[e.boss.flag]) out.push({ x: e.x, y: e.y, cat: 'boss' }); }
      else if (e.leader) { if (!flags[e.leader.badge]) out.push({ x: e.x, y: e.y, cat: 'boss' }); }
      else if (e.trainer && !flags[`tr_${mapId}_${e.id}`]) out.push({ x: e.x, y: e.y, cat: 'foe' });
    }
    return out;
  }

  function symbol(ctx, cat, x, y, s, t) {
    const c = CATS[cat].c;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * .28);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (cat) {
      case 'heal': ctx.fillRect(-s * .18, -s * .6, s * .36, s * 1.2); ctx.fillRect(-s * .6, -s * .18, s * 1.2, s * .36); break;
      case 'shop': ctx.rect(-s * .5, -s * .3, s, s * .8); ctx.moveTo(-s * .25, -s * .3); ctx.lineTo(-s * .25, -s * .6); ctx.lineTo(s * .25, -s * .6); ctx.lineTo(s * .25, -s * .3); ctx.stroke(); break;
      case 'gym': for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; ctx.lineTo(Math.cos(a) * s * .7, Math.sin(a) * s * .7); ctx.lineTo(Math.cos(a + TAU / 10) * s * .3, Math.sin(a + TAU / 10) * s * .3); } ctx.closePath(); ctx.fill(); break;
      case 'doc': ctx.arc(0, 0, s * .55, 0, TAU); ctx.stroke(); ctx.fillRect(-s * .12, -s * .35, s * .24, s * .7); break;
      case 'bar': ctx.moveTo(-s * .5, -s * .5); ctx.lineTo(s * .5, -s * .5); ctx.lineTo(0, s * .1); ctx.closePath(); ctx.fill(); ctx.fillRect(-s * .06, 0, s * .12, s * .5); break;
      case 'spire': case 'boss': ctx.moveTo(0, -s * .7); ctx.lineTo(s * .55, s * .5); ctx.lineTo(-s * .55, s * .5); ctx.closePath(); ctx.fill(); break;
      case 'house': ctx.moveTo(0, -s * .6); ctx.lineTo(s * .55, -s * .05); ctx.lineTo(s * .4, -s * .05); ctx.lineTo(s * .4, s * .5); ctx.lineTo(-s * .4, s * .5); ctx.lineTo(-s * .4, -s * .05); ctx.lineTo(-s * .55, -s * .05); ctx.closePath(); ctx.fill(); break;
      case 'exit': ctx.arc(0, 0, s * .45, 0, TAU); ctx.stroke(); break;
      case 'up': ctx.moveTo(-s * .45, s * .2); ctx.lineTo(0, -s * .35); ctx.lineTo(s * .45, s * .2); ctx.stroke(); break;
      case 'cache': ctx.moveTo(0, -s * .55); ctx.lineTo(s * .45, 0); ctx.lineTo(0, s * .55); ctx.lineTo(-s * .45, 0); ctx.closePath(); ctx.fill(); break;
      case 'item': ctx.arc(0, 0, s * .3, 0, TAU); ctx.fill(); break;
      case 'foe': ctx.arc(0, 0, s * .35, 0, TAU); ctx.fill(); break;
      case 'you': {
        const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[t] || 0;
        ctx.rotate(a); ctx.moveTo(s * .7, 0); ctx.lineTo(-s * .45, -s * .45); ctx.lineTo(-s * .2, 0); ctx.lineTo(-s * .45, s * .45); ctx.closePath();
        ctx.fill(); ctx.strokeStyle = '#05030b'; ctx.lineWidth = 1; ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  // Draws the map image plus symbols into a box at (bx, by) of size bw x bh. Returns tile scale.
  function drawMap(ctx, map, mapId, bx, by, bw, bh, now, opts = {}) {
    if (bakedFor !== mapId) bake(map, mapId);
    const w = map.rows[0].length, h = map.rows.length;
    const sc = Math.min(bw / w, bh / h);
    const ox = bx + (bw - w * sc) / 2, oy = by + (bh - h * sc) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.drawImage(baked, ox, oy, w * sc, h * sc);
    ctx.globalAlpha = 1;
    const sym = Math.max(3.4, Math.min(sc * 1.1, 9)) * (opts.symScale || 1);
    for (const p of pois(map, mapId, G.state.flags, World.ents)) symbol(ctx, p.cat, ox + (p.x + .5) * sc, oy + (p.y + .5) * sc, sym);
    const P = World.player;
    if (Math.floor(now / 400) % 2 === 0 || opts.steady) symbol(ctx, 'you', ox + (P.px / 32 + .5) * sc, oy + (P.py / 32 + .5) * sc, sym * 1.25, P.dir);
    ctx.restore();
    return sc;
  }

  function render(ctx, W, H, now) {
    const o = G.state.opts;
    if (o.minimap === false || !World.map || UI.busy) return; // stay out of the way of dialogs and menus
    const size = SIZES[o.mapSize || 'medium'];
    const pad = 6, bx = W - size - pad, by = H - size - pad;
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,12,.78)';
    ctx.fillRect(bx - 3, by - 13, size + 6, size + 16);
    ctx.strokeStyle = hexA(World.map.theme, .8); ctx.lineWidth = 1;
    ctx.strokeRect(bx - 2.5, by - 12.5, size + 5, size + 15);
    ctx.fillStyle = '#e9e2ff'; ctx.font = '700 7px "Chakra Petch", system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(World.map.name.toUpperCase(), bx, by - 6.5, size);
    drawMap(ctx, World.map, World.mapId, bx, by, size, size, now, { alpha: .95 });
    ctx.restore();
  }

  // Full-screen map with a legend, opened from the menu.
  async function open() {
    const wrap = document.createElement('div');
    wrap.className = 'bigmap';
    const c = document.createElement('canvas');
    const d = Math.min(3, window.devicePixelRatio || 1);
    c.width = 300 * d; c.height = 220 * d;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `Map of ${World.map.name}`);
    wrap.appendChild(c);
    const x = c.getContext('2d');
    x.scale(d, d);
    x.fillStyle = '#07050f'; x.fillRect(0, 0, 300, 220);
    drawMap(x, World.map, World.mapId, 6, 6, 288, 208, 0, { steady: 1, symScale: 1.2 });
    const present = new Set(pois(World.map, World.mapId, G.state.flags, World.ents).map((p) => p.cat));
    present.add('you');
    const legend = document.createElement('ul');
    legend.className = 'legend';
    for (const cat of Object.keys(CATS)) {
      if (!present.has(cat)) continue;
      const li = document.createElement('li');
      const ic = document.createElement('canvas');
      ic.width = ic.height = 16 * d; ic.setAttribute('aria-hidden', 'true');
      const ix = ic.getContext('2d'); ix.scale(d, d);
      symbol(ix, cat, 8, 8, 9, 'right');
      li.appendChild(ic);
      li.appendChild(document.createTextNode(CATS[cat].n));
      legend.appendChild(li);
    }
    wrap.appendChild(legend);
    await UI.menu({ layout: 'full', title: World.map.name, cancel: true, header: wrap, items: [{ label: 'Back', value: null }] });
  }

  return { render, open, SIZES };
})();
