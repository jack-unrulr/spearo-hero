// ============================================================================
// the arcade round: one breath-hold drop to a kelp-forest bottom spot
// ============================================================================
// The diver lies still on the bottom (aspetto) and the fish come by. A round is a seeded script of timed entries; each
// fish then runs a small state machine (calm, curious, startled, fleeing, away) driven by the shots. game.js fires the
// spear along the crosshair's ray and calls back here: arcFire, arcStop (the spear stopped), arcHit, arcLanded.
// Everything is in a local frame of the spot: x to the right, d away from the diver, h up from the eye.

// ---------------------------------------------------------------- locations
// A location is a trip: a few dive sites in the shared world, the words on its cards, and which species (indices into
// SPEC, fish.js) play which part: `hunt` the target, `trophy` the rare prize worth double, `avoid` the fish not to
// spear. A site is where the diver lies: x, z on the map, yaw the diver faces (radians, 0 = -z), eye height above the
// bottom. `board` names the location's leaderboard (trip totals). To add a location: an entry here (and its species in
// SPEC if they are new).
const LOCATIONS = [
  { id: 'tofino', board: 'tofino-trip', name: 'Tofino, BC', blurb: 'Kelp forest', air: 30, hunt: 0, trophy: 1, avoid: 2,
    avoidWhy: 'Spear one and<br>the dive is over',
    sites: [
      { name: 'Kelp Forest', spot: { x: 6, z: -66, yaw: 3.1, eye: 0.9 } },
      { name: 'Whale Tail', spot: { x: 10, z: 7, yaw: -0.84, eye: 0.9 } },
      { name: 'Coral Grotto', spot: { x: 4, z: 72, yaw: 3.5, eye: 0.9 } },
    ] },
];
const DESCENT = 6.5, ASCENT = 2.5, TURN = 0.07; // s, s, rad of camera turn toward the crosshair near the edges
let LOC, SITE = 0, SPOT, AIR, SPOT_Y, sR, sF;
const isT = (s) => s === LOC.trophy, isA = (s) => s === LOC.avoid;
const toW = (x, d) => [SPOT.x + sR[0] * x + sF[0] * d, SPOT.z + sR[1] * x + sF[1] * d];
// the bottom under the local grid, as height above the eye (m), x -16..16, d 0..14, every 0.5 m
const FLX = 65, FLD = 29, FLOOR = new Float32Array(FLX * FLD);
function useLocation(loc) { LOC = loc; AIR = loc.air; AVOID = loc.avoid; useSite(0); }
function useSite(k) {
  SITE = k; SPOT = LOC.sites[k].spot;
  SPOT_Y = floorY(SPOT.x, SPOT.z) + SPOT.eye;
  sR = [cos(SPOT.yaw), sin(SPOT.yaw)]; sF = [sin(SPOT.yaw), -cos(SPOT.yaw)]; // right and forward on the map (x, z)
  for (let j = 0; j < FLD; j++) for (let i = 0; i < FLX; i++) { const [wx, wz] = toW(i * 0.5 - 16, j * 0.5); FLOOR[i + FLX * j] = floorY(wx, wz) - SPOT_Y; }
}
useLocation(LOCATIONS.find((l) => l.id === (() => { try { return localStorage.getItem('spearo.loc'); } catch { return null; } })()) || LOCATIONS[0]);
const floorH = (x, d) => {
  const u = clamp((x + 16) * 2, 0, FLX - 1.001), v = clamp(d * 2, 0, FLD - 1.001), i = u | 0, j = v | 0, a = u - i, b = v - j, o = i + FLX * j;
  return (FLOOR[o] * (1 - a) + FLOOR[o + 1] * a) * (1 - b) + (FLOOR[o + FLX] * (1 - a) + FLOOR[o + FLX + 1] * a) * b;
};
const halfW = (d) => d * TANH * (canvas.clientWidth / max(1, canvas.clientHeight)); // half the view's width at distance d

// ---------------------------------------------------------------- round state
const OFF = 0, CALM = 1, CURIOUS = 2, STARTLED = 3, FLEE = 4, AWAY = 5, GONE = 6, SPEARED = 7, LANDED = 8;
const STN = ['off', 'calm', 'curious', 'startled', 'flee', 'away', 'gone', 'speared', 'landed'];
const RD = { phase: 'idle', t: 0, air: AIR, seed: 1, score: 0, rows: [], alarm: 0, script: [], next: 0, end: '', endT: 0, slow: 0, kick: 0, turn: 0, mx: 0.5, my: 0.45, speed: 1, rig: null, shots: 0, stamp: '', endT2: 0, br: 0, still: 0, curious: 0, back: [0, 0, 0], st: null, lowAir: 0, beat: 0 };
const FI = []; // one record per fish in the pool
for (let i = 0; i < NF; i++) FI.push({ i, s: FSP[i], st: OFF, x: 0, d: 0, h: 0, a: 0, spd: 0, vh: 0, tx: 0, td: 0, th: 0, ts: 0, path: [], wp: 0, pause: 0, tm: 0, spooks: 0, side: 1, hx: 0, hd: 0, hh: 0, wound: 0, cur: 0, zz: 0, hit: null, tear: -1, bleed: 0 });
let rng = () => 0;
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R2 = (a, b) => a + (b - a) * rng();

// ---------------------------------------------------------------- the script
// Every dive: surfperch holding territories close in, black rockfish passing farther out; on one dive of the trip
// (TRIP.trophy), a lingcod mid-dive with its escorts.
// (The fish to avoid keep the name 'garibaldi' in the code, from the first version.)
function makeScript(seed) {
  rng = mulberry(seed * 7919 + 13);
  const S = [];
  const H = LOC.hunt, T = LOC.trophy, A = LOC.avoid;
  for (let k = 0; k < 8; k++) S.push({ t: 0, s: A });
  S.push({ t: R2(8, 14), s: A });
  for (let t = R2(0.8, 1.8); t < 25; t += R2(2.5, 4.2)) {
    S.push({ t, s: H, side: rng() < 0.5 ? -1 : 1 });
    if (rng() < 0.35) S.push({ t: t + R2(0.6, 1.4), s: H, side: S[S.length - 1].side }); // a pair
  }
  const tt = R2(12, 20), ts = rng() < 0.5 ? -1 : 1;
  if (!TRIP.on || TRIP.cur === TRIP.trophy) S.push({ t: tt, s: T, side: ts, kelp: 1 }, { t: tt + 0.3, s: A, escort: 1 }, { t: tt + 0.7, s: A, escort: 1 }); // the trophy brings company
  S.sort((a, b) => a.t - b.t);
  return S;
}

// ---------------------------------------------------------------- fish behaviour
const fishOf = (s) => { for (let i = F0[s]; i < F0[s + 1]; i++) if (FI[i].st === OFF || FI[i].st === GONE) return FI[i]; return null; };
function spawn(f, len) {
  const o = f.i * FN, sp = SPEC[f.s];
  FS[o + fLEN] = len || R2(sp.l[0], sp.l[1]); FS[o + fRAD] = (sp.t[4] + sp.u[4]) * 0.5 * FS[o + fLEN] * 0.95 + 0.02;
  FS[o + fSEED] = rng(); FS[o + fPH] = rng() * TAU; FS[o + fROL] = 0; FS[o + fPIT] = 0;
  f.spooks = 0; f.wound = 0; f.hit = null; f.tear = -1; f.pause = 0; f.cur = 0; f.bleed = 0; f.spd = 0; f.vh = 0;
  FST[f.i] = 0;
}
const lane = () => R2(3, 5);
// a path across the view from `side`: in from off-screen, two stops, out the other side
function pathAcross(f, side, d0, kelp) {
  const d = d0 || lane(), hw = halfW(d), y = (x, d) => floorH(x, d) + R2(0.35, 1.3);
  const p = [], x1 = side * R2(0.25, 0.7) * hw, d1 = clamp(d + R2(-0.7, 0.7), 2.8, 5.4), x2 = -side * R2(0, 0.55) * hw, d2 = clamp(d + R2(-0.7, 0.7), 2.8, 5.4);
  if (SPEC[f.s].amb) { // an ambusher (the lingcod): it sits on the bottom a moment, then darts to the next spot, back and forth
    // out of the kelp ahead: a first stop on the way in, at an angle so it doesn't sit nose-on to the diver
    if (kelp) { const x = -side * R2(0.25, 0.45) * halfW(6.5), dd = R2(6, 7); p.push([x, dd, floorH(x, dd) + 0.1, R2(0.9, 1.5), 0]); }
    for (let k = 0; k < 4; k++) { const x = (k & 1 ? -side : side) * R2(0.15, 0.75) * hw, dd = clamp(d + R2(-1, 1), 2.8, 5.6); p.push([x, dd, floorH(x, dd) + 0.1, R2(0.7, 1.4), 0]); }
    const xe = (side) * -(halfW(d) + 2.5); p.push([xe, d, y(xe, d) + 0.3, 0, 0]); f.path = p; f.wp = 0; f.side = side; return;
  }
  p.push([x1, d1, y(x1, d1), rng() < 0.6 ? R2(0.6, 1.5) : 0, rng() < 0.4]);
  p.push([x2, d2, y(x2, d2), rng() < 0.5 ? R2(0.5, 1.2) : 0, 0]);
  const xe = -side * (halfW(d2) + 2.5); p.push([xe, d2 + R2(-0.5, 1), y(xe, d2) + 0.3, 0, 0]);
  f.path = p; f.wp = 0; f.side = side;
}
function enter(f, side, kelp) {
  const d = lane(), x = side * (halfW(d) + 1.5);
  f.x = x; f.d = d; f.h = floorH(x, d) + R2(0.5, 1.4); f.a = side > 0 ? PI : 0; f.st = CALM;
  // kelp: from the kelp forest straight ahead, swimming toward the diver (the lingcod's first entrance)
  if (kelp) { f.d = 11; f.x = side * R2(0.1, 0.3) * halfW(11); f.h = floorH(f.x, f.d) + 0.4; f.a = -PI / 2 - side * 0.35; }
  pathAcross(f, side, d, kelp);
}
function placeGaribaldi(f, late) {
  // a territory between the diver and the sheephead lanes, inside the view
  const d = R2(1.8, 2.9), hw = halfW(d) * 0.85, x = R2(-hw, hw);
  f.hx = x; f.hd = d; f.hh = floorH(x, d) + R2(0.25, 1.1);
  if (late) { const s = rng() < 0.5 ? -1 : 1; f.x = s * (halfW(d) + 1); f.d = d; f.h = f.hh; } else { f.x = f.hx + R2(-0.4, 0.4); f.d = f.hd; f.h = f.hh; }
  f.a = R2(0, TAU); f.st = CALM; f.tm = 0; f.esc = null; f.nip = rng() < 0.4; f.off = R2(-0.35, 0.35);
}
// an escort follows the trophy male wherever it goes, cutting in front of it
function escort(f) { const m = FI[F0[LOC.trophy]]; f.esc = m; f.nip = 0; const s = m.x > 0 ? 1 : -1; f.x = m.x + s * 0.8; f.d = max(1.6, m.d - 1); f.h = m.h; }
// the sheephead a garibaldi is guarding against: the nearest one passing its territory (any distance for an escort)
function intruder(f) {
  if (f.esc) return f.esc.st === CALM || f.esc.st === CURIOUS || f.esc.st === FLEE ? f.esc : null;
  let best = null, bd = 3.4;
  for (const g of FI) {
    const i = g.i; if (g.s !== LOC.hunt && g.s !== LOC.trophy) continue; if (g.st !== CALM && g.st !== CURIOUS || FST[i]) continue;
    const dd = hypot(g.x - f.hx, (g.d - f.hd) * 0.6) * (isT(g.s) ? 0.6 : 1); // the trophy draws them from farther
    if (dd < bd) { bd = dd; best = g; }
  }
  return best;
}

