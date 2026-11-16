// ============================================================================
// the fish: species, meshes, the pool and the rock-field queries
// ============================================================================
// arcade.js moves the fish; each has one row of FS and a capsule hitbox the spear is tested against (game.js).



// n name, c pool size, l length range (m), v cruise and f burst speed (m/s), R startle radius (m) around the spear's
// path, amb: an ambusher (sits on the bottom, darts). Which part a species plays (target, trophy, avoid) is set per
// location (arcade.js). t back and u belly outline (half depths at the stations PS from nose to tail stalk),
// w width / depth, D dorsal and A anal fin outlines [x, height], T tail outline [x, y], P pectoral fin [x, y, length].
// V pelvic fin [x, length]. Meshes are 1 long, nose at x = 0.5. The index is also the shader's pattern case (game.js).
const SPEC = [
  // black rockfish: big head and eyes, a tall spiny dorsal with a notch before the soft one, square-ish tail
  { n: 'Black rockfish', c: 7, l: [0.36, 0.56], v: 0.9, f: 5.2, R: 2.4,
    t: [0.03, 0.09, 0.135, 0.155, 0.155, 0.14, 0.11, 0.07, 0.05], u: [0.035, 0.08, 0.115, 0.135, 0.135, 0.12, 0.09, 0.06, 0.045], w: 0.46,
    D: [[0.26, 0], [0.245, 0.06], [0.225, 0.035], [0.2, 0.09], [0.18, 0.05], [0.155, 0.1], [0.135, 0.06], [0.11, 0.1], [0.09, 0.06], [0.065, 0.09], [0.045, 0.055], [0.02, 0.075], [0, 0.035], [-0.03, 0.03], [-0.06, 0.08], [-0.15, 0.09], [-0.24, 0.075], [-0.3, 0.025], [-0.32, 0]],
    A: [[-0.07, 0], [-0.09, 0.065], [-0.17, 0.075], [-0.25, 0.035], [-0.28, 0]],
    T: [[-0.34, 0.05], [-0.48, 0.135], [-0.465, 0], [-0.48, -0.135], [-0.34, -0.05]], P: [0.17, -0.03, 0.17], V: [0.14, 0.11] },
  // lingcod: long and round-bodied, a big head with a wide mouth, a long notched dorsal, fan pectorals, round tail
  { n: 'Lingcod', c: 1, l: [0.82, 1.15], v: 1.2, f: 7, R: 3.6, amb: 1,
    t: [0.025, 0.065, 0.088, 0.096, 0.092, 0.084, 0.07, 0.05, 0.034], u: [0.04, 0.072, 0.085, 0.088, 0.082, 0.071, 0.056, 0.04, 0.03], w: 0.78,
    D: [[0.27, 0], [0.255, 0.045], [0.21, 0.055], [0.15, 0.055], [0.08, 0.05], [0.03, 0.045], [0.005, 0.018], [-0.015, 0.055], [-0.12, 0.068], [-0.25, 0.06], [-0.33, 0.022], [-0.345, 0]],
    A: [[0, 0], [-0.02, 0.045], [-0.25, 0.05], [-0.335, 0.012]],
    T: [[-0.35, 0.035], [-0.44, 0.085], [-0.485, 0.065], [-0.5, 0], [-0.485, -0.065], [-0.44, -0.085], [-0.35, -0.035]], P: [0.21, -0.045, 0.2], V: [0.2, 0.08] },
  // striped surfperch: a deep, flat oval, a long low dorsal and a forked tail
  { n: 'Surfperch', c: 12, l: [0.2, 0.32], v: 0.45, f: 3.5, R: 1.6,
    t: [0.03, 0.12, 0.19, 0.215, 0.21, 0.18, 0.13, 0.075, 0.05], u: [0.03, 0.09, 0.15, 0.18, 0.18, 0.15, 0.1, 0.06, 0.045], w: 0.3,
    D: [[0.14, 0], [0.11, 0.055], [0.04, 0.05], [-0.05, 0.05], [-0.15, 0.07], [-0.27, 0.06], [-0.32, 0]], A: [[-0.04, 0], [-0.08, 0.06], [-0.25, 0.055], [-0.31, 0]],
    T: [[-0.34, 0.05], [-0.5, 0.17], [-0.415, 0], [-0.5, -0.17], [-0.34, -0.05]], P: [0.15, -0.02, 0.13], V: [0.1, 0.07] },
];
// the spear's hit volume: a capsule along the body, flattened sideways to the fish's thickness (an ellipse in
// cross-section: hitR up and down, hitW side to side; SPEC w is width / depth). hitH is its half-length. Targets are a
// little smaller than they look, so a shot has to be on the fish; protected fish keep a margin all round, so a careless
// shot past them still hits them.
var AVOID = -1; // the current location's fish to avoid (arcade.js sets it)
const hitH = (i) => FS[i * FN + fLEN] * 0.38, hitR = (i) => FSP[i] === AVOID ? FS[i * FN + fRAD] + 0.03 : FS[i * FN + fRAD] * 0.85;
const hitW = (i) => FSP[i] === AVOID ? FS[i * FN + fRAD] * SPEC[FSP[i]].w + 0.03 : FS[i * FN + fRAD] * 0.85 * SPEC[FSP[i]].w;
// where a point (ex, ey, ez from fish i's centre) sits in its hit volume: below 1 is inside. HT[0] = how far along the
// axis (clamped to the capsule), + toward the nose
const HT = new Float64Array(1);
function hitIn(i, ex, ey, ez) {
  const o = i * FN, cp = cos(FS[o + fPIT]), cy = cos(FS[o + fYAW]), sy = sin(FS[o + fYAW]), fx = cy * cp, fy = sin(FS[o + fPIT]), fz = sy * cp;
  let t = ex * fx + ey * fy + ez * fz; const h = hitH(i); t = t > h ? h : t < -h ? -h : t; HT[0] = t;
  // off the axis: s across the fish (its side vector is horizontal: (-sin yaw, 0, cos yaw)), the rest up and down
  const px = ex - fx * t, py = ey - fy * t, pz = ez - fz * t, s = pz * cy - px * sy, rw = hitW(i), rh = hitR(i);
  return s * s / (rw * rw) + (px * px + py * py + pz * pz - s * s) / (rh * rh);
}
const NSP = SPEC.length, PS = [0, 0.06, 0.16, 0.3, 0.46, 0.62, 0.78, 0.91, 1];
// aux: body 1, dorsal / anal fin 0.6 at the base to 0.5 at the edge, tail 0.4 to 0.3, pectoral 0.2 to 0.1
function meshSpecies(sp) {
  const m = new Mesh(), NR = 34, NS = 16, rings = [];
  // outline a (back or belly) at x: Catmull-Rom through the stations
  const hp = (a, x) => {
    const s = clamp((0.5 - x) / 0.86, 0, 1); let i = 0; while (i < 7 && PS[i + 1] < s) i++;
    const u = (s - PS[i]) / (PS[i + 1] - PS[i]), p0 = a[max(i - 1, 0)], p1 = a[i], p2 = a[i + 1], p3 = a[min(i + 2, 8)];
    return max(0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u), 0);
  };
  for (let j = 0; j <= NR; j++) {
    const s = pow(j / NR, 1.2), x = 0.5 - 0.86 * s, ht = hp(sp.t, x), hb = hp(sp.u, x), w = (ht + hb) / 2 * sp.w * (1 - 0.4 * sstep(0.6, 1, s)), r = [];
    for (let k = 0; k < NS; k++) { const an = k / NS * TAU, y = sin(an); r.push(m.v(x, y * (y > 0 ? ht : hb), cos(an) * w)); }
    rings.push(r);
  }
  for (let j = 0; j < NR; j++) for (let k = 0; k < NS; k++) { const k2 = (k + 1) % NS; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const strip = (L, sg) => {
    let pa, pb;
    for (const [x, h] of L) { const e = sg > 0 ? hp(sp.t, x) : -hp(sp.u, x), p = m.v(x, e * 0.7, 0, 0.6), q = m.v(x, e + sg * h, 0, 0.5); if (pa !== undefined) m.quad(pa, p, q, pb); pa = p; pb = q; }
  };
  strip(sp.D, 1); strip(sp.A, -1);
  const c = m.v(-0.33, 0, 0, 0.4); let pv;
  for (const [x, y] of sp.T) { const v = m.v(x, y, 0, 0.3); if (pv !== undefined) m.tri(c, pv, v); pv = v; }
  const [px, py, pl] = sp.P, pw = (hp(sp.t, px) + hp(sp.u, px)) / 2 * sp.w * 0.95;
  // pectorals: a fan of three triangles, angled back and out
  for (const s of [-1, 1]) {
    const b0 = m.v(px, py + pl * 0.06, s * pw, 0.2), b1 = m.v(px, py - pl * 0.1, s * pw, 0.2);
    const e0 = m.v(px - pl * 0.85, py + pl * 0.2, s * (pw + pl * 0.45), 0.1), e1 = m.v(px - pl, py - pl * 0.05, s * (pw + pl * 0.5), 0.1), e2 = m.v(px - pl * 0.8, py - pl * 0.4, s * (pw + pl * 0.35), 0.1);
    m.tri(b0, e0, e1); m.tri(b0, e1, b1); m.tri(b1, e1, e2);
  }
  if (sp.V) { // pelvic fins under the belly
    const [vx, vl] = sp.V, vy = -hp(sp.u, vx) * 0.92, vw = hp(sp.u, vx) * sp.w * 0.4;
    for (const s of [-1, 1]) m.tri(m.v(vx, vy, s * vw, 0.2), m.v(vx - vl, vy - vl * 0.55, s * (vw + vl * 0.3), 0.1), m.v(vx - vl * 0.9, vy - vl * 0.15, s * (vw + vl * 0.15), 0.1));
  }
  return m;
}


