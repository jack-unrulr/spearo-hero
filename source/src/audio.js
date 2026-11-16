// ============================================================================
// audio: procedural underwater ambience (no sample files)
// ============================================================================
// A fixed Web Audio graph, built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop.
// Layers: rumble, surface wash, water rush (follows camera speed), drone, bubbles, chimes and distant whale calls.
let AC, OUT, muted = false;
var SFX; // game sounds, once the graph exists: SFX(k)
var MUSIC = 0, MUSICT = 1; // arcade.js: the hunt track on / off, and its tempo factor (it speeds up as the air runs low)
const VOL = 0.78; // master level: about -18.5 LUFS, peaks near -5.5 dBFS
function mkSound(ac) {
  const sr = ac.sampleRate;
  // node of class C with options o, connected to every node / param in `to`; sources start at once
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop (the end cross-fades into the start)
  const nb = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  // reverb impulse: 5 s of noise that fades out and gets darker
  const ir = noise(5, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.04 + 0.5 * exp(-t * 2)); d[i] = b * (1 - exp(-t * 30)) * exp(-t * 1.5) * (1 - i / n); } });

  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);
  // rumble
  const rum = G(0.34, out); src(1, BQ('lowpass', 150, 0.7, rum)); lfo(0.07, 0.11, rum.gain); lfo(0.113, 0.08, rum.gain);
  // surface wash + water rush: the same noise played at another speed, so the loops never line up
  const wash = G(0.25, out), wave = G(1, wash), rush = G(0, out), rushF = BQ('bandpass', 300, 0.9, rush);
  src(0.63, BQ('bandpass', 420, 0.5, wave), rushF); lfo(0.09, 0.3, wave.gain); lfo(0.151, 0.25, wave.gain);
  // drone: stacked fifths on D, each note a pair of slightly detuned sines that slowly beat
  const pad = G(1, out, G(1.5, wet));
  [73.42, 110, 164.81, 246.94, 369.99].forEach((f, i) => { const g = G(0.022 - i * 0.003, pad); N(OscillatorNode, { frequency: f }, g); N(OscillatorNode, { frequency: f + rr(0.03, 0.11) }, g); });
  // pooled voices: oscillator -> envelope -> pan -> dry + reverb
  const pool = (n, send, type) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, out, G(send, wet)), g = G(0, p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const bub = pool(4, 0.12), chime = pool(3, 1.2), whale = pool(2, 2, 'triangle');
  // one note: pitch glides f0 -> f1 over dur, level rises to vol in att then dies away
  const play = (vs, t, f0, f1, dur, vol, att) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(rr(-0.7, 0.7), t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 5);
  };
  // game sounds (game.js), from the same fixed graph: three white-noise voices (noise -> band-pass -> envelope) and
  // two more oscillator pools
  const wn = noise(1, (d, n) => { for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1; });
  const mkNz = (n, dest) => Array.from({ length: n }, () => { const g = G(0, dest), f = BQ('bandpass', 1000, 1, g); N(AudioBufferSourceNode, { buffer: wn, loop: true }, f); return { g: g.gain, f: f.frequency, q: f.Q }; });
  const nz = mkNz(3, G(1, out, G(0.2, wet)));
  const hissOf = (P) => (t, f0, f1, dur, vol, q = 1, att = 0.005) => {
    const v = P.shift(); P.push(v);
    v.q.setValueAtTime(q, t); v.f.setValueAtTime(f0, t); v.f.exponentialRampToValueAtTime(f1, t + dur);
    v.g.setValueAtTime(0, t); v.g.linearRampToValueAtTime(vol, t + att); v.g.setTargetAtTime(0, t + att, dur / 4);
  };
  const hiss = hissOf(nz);
  // arcade voices: square / sawtooth beeps, centred, a little reverb
  const arcBus = G(0.5, out, G(0.35, wet));
  const arcV = Array.from({ length: 6 }, (_, i) => { const g = G(0, arcBus); return { g: g.gain, o: N(OscillatorNode, { type: i & 1 ? 'sawtooth' : 'square' }, g) }; });
  const beep = (t, f0, f1, dur, vol, att = 0.005) => { // f1 0: hold the pitch
    const v = arcV.shift(); arcV.push(v);
    v.o.frequency.setValueAtTime(f0, t); if (f1) v.o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    v.g.setValueAtTime(0, t); v.g.linearRampToValueAtTime(vol, t + att); v.g.setTargetAtTime(0, t + dur * 0.6, dur / 5);
  };
  const st = (n) => 440 * pow(2, n / 12); // semitones from A4
  const tone = pool(4, 0.15), tick = pool(3, 0.05, 'square');
  let tR = 0;
  // 0 band release + spear hiss, 1 spear on rock, 2 hit, 3 click, 4 band stretch, 5 spear slides in, 6 fish thrash, 7 fish landed
  SFX = (k) => {
    const t = ac.currentTime + 0.01;
    if (k === 0) { play(tone, t, 150, 42, 0.22, 0.5, 0.004); hiss(t, 900, 200, 0.12, 0.5, 0.7); hiss(t + 0.03, 3200, 700, 0.55, 0.16, 1.2, 0.03); }
    else if (k === 1) { play(tone, t, 1900, 1500, 0.12, 0.1, 0.002); hiss(t, 2500, 1200, 0.08, 0.2, 3); }
    else if (k === 2) { play(tone, t, 190, 60, 0.18, 0.5, 0.003); hiss(t, 700, 250, 0.1, 0.35, 0.8); }
    else if (k === 3) { play(tick, t, 1300, 900, 0.03, 0.08, 0.001); hiss(t, 3800, 2500, 0.03, 0.22, 2); }
    else if (k === 4) { hiss(t, 260, 950, 0.75, 0.2, 5, 0.5); play(tone, t, 70, 125, 0.75, 0.1, 0.55); }
    else if (k === 5) hiss(t, 1800, 2600, 0.45, 0.07, 4, 0.3);
    else if (k === 6) for (let i = 0; i < 3; i++) hiss(t + i * 0.08, 320 + i * 60, 140, 0.07, 0.17, 0.8);
    else if (k === 7) { play(tone, t, 300, 520, 0.12, 0.16, 0.02); play(tone, t + 0.09, 520, 780, 0.14, 0.12, 0.02); }
    // arcade: 8 stoned, 9 fish held, 10 tore off, 11 protected buzzer, 12 got away, 13 countdown, 14 go, 15 streak,
    // 16 low-air heartbeat, 17 tally fanfare, 18 miss, 19 bonus
    else if (k === 8) { [3, 7, 10, 15, 19].forEach((n, i) => beep(t + i * 0.06, st(n), 0, 0.14, 0.13)); beep(t + 0.32, st(22), st(27), 0.45, 0.12); hiss(t + 0.3, 6000, 9000, 0.4, 0.12, 3); }
    else if (k === 9) { beep(t, st(3), 0, 0.09, 0.12); beep(t + 0.09, st(10), 0, 0.25, 0.12); }
    else if (k === 10) { beep(t, st(-2), st(-9), 0.22, 0.13); beep(t + 0.24, st(-5), st(-14), 0.35, 0.13); }
    else if (k === 11) { beep(t, 98, 92, 0.32, 0.22, 0.002); beep(t, 104, 97, 0.32, 0.2, 0.002); beep(t + 0.4, 98, 82, 0.5, 0.22, 0.002); beep(t + 0.4, 104, 87, 0.5, 0.2, 0.002); }
    else if (k === 12) { beep(t, st(-5), 0, 0.22, 0.1); beep(t + 0.25, st(-6), 0, 0.22, 0.1); beep(t + 0.5, st(-7), st(-9), 0.6, 0.11); }
    else if (k === 13) beep(t, st(3), 0, 0.15, 0.13);
    else if (k === 14) { beep(t, st(15), 0, 0.4, 0.14); beep(t, st(10), 0, 0.4, 0.1); beep(t, st(3), 0, 0.4, 0.1); }
    else if (k === 15) { beep(t, st(10), st(22), 0.18, 0.11); beep(t + 0.1, st(15), st(27), 0.22, 0.1); }
    else if (k === 16) { play(tone, t, 70, 45, 0.12, 0.35, 0.005); play(tone, t + 0.16, 65, 42, 0.12, 0.25, 0.005); }
    else if (k === 17) { [3, 7, 10, 15].forEach((n, i) => beep(t + i * 0.11, st(n), 0, 0.2, 0.12)); [10, 15, 19].forEach((n) => beep(t + 0.46, st(n), 0, 0.8, 0.09)); }
    else if (k === 18) beep(t, st(-9), st(-16), 0.25, 0.07);
    else beep(t, st(15), st(20), 0.12, 0.1);
  };
  // the hunt track: kick, hats, clap, a sawtooth bass line in D minor and an arpeggio that comes in when air is low
  const mus = G(0, out), musF = BQ('lowpass', 700, 5, mus), nzM = mkNz(2, mus), hissM = hissOf(nzM);
  const bassV = Array.from({ length: 2 }, () => { const g = G(0, musF); return { g: g.gain, o: N(OscillatorNode, { type: 'sawtooth' }, g) }; });
  const kickV = Array.from({ length: 2 }, () => { const g = G(0, mus); return { g: g.gain, o: N(OscillatorNode, {}, g) }; });
  const arpV = Array.from({ length: 2 }, () => { const g = G(0, mus, G(0.4, wet)); return { g: g.gain, o: N(OscillatorNode, { type: 'square' }, g) }; });
  const BASS = [0, 0, 12, 0, 3, 0, 10, 0, 5, 5, 12, 5, 7, 3, 10, 3], ARP = [12, 15, 19, 22, 24, 22, 19, 15];
  let mNext = 0, mStep = 0;
  const env = (v, t, f, vol, len) => { v.o.frequency.setValueAtTime(f, t); v.g.setValueAtTime(0, t); v.g.linearRampToValueAtTime(vol, t + 0.008); v.g.setTargetAtTime(0, t + len, 0.03); };
  const musicTick = (now) => {
    mus.gain.setTargetAtTime(MUSIC ? 0.5 : 0, now, MUSIC ? 0.4 : 0.8);
    if (!MUSIC) { mNext = 0; return; }
    if (mNext < now) { mNext = now + 0.05; mStep = 0; }
    const e8 = 60 / (128 * MUSICT) / 2;
    musF.frequency.setTargetAtTime(500 + 1400 * (MUSICT - 1), now, 0.5);
    while (mNext < now + 0.3) {
      const t = mNext, s = mStep & 15;
      if (s % 4 === 0 || s === 14) { const v = kickV.shift(); kickV.push(v); v.o.frequency.setValueAtTime(160, t); v.o.frequency.exponentialRampToValueAtTime(40, t + 0.12); v.g.setValueAtTime(0.85, t); v.g.setTargetAtTime(0, t + 0.03, 0.06); }
      if (s & 1) hissM(t, 9000, 8000, 0.03, 0.06, 3, 0.001);
      if (s === 4 || s === 12) hissM(t, 1600, 900, 0.14, 0.22, 0.8, 0.002);
      { const v = bassV.shift(); bassV.push(v); env(v, t, 73.42 * pow(2, BASS[s] / 12), 0.3, e8 * 0.55); }
      if (MUSICT > 1.12) { const v = arpV.shift(); arpV.push(v); env(v, t, 293.66 * pow(2, ARP[mStep & 7] / 12), 0.045, e8 * 0.4); }
      mNext += e8; mStep++;
    }
  };
  const NOTES = [0, 2, 5, 7, 9, 12, 14, 17, 19]; // D major pentatonic, in semitones above A4
  let lt = ac.currentTime, tB = lt + 1.5, tC = lt + 5, tW = lt + 12, lx = F[CX], ly = F[CY], lz = F[CZ];
  out.gain.setTargetAtTime(VOL, lt, 1);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    musicTick(now);
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 60) v = 0; // ignore jumps to a viewpoint
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    rush.gain.setTargetAtTime(0.5 * pow(min(v / 26, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(220 + v * 14, t, 0.3);
    const s = clamp(1 + ly / 30, 0, 1); wash.gain.setTargetAtTime(0.25 + 0.55 * s * s, t, 0.5);
    if (REEL) for (tR = max(tR, t); tR < t + 0.1; tR += 0.042) play(tick, tR, 2100, 1700, 0.012, 0.04, 0.001); // reel ratchet
    if (t > tB) { // a burst of 1-6 bubbles: short rising blips, smaller bubbles higher and shorter
      let tt = t;
      for (let n = 1 + rnd() * rnd() * 6 | 0; n--;) { const f = rr(380, 1300); play(bub, tt, f, f * rr(1.4, 2.2), 0.05 + 40 / f, rr(0.03, 0.08), 0.006); tt += rr(0.07, 0.2); }
      tB = tt + rr(0.5, 5);
    }
    if (t > tC) { const f = 440 * pow(2, NOTES[rnd() * 9 | 0] / 12); play(chime, t, f, f, 5, rr(0.02, 0.04), 0.03); tC = t + rr(2.5, 9); }
    if (t > tW) { // a phrase of 2-3 slow glides
      let tt = t;
      for (let n = 2 + rnd() * 2 | 0; n--;) { const f = rr(170, 380), d = rr(1.6, 3.2); play(whale, tt, f, f * rr(0.6, 1.7), d, 0.08, d * 0.4); tt += d * 0.8; }
      tW = tt + rr(20, 50);
    }
  };
}
// called on every click / key / touch: builds the graph once and resumes it when the browser allows
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { muted = !muted; OUT.gain.setTargetAtTime(muted ? 0 : VOL, AC.currentTime, 0.08); };
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
