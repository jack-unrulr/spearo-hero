// ============================================================================
// game test hooks: only in dev.html, driven by the scripts in source/test
// ============================================================================
{
  const GUN = ['LOADED', 'FIRED', 'REELING', 'RELOADING'];
  // fish movement can be held still so a test can aim and fire at an exact spot
  let hold = false;
  const step0 = stepFish;
  stepFish = (f, dt) => step0(f, hold ? 0 : dt);
  const onScreen = (i) => { const o = i * FN; return project(FS[o], FS[o + 1], FS[o + 2]) && PJ[0] > 0 && PJ[1] > 0 && PJ[0] < fx.clientWidth && PJ[1] < fx.clientHeight; };
  TT.arc = {
    state: () => ({ phase: RD.phase, t: RD.t, air: RD.air, score: RD.score, rows: RD.rows, end: RD.end, alarm: RD.alarm, gun: GUN[gst], stopped, spFish, stamp: RD.stamp, menu, seed: RD.seed, shots: RD.shots, hit: G[gHIT], curious: RD.curious, back: RD.back, tallyRows: document.querySelectorAll('#rows .row canvas').length, ini: iniOn, board: !$('again').hidden }),
    fish: () => FI.map((f) => ({ i: f.i, s: f.s, st: STN[f.st], x: f.x, d: f.d, h: f.h, wound: f.wound, spooks: f.spooks, vis: FST[f.i] === 0 && !!onScreen(f.i) })),
    go: (seed) => { ui(false); startRound(seed); return RD.seed; },
    speed: (k) => { RD.speed = k; },
    rig: (r) => { RD.rig = r; },
    hold: (v) => { hold = !!v; RD.still = hold ? 1 : 0; },
    air: (v) => { RD.air = v; },
    endless: (v) => { RD.endless = !!v; },
    // a tally with n made-up fish, for checking the layout
    fakeTally: (n) => {
      RD.rows = [];
      for (let k = 0; k < n; k++) { const s = k === 3 ? 1 : k === 5 ? 2 : 0, o = k === 5 ? 'WRONG FISH' : k === 4 ? 'GOT AWAY' : ['STONED', 'BODY SHOT', 'TAIL SHOT'][k % 3]; RD.rows.push({ s, n: SPEC[s].n, inch: s === 1 ? 38 : 16 + k, zone: ['head', 'body', 'tail'][k % 3], frac: [0.3, 0, -0.3][k % 3], outcome: o, pts: k === 5 ? -500 : k === 4 ? -100 : 600 }); }
      RD.score = 2800; Object.assign(RD.st, { shots: 9, hits: 7, stoned: 3, landed: 5, biggest: 38, best: 3, bonus: 450, threads: 1, trophy: 1 });
      RD.end = 'air'; RD.phase = 'tally'; RD.endT2 = ASCENT; showTally();
    }, // dev: the round does not end when the scene empties
    // put the crosshair on fish i, at `frac` of its length from the middle (+ toward the nose); returns the first
    // fish the spear would meet on that ray (-1: none within the line's length)
    aim: (i, frac) => {
      const o = i * FN, cp = cos(FS[o + fPIT]), ax = cos(FS[o + fYAW]) * cp, ay = sin(FS[o + fPIT]), az = sin(FS[o + fYAW]) * cp, L = FS[o + fLEN] * frac;
      if (!project(FS[o] + ax * L, FS[o + 1] + ay * L, FS[o + 2] + az * L)) return -2;
      RD.mx = PJ[0] / fx.clientWidth; RD.my = PJ[1] / fx.clientHeight; camera(0);
      return TT.arc.probe();
    },
    probe: () => {
      const cx = F[CX], cy = F[CY], cz = F[CZ];
      for (let s = 0.3; s < LINE + MUZ; s += 0.02) {
        const x = cx + G[gAX] * s, y = cy + G[gAY] * s, z = cz + G[gAZ] * s;
        for (let i = 0; i < NF; i++) {
          if (FST[i] !== 0) continue;
          const o = i * FN, ex = x - FS[o], ey = y - FS[o + 1], ez = z - FS[o + 2], len = FS[o + fLEN];
          if (ex * ex + ey * ey + ez * ez > len * len * 0.36) continue;
          if (hitIn(i, ex, ey, ez) < 1) return i;
        }
      }
      return -1;
    },
    fire: () => { if (!gst && RD.phase === 'bottom' && !RD.end) { fireReq = 1; return true; } return false; },
    mouse: (x, y) => { RD.mx = x; RD.my = y; },
    screen: (i) => { const o = i * FN; return project(FS[o], FS[o + 1], FS[o + 2]) ? [PJ[0], PJ[1], PJ[2]] : null; },
  };
  // hit boxes: B (or ?boxes in the URL, or TT.arc.boxes(1)) draws each live fish's hit volume exactly as spearMove()
  // tests it (fish.js hitIn, inside the 0.6-length sphere it checks first): every 4-pixel cell whose view ray passes
  // through the volume is filled. Colour = the zone a hit there scores: head (red), body (yellow), tail (blue).
  // Dashed: that outer sphere and the fish's axis. Label: half-height and half-width of the volume, length, in cm.
  let boxes = new URLSearchParams(location.search).has('boxes');
  TT.arc.boxes = (v) => { boxes = !!v; };
  addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.repeat) boxes = !boxes; });
  const ZC = ['rgba(255,70,60,0.4)', 'rgba(255,220,60,0.35)', 'rgba(80,170,255,0.4)'], CELL = 4;
  const draw0 = drawFx;
  drawFx = (dt) => {
    draw0(dt);
    if (!boxes) return;
    const cw = fx.clientWidth, ch = fx.clientHeight, asp = cw / max(1, ch), ppm = ch / 2 / TANH; // pixels per metre at 1 m
    fxc.save(); fxc.font = '600 10px ui-monospace, monospace'; fxc.textAlign = 'center';
    for (let i = 0; i < NF; i++) {
      if (FST[i] !== 0) continue;
      const o = i * FN, len = FS[o + fLEN], R = len * 0.6;
      const cp = cos(FS[o + fPIT]), ax = cos(FS[o + fYAW]) * cp, ay = sin(FS[o + fPIT]), az = sin(FS[o + fYAW]) * cp;
      if (!project(FS[o], FS[o + 1], FS[o + 2]) || PJ[2] < R + 0.15) continue;
      const cx = PJ[0], cy = PJ[1], dc = PJ[2], cull = R * ppm / sqrt(dc * dc - R * R);
      // march each cell's view ray through the depths the outer sphere spans
      for (let py = max(0, cy - cull) - (max(0, cy - cull) % CELL); py < min(ch, cy + cull); py += CELL) {
        for (let px = max(0, cx - cull) - (max(0, cx - cull) % CELL); px < min(cw, cx + cull); px += CELL) {
          const xn = ((px + CELL / 2) / cw - 0.5) * 2 * TANH * asp, yn = (0.5 - (py + CELL / 2) / ch) * 2 * TANH;
          const dx = F[FX] + F[RX] * xn + F[UX] * yn, dy = F[FY] + F[UY] * yn, dz = F[FZ] + F[RZ] * xn + F[UZ] * yn;
          for (let z = dc - R; z < dc + R; z += 0.008) {
            const ex = F[CX] + dx * z - FS[o], ey = F[CY] + dy * z - FS[o + 1], ez = F[CZ] + dz * z - FS[o + 2];
            if (ex * ex + ey * ey + ez * ez > R * R || hitIn(i, ex, ey, ez) >= 1) continue;
            const f = HT[0] / len; fxc.fillStyle = ZC[f > 0.2 ? 0 : f < -0.22 ? 2 : 1]; fxc.fillRect(px, py, CELL, CELL); break;
          }
        }
      }
      const r = hitR(i), w = hitW(i);
      // the cull sphere and the axis
      fxc.setLineDash([3, 3]); fxc.lineWidth = 1; fxc.strokeStyle = 'rgba(255,255,255,0.35)';
      fxc.beginPath(); fxc.arc(cx, cy, cull, 0, TAU); fxc.stroke();
      if (project(FS[o] - ax * len / 2, FS[o + 1] - ay * len / 2, FS[o + 2] - az * len / 2)) {
        const tx = PJ[0], ty = PJ[1];
        if (project(FS[o] + ax * len / 2, FS[o + 1] + ay * len / 2, FS[o + 2] + az * len / 2)) { fxc.strokeStyle = '#fff'; fxc.beginPath(); fxc.moveTo(tx, ty); fxc.lineTo(PJ[0], PJ[1]); fxc.stroke(); }
      }
      fxc.setLineDash([]);
      fxc.fillStyle = '#fff'; fxc.fillText(`${round(r * 100)}x${round(w * 100)} L${round(len * 100)}`, cx, cy - cull - 4);
    }
    fxc.restore();
  };
  TT.clean = (v) => { hideGun = v; for (const id of ['x', 'hud', 'fx']) $(id).style.visibility = v ? 'hidden' : ''; };
  TT.floor = floorY;
  TT.freeze = (v) => { simOff = v ? 2 : 0; };
}