// ---------------------------------------------------------------- state
// fish per species, and where each species starts in the pool (instances of one mesh are contiguous)
const NFS = SPEC.map((s) => s.c), F0 = [0];
for (const n of NFS) F0.push(F0[F0.length - 1] + n);
const NF = F0[NSP], FN = 16;
const fX = 0, fY = 1, fZ = 2, fYAW = 3, fPIT = 4, fSPD = 5, fTX = 6, fTY = 7, fTZ = 8, fTIM = 9, fPH = 10, fLEN = 11, fRAD = 12, fPAU = 13, fROL = 14, fSEED = 15;
// FST: 0 swimming (can be hit), 3 on the spear, 4 not in the scene. arcade.js drives the rest.
const FS = new Float32Array(NF * FN), FST = new Uint8Array(NF).fill(4), FSP = new Uint8Array(NF);
for (let s = 0; s < NSP; s++) for (let i = F0[s]; i < F0[s + 1]; i++) FSP[i] = s;
// per-frame float state shared with game.js
const G = new Float64Array(64);
const gPX = 0, gPY = 1, gPZ = 2, gVX = 3, gVY = 4, gVZ = 5, gDX = 6, gDY = 7, gDZ = 8, gT = 9, gREC = 10, gB1 = 11, gB2 = 12, gSEAT = 13, gTHR = 14,
  gLX = 19, gLY = 20, gLZ = 21, gDSP = 22, gLYAW = 23, gDT = 25, gSAG = 26, gTHT = 27, gPOSE = 28, gLPIT = 29, gSPX = 32, gSPY = 33, gSPZ = 34, gRND = 35,
  gAX = 43, gAY = 44, gAZ = 45, gHIT = 46, gOX = 47, gOY = 48, gOZ = 49, gMZX = 50, gMZY = 51, gMZZ = 52;

