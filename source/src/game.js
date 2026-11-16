// ============================================================================
// the speargun, spear and line, and the shader that draws them and the fish
// ============================================================================
// Runs on top of the scene: main.js calls gameStep(dt) before render() and gameDraw(pass) inside the scene pass, both
// only once GAME is set (arcade.js). Everything is drawn with one pipeline from one instance buffer. The gun points
// along the aim G[gAX..gAZ] (the crosshair's ray, set by arcade.js) and tells arcade.js when the spear fires, stops,
// hits a fish and comes back (arcFire, arcStop, arcHit, arcLanded).
var GAME = 0, REEL = 0; // REEL: the reel is turning (audio.js ticks the ratchet)

// ---------------------------------------------------------------- shader: fish, gun, spear, line
// Instance: a = position + scale, b = orientation, c = kind (0-2 species, 8 gun, 9 band, 10 spear, 11 line),
// tail phase, wave amplitude (fish) or stretch along x (parts), seed (+2: held by the diver, drawn over the scene).
const W_GAME = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) k: vec4f, @location(4) ax: f32 };
@vertex fn vsHunt(i: VI) -> VO {
  var o: VO; var l = i.p; var n = i.n.xyz;
  if (i.c.x < 7.5) {
    // body wave: travels from the head to the tail, growing along the way
    let s = .5 - l.x; let w = (.12 + s) * (.12 + s); let ph = i.c.y - s * 6.5;
    l.z += sin(ph) * i.c.z * w;
    let sl = i.c.z * (6.5 * cos(ph) * w - 2. * sin(ph) * (.12 + s));
    n = normalize(vec3f(n.x - sl * n.z, n.y, n.z));
  } else {
    l.x *= i.c.z;
    // the line stays at least about a pixel wide
    if (i.c.x > 9.5) { let k = max(1., distance(i.a.xyz, g.cam.xyz) * select(.5, .25, i.c.x > 10.5)); l.y *= k; l.z *= k; }
  }
  let w = i.a.xyz + qrot(i.b, l * i.a.w);
  o.cp = g.vp * vec4f(w, 1.);
  if (i.c.w >= 2.) { o.cp.z = mix(o.cp.z, o.cp.w, .9); }
  o.wp = w; o.n = qrot(i.b, n); o.op = i.p; o.k = i.c; o.ax = i.n.w;
  return o;
}
const HS = array<f32, 3>(.155, .095, .215);
@fragment fn fsHunt(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let k = i32(i.k.x + .5); let p = i.op; let ax = i.ax;
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus(i.wp, dist);
  let tx = textureSample(tD, sR, p.xy * 2.3 + fract(i.k.w) * 5.);
  let tg = textureSample(tD, sR, vec2f(p.x * .8, p.y * 13. + p.z * 9.));
  var n = normalize(i.n); if (!ff) { n = -n; }
  let body = step(.9, ax);
  // 0 at a fin's base, 1 at its edge
  let fv = sat(select(select((.2 - ax) * 10., (.4 - ax) * 10., ax > .25), (.6 - ax) * 10., ax > .45));
  let tail = step(.25, ax) * step(ax, .45);
  let H = HS[min(k, 2)]; let yn = p.y / H; let up = ss(-.25, .55, yn);
  let ray = .9 + .1 * sin(p.x * 420. + p.y * 140.);
  var c = vec3f(.5); var gl = .22; var fl = .3; var thin = 1. - body;
  if (k < 3) { switch k {
    case 0 { // black rockfish: slate-black back, grey sides mottled black, pale belly and lateral line, dark-spotted spiny dorsal
      c = mix(vec3f(.80, .80, .76), vec3f(.36, .38, .40), ss(-.75, -.15, yn));
      c = mix(c, vec3f(.07, .08, .10), ss(-.05, .55, yn));
      c *= 1. - .5 * ss(.5, .72, tx.a + tx.r * .35) * ss(-.7, .2, yn) * body;
      c = mix(c, vec3f(.62, .64, .66), ss(.025, .008, abs(yn - .32 - p.x * .15)) * step(-.33, p.x) * step(p.x, .3) * body * .6);
      c = mix(c, mix(vec3f(.16, .17, .19), vec3f(.05, .05, .06), sat(ss(.2, .9, fv) + step(0., p.y) * step(-.02, p.x) * ss(.55, .7, tx.g) * .6)) * ray, thin);
      gl = .4;
    }
    case 1 { // lingcod: olive-brown, big dark blotches, copper flecks, pale belly; mottled fins
      let mot = tx.a + tg.r * .3 + sin(p.x * 60. + yn * 4.) * .08;
      c = mix(vec3f(.55, .52, .40), vec3f(.30, .29, .20), ss(-.6, .1, yn));
      c = mix(c, vec3f(.10, .085, .055), ss(.44, .58, mot) * ss(-.8, -.1, yn) * .9);
      c = mix(c, vec3f(.78, .44, .16), ss(.66, .7, tx.r + tx.b * .5) * ss(-.5, .3, yn) * .7);
      c = mix(c, vec3f(.80, .78, .68), ss(-.5, -.9, yn));
      c = mix(c, mix(vec3f(.30, .28, .18), vec3f(.12, .10, .06), ss(.5, .62, mot)) * ray, thin);
      gl = .3;
    }
    default { // striped surfperch: copper-orange, blue stripes along the lower sides, blue streaks on the head
      c = mix(vec3f(1., .52, .16), vec3f(.78, .30, .08), up);
      c = mix(c, vec3f(.10, .42, 1.), ss(.35, .7, sin(yn * 24. + p.x * 4.)) * ss(.6, -.2, yn) * step(-.33, p.x) * body);
      c = mix(c, vec3f(.30, .62, .95), ss(.6, .8, sin(p.y * 120. - p.x * 40.)) * ss(.3, .45, p.x) * body * .7);
      c = mix(c, vec3f(.85, .55, .30) * ray, thin);
      gl = .45; fl = .45;
    }
  }
  // scales (not on the head) and a slightly rough surface
  let sd = select(select(55., 75., k == 2), 95., k == 1);
  var q = vec2f(p.x * sd, p.y * sd * 1.5); q.x += .5 * floor(q.y);
  c *= mix(1., .8 + .28 * ss(.5, .22, length(fract(q) - .5)), body * ss(.32, .22, p.x));
  n = normalize(n + (tx.rgb - .5) * .16 * body);
  } else { switch k {
    case 8 { // speargun: teak stock, steel muzzle and trigger, black grip, grey reel, neoprene glove and sleeve
      thin = 0.;
      c = mix(vec3f(.07, .035, .015), vec3f(.24, .13, .055), tg.b) * (.7 + .5 * tg.a); gl = .3; fl = .1;
      if (ax < .8) { c = vec3f(.22, .23, .25); gl = .8; }
      if (ax < .6) { c = vec3f(.022, .024, .028); gl = .35; }
      if (ax < .4) { c = vec3f(.13, .14, .15); gl = .5; }
      if (ax < .2) { c = vec3f(.16, .17, .18) * (.6 + .8 * tx.a); gl = .2; }
      if (ax < .1) { c = vec3f(.035, .06, .10) * (.6 + .8 * tx.a) * (1. - .5 * ss(.012, .004, abs(p.x + .13))); gl = .25; }
    }
    case 9 { // rubber band: amber latex, paler as it stretches; dark wishbone
      thin = 0.;
      c = mix(vec3f(.62, .30, .06), vec3f(.80, .46, .12), ss(1., 2.5, i.k.z)); gl = .4;
      if (ax < .6) { c = vec3f(.03); }
    }
    case 10 { thin = 0.; c = vec3f(.75, .78, .82); gl = 1.; fl = .1; }
    case 11 { thin = 0.; c = vec3f(.85, .85, .74); gl = .1; }
    default { thin = 0.; c = vec3f(.95, .40, .08); gl = .2; }
  } }
  if (k < 8) { // eye, mouth, gill cover
    let er = .009 + select(.045, .1, k == 1) * H + select(0., .006, k == 0); let ey = H * select(.22, .45, k == 1);
    let ed = length(vec2f(p.x - .4, p.y - ey));
    c *= 1. - .5 * ss(.005, .002, abs(p.y + H * .1 - (p.x - .5) * 1.1 * H)) * step(select(.455, .39, k == 1), p.x) * body;
    c *= 1. - .14 * ss(.014, .004, abs(p.x - .31 + yn * yn * .05)) * ss(.75, .4, abs(yn)) * body;
    c = mix(c, vec3f(.55, .47, .22), ss(er * 1.45, er * 1.2, ed) * body);
    c = mix(c, vec3f(.01), ss(er, er * .8, ed) * body);
    c = mix(c, vec3f(1.6), ss(er * .3, er * .18, length(vec2f(p.x - .4 - er * .3, p.y - ey - er * .35))) * body); // glint
    c *= (.62 + .45 * tx.b) * (.85 + .3 * tx.a);
  }
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let z = zone(i.wp); let vv = vol(i.wp);
  let E = sunE(i.wp.y, z) * shadow4(i.wp + n * .25);
  let nl = dot(n, L);
  // fins let light through
  let ndl = mix(sat(nl), abs(nl) * .7 + .2, thin);
  let am = amb(i.wp, n, vv.g, z) + side(i.wp, n, sat((vv.r - .5) * 2.7), z) * .7;
  c *= .55; // the scene is exposed for dark rock
  let dl = E * ndl * (.2 + min(ca, vec3f(1.6)) * .7);
  var col = c * (dl + am) + c * fl * dot(dl + am, vec3f(.1, .5, .5));
  if (i.k.w >= 2.) { col += c * vec3f(.07, .12, .13); }
  // arcade readability: the game fish keep some of their colour at depth, where the water would take the reds
  if (k < 3) {
    col += c * vec3f(.2, .15, .12);
    // like the mantas: caustic light on the belly, and the sky catching the edges
    let sky = amb(i.wp, vec3f(0., 1., 0.), vv.g, z);
    col += c * sky * ca * .35 * (1. - up) + sky * pow(1. - sat(dot(n, V)), 3.) * .18;
    // the trophy: a faint gold rim that breathes, so it reads as special without looking unreal
    if (k == 1) { col += vec3f(1., .78, .3) * pow(1. - sat(dot(n, V)), 2.5) * (.5 + .2 * sin(g.cam.w * 3.5)) * (.5 + .5 * body); }
  }
  col += E * (.3 + ca) * pow(sat(dot(n, normalize(V + L))), mix(14., 90., gl)) * gl * .8 * sat(nl * 4.);
  col += amb(i.wp, reflect(-V, n), vv.g, z) * (.03 + gl * gl) * pow(1. - sat(dot(n, V)), 3.);
  return fin(fog(col, i.wp, z));
}
`;

// ---------------------------------------------------------------- meshes
const SLEN = 1, TIP = 0.22, LINE = 8, MUZ = 1.38; // spear length, how far a seated spear sticks out, line length, eye to muzzle
// speargun, +x along the barrel, origin at the top of the grip. aux: 0.9 wood, 0.7 steel, 0.5 black, 0.3 reel, 0.15 glove, 0.05 sleeve
function meshGun() {
  const m = new Mesh(), up = () => [0, 1, 0], fw = () => [1, 0, 0];
  const part = (aux, f) => { const n = m.aux.length; f(); for (let k = n; k < m.aux.length; k++) m.aux[k] = aux; };
  part(0.9, () => m.sweep([[-0.07, 0, 0], [0.2, 0.002, 0], [0.74, 0.004, 0]], (k) => 0.032 - k * 0.004, (k) => 0.038 - k * 0.005, up));
  part(0.7, () => {
    m.sweep([[0.72, 0.004, 0], [0.79, 0.004, 0]], 0.036, 0.042, up); // muzzle
    m.sweep([[-0.02, 0.026, 0], [0.74, 0.027, 0]], 0.012, 0.006, up); // spear track
    m.sweep([[0.035, -0.024, 0], [0.075, -0.07, 0], [0.01, -0.085, 0]], 0.012, 0.006, fw, false); // trigger guard
    m.sweep([[0.03, -0.024, 0], [0.022, -0.06, 0]], 0.008, 0.01, fw); // trigger
  });
  part(0.5, () => {
    m.sweep([[-0.02, -0.02, 0], [-0.045, -0.085, 0], [-0.075, -0.15, 0]], 0.034, 0.05, fw); // grip
  });
  part(0.3, () => m.tube([[0.2, -0.05, -0.03], [0.2, -0.05, -0.028], [0.2, -0.05, 0.028], [0.2, -0.05, 0.03]], (k) => k % 3 ? 0.034 : 0.004, 10, true));
  part(0.15, () => {
    // glove: the palm behind the grip, four fingers wrapped round its front, the thumb over the top
    m.tube([[-0.02, -0.02, 0.006], [-0.04, -0.045, 0.012], [-0.066, -0.1, 0.016], [-0.088, -0.15, 0.018], [-0.095, -0.17, 0.02]], (k) => [0.012, 0.034, 0.038, 0.036, 0.012][k], 10, true);
    for (let k = 0; k < 4; k++) { const y = -0.05 - k * 0.029, x = -0.02 + (y + 0.02) * 0.42; m.tube([[x - 0.03, y, 0.03], [x + 0.012, y - 0.004, 0.034], [x + 0.034, y - 0.008, 0.008], [x + 0.028, y - 0.01, -0.022], [x - 0.004, y - 0.01, -0.03]], (j) => 0.0135 - j * 0.001, 7, true); }
    m.tube([[-0.055, -0.035, 0.03], [-0.025, -0.012, 0.03], [0.012, -0.004, 0.022], [0.03, -0.004, 0.012]], (k) => 0.015 - k * 0.0015, 7, true);
  });
  part(0.05, () => m.tube([[-0.08, -0.155, 0.018], [-0.12, -0.19, 0.04], [-0.26, -0.27, 0.11], [-0.6, -0.44, 0.27]], (k) => [0.033, 0.04, 0.045, 0.05][k], 12, false)); // sleeve
  return m;
}
// one band, 0.24 long from the muzzle back along -x (stretched by the shader); aux < 0.6: the wishbone
function meshBand() {
  const m = new Mesh();
  for (const s of [-1, 1]) m.tube([[0, 0, s * 0.027], [-0.12, 0.014, s * 0.025], [-0.225, 0.03, s * 0.009]], 0.0075, 6, true, () => 1);
  m.tube([[-0.222, 0.03, -0.011], [-0.24, 0.032, 0], [-0.222, 0.03, 0.011]], 0.004, 5, true, () => 0.3);
  return m;
}
// spear: tip at the origin, shaft along -x, one flopper barb
function meshSpear() {
  const m = new Mesh();
  m.tube([[-SLEN, 0, 0], [-0.07, 0, 0], [-0.06, 0, 0], [0, 0, 0]], (k) => [0.0045, 0.0045, 0.008, 0.0006][k], 6, true, () => 1);
  m.tri(m.v(-0.05, 0.006, 0), m.v(-0.13, 0.03, 0), m.v(-0.12, 0.006, 0));
  m.tube([[-SLEN + 0.02, 0, 0], [-SLEN + 0.05, 0, 0]], 0.008, 6, true, () => 1);
  return m;
}
const GM = [...SPEC.map(meshSpecies), meshGun(), meshBand(), meshSpear(), (() => { const m = new Mesh(); m.tube([[0, 0, 0], [1, 0, 0]], 1, 5, true, () => 1); return m; })()].map((m) => m.build());
const mGUN = NSP, mBAND = NSP + 1, mSPEAR = NSP + 2, mLINE = NSP + 3;
{ let nv = 0, ni = 0; for (const m of GM) { m.v0 = nv; m.i0 = ni; m.n = m.ib.length; nv += m.nv; ni += m.n; } }
const vbG = buf((() => { const a = new Uint8Array(GM.reduce((n, m) => n + m.nv, 0) * 16); for (const m of GM) a.set(new Uint8Array(m.vb), m.v0 * 16); return a; })(), BU.VERTEX);
const ixG = buf((() => { const a = new Uint32Array(GM.reduce((n, m) => n + m.n, 0)); for (const m of GM) a.set(m.ib, m.i0); return a; })(), BU.INDEX);
// instances: the fish pool, gun, 2 bands, spear, line
const NSEG = 14, iGUN = NF, iBAND = iGUN + 1, iSPEAR = iBAND + 2, iLINE = iSPEAR + 1, NI = iLINE + NSEG;
const IB = new Float32Array(NI * 12), ibG = device.createBuffer({ size: IB.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const pHunt = scenePipe(mod(W_GAME), 'vsHunt', 'fsHunt', [vbSolid, ibSolid]);

// ---------------------------------------------------------------- state
// gun: 0 LOADED, 1 FIRED (in flight, then at rest), 2 REELING, 3 RELOADING
// stopped: 0 in flight, 1 in the water at the end of the line, 2 in rock, 3 in a fish
let gst = 0, stopped = 0, spFish = -1, fireReq = 0, rls = 0, limp = 0, stopT = 0;
// scratch: quaternions (slots of 4), vectors (slots of 3), scalars. Helpers take slot numbers, never floats.
const QQ = new Float64Array(32), V = new Float64Array(48), S = new Float64Array(8);
const gRTX = 37, gRTY = 38, gRTZ = 39, gYR = 40, gPR = 41, gLEN = 42;
const RELOAD = 1.1; // s: the spear slides in, then the two bands are pulled back
G[gB1] = G[gB2] = 1;
function qm(a, b, o) { // QQ[o] = QQ[a] * QQ[b]
  a *= 4; b *= 4; o *= 4; const ax = QQ[a], ay = QQ[a + 1], az = QQ[a + 2], aw = QQ[a + 3], bx = QQ[b], by = QQ[b + 1], bz = QQ[b + 2], bw = QQ[b + 3];
  QQ[o] = aw * bx + ax * bw + ay * bz - az * by; QQ[o + 1] = aw * by - ax * bz + ay * bw + az * bx; QQ[o + 2] = aw * bz + ax * by - ay * bx + az * bw; QQ[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
function qa(o, ax) { o *= 4; QQ[o] = QQ[o + 1] = QQ[o + 2] = 0; QQ[o + ax] = sin(S[0] / 2); QQ[o + 3] = cos(S[0] / 2); } // QQ[o] = turn by S[0] about axis ax
function qv(q, v) { // V[v] turned by QQ[q]
  q *= 4; v *= 3; const x = QQ[q], y = QQ[q + 1], z = QQ[q + 2], w = QQ[q + 3], vx = V[v], vy = V[v + 1], vz = V[v + 2];
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  V[v] = vx + w * tx + y * tz - z * ty; V[v + 1] = vy + w * ty + z * tx - x * tz; V[v + 2] = vz + w * tz + x * ty - y * tx;
}
function qd(o, v) { // QQ[o] = shortest turn taking +x to the unit vector V[v]
  o *= 4; v *= 3; const x = V[v], l = sqrt(2 + 2 * x);
  if (l < 1e-3) { QQ[o] = QQ[o + 2] = QQ[o + 3] = 0; QQ[o + 1] = 1; return; }
  QQ[o] = 0; QQ[o + 1] = -V[v + 2] / l; QQ[o + 2] = V[v + 1] / l; QQ[o + 3] = (1 + x) / l;
}
function ins(k, v, q) { // instance k: position V[v], orientation QQ[q]
  k *= 12; v *= 3; q *= 4; IB[k] = V[v]; IB[k + 1] = V[v + 1]; IB[k + 2] = V[v + 2]; IB[k + 4] = QQ[q]; IB[k + 5] = QQ[q + 1]; IB[k + 6] = QQ[q + 2]; IB[k + 7] = QQ[q + 3];
}
function ss01() { const x = S[0] < 0 ? 0 : S[0] > 1 ? 1 : S[0]; S[0] = x * x * (3 - 2 * x); } // S[0] = smoothstep of S[0] over 0..1
function vadd(v, a) { v *= 3; a *= 3; V[v] += V[a]; V[v + 1] += V[a + 1]; V[v + 2] += V[a + 2]; }
// fish i's instance from its FS row: yaw / pitch / roll, tail phase, wave amplitude `amp` (0 hides it)
function fishInst(i, amp) {
  const o = i * FN, k = i * 12, yaw = FS[o + fYAW], pit = FS[o + fPIT];
  const sy = sin(-yaw / 2), cyw = cos(yaw / 2), sp2 = sin(pit / 2), cp2 = cos(pit / 2), sr = sin(FS[o + fROL] / 2), cr = cos(FS[o + fROL] / 2);
  const qx = sy * sp2, qy = sy * cp2, qz = cyw * sp2, qw = cyw * cp2;
  IB[k] = FS[o]; IB[k + 1] = FS[o + 1]; IB[k + 2] = FS[o + 2]; IB[k + 3] = amp > 0 ? FS[o + fLEN] : 0;
  IB[k + 4] = qw * sr + qx * cr; IB[k + 5] = qy * cr + qz * sr; IB[k + 6] = qz * cr - qy * sr; IB[k + 7] = qw * cr - qx * sr;
  IB[k + 8] = FSP[i]; IB[k + 9] = FS[o + fPH]; IB[k + 10] = amp; IB[k + 11] = FS[o + fSEED];
}

// ---------------------------------------------------------------- spear
// moves the tip S[0] metres along its velocity in short steps; stops in rock or in the first fish it meets
function spearMove() {
  const l = sqrt(G[gVX] * G[gVX] + G[gVY] * G[gVY] + G[gVZ] * G[gVZ]); if (l < 1e-6) return;
  const dx = G[gVX] / l, dy = G[gVY] / l, dz = G[gVZ] / l, n = (S[0] / 0.025 | 0) + 1, st = S[0] / n;
  for (let k = 0; k < n; k++) {
    const x = G[gPX] += dx * st, y = G[gPY] += dy * st, z = G[gPZ] += dz * st;
    QP[0] = x; QP[1] = y; QP[2] = z; rk(0);
    if (QD[0] > 0) { G[gPX] -= dx * st; G[gPY] -= dy * st; G[gPZ] -= dz * st; stopped = 2; break; }
    let best = -1, bd = 1e9;
    for (let i = 0; i < NF; i++) {
      if (FST[i] !== 0) continue;
      const o = i * FN, ex = x - FS[o], ey = y - FS[o + 1], ez = z - FS[o + 2], len = FS[o + fLEN], d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > len * len * 0.36) continue;
      // the hit volume (fish.js hitIn); t = where along it, from the tail (-) to the nose (+)
      const q = hitIn(i, ex, ey, ez), t = HT[0];
      if (q < 1 && q < bd) {
        const cp = cos(FS[o + fPIT]), fx = cos(FS[o + fYAW]) * cp, fy = sin(FS[o + fPIT]), fz = sin(FS[o + fYAW]) * cp;
        // where along the body: the spear's line passes closest to the fish's axis there (the skin it touches
        // first is nearer the middle on a fish that is angled away)
        bd = q; best = i; const ad = fx * dx + fy * dy + fz * dz, k = 1 - ad * ad;
        G[gHIT] = (k > 0.05 ? max(-0.5, min(0.5, ((ex * fx + ey * fy + ez * fz) - (ex * dx + ey * dy + ez * dz) * ad) / k)) : t) / len;
      }
    }
    if (best >= 0) { FST[best] = 3; spFish = best; stopped = 3; G[gTHR] = 1; G[gTHT] = 0; break; }
  }
  if (stopped) {
    G[gVX] = G[gVY] = G[gVZ] = 0; G[gSPX] = G[gPX]; G[gSPY] = G[gPY]; G[gSPZ] = G[gPZ]; stopT = G[gT];
    if (SFX) SFX(stopped === 3 ? 2 : 1);
    limp = 0; if (stopped === 3) arcHit(spFish, G[gHIT]);
    arcStop();
  }
}
// the fish tears off the spear (arcade.js has already set it free)
function spearDrop() { spFish = -1; limp = 0; }
// the spear is back at the gun: hand over the fish, start the reload
function land() {
  if (spFish >= 0) { const i = spFish; spFish = -1; arcLanded(i); if (SFX) SFX(7); }
  gst = 3; stopped = 0; G[gT] = 0; rls = 0; G[gSEAT] = 1; REEL = 0; limp = 0;
}

function gameStep(dt) {
  if (simOff > 1) return; // dev: everything held still
  dt = arcStep(dt); // the round: camera, aim, fish, slow motion
  const cx = F[CX], cy = F[CY], cz = F[CZ], fx = G[gAX], fy = G[gAY], fz = G[gAZ];
  G[gDT] = dt;
  // how fast the aim turns, for the gun's lag
  const idt = 1 / max(dt, 1e-3), ayaw = atan2(fx, -fz), apit = Math.asin(fy);
  let dyaw = ayaw - G[gLYAW]; dyaw -= TAU * round(dyaw / TAU); const dpit = apit - G[gLPIT]; G[gLYAW] = ayaw; G[gLPIT] = apit;
  const kq = min(1, dt * 10), yr = dyaw * idt, pr = dpit * idt; G[gYR] += ((yr > 6 ? 6 : yr < -6 ? -6 : yr) - G[gYR]) * kq; G[gPR] += ((pr > 6 ? 6 : pr < -6 ? -6 : pr) - G[gPR]) * kq;

  G[gREC] -= G[gREC] * min(1, dt * 8);
  if (gst === 0 && fireReq) {
    // release: the tip starts at the eye so nothing between the eye and the muzzle is skipped
    gst = 1; stopped = 0; spFish = -1; G[gT] = 0; G[gREC] = 1; G[gSEAT] = 0; G[gSAG] = 0;
    G[gPX] = G[gOX] = cx + fx * 0.3; G[gPY] = G[gOY] = cy + fy * 0.3; G[gPZ] = G[gOZ] = cz + fz * 0.3; G[gVX] = fx * 34; G[gVY] = fy * 34; G[gVZ] = fz * 34; G[gDX] = fx; G[gDY] = fy; G[gDZ] = fz;
    if (SFX) SFX(0);
    arcFire();
    S[0] = MUZ + TIP - 0.3; spearMove();
  }
  fireReq = 0;
  if (gst === 1 || gst === 2) { G[gB1] = max(0, G[gB1] - dt * 28); G[gB2] = max(0, G[gB2] - dt * 22); }
  const ex = cx + fx * MUZ, ey = cy + fy * MUZ, ez = cz + fz * MUZ;
  if (gst === 1) {
    G[gT] += dt;
    if (!stopped) { // flight: water drag and a slight drop
      const k = exp(-dt * 2.7); G[gVX] *= k; G[gVY] = G[gVY] * k - 1.2 * dt; G[gVZ] *= k;
      const sp = sqrt(G[gVX] * G[gVX] + G[gVY] * G[gVY] + G[gVZ] * G[gVZ]);
      G[gDX] = G[gVX] / sp; G[gDY] = G[gVY] / sp; G[gDZ] = G[gVZ] / sp;
      S[0] = sp * dt; spearMove();
      const qx = G[gPX] - ex, qy = G[gPY] - ey, qz = G[gPZ] - ez;
      if (!stopped && (qx * qx + qy * qy + qz * qz > LINE * LINE || sp < 2.5)) { // end of the line: a miss
        stopped = 1; G[gVX] = G[gVY] = G[gVZ] = 0; G[gSPX] = G[gPX]; G[gSPY] = G[gPY]; G[gSPZ] = G[gPZ]; stopT = G[gT]; arcStop();
      }
    } else if (stopped === 1) { // hangs on the line, sinking slowly, nose down
      G[gPY] -= 0.3 * dt;
      G[gDY] -= dt * 0.3; const l = sqrt(G[gDX] * G[gDX] + G[gDY] * G[gDY] + G[gDZ] * G[gDZ]); G[gDX] /= l; G[gDY] /= l; G[gDZ] /= l;
    }
    // the reel is automatic: it starts a moment after the spear stops
    if (stopped && G[gT] - stopT > 0.25) { gst = 2; G[gLEN] = 99; }
  } else if (gst === 2) {
    REEL = 1;
    // the reel takes the line in at its own speed, a little slower with a fish on
    const tx = G[gPX] - G[gRTX], ty = G[gPY] - G[gRTY], tz = G[gPZ] - G[gRTZ], d = sqrt(tx * tx + ty * ty + tz * tz) + 1e-6;
    if (d < G[gLEN]) G[gLEN] = d;
    G[gLEN] -= 11 / (1 + (spFish >= 0 ? 1.2 * FS[spFish * FN + fLEN] : 0)) * dt;
    if (G[gLEN] < 0.06) land();
    else if (d > G[gLEN]) { const k = G[gLEN] / d; G[gPX] = G[gRTX] + tx * k; G[gPY] = G[gRTY] + ty * k; G[gPZ] = G[gRTZ] + tz * k; }
  } else if (gst === 3) { // reload: slide the spear in, then stretch the two bands one at a time
    const t = G[gT] += dt, R = RELOAD / 2.5;
    S[0] = t / (0.5 * R); ss01(); G[gSEAT] = 1 - S[0]; S[0] = (t - 0.6 * R) / (0.76 * R); ss01(); G[gB1] = S[0]; S[0] = (t - 1.48 * R) / (0.76 * R); ss01(); G[gB2] = S[0];
    S[0] = t / 0.2; ss01(); G[gPOSE] = S[0] * 0.6; S[0] = (RELOAD - t) / 0.2; ss01(); G[gPOSE] *= S[0];
    const stage = t < 0.5 * R ? 1 : t < 0.6 * R ? 2 : t < 1.36 * R ? 3 : t < 1.48 * R ? 4 : t < 2.24 * R ? 5 : 6;
    if (stage !== rls) { rls = stage; if (SFX) SFX(stage === 1 ? 5 : stage & 1 ? 4 : 3); if (stage === 4 || stage === 6) G[gREC] = 0.35; }
    if (t >= RELOAD) { gst = 0; G[gSEAT] = 0; G[gB1] = G[gB2] = 1; G[gPOSE] = 0; }
  }
  if (gst === 1) { // the line does not stretch: it drags the spear (and whatever is on it) along
    const qx = G[gPX] - ex, qy = G[gPY] - ey, qz = G[gPZ] - ez, d = sqrt(qx * qx + qy * qy + qz * qz);
    if (d > LINE + 0.2 && stopped) { const k = (LINE + 0.2) / d; G[gPX] = ex + qx * k; G[gPY] = ey + qy * k; G[gPZ] = ez + qz * k; if (stopped === 2) stopped = 1; }
  }
  if (gst !== 2) REEL = 0;
  if (spFish >= 0) { // the fish on the spear thrashes, and tires; a stoned fish hangs limp
    G[gTHR] = limp ? 0 : max(0.3, G[gTHR] - dt * 0.15);
    if (!limp && (G[gTHT] -= dt) <= 0) { rn(); G[gTHT] = 0.3 + G[gRND] * 0.5; if (SFX) SFX(6); }
  }
}

// ---------------------------------------------------------------- draw
// Places everything the diver holds from this frame's aim, then draws the fish and the gun.
function gameDraw(r) {
  const cx = F[CX], cy = F[CY], cz = F[CZ], t = F[TIME], dt = G[gDT];
  // the aim's basis: forward, right (level), up
  const fx = G[gAX], fy = G[gAY], fz = G[gAZ], rl = sqrt(fx * fx + fz * fz) + 1e-9, rx = fx === 0 && fz === 0 ? 1 : -fz / rl, rz = fx / rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  // Q0 = the aim's orientation: +x forward, +y up, +z right
  {
    const tr = fx + uy + rz;
    if (tr > 0) { const s = sqrt(tr + 1) * 2; QQ[3] = s / 4; QQ[0] = uz / s; QQ[1] = (rx - fz) / s; QQ[2] = (fy - ux) / s; }
    else if (fx > uy && fx > rz) { const s = sqrt(1 + fx - uy - rz) * 2; QQ[3] = uz / s; QQ[0] = s / 4; QQ[1] = (ux + fy) / s; QQ[2] = (rx + fz) / s; }
    else if (uy > rz) { const s = sqrt(1 + uy - fx - rz) * 2; QQ[3] = (rx - fz) / s; QQ[0] = (ux + fy) / s; QQ[1] = s / 4; QQ[2] = uz / s; }
    else { const s = sqrt(1 + rz - fx - uy) * 2; QQ[3] = (fy - ux) / s; QQ[0] = (rx + fz) / s; QQ[1] = uz / s; QQ[2] = s / 4; }
  }
  // gun: lower right, canted a little towards the crosshair; it lags behind the aim, kicks back on a shot, and
  // comes up and across for the reload
  const pose = G[gPOSE], rec = G[gREC];
  S[0] = 0.1 + pose * 0.2 + max(-0.08, min(0.08, G[gYR] * 0.02)); qa(2, 1);
  S[0] = 0.05 + pose * 0.24 + rec * 0.1 + max(-0.08, min(0.08, G[gPR] * 0.02)); qa(3, 2); qm(2, 3, 4);
  S[0] = -pose * 0.55; qa(3, 0); qm(4, 3, 2); qm(0, 2, 1); // Q1 = the gun's orientation
  V[0] = 0.62 - rec * 0.1 - pose * 0.1; V[1] = -0.2 + pose * 0.04 + sin(t * 1.1) * 0.004; V[2] = 0.27 - pose * 0.1; qv(0, 0);
  V[0] += cx; V[1] += cy; V[2] += cz; // V0 = the gun's origin
  ins(iGUN, 0, 1); let k = iGUN * 12; IB[k + 3] = 1; IB[k + 8] = 8; IB[k + 10] = 1; IB[k + 11] = 2.5;
  for (let b = 0; b < 2; b++) { // bands: from the muzzle back to the spear's notches when loaded, slack otherwise
    const s = G[gB1 + b];
    V[3] = 0.752 - b * 0.03; V[4] = 0.016; V[5] = 0; qv(1, 1); vadd(1, 0);
    S[0] = 0.2 * (1 - s); qa(3, 2); qm(1, 3, 4);
    ins(iBAND + b, 1, 4); k = (iBAND + b) * 12; IB[k + 3] = 1; IB[k + 8] = 9; IB[k + 10] = 1 + (1.5 - b * 0.12) * s; IB[k + 11] = 2.5;
  }
  // V2 = where the spear's tip rides on the gun (seat 0: loaded, 1: its tail at the muzzle), V3 = the gun's axis
  V[6] = 0.76 + TIP + G[gSEAT] * (SLEN - TIP); V[7] = 0.032; V[8] = 0; qv(1, 2); vadd(2, 0);
  V[9] = 1; V[10] = V[11] = 0; qv(1, 3);
  // the reel-in target: where the tip is when the spear's tail reaches the muzzle, as seen from the eye's line
  V[12] = 0.76 + SLEN; V[13] = 0.032; V[14] = 0; qv(1, 4); vadd(4, 0);
  const ox = V[0] + V[9] * 0.76 - (cx + fx * MUZ), oy = V[1] + V[10] * 0.76 - (cy + fy * MUZ), oz = V[2] + V[11] * 0.76 - (cz + fz * MUZ); // gun muzzle minus the eye-line muzzle
  G[gRTX] = V[12] - ox; G[gRTY] = V[13] - oy; G[gRTZ] = V[14] - oz;
  // where the muzzle is, for the bubbles on a shot (arcade.js)
  G[gMZX] = V[0] + V[9] * 0.79; G[gMZY] = V[1] + V[10] * 0.79; G[gMZZ] = V[2] + V[11] * 0.79;
  k = iSPEAR * 12; IB[k + 3] = 1; IB[k + 8] = 10; IB[k + 10] = 1;
  const out = gst === 1 || gst === 2;
  if (!out) { ins(iSPEAR, 2, 1); IB[k + 11] = 2.5; }
  else {
    // in flight the tip is on the eye's line (what the crosshair shows); near the gun it blends over to the gun's
    const qx = G[gPX] - (cx + fx * MUZ), qy = G[gPY] - (cy + fy * MUZ), qz = G[gPZ] - (cz + fz * MUZ), d = sqrt(qx * qx + qy * qy + qz * qz) + 1e-6; S[0] = (d - 1) / 2.5; ss01(); const b = 1 - S[0];
    V[6] = G[gPX] + ox * b; V[7] = G[gPY] + oy * b; V[8] = G[gPZ] + oz * b;
    if (gst === 2) { // reeling: the spear trails tip-last along the line
      const kk = min(1, dt * 5); let ax = G[gDX] + (qx / d - G[gDX]) * kk, ay = G[gDY] + (qy / d - G[gDY]) * kk, az = G[gDZ] + (qz / d - G[gDZ]) * kk; const l = sqrt(ax * ax + ay * ay + az * az);
      G[gDX] = ax / l; G[gDY] = ay / l; G[gDZ] = az / l;
    }
    const w = gst === 2 ? b * b : 0; let ax = G[gDX] * (1 - w) + V[9] * w, ay = G[gDY] * (1 - w) + V[10] * w, az = G[gDZ] * (1 - w) + V[11] * w; const l = sqrt(ax * ax + ay * ay + az * az);
    V[15] = ax / l; V[16] = ay / l; V[17] = az / l; qd(5, 5);
    ins(iSPEAR, 2, 5); IB[k + 11] = 0.5;
    if (spFish >= 0) { // the speared fish: across the shaft where it was hit, thrashing (or limp)
      const thr = G[gTHR], f = spFish * 12, o = spFish * FN, at = 0.14;
      S[0] = 1.45 + sin(t * 23) * 0.5 * thr; qa(6, 1); qm(5, 6, 7); S[0] = sin(t * 17) * 0.5 * thr; qa(6, 0); qm(7, 6, 4);
      // the fish's body point that was hit sits on the shaft: shift it along its own axis by the hit position
      V[42] = -FS[o + fTX] * FS[o + fLEN]; V[43] = V[44] = 0; qv(4, 14);
      IB[f] = V[6] - V[15] * at + V[42]; IB[f + 1] = V[7] - V[16] * at + V[43]; IB[f + 2] = V[8] - V[17] * at + V[44]; IB[f + 3] = FS[o + fLEN];
      IB[f + 4] = QQ[16]; IB[f + 5] = QQ[17]; IB[f + 6] = QQ[18]; IB[f + 7] = QQ[19];
      IB[f + 9] = FS[o + fPH] += dt * (8 + 34 * thr); IB[f + 10] = limp ? 0.005 : 0.04 + 0.2 * thr;
      FS[o] = IB[f]; FS[o + 1] = IB[f + 1]; FS[o + 2] = IB[f + 2];
    }
    // line: muzzle to the spear's tail, sagging with its slack
    const mx = V[0] + V[9] * 0.77 - V[10] * 0.02, my = V[1] + V[10] * 0.77 - 0.02, mz = V[2] + V[11] * 0.77;
    const ex = V[6] - V[15] * SLEN, ey = V[7] - V[16] * SLEN, ez = V[8] - V[17] * SLEN, ll = sqrt((ex - mx) * (ex - mx) + (ey - my) * (ey - my) + (ez - mz) * (ez - mz));
    G[gSAG] += ((gst === 1 && stopped ? max(0.03, min(0.22, (LINE - ll) * 0.05)) : 0.012 * ll) - G[gSAG]) * min(1, dt * 4);
    const hx = (mx + ex) / 2, hy = (my + ey) / 2 - G[gSAG] * 2, hz = (mz + ez) / 2;
    let px = mx, py = my, pz = mz;
    for (let j = 1; j <= NSEG; j++) {
      const u = j / NSEG, a = (1 - u) * (1 - u), bb = 2 * u * (1 - u), c = u * u, nx = mx * a + hx * bb + ex * c, ny = my * a + hy * bb + ey * c, nz = mz * a + hz * bb + ez * c;
      const sx = nx - px, sy = ny - py, sz = nz - pz, sl = sqrt(sx * sx + sy * sy + sz * sz) + 1e-6;
      V[18] = px; V[19] = py; V[20] = pz; V[21] = sx / sl; V[22] = sy / sl; V[23] = sz / sl; qd(6, 7);
      const q = iLINE + j - 1; ins(q, 6, 6); IB[q * 12 + 3] = 0.0032; IB[q * 12 + 8] = 11; IB[q * 12 + 10] = sl / 0.0032; IB[q * 12 + 11] = 0.5;
      px = nx; py = ny; pz = nz;
    }
  }
  if (!r) return;
  Q.writeBuffer(ibG, 0, IB);
  r.setPipeline(pHunt); r.setVertexBuffer(0, vbG); r.setVertexBuffer(1, ibG); r.setIndexBuffer(ixG, 'uint32');
  for (let s = 0; s < NSP; s++) r.drawIndexed(GM[s].n, NFS[s], GM[s].i0, GM[s].v0, F0[s]);
  if (hideGun) return;
  r.drawIndexed(GM[mGUN].n, 1, GM[mGUN].i0, GM[mGUN].v0, iGUN);
  r.drawIndexed(GM[mBAND].n, 2, GM[mBAND].i0, GM[mBAND].v0, iBAND);
  r.drawIndexed(GM[mSPEAR].n, 1, GM[mSPEAR].i0, GM[mSPEAR].v0, iSPEAR);
  if (out) r.drawIndexed(GM[mLINE].n, NSEG, GM[mLINE].i0, GM[mLINE].v0, iLINE);
}
let hideGun = 0, simOff = 0; // dev stills: the scene alone, the fish held still