// startle every fish whose distance to the segment a -> b (world) is under its species radius
function startleAlong(ax, ay, az, bx, by, bz, extra, skip) {
  const ex = bx - ax, ey = by - ay, ez = bz - az, L = ex * ex + ey * ey + ez * ez + 1e-9;
  for (const f of FI) {
    if (f === skip || f.st === OFF || f.st === GONE || f.st === SPEARED || f.st === LANDED || f.st === AWAY) continue;
    const o = f.i * FN, px = FS[o] - ax, py = FS[o + 1] - ay, pz = FS[o + 2] - az, u = clamp((px * ex + py * ey + pz * ez) / L, 0, 1);
    const qx = px - ex * u, qy = py - ey * u, qz = pz - ez * u, R = SPEC[f.s].R * (1 + RD.alarm * 0.4) + extra;
    if (qx * qx + qy * qy + qz * qz < R * R) {
      // which way the threat is, across the view: the spear's closest point in the local frame
      const cx = ax + ex * u - SPOT.x, cz = az + ez * u - SPOT.z;
      startle(f, cx * sR[0] + cz * sR[1]);
    }
  }
}
function startle(f, threatX) {
  if (f.st === STARTLED || f.st === FLEE && f.tm < 0.3) return;
  f.st = STARTLED; f.tm = R2(0.12, 0.22); f.spooks++; f.side = f.x > threatX ? 1 : f.x < threatX ? -1 : rng() < 0.5 ? -1 : 1;
  if (abs(f.x - threatX) < 0.3 && rng() < 0.5) f.side = -f.side;
}
// the flee heading: across the view, away from the threat, with some depth wobble; for good: out the nearest side
function fleeHeading(f) { const dd = clamp(R2(-0.45, 0.55) + (f.d < 3 ? 0.5 : f.d > 6.5 ? -0.5 : 0), -0.9, 0.9); return atan2(dd, f.side); }
const leaves = (f) => f.wound || !isA(f.s) && f.spooks >= (isT(f.s) ? 2 : 3);

function stepFish(f, dt) {
  const o = f.i * FN, sp = SPEC[f.s], gar = isA(f.s);
  let want = f.a, spd = sp.v, turn = 2.2, flinch = 0;
  if (f.st === OFF || f.st === GONE || f.st === LANDED || f.st === SPEARED) return;
  if (f.st === AWAY) { // off-screen: comes back once the alarm has died down
    f.tm -= dt;
    if (f.tm <= 0 && RD.alarm < 0.35 && RD.phase === 'bottom') { if (leaves(f)) f.st = GONE; else { const s = f.side; enter(f, -s); f.st = CALM; RD.back[f.s]++; } }
    FST[f.i] = 4; fishInst(f.i, 0); return;
  }
  FST[f.i] = 0;
  const bl = () => f.spd / FS[o + fLEN];
  if (f.st === STARTLED) { // the telegraph: a quick flinch on the spot
    f.tm -= dt; flinch = 1; f.spd *= exp(-dt * 12);
    if (f.tm <= 0) { f.st = FLEE; f.tm = gar ? R2(0.5, 0.9) : f.wound ? R2(2.5, 3.5) : R2(1.6, 2.6); f.zz = R2(0.35, 0.6); f.ts = fleeHeading(f); f.a = f.ts + (rng() - 0.5) * 0.3; f.spd = sp.f * (f.wound ? 0.75 : 1); }
    want = f.a; spd = f.spd; turn = 0;
  } else if (f.st === FLEE) { // burst and coast, zig-zagging across the view
    f.tm -= dt; f.zz -= dt; turn = sp.amb ? 4 : 9;
    if (f.zz <= 0) { f.zz = R2(0.45, 0.75); f.spd = sp.f * R2(0.7, 1) * (f.wound ? 0.75 : 1); f.ts = fleeHeading(f); f.ts += (rng() < 0.5 ? -1 : 1) * R2(0.3, 0.6); }
    if (leaves(f)) f.ts = atan2(R2(-0.1, 0.2), f.side);
    want = f.ts; spd = sp.v * 1.5 + (f.spd - sp.v * 1.5) * exp(-dt * 2.5); f.spd = spd;
    if (f.wound && (f.bleed -= dt) <= 0) { f.bleed = 0.25; blood(FS[o], FS[o + 1], FS[o + 2], 0.05); }
    const off = abs(f.x) > halfW(f.d) + 0.8;
    if (off && !gar) { f.st = AWAY; f.tm = R2(1.5, 3); FST[f.i] = 4; fishInst(f.i, 0); if (f.wound) lost(f); return; }
    if (f.tm <= 0) {
      if (gar) { f.st = CALM; f.tm = 0; RD.back[2]++; }
      else if (leaves(f)) f.tm = 0.5; // keep going until off-screen
      else { f.st = CALM; pathAcross(f, -f.side, clamp(f.d, 2.8, 5.4)); f.wp = 1; RD.back[f.s]++; }
    }
  } else if (gar) { // territorial: hovering round its spot, turning often
    // An intruding sheephead gets chased: most garibaldi cut in between it and the diver (they hang right in the line
    // of fire), the rest go and nip at its flank. Real garibaldi defend their patch hard.
    f.tm -= dt; const g = intruder(f);
    if (g) {
      if (f.nip) { f.tx = g.x + f.off * 2; f.td = g.d - 0.45; f.th = g.h + f.off * 0.5; }
      else { const k = clamp((g.d - 1.1) / g.d, 0.3, 0.8); f.tx = g.x * k + f.off * k; f.td = g.d * k; f.th = g.h * k + f.off * 0.4; }
      if (!f.esc) { const lx = f.tx - f.hx, ld = f.td - f.hd, ll = hypot(lx, ld); if (ll > 3.5) { f.tx = f.hx + lx * 3.5 / ll; f.td = f.hd + ld * 3.5 / ll; } }
      f.td = max(f.td, 1.6); f.tm = 0.4;
    } else if (f.tm <= 0) { f.tm = R2(1.2, 3); f.tx = f.hx + R2(-0.5, 0.5); f.td = f.hd + R2(-0.3, 0.3); f.th = f.hh + R2(-0.15, 0.15); }
    const dx = f.tx - f.x, dd = f.td - f.d, dist = hypot(dx, dd);
    want = atan2(dd, dx); spd = dist > 1 ? sp.f * (g ? 0.9 : 0.6) : dist > 0.25 ? sp.v * (g ? 2.5 : 1) : 0.08; turn = g ? 6 : 3;
  } else if (f.st === CURIOUS) { // close in to have a look, hang there facing the diver
    f.tm -= dt; const dx = f.tx - f.x, dd = f.td - f.d, dist = hypot(dx, dd);
    if (dist > 0.3) { want = atan2(dd, dx); spd = sp.v * 1.2; } else { want = atan2(-f.d, -f.x); spd = 0.05; }
    turn = 2.5;
    if (f.tm <= 0 || RD.alarm > 0.4) f.st = CALM;
  } else { // calm: along the path, stopping to pick at the bottom
    const p = f.path[f.wp] || f.path[f.path.length - 1];
    f.tx = p[0]; f.td = p[1]; f.th = p[2];
    const dx = f.tx - f.x, dd = f.td - f.d, dist = hypot(dx, dd);
    want = atan2(dd, dx); spd = sp.v * (1 + RD.alarm);
    if (sp.amb) { spd = sp.f * 0.42; turn = 2.6; } // the dart: brisk but smooth
    if (f.pause > 0) { f.pause -= dt; spd = 0.06; f.th = floorH(f.x, f.d) + (sp.amb ? 0.05 : 0.3) + FS[o + fRAD]; if (f.pause <= 0) f.wp++; }
    else if (dist < (sp.amb ? 0.9 : 0.4)) {
      if (f.wp >= f.path.length - 1) { f.st = GONE; FST[f.i] = 4; fishInst(f.i, 0); return; }
      if (p[4] && RD.alarm < 0.3) { p[4] = 0; f.st = CURIOUS; RD.curious++; f.tm = R2(1.5, 2.6); f.tx = f.x * 0.4 + R2(-0.6, 0.6); f.td = R2(2, 2.6); f.th = R2(-0.35, 0.1); }
      else if (p[3]) { f.pause = p[3]; p[3] = 0; } else f.wp++;
    }
  }
  // turn toward `want`, ease the speed, move in the local frame
  if (turn > 0) { let da = want - f.a; da -= TAU * round(da / TAU); f.a += clamp(da, -turn * dt, turn * dt); }
  if (f.st !== FLEE && f.st !== STARTLED) f.spd += (spd - f.spd) * min(1, dt * (sp.amb ? 1.3 : 2));
  if (f.st === CURIOUS || gar || f.st === CALM) f.vh = clamp((f.th - f.h) * 1.2, -0.4, 0.4); else f.vh *= exp(-dt * 3);
  f.x += cos(f.a) * f.spd * dt; f.d += sin(f.a) * f.spd * dt; f.h += f.vh * dt;
  if (f.d < 1.5) { f.d = 1.5; if (sin(f.a) < 0) f.a = -f.a; }
  if (f.d > 11) { f.d = 11; if (sin(f.a) > 0) f.a = -f.a; }
  const fl = floorH(f.x, f.d) + FS[o + fRAD] + 0.12; if (f.h < fl) f.h += (fl - f.h) * min(1, dt * 8);
  if (f.h > 2.5) f.h = 2.5;
  // the FS row, in the world
  const [wx, wz] = toW(f.x, f.d), fx = sR[0] * cos(f.a) + sF[0] * sin(f.a), fz = sR[1] * cos(f.a) + sF[1] * sin(f.a);
  FS[o] = wx; FS[o + 1] = SPOT_Y + f.h; FS[o + 2] = wz;
  QP[0] = wx; QP[1] = FS[o + 1]; QP[2] = wz; rk(0); if (QD[0] > -0.1) { f.h += 0.4 * dt + max(0, QD[0]); FS[o + 1] = SPOT_Y + f.h; }
  FS[o + fYAW] = atan2(fz, fx) + (flinch ? sin(RD.t * 70) * 0.25 : 0);
  FS[o + fPIT] = f.pause > 0 ? (sp.amb ? 0 : -0.35) : clamp(atan2(f.vh, max(f.spd, 0.2)), -0.5, 0.5);
  FS[o + fROL] = flinch ? sin(RD.t * 55) * 0.3 : 0;
  const b = bl(); FS[o + fPH] += dt * TAU * min(0.9 + 1.1 * b + flinch * 6, 9); if (FS[o + fPH] > 100 * TAU) FS[o + fPH] -= 100 * TAU;
  fishInst(f.i, flinch ? 0.16 : 0.03 + 0.05 * min(b / 3, 1.4));
}

