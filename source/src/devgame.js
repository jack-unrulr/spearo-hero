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
      for (let s = 0.3; s < LINE + MUZ; s += 0.05) {
        const x = cx + G[gAX] * s, y = cy + G[gAY] * s, z = cz + G[gAZ] * s;
        for (let i = 0; i < NF; i++) {
          if (FST[i] !== 0) continue;
          const o = i * FN, ex = x - FS[o], ey = y - FS[o + 1], ez = z - FS[o + 2], len = FS[o + fLEN];
          if (ex * ex + ey * ey + ez * ez > len * len * 0.36) continue;
          const cp = cos(FS[o + fPIT]), fx = cos(FS[o + fYAW]) * cp, fy = sin(FS[o + fPIT]), fz = sin(FS[o + fYAW]) * cp;
          let t = ex * fx + ey * fy + ez * fz; const h = hitH(i); t = t > h ? h : t < -h ? -h : t;
          const px = ex - fx * t, py = ey - fy * t, pz = ez - fz * t, r = hitR(i);
          if (px * px + py * py + pz * pz < r * r) return i;
        }
      }
      return -1;
    },
    fire: () => { if (!gst && RD.phase === 'bottom' && !RD.end) { fireReq = 1; return true; } return false; },
    mouse: (x, y) => { RD.mx = x; RD.my = y; },
    screen: (i) => { const o = i * FN; return project(FS[o], FS[o + 1], FS[o + 2]) ? [PJ[0], PJ[1], PJ[2]] : null; },
  };
  TT.clean = (v) => { hideGun = v; for (const id of ['x', 'hud', 'fx']) $(id).style.visibility = v ? 'hidden' : ''; };
  TT.floor = floorY;
  TT.freeze = (v) => { simOff = v ? 2 : 0; };
}
