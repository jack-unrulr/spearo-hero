// ============================================================================
// voice: the announcer. A line at the big moments only, never two close together.
// ============================================================================
// VLINES (voice/lines.json: the script and its rules) and VCLIPS (voice/<event>-<n>.mp3 as data URLs) are put in by
// build.mjs. A take with a clip plays it through the sound graph, under the master volume and mute; a take without one
// is spoken by the browser as a stand-in, so the timing can be tried before any clips exist.
// The rules: a line plays with its event's odds (`first`: the odds the first time in a dive); `once` lines play once
// per dive / trip / session; while one speaks only a higher `pri` cuts in; after it, VGAP s of quiet, which only
// pri 4+ (trophy, wrong fish) may break. The hunt music ducks while it talks. Math.random, not rng(): the game's
// seeded randomness stays untouched.
let VOICE = (() => { try { return localStorage.spearoVoice !== '0'; } catch { return true; } })();
var DUCK = 0; // audio.js: the hunt music dips while the announcer talks
const VO = { g: null, end: 0, pri: 0, last: {}, done: { session: {}, trip: {}, dive: {} }, n: {}, src: null, bufs: {}, gen: 0, log: [] };
const VGAP = 1.5, VGAIN = 1.6; // VGAIN: the clips' level over the rest of the mix
const vNow = () => performance.now() / 1000;
const vText = (s) => s.replace(/\[[^\]]*\]\s*/g, '').trim();
let vMan; // the stand-in's voice: an Australian male one when the browser has one, else an American one
function vPickVoice() {
  if (!window.speechSynthesis) return null;
  const all = speechSynthesis.getVoices(), vs = all.filter((v) => /^en[-_]US/i.test(v.lang));
  const au = all.find((v) => /^en[-_]AU/i.test(v.lang) && /Lee|Gordon|William|James|Male/.test(v.name)); if (au) return au;
  for (const p of ['Fred', 'Ralph', 'Aaron', 'Evan', 'Nathan', 'Alex', 'Tom', 'Microsoft Guy', 'Microsoft David', 'Google US English']) {
    const v = vs.find((v) => v.name.includes(p)); if (v) return v;
  }
  return vs[0] || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { vMan = vPickVoice(); };
const voiceDive = () => { VO.done.dive = {}; VO.n = {}; }; // a new dive: once-per-dive lines and first-time odds start over
const voiceTrip = () => { VO.done.trip = {}; };
function vStop() {
  VO.gen++; VO.end = 0; DUCK = 0;
  if (VO.src) { try { VO.src.stop(); } catch {} VO.src = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
}
const vDone = (g) => { if (g !== VO.gen) return; VO.end = vNow(); DUCK = 0; VO.src = null; };
// every clip decoded once the sound graph exists, so the first one plays without a wait
function voicePreload() { if (AC) for (const id in VCLIPS) vBuf(id); }
const vBuf = (id) => VO.bufs[id] ||= fetch(VCLIPS[id]).then((r) => r.arrayBuffer()).then((b) => AC.decodeAudioData(b)).catch(() => null);
// ev: an event in VLINES; delay: s to wait before speaking (the odds and the rules are checked now)
function voice(ev, delay = 0) {
  const L = VLINES[ev]; if (!L || !VOICE || muted) return false;
  const seen = VO.n[ev] || 0; VO.n[ev] = seen + 1;
  const scope = L.once && VO.done[L.once];
  if (scope && scope[ev]) return false;
  if (Math.random() >= (seen === 0 && L.first !== undefined ? L.first : L.p ?? 1)) return false;
  const now = vNow() + delay, pri = L.pri || 1, talking = now < VO.end;
  if (talking ? pri <= VO.pri : now < VO.end + VGAP && pri < 4) return false;
  const k = L.lines.length; let i = Math.random() * k | 0; if (k > 1 && i === VO.last[ev]) i = (i + 1) % k;
  VO.last[ev] = i; if (scope) scope[ev] = 1;
  const id = `${ev}-${i + 1}`, text = vText(L.lines[i]);
  VO.pri = pri; VO.end = now + 0.6 + text.length * 0.065; // a guess until it really ends
  VO.log.push(id);
  const g = ++VO.gen;
  setTimeout(() => vSay(g, id, text), delay * 1000);
  return true;
}
async function vSay(g, id, text) {
  if (g !== VO.gen) return;
  if (VO.src) { try { VO.src.stop(); } catch {} VO.src = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  DUCK = 1;
  if (VCLIPS[id] && AC) {
    const b = await vBuf(id); if (g !== VO.gen) return;
    if (b) {
      const s = VO.src = new AudioBufferSourceNode(AC, { buffer: b }); if (!VO.g) { VO.g = new GainNode(AC, { gain: VGAIN }); VO.g.connect(OUT); } s.connect(VO.g); s.onended = () => vDone(g); s.start();
      VO.end = vNow() + b.duration; VO.log.push('clip ' + id); return;
    }
  }
  if (!window.speechSynthesis) return vDone(g);
  const u = new SpeechSynthesisUtterance(text); vMan ||= vPickVoice();
  if (vMan) u.voice = vMan;
  u.lang = vMan ? vMan.lang : 'en-US'; u.pitch = 0.75; u.rate = 1.05; u.onend = u.onerror = () => vDone(g);
  speechSynthesis.speak(u);
}
// the options' Voice switch
function setVoice(on) { VOICE = on; try { localStorage.spearoVoice = on ? '1' : '0'; } catch {} if (!on) vStop(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) vStop(); });
// the options' Voice switch: the lit button is the current setting
{ const vb = $('vo').querySelectorAll('button'), lit = () => vb.forEach((b, i) => { b.className = (i === 0) === VOICE ? 'on' : ''; });
  vb.forEach((b, i) => { b.onclick = () => { setVoice(i === 0); lit(); }; }); lit(); }