// ---------------------------------------------------------------- scoring
const ZONE = (frac) => frac > 0.2 ? 'head' : frac < -0.22 ? 'tail' : 'body';
const basePts = (f) => round(FS[f.i * FN + fLEN] * 1000 / 50) * 50 * (isT(f.s) ? 2 : 1);
const cm = (f) => round(FS[f.i * FN + fLEN] * 100), inch = (f) => round(FS[f.i * FN + fLEN] * 39.37); // lengths are shown in inches
function addScore(n) { RD.score = max(0, RD.score + n); HUD.sc.textContent = RD.score; } // a dive never goes below zero; the HUD counts this dive only
function row(f, outcome, pts) { RD.rows.push({ s: f.s, n: SPEC[f.s].n, inch: inch(f), zone: f.hit ? f.hit.zone : '', frac: f.hit ? f.hit.frac : 0, outcome, pts }); }
// a wounded fish that leaves the view: the hit still pays, 100 less (never under 50), so a lost fish never costs points
function lost(f) {
  if (f.wound !== 1) return; f.wound = 2; RD.st.lost++;
  const o = f.i * FN, p = max(50, (f.pts || 0) - 100);
  callout(FS[o], FS[o + 1], FS[o + 2], `GOT AWAY  +${p}`, '#ffb35c'); addScore(p); row(f, 'GOT AWAY', p); if (SFX) SFX(12);
}
const pick = (a) => a[rng() * a.length | 0];
// a fish taken (stoned, or landed): the streak grows, and from the second in a row it pays a bonus
function took(f, x, y, z) {
  const S = RD.st; S.landed++; S.biggest = max(S.biggest, inch(f)); if (isT(f.s)) S.trophy = 1;
  S.streak++; S.best = max(S.best, S.streak);
  if (S.streak > 1) {
    const b = 100 * (S.streak - 1); S.bonus += b; addScore(b);
    setTimeout(() => { callout(x, y + 0.2, z, `${S.streak} IN A ROW!  +${b}`, '#ff9cf0', 1.1); if (SFX) SFX(15); }, 450);
  }
}
const resetStreak = () => { RD.st.streak = 0; };

// game.js callbacks
function arcFire() {
  RD.alarm = min(1, RD.alarm + 0.25); RD.kick = 1; RD.shots++; RD.st.shots++;
  for (let k = 0; k < 14; k++) bubbles.push({ x: G[gMZX], y: G[gMZY], z: G[gMZZ], vx: G[gAX] * R2(0.3, 1.2) + R2(-0.15, 0.15), vy: R2(0.3, 0.8), vz: G[gAZ] * R2(0.3, 1.2) + R2(-0.15, 0.15), r: R2(0.004, 0.013), t: 0, life: R2(0.8, 1.6) });
}
function arcStop() {
  if (stopped !== 3) {
    RD.alarm = min(1, RD.alarm + 0.15); resetStreak();
    callout(G[gSPX], G[gSPY], G[gSPZ], stopped === 2 ? pick(['CLANG!', 'ROCK SHOT', 'PING!']) : pick(['MISS!', 'WHIFF!', 'NOPE!', 'SPLOOSH']), '#b9d4dc', 0.9);
    if (SFX) SFX(18);
  }
  startleAlong(G[gOX], G[gOY], G[gOZ], G[gSPX], G[gSPY], G[gSPZ], 0, spFish >= 0 ? FI[spFish] : null);
}
function arcHit(i, frac, second) { // second: the far fish of a double
  const f = FI[i], o = i * FN, zone = ZONE(frac); f.st = SPEARED; f.hit = { zone, frac }; FS[o + fTX] = frac; RD.st.hits++; if (!second) RD.st.hitShots++; // hits counts fish; hitShots counts shots that hit (a double is one)
  blood(G[gPX], G[gPY], G[gPZ], 0.09);
  // the thrashing fish scares the ones around it
  startleAlong(FS[o], FS[o + 1], FS[o + 2], FS[o], FS[o + 1], FS[o + 2], 0.6, f);
  if (isA(f.s)) {
    addScore(-500); row(f, 'WRONG FISH', -500); callout(FS[o], FS[o + 1], FS[o + 2], '−500', '#ff5a4a');
    stamp('WRONG FISH!', 'bad'); endRound('protected'); if (SFX) SFX(11);
    return;
  }
  // a double: two fish on one spear
  if (second) {
    RD.st.doubles++; addScore(500); RD.st.bonus += 500;
    setTimeout(() => { callout(FS[o], FS[o + 1] + 0.45, FS[o + 2], pick(['DOUBLE!  +500', 'SHISH KEBAB!  +500', 'TWO FOR ONE!  +500']), '#ff9cf0', 1.4); if (SFX) SFX(15); }, 350);
  }
  // threaded it: the spear went past a garibaldi with only a hand's width to spare
  const ax = G[gOX], ay = G[gOY], az = G[gOZ], ex = G[gPX] - ax, ey = G[gPY] - ay, ez = G[gPZ] - az, L = ex * ex + ey * ey + ez * ez + 1e-9;
  for (const g of FI) {
    if (!isA(g.s) || FST[g.i] !== 0) continue;
    const q = g.i * FN, px = FS[q] - ax, py = FS[q + 1] - ay, pz = FS[q + 2] - az, u = clamp((px * ex + py * ey + pz * ez) / L, 0, 1);
    if (u > 0 && u < 1 && hypot(px - ex * u, py - ey * u, pz - ez * u) < FS[q + fRAD] + 0.25) {
      RD.st.threads++; addScore(150); RD.st.bonus += 150;
      setTimeout(() => { callout(FS[o], FS[o + 1] + 0.35, FS[o + 2], 'THREADED IT!  +150', '#7dff9a', 1.05); if (SFX) SFX(19); }, 250);
      break;
    }
  }
  if (isT(f.s)) callout(FS[o], FS[o + 1] + 0.5, FS[o + 2], 'TROPHY!', '#fff27a', 1.5);
  else if (cm(f) >= 54) callout(FS[o], FS[o + 1] + 0.5, FS[o + 2], pick(['BIG ONE!', 'HOG!', 'MONSTER!']), '#fff27a', 1.2);
  const rig = RD.rig, hold = rig && rig.hold !== undefined ? rig.hold : rng() < (zone === 'body' ? 0.8 : zone === 'tail' ? 0.25 : 1);
  if (zone === 'head') {
    if (second) limp2 = 1; else limp = 1; const p = round(basePts(f) * 1.5 / 10) * 10; f.pts = p; addScore(p); row(f, 'STONED', p);
    callout(FS[o], FS[o + 1], FS[o + 2], `STONED!  +${p}`, '#fff27a', 1.3); RD.slow = 0.75;
    RD.st.stoned++; took(f, FS[o], FS[o + 1], FS[o + 2]); if (SFX) SFX(8);
  } else {
    f.pts = zone === 'body' ? basePts(f) : round(basePts(f) * 0.6 / 10) * 10;
    f.tear = hold ? -1 : R2(0.06, 0.18); // s into the reel: early, the fish is close in a moment
    callout(FS[o], FS[o + 1], FS[o + 2], zone === 'body' ? 'BODY SHOT' : 'TAIL SHOT', '#e8fbff'); if (SFX) SFX(9);
  }
}
function arcLanded(i) {
  const f = FI[i]; f.st = LANDED; FST[i] = 4; fishInst(i, 0);
  if (isA(f.s) || !f.hit) return;
  if (f.hit.zone !== 'head') { addScore(f.pts); row(f, f.hit.zone === 'body' ? 'BODY SHOT' : 'TAIL SHOT', f.pts); callout(G[gMZX], G[gMZY] + 0.25, G[gMZZ], `+${f.pts}`, '#9ff6ff'); took(f, G[gMZX], G[gMZY] + 0.25, G[gMZZ]); if (SFX) SFX(9); }
}
// on the reel a badly hit fish can tear free
function checkTear(dt) {
  if (spFish < 0 || gst !== 2) return;
  if (spFish2 >= 0) tearOne(FI[spFish2], dt); // a double: either fish can tear free (the far one first)
  if (spFish >= 0) tearOne(FI[spFish], dt);
}
function tearOne(f, dt) {
  if (f.tear < 0) return;
  if ((f.tear -= dt) > 0) return;
  const o = f.i * FN; spearDrop(f.i); f.tear = -1;
  f.st = STARTLED; f.tm = 0.05; f.wound = 1; f.spooks = 99; f.side = rng() < 0.5 ? -1 : 1; FST[f.i] = 0;
  // back into the local frame from where it hangs on the line
  const px = FS[o] - SPOT.x, pz = FS[o + 2] - SPOT.z; f.x = px * sR[0] + pz * sR[1]; f.d = max(1.8, px * sF[0] + pz * sF[1]); f.h = FS[o + 1] - SPOT_Y;
  callout(FS[o], FS[o + 1], FS[o + 2], pick(['TORE OFF!', 'IT BROKE OFF!', 'PULLED FREE!']), '#ffb35c', 1.15); blood(FS[o], FS[o + 1], FS[o + 2], 0.07);
  resetStreak(); if (SFX) SFX(10);
}