// Hot path: these take slot numbers and pass values through QP / QD, never as arguments or return values.
const QP = new Float64Array(30), QD = new Float64Array(10);
// QD[j] = distance into the rock at QP[3j..] (m, < 0 in water, clamped to ±1); outside the baked field counts as rock
function rk(j) {
  const x = (QP[j * 3] - OX) / VS - CO, y = (QP[j * 3 + 1] - OY) / VS, z = (QP[j * 3 + 2] - OZ) / VS - CO;
  if (!(x >= 0 && y >= 4 && z >= 0 && x < CN * 4 - 1 && y < NY - 5 && z < CN * 4 - 1)) { QD[j] = 1; return; }
  const ix = x | 0, iy = y | 0, iz = z | 0, u = x - ix, v = y - iy, a = cv(ix, iy, iz), b = cv(ix, iy + 1, iz), c = cv(ix, iy, iz + 1), d = cv(ix, iy + 1, iz + 1);
  const p = a + (cv(ix + 1, iy, iz) - a) * u, q = b + (cv(ix + 1, iy + 1, iz) - b) * u, r = c + (cv(ix + 1, iy, iz + 1) - c) * u, s = d + (cv(ix + 1, iy + 1, iz + 1) - d) * u;
  const e = p + (q - p) * v; QD[j] = (e + (r + (s - r) * v - e) * (z - iz)) / 127;
}
// G[gRND] = a random number
function rn() { // math.js's rnd(), written out: a returned number would be boxed
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  G[gRND] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- load-time queries: rock and the floor under a point
const rockAt = (x, y, z) => { QP[0] = x; QP[1] = y; QP[2] = z; rk(0); return QD[0]; };
// lowest water above the seabed in this column (the top of the rock where the column is solid)
const floorY = (x, z) => { let y = -53; while (y < -4 && rockAt(x, y, z) > 0) y += 0.25; return y; };
