'use strict';
// Procedural renderer for Robomon, people and small props. Robomon are drawn as armored
// mechs: every part goes through shell() (shaded plate + hard outline), limbs are segments
// joined by lit joints, and neon is saved for accents, eyes and cores so they read in the dark.
// Robomon are built from blueprint parts (see SPECIES[*].bp) in a 100-unit box
// whose origin sits on the ground under the creature.

const TAU = Math.PI * 2;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(h1, h2, f) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const Sprites = (() => {
  const LEG_H = { none: 0, two: 16, four: 12, six: 10, treads: 13, hover: 0 };
  const BODY = { orb: [52, 50], egg: [46, 56], box: [54, 46], slab: [64, 54], hex: [56, 50] };

  let px = 1; // device pixels per unit, so glow survives the transform
  const CHROME = '#dfe6f2', BLADE = '#ff2e55', WIRE = '#ff4fd8';

  function glow(ctx, color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * px;
  }

  function line(ctx, color, w, blur) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    glow(ctx, color, blur);
  }

  function bodyPath(ctx, shape, w, h) {
    ctx.beginPath();
    if (shape === 'orb') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    else if (shape === 'egg') {
      ctx.moveTo(0, -h / 2);
      ctx.bezierCurveTo(w * .62, -h / 2, w * .56, h / 2, 0, h / 2);
      ctx.bezierCurveTo(-w * .56, h / 2, -w * .62, -h / 2, 0, -h / 2);
    } else if (shape === 'box') { rrect(ctx, -w / 2, -h / 2, w, h, 10); return; }
    else if (shape === 'slab') {
      ctx.moveTo(-w * .36, -h / 2); ctx.lineTo(w * .36, -h / 2); ctx.lineTo(w / 2, -h * .08);
      ctx.lineTo(w * .4, h / 2); ctx.lineTo(-w * .4, h / 2); ctx.lineTo(-w / 2, -h * .08);
    } else if (shape === 'hex') {
      ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 4, -h / 2); ctx.lineTo(w / 4, -h / 2);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w / 4, h / 2); ctx.lineTo(-w / 4, h / 2);
    }
    ctx.closePath();
  }

  // Armored plate: dark tinted metal, bevel highlight on top, hard dark outline.
  function shell(ctx, c, fill, top, bottom) {
    ctx.shadowBlur = 0;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = 1.8; ctx.stroke(); return; }
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, mix(c, '#d7dceb', .55));
    g.addColorStop(.16, mix(c, '#2b2e3f', .7));
    g.addColorStop(.7, mix(c, '#1a1c29', .8));
    g.addColorStop(1, mix(c, '#06060b', .9));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = hexA(mix(c, '#ffffff', .5), .4); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#05050a'; ctx.lineWidth = 1.7; ctx.stroke();
  }

  // An armored limb segment from (x1,y1) to (x2,y2), w units thick.
  function seg(ctx, x1, y1, x2, y2, w, c, fill) {
    const a = Math.atan2(y2 - y1, x2 - x1), l = Math.hypot(x2 - x1, y2 - y1);
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(a);
    rrect(ctx, -w * .35, -w / 2, l + w * .7, w, w * .38);
    shell(ctx, c, fill, -w / 2, w / 2);
    ctx.restore();
  }

  // Mechanical joint: dark housing with a lit bolt.
  function joint(ctx, x, y, r, c2, fill, t) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill || '#23242f'; ctx.fill();
    ctx.strokeStyle = fill || '#05050a'; ctx.lineWidth = 1.4; ctx.stroke();
    if (fill) return;
    ctx.beginPath(); ctx.arc(x, y, r * .42, 0, TAU);
    ctx.fillStyle = hexA(c2, .6 + .3 * Math.sin(t * 2 + x)); glow(ctx, c2, 6); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Hydraulic piston rod drawn alongside a limb.
  function piston(ctx, x1, y1, x2, y2, fill) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = fill || '#05050a'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (fill) return;
    ctx.strokeStyle = '#a6aec4'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function flame(ctx, x, y, s, t, c1, sil) {
    const f = Math.sin(t * 13) * 1.6 + Math.sin(t * 7.3) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y);
    ctx.bezierCurveTo(x - 9 * s, y - 10 * s, x - 2 * s + f * .4, y - 14 * s, x + f * .6, y - (22 + f) * s);
    ctx.bezierCurveTo(x + 3 * s, y - 13 * s, x + 10 * s, y - 9 * s, x + 7 * s, y);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y - 22 * s, 0, y);
    g.addColorStop(0, sil || '#fff6c2');
    g.addColorStop(1, sil || c1);
    ctx.fillStyle = g;
    glow(ctx, c1, 14);
    ctx.fill();
  }

  function legs(ctx, kind, bw, bottom, c1, c2, t, fill, bob) {
    const flex = (bob || 0) * .8;
    if (kind === 'two') { // digitigrade walker legs
      for (const s of [-1, 1]) {
        const hx = s * bw * .24, hy = bottom - 2;
        const kx = s * bw * .36, ky = hy * .5 + 2 + flex;
        const ax = s * bw * .25, ay = -7;
        seg(ctx, hx, hy, kx, ky, 11, c1, fill);
        piston(ctx, hx - s * 3, hy + 2, ax - s * 2, ay - 2, fill);
        seg(ctx, kx, ky, ax, ay, 8, c1, fill);
        joint(ctx, kx, ky, 4.2, c2, fill, t);
        ctx.beginPath(); // foot: wedge with a toe
        ctx.moveTo(ax - 8, 0); ctx.lineTo(ax - 6, ay - 1); ctx.lineTo(ax + 6, ay - 1); ctx.lineTo(ax + 10 * s, 0); ctx.closePath();
        shell(ctx, c1, fill, ay, 0);
      }
    } else if (kind === 'four') { // crab-style walker
      for (const [s, back] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) {
        ctx.save(); ctx.globalAlpha *= back ? .78 : 1;
        const sp = back ? .7 : 1;
        const hx = s * bw * .28 * sp, hy = bottom - 4;
        const kx = s * (bw * .58 * sp + 4), ky = bottom - 14 + flex * (back ? -1 : 1);
        const fx = s * (bw * .66 * sp + 6), fy = 0;
        seg(ctx, hx, hy, kx, ky, 8, c1, fill);
        seg(ctx, kx, ky, fx, fy - 4, 7, c1, fill);
        joint(ctx, kx, ky, 3.6, c2, fill, t);
        ctx.beginPath(); ctx.moveTo(fx - 3, fy - 5); ctx.lineTo(fx + s * 3, fy); ctx.lineTo(fx - s * 4, fy); ctx.closePath();
        ctx.fillStyle = fill || '#9aa2b8'; ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'six') { // insectoid servo legs
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const tw = Math.sin(t * 9 + i * 2) * 1.2;
        const hx = s * bw * .24, hy = bottom - 8 - i * 4;
        const kx = s * (bw * .5 + i * 4), ky = bottom - 14 - i * 3 + tw;
        const fx = s * (bw * .56 + i * 7), fy = -1;
        seg(ctx, hx, hy, kx, ky, 4.2, c1, fill);
        seg(ctx, kx, ky, fx, fy, 3.4, c1, fill);
        joint(ctx, kx, ky, 2.2, c2, fill, t);
      }
    } else if (kind === 'treads') {
      rrect(ctx, -bw * .6, -17, bw * 1.2, 17, 7);
      shell(ctx, c1, fill, -17, 0);
      if (!fill) {
        rrect(ctx, -bw * .55, -10, bw * 1.1, 8, 4); ctx.fillStyle = '#0b0b12'; ctx.fill();
        ctx.strokeStyle = '#3a3c4c'; ctx.lineWidth = 1.2;
        const off = (t * 10) % 5;
        for (let x = -bw * .55 + off; x < bw * .55; x += 5) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, -2); ctx.stroke(); }
      }
      for (let i = 0; i < 4; i++) joint(ctx, -bw * .42 + i * bw * .28, -6, 3.4, c2, fill, t + i);
      rrect(ctx, -bw * .62, -20, bw * 1.24, 6, 3); shell(ctx, c1, fill, -20, -14); // fender
    } else if (kind === 'hover') { // thruster nacelle and jet wash
      rrect(ctx, -bw * .22, bottom - 4, bw * .44, 10, 4);
      shell(ctx, c1, fill, bottom - 4, bottom + 6);
      const g = ctx.createLinearGradient(0, bottom + 6, 0, bottom + 26);
      g.addColorStop(0, fill || '#ffffff'); g.addColorStop(.3, fill || hexA(c2, .8)); g.addColorStop(1, hexA(fill || c2, 0));
      const fl = 14 + Math.sin(t * 23) * 3 + Math.sin(t * 13) * 2;
      ctx.beginPath(); ctx.moveTo(-bw * .14, bottom + 6); ctx.lineTo(bw * .14, bottom + 6); ctx.lineTo(0, bottom + 6 + fl); ctx.closePath();
      ctx.fillStyle = g; glow(ctx, c2, 14); ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  function arms(ctx, kind, bw, by, bh, c1, c2, t, fill, phase) {
    const sw = Math.sin(t * 2.4 + phase) * 2;
    const twitch = Math.sin(t * 7.3 + phase * 3) > .985 ? 3 : 0; // occasional servo jolt
    const sparks = kind === 'shock';
    if (sparks) kind = 'claws';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      const x0 = bw * .46, y0 = by - bh * .1;
      const ex = x0 + 10, ey = y0 + 10 + sw + twitch * (s > 0 ? 1 : 0); // elbow
      const hx = x0 + 15, hy = y0 + 20 + sw; // hand
      if (kind !== 'vines') {
        if (kind === 'cannons' || kind === 'gorilla') seg(ctx, x0, y0, ex, ey, 9, c1, fill);
        else { seg(ctx, x0, y0, ex, ey, 7, c1, fill); }
      }
      if (kind === 'stubs') {
        seg(ctx, ex, ey, hx - 2, hy - 2, 7, c1, fill);
        rrect(ctx, hx - 6, hy - 5, 10, 9, 3); shell(ctx, c1, fill, hy - 5, hy + 4);
      } else if (kind === 'claws') {
        seg(ctx, ex, ey, hx, hy, 6.5, c1, fill);
        const open = .35 + .25 * Math.sin(t * 3 + phase);
        for (const d of [-1, 1]) {
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(.5 + d * open);
          ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(11, d * 1.5); ctx.lineTo(2, 3); ctx.closePath();
          shell(ctx, c2, fill, -2, 3);
          ctx.restore();
        }
      } else if (kind === 'blades') {
        seg(ctx, ex, ey, hx, hy - 2, 6.5, c1, fill);
        ctx.beginPath(); ctx.moveTo(hx - 3, hy); ctx.lineTo(hx + 26, hy - 22 + sw); ctx.lineTo(hx + 2, hy - 8); ctx.closePath();
        shell(ctx, c2, fill, hy - 22, hy);
        if (!fill) { line(ctx, c2, 1, 8); ctx.beginPath(); ctx.moveTo(hx, hy - 3); ctx.lineTo(hx + 24, hy - 21 + sw); ctx.stroke(); ctx.shadowBlur = 0; }
      } else if (kind === 'cannons') {
        rrect(ctx, ex - 4, ey - 6, 26, 13, 3); shell(ctx, c1, fill, ey - 6, ey + 7);
        if (!fill) { ctx.fillStyle = '#05050a'; for (let i = 0; i < 3; i++) ctx.fillRect(ex + 2 + i * 4, ey - 4, 2, 4); }
        ctx.beginPath(); ctx.arc(ex + 22, ey + .5, 3.4, 0, TAU);
        ctx.fillStyle = fill || c2; glow(ctx, c2, 12); ctx.fill(); ctx.shadowBlur = 0;
      } else if (kind === 'mantis') {
        seg(ctx, ex, ey, hx, hy - 2, 6, c1, fill);
        ctx.beginPath(); ctx.moveTo(hx - 2, hy);
        ctx.quadraticCurveTo(hx + 22, hy - 4, hx + 28, hy - 38);
        ctx.quadraticCurveTo(hx + 12, hy - 18, hx + 3, hy - 6); ctx.closePath();
        const g = ctx.createLinearGradient(hx, hy, hx + 28, hy - 38);
        g.addColorStop(0, fill || '#3a3f52'); g.addColorStop(1, fill || '#f4f7ff');
        ctx.fillStyle = g; glow(ctx, BLADE, 12); ctx.fill();
        line(ctx, fill || BLADE, 1.4, 10); ctx.stroke(); ctx.shadowBlur = 0;
      } else if (kind === 'gorilla') {
        seg(ctx, ex, ey, hx, hy, 11, CHROME, fill);
        piston(ctx, x0 + 2, y0 + 6, hx - 2, hy + 4, fill);
        rrect(ctx, hx - 3, hy - 6, 19, 17, 5);
        shell(ctx, CHROME, fill, hy - 6, hy + 11);
        if (!fill) { ctx.strokeStyle = '#05050a'; ctx.lineWidth = 1.2; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx - 3 + i * 4.7, hy - 5); ctx.lineTo(hx - 3 + i * 4.7, hy + 1); ctx.stroke(); } }
      } else if (kind === 'wire') {
        seg(ctx, ex, ey, hx, hy, 6, c1, fill);
        line(ctx, fill || WIRE, 1.2, 12);
        ctx.beginPath(); ctx.moveTo(hx, hy);
        ctx.bezierCurveTo(hx + 16, hy - 16 + sw * 3, hx + 8, hy + 24 - sw * 3, hx + 28, hy + 12 + Math.sin(t * 5) * 4);
        ctx.stroke(); ctx.shadowBlur = 0;
      } else if (kind === 'vines') {
        ctx.strokeStyle = fill || '#14151f'; ctx.lineWidth = 4.5; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(x0 - 3, y0);
        ctx.bezierCurveTo(x0 + 14, y0 - 8 + sw * 2, x0 + 8, y0 + 16 - sw * 2, x0 + 22, y0 + 20);
        ctx.stroke();
        line(ctx, fill || c2, 1.2, 6); ctx.stroke(); ctx.shadowBlur = 0;
        rrect(ctx, x0 + 18, y0 + 17, 9, 6, 2); shell(ctx, c1, fill, y0 + 17, y0 + 23);
      }
      if (sparks && Math.random() > .4) {
        line(ctx, '#ffe14d', 1.2, 10);
        ctx.beginPath(); ctx.moveTo(hx + 6, hy);
        for (let i = 0; i < 4; i++) ctx.lineTo(hx + 9 + i * 3, hy - 6 + (Math.random() - .5) * 10);
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      // shoulder pauldron caps the joint
      rrect(ctx, x0 - 8, y0 - 8, 16, 13, 4); shell(ctx, c1, fill, y0 - 8, y0 + 5);
      if (!fill) { ctx.fillStyle = hexA(c2, .9); glow(ctx, c2, 6); ctx.fillRect(x0 - 5, y0 - 1, 10, 1.6); ctx.shadowBlur = 0; }
      ctx.restore();
    }
  }

  function wings(ctx, kind, bw, by, bh, c1, c2, t, fill) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      const x0 = bw * .32, y0 = by - bh * .18;
      if (kind === 'jet') {
        ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x0 + 32, y0 + 10); ctx.lineTo(x0 + 26, y0 + 15); ctx.lineTo(x0 + 2, y0 + 14); ctx.closePath();
        shell(ctx, c1, fill, y0, y0 + 15);
      } else if (kind === 'bat') {
        const f = Math.sin(t * 3) * 4;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 6);
        ctx.lineTo(x0 + 36, y0 - 28 - f);
        ctx.quadraticCurveTo(x0 + 30, y0 - 10 - f, x0 + 38, y0 - 2 - f * .5);
        ctx.quadraticCurveTo(x0 + 24, y0 - 2, x0 + 26, y0 + 10);
        ctx.quadraticCurveTo(x0 + 14, y0 + 4, x0 + 4, y0 + 14);
        ctx.closePath();
        shell(ctx, c1, fill, y0 - 28, y0 + 14);
      } else if (kind === 'insect') {
        const f = Math.sin(t * 16) * .18;
        for (const [ang, rx, ry, oy] of [[-.5 + f, 22, 9, -4], [.25 - f, 16, 7, 8]]) {
          ctx.save(); ctx.translate(x0 + 4, y0 + oy); ctx.rotate(ang);
          ctx.beginPath(); ctx.ellipse(rx * .8, 0, rx, ry, 0, 0, TAU);
          ctx.fillStyle = fill || hexA(c2, .16); ctx.fill();
          line(ctx, c2, 1.6, 8); ctx.stroke();
          ctx.restore();
        }
      } else if (kind === 'blade') {
        const f = Math.sin(t * 2) * 2;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0 + 46, y0 - 22 + f); ctx.lineTo(x0 + 36, y0 - 12 + f);
        ctx.lineTo(x0 + 42, y0 - 2 + f); ctx.lineTo(x0 + 26, y0 + 2); ctx.lineTo(x0 + 2, y0 + 10); ctx.closePath();
        shell(ctx, c1, fill, y0 - 22, y0 + 10);
        line(ctx, c2, 1.2, 6);
        ctx.beginPath(); ctx.moveTo(x0 + 6, y0 - 2); ctx.lineTo(x0 + 40, y0 - 17 + f); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function tail(ctx, kind, bw, by, bh, c1, c2, t, fill, sil) {
    const w = Math.sin(t * 3) * 4;
    const x0 = bw * .32, y0 = by + bh * .25;
    if (kind === 'whip' || kind === 'flame' || kind === 'plug') {
      const ex = kind === 'plug' ? x0 + 24 : x0 + 26, ey = kind === 'plug' ? -3 : by - 18 + w;
      line(ctx, c1, 3, 8);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + 22, y0 + 4, ex - 4, ey + 16, ex, ey); ctx.stroke();
      if (kind === 'flame') flame(ctx, ex, ey + 4, .6, t, c1, sil);
      else if (kind === 'whip') {
        ctx.beginPath(); ctx.moveTo(ex, ey - 6); ctx.lineTo(ex + 4, ey); ctx.lineTo(ex, ey + 6); ctx.lineTo(ex - 4, ey); ctx.closePath();
        ctx.fillStyle = fill || c2; glow(ctx, c2, 10); ctx.fill();
      } else {
        rrect(ctx, ex - 4, ey - 7, 9, 8, 2); shell(ctx, c1, fill, ey - 7, ey + 1);
        line(ctx, c2, 1.8, 6);
        ctx.beginPath(); ctx.moveTo(ex + 6, ey - 5); ctx.lineTo(ex + 10, ey - 5); ctx.moveTo(ex + 6, ey - 1); ctx.lineTo(ex + 10, ey - 1); ctx.stroke();
      }
    } else if (kind === 'fin') {
      line(ctx, c1, 3, 8);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 16, y0 + 2, x0 + 20, y0 - 8 + w * .5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + 20, y0 - 8 + w * .5); ctx.lineTo(x0 + 32, y0 - 20 + w); ctx.lineTo(x0 + 28, y0 - 6); ctx.lineTo(x0 + 34, y0 + 4 + w * .5); ctx.closePath();
      shell(ctx, c2, fill, y0 - 20, y0 + 4);
    } else if (kind === 'segment') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x0 + 8 + i * 8, y0 - i * 7 + Math.sin(t * 3 + i) * 2, 5.5 - i, 0, TAU);
        shell(ctx, i === 3 ? c2 : c1, fill, y0 - 30, y0 + 6);
      }
    }
  }

  function eyes(ctx, kind, fx, fy, fw, c2, t, phase, fill) {
    const blink = ((t + phase) % 4.3) < .13 ? .15 : 1;
    const white = fill || '#f4fbff';
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1, blink);
    glow(ctx, c2, 10); ctx.fillStyle = white;
    if (kind === 'mono') {
      ctx.beginPath(); ctx.arc(0, 0, fw * .2, 0, TAU); ctx.fillStyle = 'rgba(5,5,12,.9)'; ctx.fill();
      line(ctx, c2, 2, 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, fw * .09, 0, TAU); ctx.fillStyle = white; ctx.fill();
    } else if (kind === 'twin') {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * fw * .22, 0, fw * .11, 0, TAU); ctx.fill(); }
    } else if (kind === 'visor') {
      const w = fw * .86, h = fw * .2;
      rrect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = fill || hexA(c2, .28); ctx.fill(); line(ctx, c2, 1.6, 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(Math.sin(t * 2.2) * w * .34, 0, h * .32, 0, TAU); ctx.fillStyle = white; ctx.fill();
    } else if (kind === 'tri') {
      for (const [x, y] of [[-fw * .22, 0], [fw * .22, 0], [0, -fw * .2]]) {
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
      }
    } else if (kind === 'slit') {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * fw * .08, -1); ctx.lineTo(s * fw * .34, -5); ctx.lineTo(s * fw * .32, 1); ctx.lineTo(s * fw * .1, 3);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  function top(ctx, kind, tx, ty, w, c1, c2, t, fill, sil) {
    const sway = Math.sin(t * 2.1) * .12;
    if (kind === 'antenna' || kind === 'twin') {
      const list = kind === 'antenna' ? [0] : [-.38, .38];
      for (const a of list) {
        ctx.save(); ctx.translate(tx + a * w * .5, ty + 2); ctx.rotate(a + sway);
        ctx.shadowBlur = 0; ctx.strokeStyle = fill || '#05050a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
        if (!fill) { ctx.strokeStyle = '#8a92a8'; ctx.lineWidth = 1.2; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(0, -16, 3.2, 0, TAU);
        ctx.fillStyle = fill || hexA(c2, .55 + .45 * Math.abs(Math.sin(t * 3 + a))); glow(ctx, c2, 12); ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'horns') {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(tx + s * w * .18, ty + 3);
        ctx.quadraticCurveTo(tx + s * w * .3, ty - 6, tx + s * w * .52, ty - 16);
        ctx.quadraticCurveTo(tx + s * w * .34, ty - 2, tx + s * w * .34, ty + 4); ctx.closePath();
        shell(ctx, c2, fill, ty - 16, ty + 4);
      }
    } else if (kind === 'ears') {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(tx + s * w * .1, ty + 4); ctx.lineTo(tx + s * w * .36, ty - 14); ctx.lineTo(tx + s * w * .42, ty + 6); ctx.closePath();
        shell(ctx, c1, fill, ty - 14, ty + 6);
      }
    } else if (kind === 'crest') {
      for (const [x, h] of [[-.22, 12], [0, 19], [.22, 12]]) {
        ctx.beginPath(); ctx.moveTo(tx + x * w - 4, ty + 3); ctx.lineTo(tx + x * w * 1.4, ty - h); ctx.lineTo(tx + x * w + 4, ty + 3); ctx.closePath();
        shell(ctx, c2, fill, ty - h, ty + 3);
      }
    } else if (kind === 'flame') {
      flame(ctx, tx, ty + 4, .9, t, c1, sil);
    } else if (kind === 'fin') {
      ctx.beginPath(); ctx.moveTo(tx - 8, ty + 3); ctx.quadraticCurveTo(tx - 2, ty - 10, tx + 8, ty - 18); ctx.quadraticCurveTo(tx + 6, ty - 6, tx + 10, ty + 3); ctx.closePath();
      shell(ctx, c2, fill, ty - 18, ty + 3);
    } else if (kind === 'spikes') {
      for (let i = -2; i <= 2; i++) {
        const x = tx + i * w * .17, h = 10 - Math.abs(i) * 2;
        ctx.beginPath(); ctx.moveTo(x - 4, ty + 3); ctx.lineTo(x, ty - h); ctx.lineTo(x + 4, ty + 3); ctx.closePath();
        shell(ctx, c2, fill, ty - h, ty + 3);
      }
    } else if (kind === 'leaf') {
      ctx.save(); ctx.translate(tx, ty + 2); ctx.rotate(sway * 2);
      line(ctx, c1, 2, 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(14, -12, 12, -24); ctx.quadraticCurveTo(-2, -20, 0, -8); ctx.closePath();
      shell(ctx, c2, fill, -24, -8);
      ctx.restore();
    } else if (kind === 'rotor') {
      line(ctx, c1, 2, 6); ctx.beginPath(); ctx.moveTo(tx, ty + 2); ctx.lineTo(tx, ty - 7); ctx.stroke();
      ctx.save(); ctx.translate(tx, ty - 8); ctx.scale(Math.cos(t * 28), 1);
      line(ctx, c2, 3, 10); ctx.beginPath(); ctx.moveTo(-w * .45, 0); ctx.lineTo(w * .45, 0); ctx.stroke();
      ctx.restore();
    }
  }

  // Armor overlays drawn inside the body's local space (origin = body center).
  function frameOverlay(ctx, vis, shape, bw, bh, t) {
    ctx.save();
    bodyPath(ctx, shape, bw, bh); ctx.clip();
    if (vis === 'plates') {
      ctx.fillStyle = 'rgba(190,204,228,.16)';
      line(ctx, '#b8c4dc', 1.6, 4);
      for (const [x, y, w, h] of [[-bw * .42, -bh * .38, bw * .38, bh * .34], [bw * .04, -bh * .38, bw * .38, bh * .34]]) {
        rrect(ctx, x, y, w, h, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#dfe6f2'; ctx.fillRect(x + 2, y + 2, 2, 2); ctx.fillRect(x + w - 4, y + 2, 2, 2);
        ctx.fillStyle = 'rgba(190,204,228,.16)';
      }
    } else if (vis === 'scrap') {
      for (const [x, y, a] of [[-bw * .3, -bh * .1, .2], [bw * .08, bh * .02, -.15]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = 'rgba(192,112,58,.45)'; ctx.fillRect(0, 0, bw * .26, bh * .22);
        line(ctx, '#c0703a', 1.2, 3); ctx.strokeRect(0, 0, bw * .26, bh * .22);
        ctx.restore();
      }
    } else if (vis === 'mesh') {
      line(ctx, 'rgba(208,138,74,.55)', .9, 3);
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(i * 8 - bh / 2, -bh / 2); ctx.lineTo(i * 8 + bh / 2, bh / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * 8 + bh / 2, -bh / 2); ctx.lineTo(i * 8 - bh / 2, bh / 2); ctx.stroke();
      }
    } else if (vis === 'camo') {
      ctx.fillStyle = 'rgba(160,240,255,.18)';
      const off = (t * 40) % bh;
      ctx.fillRect(-bw / 2, -bh / 2 + off, bw, 3);
      ctx.fillRect(-bw / 2, -bh / 2 + (off + bh / 2) % bh, bw, 2);
    }
    ctx.restore();
    if (vis === 'fins') {
      ctx.fillStyle = 'rgba(255,106,61,.75)'; glow(ctx, '#ff6a3d', 8);
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) ctx.fillRect(sx * (bw / 2 + 1 + i * 3) - (sx < 0 ? 2 : 0), -bh * .3 + i * 2, 2, bh * .3);
    }
  }

  function pod(ctx, bw, bTop, t, fill) {
    ctx.save(); ctx.translate(bw * .3, bTop + 2);
    rrect(ctx, -2, -12, 18, 12, 3); shell(ctx, CHROME, fill, -12, 0);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(2 + i * 5, -6, 1.7, 0, TAU);
      ctx.fillStyle = fill || (Math.sin(t * 4 + i) > 0 ? '#ffb52e' : '#ff3d5a'); glow(ctx, '#ffb52e', 8); ctx.fill();
    }
    ctx.restore();
  }

  // o: { t, flip, alpha, scale, phase, sil (solid color silhouette), mods (installed chrome by slot) }
  function drawBot(ctx, id, x, y, size, o = {}) {
    const sp = SPECIES[id], bp = sp.bp;
    const sil = o.sil || null;
    const c1 = sil || TYPES[sp.t[0]].c;
    const c2 = sil || (sp.t[1] ? TYPES[sp.t[1]].c : mix(TYPES[sp.t[0]].c, '#ffffff', .55));
    const fill = sil;
    const t = o.t || 0, phase = o.phase || 0;
    const mods = o.mods || {};
    const mod = (slot) => (mods[slot] ? MODS[mods[slot]] : null);
    const armMod = mod('arms'), frameMod = mod('frame'), optMod = mod('optics'), coreMod = mod('core');
    const armKind = armMod && armMod.vis !== 'pod' ? armMod.vis : bp.arms;
    const eyeC = sil || (optMod ? optMod.eye : c2);
    const k = size / 100 * (bp.s || 1) * (o.scale ?? 1);
    if (k <= 0.001) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= (o.alpha ?? 1) * (frameMod && frameMod.vis === 'camo' && !sil ? .6 + .25 * Math.sin(t * 6 + phase) : 1);
    ctx.scale(o.flip ? -k : k, k);
    const m = ctx.getTransform();
    px = Math.hypot(m.a, m.b);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    ctx.beginPath(); ctx.ellipse(0, 0, 34, 7, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 0; ctx.fill();

    const legKind = bp.legs || 'none';
    const floats = legKind === 'hover' || legKind === 'none';
    const bob = Math.sin(t * 2.6 + phase) * (floats ? 3 : 1.2);
    const [bw, bh] = BODY[bp.body];
    const legH = LEG_H[legKind];
    const by = -(legH + bh / 2) - (floats ? 18 : 0) + bob;
    const bTop = by - bh / 2, bBot = by + bh / 2;

    if (bp.tail) tail(ctx, bp.tail, bw, by, bh, c1, c2, t, fill, sil);
    if (bp.wings) wings(ctx, bp.wings, bw, by, bh, c1, c2, t, fill);
    legs(ctx, legKind, bw, floats ? bBot : -legH - 2 + bob * .3, c1, c2, t, fill, bob);

    ctx.save(); ctx.translate(0, by);
    bodyPath(ctx, bp.body, bw, bh);
    shell(ctx, c1, fill, -bh / 2, bh / 2);
    if (!sil) {
      ctx.save(); bodyPath(ctx, bp.body, bw, bh); ctx.clip();
      // panel seams
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.1; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(-bw / 2, bh * .16); ctx.lineTo(bw / 2, bh * .16);
      ctx.moveTo(0, -bh / 2); ctx.lineTo(0, -bh * .1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(-bw / 2, bh * .16 + 1.2); ctx.lineTo(bw / 2, bh * .16 + 1.2); ctx.stroke();
      // vents
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-bw * .38, bh * .24 + i * 3.4, bw * .18, 1.6);
      // neon accent strip
      line(ctx, c2, 1.6, 7);
      ctx.beginPath(); ctx.moveTo(bw * .2, -bh * .34); ctx.lineTo(bw * .34, -bh * .34); ctx.lineTo(bw * .34, bh * .06); ctx.stroke();
      ctx.shadowBlur = 0;
      // bolts and status LEDs
      ctx.fillStyle = '#9aa2b8';
      for (const [bx2, by2] of [[-.3, -.32], [.3, .34], [-.3, .4]]) { ctx.beginPath(); ctx.arc(bx2 * bw, by2 * bh, 1.3, 0, TAU); ctx.fill(); }
      const led = Math.floor(t * 2 + phase) % 3;
      ['#ff3045', '#ffb52e', '#3dfc8f'].forEach((lc, i) => { ctx.fillStyle = i === led ? lc : 'rgba(255,255,255,.12)'; ctx.fillRect(bw * .1 + i * 3.6, bh * .26, 2.2, 2.2); });
      ctx.restore();
    }
    if (frameMod && !sil) frameOverlay(ctx, frameMod.vis, bp.body, bw, bh, t);
    if (bp.core || coreMod) {
      const cc = coreMod ? RARITY[coreMod.r].c : c2;
      const p = .6 + .4 * Math.sin(t * 3.4);
      ctx.beginPath(); ctx.moveTo(0, bh * .02); ctx.lineTo(7, bh * .16); ctx.lineTo(0, bh * .3); ctx.lineTo(-7, bh * .16); ctx.closePath();
      ctx.fillStyle = fill || hexA(cc, p); glow(ctx, cc, 16); ctx.fill();
    }
    ctx.restore();

    if (armMod && armMod.vis === 'pod') pod(ctx, bw, bTop, t, fill);
    if (armKind) arms(ctx, armKind, bw, by, bh, c1, c2, t, fill, phase);

    let fx = 0, fy = by - bh * .12, fw = bw * .72, tx = 0, ty = bTop, tw = bw;
    if (bp.head && bp.head !== 'none') {
      const hs = bw * .64;
      const hh = bp.head === 'box' ? hs * .78 : hs * .88;
      const hy = bTop - hh * .3;
      const look = Math.sin(t * .7 + phase * 2) * 1.6 + (Math.sin(t * .31 + phase) > .9 ? 2.5 : 0); // head scans around
      ctx.save(); ctx.translate(look, hy);
      ctx.beginPath();
      if (bp.head === 'orb') ctx.ellipse(0, 0, hs / 2, hh / 2, 0, 0, TAU);
      else if (bp.head === 'box') rrect(ctx, -hs / 2, -hh / 2, hs, hh, 7);
      else { ctx.moveTo(-hs / 2, -hh / 2); ctx.lineTo(hs / 2, -hh / 2); ctx.quadraticCurveTo(hs * .3, hh * .2, 0, hh / 2); ctx.quadraticCurveTo(-hs * .3, hh * .2, -hs / 2, -hh / 2); ctx.closePath(); }
      shell(ctx, c1, fill, -hh / 2, hh / 2);
      if (!sil) { // recessed faceplate the eyes glow out of
        const fy0 = bp.head === 'tri' ? -hh * .3 : -hh * .18;
        rrect(ctx, -hs * .38, fy0, hs * .76, hh * .32, 3); ctx.fillStyle = '#05050a'; ctx.fill();
      }
      ctx.restore();
      fx = look; fy = hy - (bp.head === 'tri' ? hh * .14 : 0) + (bp.head === 'tri' ? 0 : -hh * .02); fw = hs * .9; tx = look; ty = hy - hh / 2; tw = hs;
    } else if (!sil) {
      rrect(ctx, -bw * .3, by - bh * .24, bw * .6, bh * .22, 4); ctx.fillStyle = '#05050a'; ctx.fill();
    }
    eyes(ctx, bp.eyes, fx, fy, fw, eyeC, t, phase, fill);
    if (bp.top && bp.top !== 'none') top(ctx, bp.top, tx, ty, tw, c1, c2, t, fill, sil);

    // exhaust: a puff of steam from the back vents every few seconds
    if (!sil && o.life !== false) {
      const ph = ((t + phase * 1.7) % 5) / 1.4;
      if (ph < 1) {
        for (let i = 0; i < 3; i++) {
          const q = Math.min(1, ph + i * .12);
          ctx.fillStyle = `rgba(210,215,235,${.28 * (1 - q)})`;
          ctx.beginPath(); ctx.arc(-bw * .42 - q * 8, bTop + 4 - q * 18 - i * 3, 3 + q * 6, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Overworld people/bots inside a 32px tile. (x, y) = tile's top-left in logical px.
  function drawPerson(ctx, x, y, dir, look, step, t) {
    const cx = x + 16, c = look.c;
    const pxs = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(cx, y + 29, 9, 3.5, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
    // Imported pixel sprite (32x64, feet on this tile) with a neon rim in the character's colour.
    if (look.sheet && Atlas.npc(ctx, look.sheet, dir, step, x, y)) {
      ctx.restore();
      return;
    }
    const g = (col, b) => { ctx.shadowColor = col; ctx.shadowBlur = b * pxs; };
    if (look.bot) {
      const bob = Math.sin(t * 3 + x) * 1.5;
      ctx.beginPath(); ctx.ellipse(cx, y + 27, 6, 2, 0, 0, TAU); ctx.fillStyle = hexA(c, .7); g(c, 8); ctx.fill();
      rrect(ctx, cx - 9, y + 6 + bob, 18, 15, 5); ctx.fillStyle = '#0d0b1e'; ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; g(c, 6); ctx.stroke();
      rrect(ctx, cx - 6, y + 21 + bob, 12, 4, 2); ctx.fill(); ctx.stroke();
      if (dir !== 'up') {
        const ox = dir === 'left' ? -2 : dir === 'right' ? 2 : 0;
        ctx.fillStyle = '#f4fbff'; g(c, 6);
        ctx.fillRect(cx - 5 + ox, y + 11 + bob, 3, 3); ctx.fillRect(cx + 2 + ox, y + 11 + bob, 3, 3);
      }
      ctx.restore();
      return;
    }
    const walk = step ? (step % 2 ? 1 : -1) : 0;
    // legs
    ctx.fillStyle = '#16122c';
    ctx.fillRect(cx - 5, y + 22, 4, 6 + (walk > 0 ? -1 : 0));
    ctx.fillRect(cx + 1, y + 22, 4, 6 + (walk < 0 ? -1 : 0));
    // trench coat, drawn behind the jacket so it flares past the hips
    if (look.coat) {
      ctx.beginPath();
      ctx.moveTo(cx - 8, y + 15); ctx.lineTo(cx + 8, y + 15); ctx.lineTo(cx + 10 + walk * .5, y + 27); ctx.lineTo(cx - 10 + walk * .5, y + 27); ctx.closePath();
      ctx.fillStyle = look.coat; ctx.fill();
      ctx.strokeStyle = hexA(c, .6); ctx.lineWidth = 1; ctx.stroke();
    }
    // jacket
    rrect(ctx, cx - 8, y + 13, 16, 11, 4);
    ctx.fillStyle = mix(c, '#0b0918', .72); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 1.5; g(c, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    // head
    ctx.beginPath(); ctx.arc(cx, y + 9, 7, 0, TAU); ctx.fillStyle = look.skin || '#c98e6a'; ctx.fill();
    ctx.fillStyle = look.hair || '#1b1530';
    ctx.beginPath();
    if (dir === 'up') ctx.arc(cx, y + 9, 7.4, 0, TAU);
    else ctx.arc(cx, y + 7.5, 7.4, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    if (look.hairGlow) { ctx.strokeStyle = look.hair; ctx.lineWidth = 1; g(look.hair, 6); ctx.stroke(); ctx.shadowBlur = 0; }
    if (dir !== 'up') {
      const ox = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
      const vw = dir === 'down' ? 10 : 6;
      ctx.fillStyle = look.visor || '#18f0ff'; g(look.visor || '#18f0ff', 8);
      ctx.fillRect(cx - vw / 2 + ox, y + 9, vw, 2.4);
    }
    ctx.restore();
  }

  function drawOrb(ctx, cx, cy, t, color) {
    const p = .6 + .4 * Math.sin(t * 4);
    const pxs = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy + 8, 6, 2, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU);
    ctx.fillStyle = '#0d0b1e'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.shadowColor = color; ctx.shadowBlur = 10 * pxs * p; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }

  function drawCore(ctx, cx, cy, r, color) {
    const pxs = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = '#0d0b1e'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 12 * pxs; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .36, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }

  // Battered milspec crate with a status light; dims once opened.
  function drawCache(ctx, x, y, t, open) {
    const pxs = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x + 16, y + 28, 12, 3, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    rrect(ctx, x + 4, y + 10, 24, 17, 2);
    ctx.fillStyle = '#1c1a22'; ctx.fill();
    ctx.strokeStyle = '#5a5566'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#2a2731'; ctx.fillRect(x + 4, y + 10, 24, 5);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#1c1a22' : 'rgba(255,181,46,.55)'; ctx.fillRect(x + 6 + i * 5, y + 22, 5, 3); }
    const c = open ? '#3a3352' : '#ffb52e';
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = open ? 0 : (6 + 4 * Math.sin(t * 5)) * pxs;
    ctx.fillRect(x + 13, y + 15, 6, 3);
    ctx.restore();
  }

  return { drawBot, drawPerson, drawOrb, drawCore, drawCache };
})();