// ---------------------------------------------------------------- HUD (DOM)
document.body.insertAdjacentHTML('beforeend', `<canvas id=fx></canvas>
<div id=hud><p id=sc0>1UP <b id=sc>0</b></p><div id=air><i></i><span>AIR</span></div></div>
<div id=card></div>
<p id=big></p>
<div id=tally><div class=tl><h2 id=th>Dive over</h2><p id=why></p><p id=tsc>0</p><div id=rows></div></div><div class=tc><div id=stats></div><p id=verdict></p><div id=awards></div><p id=lbt class=k></p><ol id=lb></ol><button id=again>Next dive</button></div></div>`);
// the fx canvas has to come after the scene canvas but under the HUD: move it next to the canvas
canvas.after($('fx'));
const HUD = { sc: $('sc'), air: $('air'), fill: $('air').firstChild, card: $('card'), big: $('big'), tally: $('tally') };
let bigT = 0;
function stamp(text, cls, dur) { HUD.big.textContent = text; HUD.big.className = 'on ' + (cls || ''); bigT = dur || 2.2; RD.stamp = text; }

// ---------------------------------------------------------------- effects (2D overlay, projected from the world)
const fx = $('fx'), fxc = fx.getContext('2d'), bubbles = [], clouds = [], calls = [], sparks = [];
function blood(x, y, z, r) { for (let k = 0; k < 5; k++) clouds.push({ x: x + R2(-r, r), y: y + R2(-r, r), z: z + R2(-r, r), r: r * R2(0.6, 1.2), g: R2(0.25, 0.5), t: 0, life: R2(2, 3.5) }); }
function callout(x, y, z, text, col, big) { calls.push({ x, y, z, text, col, big: big || 1, t: 0 }); }
const PJ = new Float64Array(3);
function project(x, y, z) { // PJ = screen x, y (CSS px) and depth; depth < 0.1 is behind
  const dx = x - F[CX], dy = y - F[CY], dz = z - F[CZ], cw = fx.clientWidth, ch = fx.clientHeight, asp = cw / max(1, ch);
  const zz = dx * F[FX] + dy * F[FY] + dz * F[FZ], xx = dx * F[RX] + dz * F[RZ], yy = dx * F[UX] + dy * F[UY] + dz * F[UZ];
  PJ[2] = zz; if (zz < 0.1) return 0;
  PJ[0] = (xx / (zz * TANH * asp) * 0.5 + 0.5) * cw; PJ[1] = (0.5 - yy / (zz * TANH) * 0.5) * ch; return 1;
}
function drawFx(dt) {
  const dpr = min(devicePixelRatio, 2), cw = fx.clientWidth, ch = fx.clientHeight;
  if (fx.width !== round(cw * dpr) || fx.height !== round(ch * dpr)) { fx.width = round(cw * dpr); fx.height = round(ch * dpr); }
  fxc.setTransform(dpr, 0, 0, dpr, 0, 0); fxc.clearRect(0, 0, cw, ch);
  const px = ch / 2 / TANH; // pixels per metre at 1 m
  for (let k = clouds.length; k--;) { // blood: red turns dark green at depth
    const c = clouds[k]; c.t += dt; c.r += dt * 0.12 * (1 - c.t / c.life); c.y += dt * 0.03;
    if (c.t > c.life) { clouds.splice(k, 1); continue; }
    if (!project(c.x, c.y, c.z)) continue;
    const r = c.r * px / PJ[2], a = c.g * (1 - c.t / c.life), gr = fxc.createRadialGradient(PJ[0], PJ[1], 0, PJ[0], PJ[1], r);
    gr.addColorStop(0, `rgba(16,38,20,${a})`); gr.addColorStop(0.6, `rgba(22,48,26,${a * 0.6})`); gr.addColorStop(1, 'rgba(22,48,26,0)');
    fxc.fillStyle = gr; fxc.beginPath(); fxc.arc(PJ[0], PJ[1], r, 0, TAU); fxc.fill();
  }
  fxc.lineWidth = 1.2;
  for (let k = bubbles.length; k--;) {
    const b = bubbles[k]; b.t += dt; b.vx *= exp(-dt * 3); b.vz *= exp(-dt * 3); b.vy = min(b.vy + dt * 1.5, 1.2);
    b.x += b.vx * dt + sin(b.t * 13 + k) * 0.02 * dt * 10; b.y += b.vy * dt; b.z += b.vz * dt; b.r += dt * 0.003;
    if (b.t > b.life) { bubbles.splice(k, 1); continue; }
    if (!project(b.x, b.y, b.z)) continue;
    const r = max(1.2, b.r * px / PJ[2]); fxc.strokeStyle = `rgba(220,250,255,${0.7 * (1 - b.t / b.life)})`;
    fxc.beginPath(); fxc.arc(PJ[0], PJ[1], r, 0, TAU); fxc.stroke();
  }
  { const m = FI[F0[LOC.trophy]], o = m.i * FN; // a soft gold halo round the trophy
    if (FST[m.i] === 0 && project(FS[o], FS[o + 1], FS[o + 2])) {
      const r = FS[o + fLEN] * 0.75 * px / PJ[2], a = 0.26 + 0.1 * sin(F[TIME] * 3.5), gr = fxc.createRadialGradient(PJ[0], PJ[1], 0, PJ[0], PJ[1], r);
      gr.addColorStop(0, `rgba(255,214,90,${a})`); gr.addColorStop(0.55, `rgba(255,200,70,${a * 0.5})`); gr.addColorStop(1, 'rgba(255,190,60,0)');
      fxc.save(); fxc.globalCompositeOperation = 'lighter'; fxc.fillStyle = gr; fxc.beginPath(); fxc.arc(PJ[0], PJ[1], r, 0, TAU); fxc.fill(); fxc.restore();
    } }
  for (let k = sparks.length; k--;) { // four-point gold glints
    const p = sparks[k]; p.t += dt; p.y += dt * 0.08; if (p.t > p.life) { sparks.splice(k, 1); continue; }
    if (!project(p.x, p.y, p.z)) continue;
    const u = p.t / p.life, r = (1 - abs(u * 2 - 1)) * 10 * min(1.6, 3 / PJ[2]);
    fxc.fillStyle = 'rgba(255,240,160,.95)'; fxc.beginPath();
    fxc.moveTo(PJ[0], PJ[1] - r); fxc.lineTo(PJ[0] + r * .2, PJ[1] - r * .2); fxc.lineTo(PJ[0] + r, PJ[1]); fxc.lineTo(PJ[0] + r * .2, PJ[1] + r * .2);
    fxc.lineTo(PJ[0], PJ[1] + r); fxc.lineTo(PJ[0] - r * .2, PJ[1] + r * .2); fxc.lineTo(PJ[0] - r, PJ[1]); fxc.lineTo(PJ[0] - r * .2, PJ[1] - r * .2); fxc.fill();
  }
  fxc.textAlign = 'center'; fxc.lineJoin = 'round';
  for (let k = calls.length; k--;) { // callouts float up from the fish
    const c = calls[k]; c.t += dt; if (c.t > 1.8) { calls.splice(k, 1); continue; }
    if (!project(c.x, c.y, c.z)) continue;
    const pop = min(1, c.t / 0.12), a = c.t < 1.3 ? 1 : 1 - (c.t - 1.3) / 0.5, sz = round(min(cw, ch * 1.6) * 0.03 * c.big * (0.7 + 0.3 * pop));
    fxc.font = `900 ${sz}px system-ui, sans-serif`; fxc.globalAlpha = a;
    const hw = fxc.measureText(c.text).width / 2 + 8, x = clamp(PJ[0], hw, cw - hw - ch * 0.08);
    const y = clamp(PJ[1] - 30 - c.t * 45, sz * 2.2, ch - sz); fxc.lineWidth = sz * 0.18; fxc.strokeStyle = '#03131c'; fxc.strokeText(c.text, x, y); fxc.fillStyle = c.col; fxc.fillText(c.text, x, y);
    fxc.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- round flow
// the dive card for the current site: what to hunt (with photos), what to avoid, the tip
function buildCard() {
  const fig = (s, extra, cls) => `<figure data-s=${s}${cls ? ' class=' + cls : ''}><figcaption>${SPEC[s].n}${extra || ''}</figcaption></figure>`;
  HUD.card.innerHTML = `<h2>${LOC.sites[SITE].name}</h2><p class=d>${LOC.name} · one breath · ${AIR} s on the bottom</p>
<div class=cols><div class="cc hunt"><b class=hd>Hunt</b><div class=fs>${fig(LOC.hunt)}${fig(LOC.trophy, ' <em>Trophy ×2</em>')}</div></div>
<div class="cc avoid"><b class=hd>Avoid</b><div class=fs>${fig(LOC.avoid, '', 'no')}</div><p>${LOC.avoidWhy}</p></div></div>
<p class=tip><i></i><span><b>Aim for the head!</b> Head shots stone the fish. Body and tail shots can tear free.</span></p>`;
  for (const f of HUD.card.querySelectorAll('figure')) f.prepend(fishCanvas(+f.dataset.s, 156, 65));
}
function newRound(seed) {
  RD.seed = seed; RD.script = makeScript(seed); RD.next = 0; RD.t = 0; RD.air = AIR; RD.score = 0; RD.rows = []; RD.alarm = 0; RD.end = ''; RD.endT = 0; RD.slow = 0; RD.shots = 0; RD.stamp = ''; RD.curious = 0; RD.back = [0, 0, 0]; RD.lowAir = 0; RD.beat = 0;
  RD.st = { shots: 0, hits: 0, hitShots: 0, stoned: 0, landed: 0, lost: 0, doubles: 0, biggest: 0, streak: 0, best: 0, bonus: 0, threads: 0, trophy: 0 };
  rng = mulberry(seed * 31337 + 7);
  for (const f of FI) { f.st = OFF; FST[f.i] = 4; fishInst(f.i, 0); }
  bubbles.length = clouds.length = calls.length = sparks.length = 0;
  HUD.sc.textContent = 0; HUD.tally.className = ''; body.classList.remove('tal');
  // the reel and gun start clean
  gst = 0; stopped = 0; spFish = spFish2 = -1; spGap = 0; fireReq = 0; limp = limp2 = 0; G[gB1] = G[gB2] = 1; G[gSEAT] = 0; G[gPOSE] = 0; REEL = 0;
  // garibaldi are already home when you arrive
  for (const e of RD.script) if (e.t === 0) { const f = fishOf(e.s); if (f) { spawn(f); placeGaribaldi(f, 0); } }
  while (RD.next < RD.script.length && RD.script[RD.next].t === 0) RD.next++;
}
function startRound(seed) {
  $('ps').hidden = true;
  if (iniOn) closeName(); for (const t of tallyTimers) clearTimeout(t); tallyTimers = [];
  newRound(seed); RD.phase = 'descent'; HUD.card.className = 'on'; }
function endRound(why) {
  if (RD.end) return; MUSIC = 0; MUSICT = 1; RD.end = why; RD.endT = why === 'protected' ? 2.2 : why === 'air' ? 1.2 : 1;
  if (why === 'air') stamp('SURFACE!', 'warn'); else if (why === 'clear') stamp('ALL CLEAR', '', 1.4);
}
// ---------------------------------------------------------------- the trip
// A trip is every dive site of a location, each dived once, in any order. One of them, picked at random, has the trophy.
// Its score is the sum of its dives; that total is what goes on the board.
const TRIP = { on: 0, seed: 0, trophy: -1, dives: [], cur: -1, order: [] };
function newTrip(seed) {
  const r = mulberry(seed * 9973 + 5);
  TRIP.on = 1; TRIP.seed = seed; TRIP.trophy = r() * LOC.sites.length | 0; TRIP.dives = LOC.sites.map(() => null); TRIP.cur = -1; TRIP.order = [];
}
const tripScore = () => TRIP.dives.reduce((a, d) => a + (d ? d.score : 0), 0);
const tripLeft = () => TRIP.dives.filter((d) => !d).length;
function tripStats() { // the dives' stats added up (the biggest fish and best streak: the best of them)
  const S = { shots: 0, hits: 0, hitShots: 0, stoned: 0, landed: 0, lost: 0, doubles: 0, biggest: 0, best: 0, bonus: 0, threads: 0, trophy: 0, prot: 0 };
  for (const d of TRIP.dives) if (d) {
    for (const k of ['shots', 'hits', 'hitShots', 'stoned', 'landed', 'lost', 'doubles', 'bonus', 'threads']) S[k] += d.st[k];
    S.biggest = max(S.biggest, d.st.biggest); S.best = max(S.best, d.st.best); S.trophy |= d.st.trophy; if (d.end === 'protected') S.prot++;
  }
  return S;
}
function startDive(k, seed) {
  if (!TRIP.on || TRIP.dives[k]) return;
  TRIP.cur = k; useSite(k); buildCard(); $('m').dataset.s = 'home'; $('quit').hidden = false; ui(false); bDive.textContent = 'Resume';
  startRound(seed ?? TRIP.seed * 7 + k + 1);
}
function leaveTally() { for (const t of tallyTimers) clearTimeout(t); tallyTimers = []; newRound(1); RD.phase = 'idle'; camera(0); }
function endTrip() { TRIP.on = 0; TRIP.cur = -1; TRIP.dives = []; bDive.textContent = 'Start'; $('ps').hidden = false; $('quit').hidden = true; leaveTally(); }

// ---------------------------------------------------------------- screens on the start page
// Start > trip picker > Player 1's name > dive picker > a dive and its results, back to the picker > trip results.
// #m[data-s] says which is up: home, trips, name, dives.
function show(s) { $('m').dataset.s = s; ui(true); }
function arcGo() { // the home screen's button: resume a paused dive (true), or go and pick a trip (false: the menu stays up)
  if (TRIP.on && RD.phase !== 'idle') return true;
  showTrips(); return false;
}
// the trip picker: a card per location with a photo of its first site, and its Top 10 button underneath
function showTrips() {
  const el = $('tripc'); el.innerHTML = '';
  for (const l of LOCATIONS) {
    const c = document.createElement('div'), b = document.createElement('button');
    c.className = 'tcard'; b.className = 'go'; b.append(shot(l, 0, 208, 150));
    b.insertAdjacentHTML('beforeend', `<b>${l.name}</b><span>${l.blurb} · ${l.sites.length} dives</span>`);
    b.onclick = () => { sound(); useLocation(l); try { localStorage.setItem('spearo.loc', l.id); } catch {} buildCard(); showHi(); askName(); };
    c.append(b); c.insertAdjacentHTML('beforeend', '<div class=under><button class=top>Top 10</button></div>');
    c.querySelector('.top').onclick = () => openBoard(l);
    el.append(c);
  }
  el.insertAdjacentHTML('beforeend', '<div class="tcard soon"><div class=face><i></i><b>More waters</b><span>Coming soon</span></div><div class=under></div></div>');
  show('trips'); setTimeout(() => el.querySelector('.go').focus(), 100);
}
// ---------------------------------------------------------------- players
// Each trip starts with its player entering a name (one player for now: Player 1). The last name used on this device is
// filled in, so Enter is enough. The trip's score goes on the board under it.
let PLAYER = '', iniOn = false;
const myName = () => { try { const v = localStorage.getItem('spearo.name'); return /^[A-Z]{1,7}$/.test(v || '') ? v : ''; } catch { return ''; } };
const cleanName = (v) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, NAMEN);
function askName() { iniOn = true; const n = $('nm'); n.value = myName(); show('name'); setTimeout(() => { n.focus(); n.select(); }, 60); }
function closeName() { iniOn = false; $('nm').blur(); }
$('nm').oninput = (e) => { const n = e.target, v = cleanName(n.value); if (v !== n.value) n.value = v; };
$('who').onsubmit = (e) => {
  e.preventDefault(); const v = cleanName($('nm').value); if (!v || !iniOn) { $('nm').focus(); return; }
  PLAYER = v; try { localStorage.setItem('spearo.name', v); } catch {} closeName(); sound();
  newTrip(seedFromUrl ?? (Math.random() * 99999 | 0) + 1); seedFromUrl = null; showDives();
};
// typing in the name box doesn't reach the game's keys (M, fire…); Esc goes back to the trips
addEventListener('keydown', (e) => { if (!iniOn) return; if (e.code === 'Escape') { closeName(); showTrips(); } else if (e.target === $('nm')) e.stopImmediatePropagation(); }, true);
$('trips').querySelector('.back').onclick = () => { show('home'); };
$('who').querySelector('.back').onclick = () => { closeName(); showTrips(); };
// the dive picker: a card per site (done ones show their score), and the trophy's slot: empty until the trophy dive is
// done, then the fish or 'Missed'
function showDives() {
  const el = $('divec'); el.innerHTML = '';
  LOC.sites.forEach((st, k) => {
    const d = TRIP.dives[k], b = document.createElement('button'); b.className = 'dcard' + (d ? ' done' : ''); b.disabled = !!d;
    b.append(shot(LOC, k, 176, 110)); b.insertAdjacentHTML('beforeend', `<b>${st.name}</b><span>${d ? d.score + ' pts' : 'Dive'}</span>`);
    b.onclick = () => { sound(); startDive(k); };
    el.append(b);
  });
  const T = LOC.trophy, td = TRIP.dives[TRIP.trophy], got = td && td.st.trophy, r = got && td.rows.find((r) => r.s === T && r.outcome !== 'GOT AWAY');
  const brk = td && !got && td.rows.some((r) => r.s === T && r.outcome === 'GOT AWAY'); // hit, but it tore free and got away
  const slot = document.createElement('div'); slot.className = 'tslot' + (got ? ' got' : td ? ' miss' : '');
  slot.append(fishCanvas(T, 156, 65));
  slot.insertAdjacentHTML('beforeend', `<b>Trophy</b><span>${got ? `${SPEC[T].n}${r ? ' · ' + r.inch + ' in' : ''}` : td ? (brk ? 'Broke off' : 'Missed') : `${SPEC[T].n}<br>on one of these dives`}</span>`);
  el.append(slot);
  const left = tripLeft(); $('dvh').textContent = LOC.name;
  $('dvs').textContent = `${PLAYER} · ${tripScore()} pts · ${left === LOC.sites.length ? 'pick a dive, any order' : left + (left === 1 ? ' dive left' : ' dives left')}`;
  show('dives'); setTimeout(() => { const b = el.querySelector('.dcard:not(.done)'); if (b) b.focus(); }, 100);
}
// quitting throws the trip away, so the button asks twice
for (const b of [$('quit'), $('dvq')]) b.onclick = () => {
  if (b.dataset.sure) { delete b.dataset.sure; b.textContent = 'Quit trip'; endTrip(); show('home'); return; }
  b.dataset.sure = 1; b.textContent = 'Lose this trip? Click again'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Quit trip'; }, 3000);
};
let seedFromUrl = (() => { const v = new URLSearchParams(location.search).get('seed'); return v ? +v | 0 : null; })();

// ---------------------------------------------------------------- the camera and the crosshair
const cross = $('x');
addEventListener('mousemove', (e) => { RD.mx = e.clientX / innerWidth; RD.my = e.clientY / innerHeight; });
addEventListener('mousedown', (e) => {
  if (e.button || menu || RD.phase !== 'bottom' || RD.end || e.target.closest('button,#tally')) return;
  sound(); if (!gst) fireReq = 1;
});
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function camera(dt) {
  const t = RD.t, yaw0 = SPOT.yaw, pit0 = -0.04;
  let x = SPOT.x, y = SPOT_Y, z = SPOT.z, yaw = yaw0, pit = pit0;
  if (RD.phase === 'descent') {
    const e = ease(t / DESCENT), e2 = ease((t - 0.5) / (DESCENT - 0.5));
    y = -1.8 + (SPOT_Y + 1.8) * (1 - (1 - e) * (1 - e)); x -= sF[0] * 3 * (1 - e); z -= sF[1] * 3 * (1 - e);
    pit = -1.05 + (pit0 + 1.05) * e2; yaw += 0.35 * (1 - e2);
  } else if (RD.phase === 'ascent' || RD.phase === 'tally') {
    const e = ease(RD.endT2 / ASCENT); y = SPOT_Y + (-2 - SPOT_Y) * e * e; pit = pit0 + 0.95 * ease(RD.endT2 / 1.2);
  }
  // the view turns a few degrees toward a crosshair near the left or right edge; breathing
  const nx = RD.mx * 2 - 1, want = RD.phase === 'bottom' ? Math.sign(nx) * TURN * ease((abs(nx) - 0.55) / 0.45) : 0;
  if (RD.still) dt = 0; // dev: hold the view exactly still while a test aims
  RD.turn += (want - RD.turn) * min(1, dt * 3);
  RD.br += dt; const br = RD.br * TAU / 5.2;
  RD.kick *= exp(-dt * 10);
  F[CX] = x; F[CY] = y + (RD.phase === 'bottom' ? sin(br) * 0.03 : 0); F[CZ] = z; F[YAW] = yaw + RD.turn; F[PIT] = pit + sin(br + 0.6) * 0.006 + RD.kick * 0.015;
  F[VX] = F[VY] = F[VZ] = 0;
  // the camera basis (as render() computes it) and the crosshair's ray
  const cp = cos(F[PIT]), fy = sin(F[PIT]), rx = cos(F[YAW]), rz = sin(F[YAW]), ffx = cp * rz, ffz = -cp * rx;
  F[FX] = ffx; F[FY] = fy; F[FZ] = ffz; F[RX] = rx; F[RZ] = rz; F[UX] = -rz * fy; F[UY] = rz * ffx - rx * ffz; F[UZ] = rx * fy;
  const asp = canvas.clientWidth / max(1, canvas.clientHeight), sx = (RD.mx * 2 - 1) * TANH * asp, sy = (1 - RD.my * 2) * TANH;
  let ax = ffx + rx * sx + F[UX] * sy, ay = fy + F[UY] * sy, az = ffz + rz * sx + F[UZ] * sy; const l = hypot(ax, ay, az);
  G[gAX] = ax / l; G[gAY] = ay / l; G[gAZ] = az / l;
  cross.style.left = RD.mx * 100 + '%'; cross.style.top = RD.my * 100 + '%';
}

// every frame, from gameStep: returns the (slowed) time step for the gun
function arcStep(dtr) {
  MUSIC = !menu && RD.phase === 'bottom' && !RD.end ? 1 : 0;
  if (menu && RD.phase !== 'idle') { drawFx(0); return 0; }
  dtr *= RD.speed;
  // slow motion after a stoned fish: a quarter speed, easing back
  let ts = 1; if (RD.slow > 0) { RD.slow -= dtr; ts = RD.slow > 0.3 ? 0.25 : 0.25 + 0.75 * (1 - RD.slow / 0.3); }
  const dt = dtr * ts;
  RD.t += dt;
  if ((bigT -= dtr) <= 0 && HUD.big.className) HUD.big.className = '';
  if (RD.phase === 'descent') {
    if (RD.t > DESCENT - 2.2) HUD.card.className = '';
    const cd = RD.t < DESCENT - 2 ? 0 : RD.t < DESCENT - 1 ? 1 : 2;
    if (cd > RD.beat) { RD.beat = cd; stamp(cd === 1 ? 'READY?' : 'SET…', 'cd', 0.9); if (SFX) SFX(13); }
    if (RD.t >= DESCENT) { RD.phase = 'bottom'; RD.t = 0; stamp('HUNT!', 'go', 1); if (SFX) SFX(14); MUSIC = 1; }
  } else if (RD.phase === 'bottom') {
    if (!RD.end) {
      RD.air = max(0, RD.air - dt);
      if (RD.air <= 0) endRound('air');
      const a = RD.air / AIR; MUSICT = a < 0.4 ? 1 + 0.3 * (0.4 - a) / 0.4 : 1;
      if (a < 0.25 && !RD.lowAir) { RD.lowAir = 1; stamp('LOW AIR!', 'warn', 1.2); }
      if (a < 0.25 && (RD.beatT = (RD.beatT || 0) - dtr) <= 0) { RD.beatT = 0.45 + a * 2; if (SFX) SFX(16); }
      // the script: entries come in on time unless the scene is still alarmed
      while (RD.next < RD.script.length && RD.script[RD.next].t <= RD.t) {
        const e = RD.script[RD.next];
        if (!isA(e.s) && RD.alarm > 0.6) { e.t += 1; break; }
        const f = fishOf(e.s); if (f) { spawn(f); if (isA(e.s)) { placeGaribaldi(f, 1); if (e.escort) escort(f); } else { enter(f, e.side, e.kelp); if (isT(e.s)) { stamp('TROPHY FISH!', 'gold', 1.5); if (SFX) SFX(15); } } }
        RD.next++;
      }
      // the scene is empty: nothing left to come and no sheephead around
      if (!RD.endless && RD.next >= RD.script.length && gst === 0 && !FI.some((f) => !isA(f.s) && f.st !== OFF && f.st !== GONE && f.st !== LANDED)) endRound('clear');
    } else if (spFish < 0 || RD.end === 'protected') {
      if ((RD.endT -= dtr) <= 0) { RD.phase = 'ascent'; RD.endT2 = 0; }
    }
  } else if (RD.phase === 'ascent') {
    RD.endT2 += dtr; if (RD.endT2 >= ASCENT) { RD.phase = 'tally'; showTally(); }
  } else if (RD.phase === 'tally') RD.endT2 = ASCENT;
  RD.alarm = max(0, RD.alarm - dt * 0.12);
  checkTear(dt);
  for (const f of FI) stepFish(f, dt);
  { const m = FI[F0[LOC.trophy]], o = m.i * FN; // the trophy twinkles now and then
    const r = Math.random; // cosmetic: not from the round's seeded stream
    if (FST[m.i] === 0 && r() < dt * 9) { const L = FS[o + fLEN]; sparks.push({ x: FS[o] + (r() - 0.5) * L, y: FS[o + 1] + r() * 0.25 - 0.1, z: FS[o + 2] + (r() - 0.5) * L, t: 0, life: 0.5 + r() * 0.4 }); } }
  camera(dtr);
  // air bar: cyan, yellow below 40 %, red and pulsing below 20 %
  const a = RD.air / AIR; HUD.fill.style.height = a * 100 + '%';
  HUD.air.className = a < 0.2 ? 'low' : a < 0.4 ? 'mid' : '';
  body.classList.toggle('play', RD.phase === 'bottom' || RD.phase === 'descent');
  body.classList.toggle('aim', RD.phase === 'bottom' && !RD.end);
  drawFx(dt);
  return dt;
}

// ---------------------------------------------------------------- tally and leaderboard
// ---------------------------------------------------------------- leaderboards
// The world board is a small server (server/ in the repo: a Cloudflare Worker with a D1 database). LB_DEFAULT is where
// it is deployed; ?lb=<url> overrides it (for testing against a local server) and ?lb=off turns it off (the tests). With no server, or when it can't be
// reached, the board is this device's own (localStorage). One board per location, of trip totals. Names: 1-7 letters.
const LB_DEFAULT = 'https://spearo-hero-scores.spearo-hero-scores.workers.dev'; // the deployed server (server/, `npm run deploy`)
const LBQ = new URLSearchParams(location.search).get('lb'), LBU = (LBQ === 'off' ? '' : LBQ || LB_DEFAULT).replace(/\/$/, ''), NAMEN = 7;
const lbKey = (l = LOC) => 'spearo.scores.' + l.board;
const lbLoad = (l) => { try { const v = JSON.parse(localStorage.getItem(lbKey(l))); return Array.isArray(v) ? v : []; } catch { return []; } };
const lbSave = (v) => { try { localStorage.setItem(lbKey(), JSON.stringify(v)); } catch {} };
const localBoard = (l) => lbLoad(l).map((e) => ({ name: e.i, score: e.s }));
const WORLD = {}; // the world top 10 per board, as last fetched; missing or null when there is no server or it is down
async function lbFetch(l = LOC) {
  if (!LBU) return (WORLD[l.board] = null);
  try { const r = await fetch(`${LBU}/scores?loc=${l.board}&limit=10`, { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw r.status; WORLD[l.board] = (await r.json()).top; }
  catch (e) { WORLD[l.board] = null; console.warn('leaderboard unreachable', e); }
  showHi(); return WORLD[l.board];
}
async function lbPost(name) { // the trip's total and its stats
  if (!LBU) return null;
  const S = tripStats(), body = { loc: LOC.board, name, score: tripScore(), seed: TRIP.seed, stats: { shots: S.shots, hits: S.hitShots, stoned: S.stoned, landed: S.landed } };
  try {
    const r = await fetch(`${LBU}/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw r.status; const v = await r.json(); WORLD[LOC.board] = v.top; showHi(); return v;
  } catch (e) { console.warn('score not sent', e); return null; }
}
const COL = ['#59626b', '#8a7746', '#ee8a3c'];
// A small painted fish from the species' SPEC: fins, shaded body with its pattern, gill, pectoral and eye.
// Nose to the left, centred on 0, 0, `sc` pixels per body length.
const PAL = [ // back, side, belly, fins
  ['#1b2027', '#5d666e', '#c9cbc6', '#2a2f36'], ['#3f3a28', '#6e6646', '#d3ccb0', '#4c4630'], ['#a8501c', '#f08a3a', '#f8b878', '#e3934e']];
function drawFish(k, s, sc) {
  const sp = SPEC[s], pal = PAL[s], X = (x) => -x * sc, Y = (y) => -y * sc;
  const hp = (a, x) => { const u = clamp((0.5 - x) / 0.86, 0, 1); let i = 0; while (i < 7 && PS[i + 1] < u) i++; return a[i] + (a[i + 1] - a[i]) * (u - PS[i]) / (PS[i + 1] - PS[i]); };
  const ran = (n) => { const v = sin(n * 127.1 + s * 31.7) * 43758.5; return v - floor(v); }; // fixed per species
  k.save(); k.lineJoin = 'round';
  // fins behind the body: dorsal, anal, tail
  k.fillStyle = pal[3]; k.globalAlpha = 0.92;
  const fin = (L, top) => { k.beginPath(); const e = (x) => top ? hp(sp.t, x) : -hp(sp.u, x); k.moveTo(X(L[0][0]), Y(e(L[0][0]) * 0.7)); for (const [x, h] of L) k.lineTo(X(x), Y(e(x) + (top ? h : -h))); k.lineTo(X(L[L.length - 1][0]), Y(e(L[L.length - 1][0]) * 0.7)); k.fill(); };
  fin(sp.D, 1); fin(sp.A, 0);
  k.beginPath(); k.moveTo(X(-0.3), 0); for (const [x, y] of sp.T) k.lineTo(X(x), Y(y)); k.closePath(); k.fill();
  k.globalAlpha = 1;
  // body
  const body = new Path2D();
  for (let i = 0; i < 9; i++) { const x = 0.5 - 0.86 * PS[i]; body.lineTo(X(x), Y(sp.t[i])); }
  for (let i = 8; i >= 0; i--) { const x = 0.5 - 0.86 * PS[i]; body.lineTo(X(x), Y(-sp.u[i])); }
  body.closePath();
  const top = Y(max(...sp.t)), bot = Y(-max(...sp.u)), gr = k.createLinearGradient(0, top, 0, bot);
  gr.addColorStop(0, pal[0]); gr.addColorStop(0.45, pal[1]); gr.addColorStop(1, pal[2]);
  k.fillStyle = gr; k.fill(body);
  k.save(); k.clip(body);
  if (s === 0) { // rockfish: dark mottling, pale lateral line
    k.fillStyle = 'rgba(10,12,16,.38)';
    for (let n = 0; n < 16; n++) { k.beginPath(); k.ellipse(X(0.3 - ran(n) * 0.65), Y((ran(n + 40) - 0.35) * 0.18), sc * (0.025 + ran(n + 80) * 0.03), sc * 0.018, 0, 0, TAU); k.fill(); }
    k.strokeStyle = 'rgba(210,214,218,.5)'; k.lineWidth = max(1, sc * 0.006); k.beginPath(); k.moveTo(X(0.3), Y(0.07)); k.quadraticCurveTo(X(0), Y(0.085), X(-0.33), Y(0.02)); k.stroke();
  } else if (s === 1) { // lingcod: big dark blotches, copper flecks
    k.fillStyle = 'rgba(25,20,12,.55)';
    for (let n = 0; n < 18; n++) { k.beginPath(); k.ellipse(X(0.35 - ran(n) * 0.72), Y((ran(n + 40) - 0.3) * 0.13), sc * (0.02 + ran(n + 80) * 0.025), sc * (0.014 + ran(n + 9) * 0.012), ran(n + 3) * 3, 0, TAU); k.fill(); }
    k.fillStyle = 'rgba(214,128,52,.85)';
    for (let n = 0; n < 12; n++) { k.beginPath(); k.arc(X(0.3 - ran(n + 200) * 0.6), Y((ran(n + 240) - 0.2) * 0.1), sc * 0.006, 0, TAU); k.fill(); }
  } else { // striped surfperch: blue stripes along the lower sides, blue streaks on the head
    k.strokeStyle = 'rgba(30,110,255,.8)'; k.lineWidth = max(1, sc * 0.011);
    for (let n = 0; n < 6; n++) { const y = 0.05 - n * 0.038; k.beginPath(); k.moveTo(X(0.32), Y(y + 0.01)); k.quadraticCurveTo(X(0), Y(y - 0.01), X(-0.34), Y(y * 0.3)); k.stroke(); }
    k.lineWidth = max(1, sc * 0.006); for (let n = 0; n < 3; n++) { k.beginPath(); k.moveTo(X(0.47), Y(0.02 - n * 0.03)); k.lineTo(X(0.35), Y(0.05 - n * 0.035)); k.stroke(); }
  }
  // gill cover
  k.strokeStyle = 'rgba(0,0,0,.35)'; k.lineWidth = max(1, sc * 0.008); k.beginPath(); k.moveTo(X(0.3), Y(sp.t[2] * 0.85)); k.quadraticCurveTo(X(0.26), 0, X(0.3), Y(-sp.u[2] * 0.85)); k.stroke();
  k.restore();
  k.strokeStyle = 'rgba(3,10,20,.7)'; k.lineWidth = max(1, sc * 0.008); k.stroke(body);
  // pectoral fin
  const [px, py, pl] = sp.P; k.fillStyle = pal[3]; k.globalAlpha = 0.8;
  k.beginPath(); k.moveTo(X(px), Y(py + 0.01)); k.lineTo(X(px - pl), Y(py + pl * 0.15)); k.lineTo(X(px - pl * 0.8), Y(py - pl * 0.4)); k.closePath(); k.fill(); k.globalAlpha = 1;
  // eye
  const H = [0.155, 0.095, 0.215][s], ey = H * (s === 1 ? 0.45 : 0.22), er = (0.009 + (s === 1 ? 0.1 : 0.045) * H + (s === 0 ? 0.006 : 0)) * 1.15;
  k.fillStyle = s === 1 ? '#d9b44a' : '#b89a4a'; k.beginPath(); k.arc(X(0.4), Y(ey), er * sc * 1.35, 0, TAU); k.fill();
  k.fillStyle = '#05080c'; k.beginPath(); k.arc(X(0.4), Y(ey), er * sc, 0, TAU); k.fill();
  k.fillStyle = '#fff'; k.beginPath(); k.arc(X(0.4) - er * sc * 0.35, Y(ey) - er * sc * 0.35, max(0.8, er * sc * 0.3), 0, TAU); k.fill();
  k.restore();
}
// Photos of the real 3D fish, taken once while the page loads: each species posed side-on in front of the camera at
// the round's spot, drawn by the game's own renderer, and cropped from the frame. PW body lengths fit across a photo.
const PHOTO = [], PW = 1.35, PA = 2.4; // photo width in body lengths, aspect
function photoShoot() {
  const keep = [F[CX], F[CY], F[CZ], F[YAW], F[PIT]], g0 = GAME, hg = hideGun;
  GAME = 1; hideGun = 1;
  try {
    for (let s = 0; s < NSP; s++) {
      const i = F0[s], o = i * FN, L = (SPEC[s].l[0] + SPEC[s].l[1]) / 2, dist = L * 2.3;
      F[CX] = SPOT.x; F[CY] = SPOT_Y + 0.2; F[CZ] = SPOT.z; F[YAW] = SPOT.yaw + 0.25; F[PIT] = -0.05;
      render(); // sets the camera basis
      FS[o] = F[CX] + F[FX] * dist; FS[o + 1] = F[CY] + F[FY] * dist; FS[o + 2] = F[CZ] + F[FZ] * dist;
      FS[o + fLEN] = L; FS[o + fYAW] = atan2(-F[RZ], -F[RX]) + 0.12; FS[o + fPIT] = 0; FS[o + fROL] = 0; FS[o + fPH] = 1.3; FS[o + fSEED] = 0.37;
      fishInst(i, 0.025); render();
      if (!project(FS[o], FS[o + 1], FS[o + 2])) continue;
      const k = canvas.width / canvas.clientWidth, lpx = L * (canvas.clientHeight / 2 / TANH) / PJ[2], sw = lpx * PW * k, sh = sw / PA;
      const c = document.createElement('canvas'); c.width = 288; c.height = 120;
      const cx = c.getContext('2d'); cx.filter = 'saturate(1.4) contrast(1.12) brightness(1.08)'; // a little punch, like a dive-light photo
      cx.drawImage(canvas, PJ[0] * k - sw / 2, PJ[1] * k - sh / 2, sw, sh, 0, 0, c.width, c.height);
      PHOTO[s] = c; fishInst(i, 0);
    }
  } catch (e) { console.warn('fish photos', e); }
  GAME = g0; hideGun = hg; F[CX] = keep[0]; F[CY] = keep[1]; F[CZ] = keep[2]; F[YAW] = keep[3]; F[PIT] = keep[4];
}
// a thumbnail canvas (CSS size w x h, aspect PA): the photo with rounded corners, or the painted fish if there is none
function fishCanvas(s, w, h) {
  const c = document.createElement('canvas'), k = c.getContext('2d'), d = 2;
  c.width = w * d; c.height = h * d; c.style.width = w + 'px'; c.style.height = h + 'px';
  k.scale(d, d);
  if (PHOTO[s]) { k.beginPath(); k.roundRect(0, 0, w, h, h * 0.18); k.clip(); k.drawImage(PHOTO[s], 0, 0, w, h); }
  k.translate(w / 2, h / 2); if (!PHOTO[s]) drawFish(k, s, w * 0.9);
  return c;
}
// Photos of the dive sites, taken once while the page loads: the diver's view from each spot. shot() gives a thumbnail
// (CSS size w x h) cropped from one to fill.
const SHOT = {};
function siteShoot() {
  const keep = [F[CX], F[CY], F[CZ], F[YAW], F[PIT]], g0 = GAME, hg = hideGun, l0 = LOC, k0 = SITE;
  GAME = 1; hideGun = 1;
  try {
    for (const l of LOCATIONS) {
      LOC = l; SHOT[l.id] = l.sites.map((st, k) => {
        useSite(k); F[CX] = SPOT.x; F[CY] = SPOT_Y; F[CZ] = SPOT.z; F[YAW] = SPOT.yaw; F[PIT] = -0.04; render();
        const c = document.createElement('canvas'), cx = c.getContext('2d'); c.width = 480; c.height = 300;
        const w = min(canvas.width, canvas.height * 1.6), h = w / 1.6; cx.filter = 'saturate(1.25) contrast(1.08) brightness(1.15)';
        cx.drawImage(canvas, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h, 0, 0, c.width, c.height); return c;
      });
    }
  } catch (e) { console.warn('site photos', e); }
  LOC = l0; useSite(k0); GAME = g0; hideGun = hg; F[CX] = keep[0]; F[CY] = keep[1]; F[CZ] = keep[2]; F[YAW] = keep[3]; F[PIT] = keep[4];
}
function shot(l, k, w, h) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), src = SHOT[l.id] && SHOT[l.id][k];
  c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
  if (!src) { x.fillStyle = '#0a3a4a'; x.fillRect(0, 0, c.width, c.height); return c; }
  const a = w / h, sw = min(src.width, src.height * a), sh = sw / a;
  x.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height); return c;
}
function silhouette(s, frac, cross) { // the tally's fish, with a dot where the spear went in; grey and crossed out if lost / wrong fish
  const w = 96, h = 40, c = fishCanvas(s, w, h), k = c.getContext('2d'), sc = PHOTO[s] ? w / PW : w * 0.9, X = (x) => -x * sc;
  if (cross === 'lost') { k.save(); k.globalCompositeOperation = 'saturation'; k.fillStyle = '#000'; k.fillRect(-w, -h, w * 2, h * 2); k.restore(); k.fillStyle = 'rgba(3,19,28,.35)'; k.fillRect(-w, -h, w * 2, h * 2); }
  if (frac !== null) { k.fillStyle = '#fff'; k.beginPath(); k.arc(X(frac), 0, 4.5, 0, TAU); k.fill(); k.fillStyle = '#d0141a'; k.beginPath(); k.arc(X(frac), 0, 3, 0, TAU); k.fill(); }
  if (cross) { // a big red X
    k.lineCap = 'round'; for (const [lw, col] of [[8, '#03131c'], [5, '#ff3b2f']]) { k.lineWidth = lw; k.strokeStyle = col; k.beginPath(); k.moveTo(-26, -16); k.lineTo(26, 16); k.moveTo(26, -16); k.lineTo(-26, 16); k.stroke(); }
  }
  return c;
}
let tallyTimers = [], tallyMode = ''; // 'dive': one dive's results; 'trip': the whole trip's, with the board
const rowEl = (cls, html, pic) => { const el = document.createElement('div'); el.className = 'row ' + cls; if (pic) el.append(pic); el.insertAdjacentHTML('beforeend', html); return el; };
// the results screen: the rows come in one by one in the middle of the screen and the score counts up; then (class
// 'cnt' off) they slide left as the other column opens, and `done` fills that with the stats and the button
function tallyRun(title, why, list, total, done) {
  HUD.card.className = ''; body.classList.add('tal'); HUD.tally.className = 'on cnt';
  $('th').textContent = title; $('why').textContent = why;
  const rows = $('rows'); rows.innerHTML = ''; $('lb').innerHTML = ''; $('lbt').textContent = ''; $('stats').innerHTML = $('verdict').textContent = $('awards').innerHTML = ''; $('again').hidden = true;
  for (const t of tallyTimers) clearTimeout(t); tallyTimers = [];
  list.forEach((el, k) => tallyTimers.push(setTimeout(() => { rows.append(el); if (SFX) SFX(3); }, 400 + k * 380)));
  const t0 = 400 + list.length * 380, tsc = $('tsc'), mode = tallyMode, t1 = performance.now() + t0; tsc.textContent = 0;
  const count = (now) => {
    if (RD.phase !== 'tally' || tallyMode !== mode) return;
    const u = clamp((now - t1) / 1200, 0, 1); tsc.textContent = round(total * u); if (u < 1) requestAnimationFrame(count); else tallyTimers.push(setTimeout(() => { if (RD.phase !== 'tally' || tallyMode !== mode) return; HUD.tally.classList.remove('cnt'); done(); }, 450));
  };
  tallyTimers.push(setTimeout(() => requestAnimationFrame(count), t0));
}
// a dive's results: every fish and what became of it, the dive in numbers, then on to the next dive
function showTally() {
  tallyMode = 'dive';
  if (TRIP.on && TRIP.cur >= 0 && !TRIP.dives[TRIP.cur]) { TRIP.dives[TRIP.cur] = { score: RD.score, st: { ...RD.st }, rows: RD.rows.slice(), end: RD.end, seed: RD.seed }; TRIP.order.push(TRIP.cur); }
  const list = RD.rows.length ? RD.rows.map((r) => {
    const bad = r.outcome === 'GOT AWAY' ? 'lost' : r.outcome === 'WRONG FISH' ? 'prot' : '', tro = !bad && isT(r.s); // a landed trophy: gold row with a badge
    return rowEl(bad + (tro ? ' troph' : ''), `<span>${r.n} <i>${r.inch} in</i>${tro ? '<em>Trophy</em>' : ''}</span><span class=o>${r.outcome}</span><b class=${r.pts < 0 ? 'neg' : ''}>${r.pts > 0 ? '+' : ''}${r.pts}</b>`, silhouette(r.s, r.zone ? r.frac : null, bad));
  }) : [rowEl('', '<span>No fish this dive</span>')];
  const why = RD.end === 'protected' ? 'Speared a surfperch' : RD.end === 'air' ? 'Out of air' : 'Nothing left to hunt';
  tallyRun(TRIP.on ? LOC.sites[TRIP.cur].name : 'Dive over', (TRIP.on ? `Dive ${TRIP.order.length} of ${LOC.sites.length} · ` : '') + why, list, RD.score, () => {
    showStats(RD.st, RD.score, RD.end, 1);
    const b = $('again'); b.textContent = !TRIP.on ? 'Play again' : tripLeft() ? 'Next dive' : 'Trip results'; b.hidden = false; setTimeout(() => b.focus(), 50);
  });
}
// the trip's results: a row per dive in the order they were dived, the trophy (landed or missed), the trip in numbers,
// then the board with the total on it
function showFinal() {
  tallyMode = 'trip'; RD.lbP = lbFetch();
  const S = tripStats(), total = tripScore(), T = LOC.trophy, td = TRIP.dives[TRIP.trophy], tr = td.rows.find((r) => r.s === T && r.outcome !== 'GOT AWAY');
  const tp = td.rows.filter((r) => r.s === T).reduce((a, r) => a + r.pts, 0); // what the trophy fish paid (0 if it never came to the spear)
  const brk = td.rows.some((r) => r.s === T && r.outcome === 'GOT AWAY'); // hit but it tore free: paid something, still not landed
  const list = TRIP.order.map((k) => { const d = TRIP.dives[k];
    return rowEl('trip', `<span>${LOC.sites[k].name} <i>${d.st.landed} landed</i></span><span class=o>${d.end === 'protected' ? 'WRONG FISH' : d.end === 'air' ? 'OUT OF AIR' : 'ALL CLEAR'}</span><b>${d.score}</b>`, shot(LOC, k, 96, 40)); });
  list.push(td.st.trophy ? rowEl('troph', `<span>${SPEC[T].n} <i>${tr ? tr.inch + ' in' : ''}</i><em>Trophy</em></span><span class=o>LANDED</span><b>+${tp}</b>`, silhouette(T, null, ''))
    : rowEl('lost', `<span>${SPEC[T].n}</span><span class=o>${brk ? 'BROKE OFF' : 'TROPHY MISSED'}</span><b>${tp ? '+' + tp : 0}</b>`, silhouette(T, null, 'lost')));
  tallyRun('Trip over', `${LOC.name} · ${PLAYER}`, list, total, () => { showStats(S, total, '', LOC.sites.length); afterBoard(); });
}
// a dive or a trip (n dives) in numbers, a verdict on dinner, and a few badges
function verdict(S, sc, end, n) {
  if (end === 'protected') return pick(['Wrong fish, chief.', 'That perch had a family.', 'The surfperch union is filing a complaint.']);
  if (!S.shots) return 'You forgot to pull the trigger.';
  if (sc >= 2500 * n) return "You're eating well tonight!";
  if (sc >= 1500 * n) return 'Fish tacos for the whole boat.';
  if (sc >= 700 * n) return 'Ceviche for one.';
  if (sc > 0) return 'Better than an empty cooler.';
  return pick(['Better luck next time.', 'Grocery store it is.', 'The fish send their regards.']);
}
function showStats(S, sc, end, n) {
  const acc = S.shots ? round(S.hitShots / S.shots * 100) : 0;
  const cells = [['Shots', S.shots], ['Accuracy', S.shots ? acc + '%' : '—'], ['Stoned', S.stoned], ['Landed', S.landed], ['Biggest', S.biggest ? S.biggest + ' in' : '—'], ['Best streak', S.best], ['Got away', S.lost], ['Bonus', S.bonus ? '+' + S.bonus : 0]];
  $('stats').innerHTML = cells.map(([k, v]) => `<p><b>${v}</b><span>${k}</span></p>`).join('');
  $('verdict').textContent = verdict(S, sc, end, n);
  const aw = [];
  if (S.stoned >= 2 * n) aw.push('Headhunter'); if (S.shots >= 3 && acc === 100) aw.push('Dead eye'); if (S.trophy) aw.push('Trophy hunter');
  if (S.threads) aw.push('Threaded the needle'); if (S.doubles) aw.push('Shish kebab'); if (S.best >= 3) aw.push('On fire'); if (end === 'protected' || S.prot) aw.push('Perch puncher');
  $('awards').innerHTML = aw.map((a) => `<b>${a}</b>`).join('');
  if (SFX) SFX(sc > 0 && end !== 'protected' ? 17 : 12);
}
// the trip's total goes on the board under the player's name; a zero just shows the board
async function afterBoard() {
  const seed = TRIP.seed; await RD.lbP; if (RD.phase !== 'tally' || tallyMode !== 'trip' || TRIP.seed !== seed || !$('again').hidden) return;
  if (tripScore() > 0 && PLAYER) submitScore(PLAYER); else showBoard(WORLD[LOC.board] || localBoard(), -1);
}
async function submitScore(name) {
  const lb = lbLoad(), e = { i: name, s: tripScore(), r: TRIP.seed, d: Date.now() };
  lb.push(e); lb.sort((a, b) => b.s - a.s || a.d - b.d); lb.length = min(lb.length, 10); lbSave(lb); showHi();
  $('lbt').textContent = LBU ? 'Sending…' : '';
  const v = await lbPost(name); if (RD.phase !== 'tally' || tallyMode !== 'trip') return;
  if (v) showBoard(v.top, v.rank <= 10 ? v.rank - 1 : -1, v.rank);
  else showBoard(localBoard(), lb.indexOf(e));
}
function showBoard(b, me, rank) {
  const ol = $('lb'), w = WORLD[LOC.board]; ol.innerHTML = '';
  $('lbt').textContent = (b === w || rank ? 'World top 10' : 'Top 10 on this device') + ' · ' + LOC.name + ' trips' + (rank ? ` · you are #${rank}` : '') + (LBU && !w ? ' · world board offline' : '');
  b.forEach((e, k) => { const li = document.createElement('li'); if (k === me) li.className = 'me'; li.innerHTML = `<b></b><span>${e.score}</span>`; li.firstChild.textContent = e.name; ol.append(li); });
  if (!b.length) ol.innerHTML = '<li class=none>No scores yet: be the first</li>';
  const a = $('again'); a.textContent = 'Play again'; a.hidden = false; setTimeout(() => a.focus(), 50);
}
// the leaderboard popup on the trip picker: a location's board, fetched fresh
let popFrom = null;
function fillBoard(l, b, note) {
  const ol = $('popl'); ol.innerHTML = '';
  $('popt').textContent = l.name + ' trips · ' + note;
  b.forEach((e) => { const li = document.createElement('li'); li.innerHTML = '<b></b><span></span>'; li.firstChild.textContent = e.name; li.lastChild.textContent = e.score; ol.append(li); });
  if (!b.length) ol.innerHTML = '<li class=none>No scores yet: be the first</li>';
}
async function openBoard(l) {
  if (SFX) SFX(3);
  popFrom = document.activeElement; $('pop').hidden = false; setTimeout(() => $('popx').focus(), 50);
  fillBoard(l, WORLD[l.board] || localBoard(l), LBU ? 'Loading…' : 'This device');
  if (!LBU) return;
  const w = await lbFetch(l); if ($('pop').hidden) return;
  fillBoard(l, w || localBoard(l), w ? 'World' : 'This device · world board offline');
}
const closeBoard = () => { if ($('pop').hidden) return false; $('pop').hidden = true; if (popFrom && popFrom.isConnected) popFrom.focus(); return true; };
$('popx').onclick = closeBoard;
$('pop').onclick = (e) => { if (e.target === $('pop')) closeBoard(); };
addEventListener('keydown', (e) => { if (e.code === 'Escape' && closeBoard()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// the results screen's button: on to the next dive, or the trip's results, or (after those) a new trip
$('again').onclick = () => {
  if (RD.phase !== 'tally') return; sound();
  if (tallyMode === 'dive' && TRIP.on) { if (tripLeft()) { leaveTally(); showDives(); } else showFinal(); }
  else { endTrip(); showTrips(); }
};

// ---------------------------------------------------------------- start: the spot behind the menu, a few garibaldi
// the menu's hi-score line, from the board
function showHi() { const t = (WORLD[LOC.board] || localBoard())[0]; $('hi').lastChild.textContent = t ? `${t.name}  ${t.score}` : '— — —'; }
showHi(); lbFetch();
// the intro card's thumbnails
photoShoot(); siteShoot();
buildCard();
newRound(1); RD.phase = 'idle';
{ const keep = RD.t; RD.t = 0; camera(0); RD.t = keep; }
GAME = 1;
