'use strict';
// Procedural neon renderer for Robomon, people and small props.
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

  function shell(ctx, c1, fill, top, bottom) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, fill ? fill : hexA(c1, .32));
    g.addColorStop(1, fill ? fill : 'rgba(7,6,15,.94)');
    ctx.fillStyle = g;
    ctx.fill();
    line(ctx, c1, 2.6, 9);
    ctx.stroke();
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

  function legs(ctx, kind, bw, bottom, c1, c2, t, fill) {
    if (kind === 'two') {
      for (const s of [-1, 1]) {
        rrect(ctx, s * bw * .22 - 4, bottom - 4, 8, -bottom - 2, 3);
        shell(ctx, c1, fill, bottom, 0);
        rrect(ctx, s * bw * .22 - 7 + s * 2, -6, 14, 6, 3);
        shell(ctx, c1, fill, -6, 0);
      }
    } else if (kind === 'four') {
      for (const [s, xo, dark] of [[-1, .14, 1], [1, .14, 1], [-1, .32, 0], [1, .32, 0]]) {
        ctx.globalAlpha *= dark ? .7 : 1;
        rrect(ctx, s * bw * xo - 4, bottom - 6, 8, -bottom + 6 - (dark ? 3 : 0), 3);
        shell(ctx, c1, fill, bottom, 0);
        ctx.globalAlpha /= dark ? .7 : 1;
      }
    } else if (kind === 'six') {
      line(ctx, c1, 2, 6);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const tw = Math.sin(t * 9 + i * 2) * 1.2;
        ctx.beginPath();
        ctx.moveTo(s * bw * .25, bottom - 8 - i * 5);
        ctx.lineTo(s * (bw * .5 + i * 4), bottom - 12 - i * 3 + tw);
        ctx.lineTo(s * (bw * .55 + i * 6), -1);
        ctx.stroke();
      }
    } else if (kind === 'treads') {
      rrect(ctx, -bw * .58, -15, bw * 1.16, 15, 7);
      shell(ctx, c1, fill, -15, 0);
      line(ctx, c2, 1.3, 4);
      for (let i = 0; i < 4; i++) {
        const cx = -bw * .42 + i * bw * .28;
        ctx.beginPath(); ctx.arc(cx, -7.5, 4.5, 0, TAU); ctx.stroke();
        const a = t * 4 + i;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 4, -7.5 + Math.sin(a) * 4);
        ctx.lineTo(cx - Math.cos(a) * 4, -7.5 - Math.sin(a) * 4); ctx.stroke();
      }
    } else if (kind === 'hover') {
      ctx.beginPath(); ctx.ellipse(0, bottom + 3, bw * .3, 4, 0, 0, TAU);
      ctx.fillStyle = hexA(c2, .8); glow(ctx, c2, 14); ctx.fill();
      line(ctx, hexA(c2, .7), 1.5, 8);
      for (let i = -2; i <= 2; i++) {
        const l = 6 + Math.abs(Math.sin(t * 17 + i * 1.7)) * 8;
        ctx.beginPath(); ctx.moveTo(i * bw * .1, bottom + 6); ctx.lineTo(i * bw * .12, bottom + 6 + l); ctx.stroke();
      }
    }
  }

  function arms(ctx, kind, bw, by, c1, c2, t, fill) {
    const sw = Math.sin(t * 2.4) * 2;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      const x0 = bw * .46, y0 = by + 2;
      if (kind === 'stubs') {
        ctx.save(); ctx.translate(x0 + 2, y0); ctx.rotate(-.4 + sw * .04);
        rrect(ctx, -2, -5, 12, 14, 5); shell(ctx, c1, fill, -5, 9); ctx.restore();
      } else if (kind === 'claws') {
        const tx = x0 + 16, ty = y0 + 8 + sw;
        line(ctx, c1, 3, 8);
        ctx.beginPath(); ctx.moveTo(x0 - 2, y0 - 2); ctx.lineTo(tx, ty); ctx.stroke();
        line(ctx, c2, 2.4, 8);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 8, ty - 8);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + 10, ty + 2); ctx.stroke();
      } else if (kind === 'blades') {
        ctx.beginPath(); ctx.moveTo(x0 - 4, y0 - 8); ctx.lineTo(x0 + 28, y0 - 22 + sw); ctx.lineTo(x0 - 2, y0 + 8); ctx.closePath();
        shell(ctx, c2, fill, y0 - 22, y0 + 8);
      } else if (kind === 'cannons') {
        rrect(ctx, x0 - 4, y0 - 6, 24, 11, 3); shell(ctx, c1, fill, y0 - 6, y0 + 5);
        ctx.beginPath(); ctx.arc(x0 + 21, y0 - .5, 3.2, 0, TAU);
        ctx.fillStyle = fill || c2; glow(ctx, c2, 12); ctx.fill();
      } else if (kind === 'vines') {
        line(ctx, c1, 2.4, 8);
        ctx.beginPath(); ctx.moveTo(x0 - 3, y0 - 4);
        ctx.bezierCurveTo(x0 + 14, y0 - 10 + sw * 2, x0 + 8, y0 + 14 - sw * 2, x0 + 22, y0 + 18);
        ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x0 + 23, y0 + 19, 5, 2.6, .7, 0, TAU);
        ctx.fillStyle = fill || c2; glow(ctx, c2, 8); ctx.fill();
      }
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
        line(ctx, c1, 2, 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
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

  // o: { t, flip, alpha, scale, phase, sil (solid color silhouette) }
  function drawBot(ctx, id, x, y, size, o = {}) {
    const sp = SPECIES[id], bp = sp.bp;
    const sil = o.sil || null;
    const c1 = sil || TYPES[sp.t[0]].c;
    const c2 = sil || (sp.t[1] ? TYPES[sp.t[1]].c : mix(TYPES[sp.t[0]].c, '#ffffff', .55));
    const fill = sil;
    const t = o.t || 0, phase = o.phase || 0;
    const k = size / 100 * (bp.s || 1) * (o.scale ?? 1);
    if (k <= 0.001) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= (o.alpha ?? 1);
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
    legs(ctx, legKind, bw, floats ? bBot : -legH - 2 + bob * .3, c1, c2, t, fill);

    ctx.save(); ctx.translate(0, by);
    bodyPath(ctx, bp.body, bw, bh);
    shell(ctx, c1, fill, -bh / 2, bh / 2);
    if (!sil) {
      ctx.save(); bodyPath(ctx, bp.body, bw, bh); ctx.clip();
      line(ctx, hexA(c2, .65), 1.2, 4);
      ctx.beginPath(); ctx.moveTo(-bw / 2, bh * .18); ctx.lineTo(bw / 2, bh * .18); ctx.stroke();
      ctx.fillStyle = hexA(c2, .8);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * bw * .28, bh * .3, 1.6, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    if (bp.core) {
      const p = .6 + .4 * Math.sin(t * 3.4);
      ctx.beginPath(); ctx.moveTo(0, bh * .02); ctx.lineTo(7, bh * .16); ctx.lineTo(0, bh * .3); ctx.lineTo(-7, bh * .16); ctx.closePath();
      ctx.fillStyle = fill || hexA(c2, p); glow(ctx, c2, 16); ctx.fill();
    }
    ctx.restore();

    if (bp.arms) arms(ctx, bp.arms, bw, by, c1, c2, t, fill);

    let fx = 0, fy = by - bh * .12, fw = bw * .72, tx = 0, ty = bTop, tw = bw;
    if (bp.head && bp.head !== 'none') {
      const hs = bw * .64;
      const hh = bp.head === 'box' ? hs * .78 : hs * .88;
      const hy = bTop - hh * .3;
      ctx.save(); ctx.translate(0, hy);
      ctx.beginPath();
      if (bp.head === 'orb') ctx.ellipse(0, 0, hs / 2, hh / 2, 0, 0, TAU);
      else if (bp.head === 'box') rrect(ctx, -hs / 2, -hh / 2, hs, hh, 7);
      else { ctx.moveTo(-hs / 2, -hh / 2); ctx.lineTo(hs / 2, -hh / 2); ctx.quadraticCurveTo(hs * .3, hh * .2, 0, hh / 2); ctx.quadraticCurveTo(-hs * .3, hh * .2, -hs / 2, -hh / 2); ctx.closePath(); }
      shell(ctx, c1, fill, -hh / 2, hh / 2);
      ctx.restore();
      fx = 0; fy = hy - (bp.head === 'tri' ? hh * .12 : 0); fw = hs * .9; tx = 0; ty = hy - hh / 2; tw = hs;
    }
    eyes(ctx, bp.eyes, fx, fy, fw, c2, t, phase, fill);
    if (bp.top && bp.top !== 'none') top(ctx, bp.top, tx, ty, tw, c1, c2, t, fill, sil);

    ctx.restore();
  }

  // Overworld people/bots inside a 32px tile. (x, y) = tile's top-left in logical px.
  function drawPerson(ctx, x, y, dir, look, step, t) {
    const cx = x + 16, c = look.c;
    const pxs = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(cx, y + 29, 9, 3.5, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
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

  return { drawBot, drawPerson, drawOrb, drawCore };
})();
