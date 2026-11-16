// A seeded arcade round from start to finish, driven through the dev.html test hooks (TT.arc in devgame.js).
//   node test/round.mjs [seed] [shots dir]
// Run 1: descent, then shots at rockfish in each hit zone (head = stoned, body held, tail torn off), a wait for the
// torn-off fish to get away or be shot again, then a surfperch, which must end the round; tally and initials.
// Run 2: the same seed, no shots: the air runs out, the tally shows "Out of air". Fails on any page error.
import { launch } from './cdp.mjs';
import path from 'node:path';
const seed = +(process.argv[2] || 42), shots = process.argv[3];
const c = await launch({ width: 960, height: 540 });
const fails = [], log = (...a) => console.log(...a);
const check = (ok, what) => { log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const st = () => c.ev('TT.arc.state()'), fish = () => c.ev('TT.arc.fish()');
const until = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await c.ev(expr)) return true; await c.sleep(50); } return false; };
const snap = async (name) => { if (shots) await c.shot(path.join(shots, name + '.jpg'), { jpeg: true }); };

// LB=<url> runs against a leaderboard server (e.g. `npm run dev` in server/ -> http://localhost:8787)
const LB = process.env.LB || '';
await c.goto(new URL('../../dev.html', import.meta.url).href + (LB ? '?lb=' + encodeURIComponent(LB) : ''));
await c.waitFor('window.TT && TT.ready && TT.arc && document.body.className !== "l"');
await c.ev('localStorage.removeItem("spearo.scores.tofino")');

// ---- run 1
await c.ev(`TT.arc.go(${seed}); TT.arc.speed(1.5)`);
check((await st()).phase === 'descent', 'round starts with the descent');
await snap('1-descent');
check(await until('TT.arc.state().phase === "bottom"', 15000), 'reaches the bottom');
// run 1 tests shots, not the air: keep it topped up (run 2 lets it run out)
await c.ev('window.__air = setInterval(() => { const s = TT.arc.state(); if (s.phase === "bottom" && !s.end) TT.arc.air(30); }, 300); TT.arc.endless(1)');
await c.sleep(300); await snap('2-bottom');

// shoot a visible, unobstructed rockfish at `frac` along its body; returns the outcome row or null
async function shoot(frac, rig, species = [0, 1]) {
  for (let tries = 0; tries < 400; tries++) {
    const s = await st(); if (s.phase !== 'bottom' || s.end) return null;
    if (s.gun !== 'LOADED') { await c.sleep(60); continue; }
    await c.ev('TT.arc.air(30)'); // the test takes its time finding clear shots: keep the air topped up
    const cand = (await fish()).filter((f) => species.includes(f.s) && f.vis && ['calm', 'curious'].includes(f.st) && f.d < 7.6);
    let done = false;
    for (const f of cand) {
      await c.ev('TT.arc.hold(1)');
      const hit = await c.ev(`TT.arc.aim(${f.i}, ${frac})`);
      if (hit === f.i) {
        await c.ev(`TT.arc.rig(${JSON.stringify(rig)}); TT.arc.fire()`);
        await until('TT.arc.state().stopped > 0', 3000);
        await c.ev('TT.arc.hold(0)');
        done = true; break;
      }
      await c.ev('TT.arc.hold(0)');
    }
    if (done) return true;
    await c.sleep(120);
  }
  return null;
}
const rowsN = async () => (await st()).rows.length;
const lastRow = async () => { const r = (await st()).rows; return r[r.length - 1]; };

// head: stoned
let n0 = await rowsN();
check(await shoot(0.33, null), 'found a clear head shot');
check(await until(`TT.arc.state().rows.length > ${n0}`, 3000) && (await lastRow()).outcome === 'STONED', 'head shot stones the rockfish (+points at once)');
await c.sleep(150); await snap('3-stoned');
check(await until('TT.arc.state().gun === "LOADED"', 8000), 'reel and reload come back to LOADED');

// body, rigged to hold: landed with points
n0 = await rowsN();
check(await shoot(0.0, { hold: true }), 'found a clear body shot');
check(await until(`TT.arc.state().rows.length > ${n0}`, 6000) && (await lastRow()).outcome === 'BODY SHOT', 'body shot that holds is landed');
check(await until('TT.arc.state().gun === "LOADED"', 8000), 'gun reloaded');

// tail, rigged to tear: the fish tears off wounded, then gets away (or is shot again)
const before = (await fish()).filter((f) => f.wound).length;
check(await shoot(-0.33, { hold: false }), 'found a clear tail shot');
check(await until(`TT.arc.fish().filter((f) => f.wound).length > ${before}`, 5000), 'tail shot tears off: a wounded fish');
await c.sleep(200); await snap('4-tore-off');
await c.ev('TT.arc.rig(null)');
check(await until('TT.arc.state().rows.some((r) => r.outcome === "GOT AWAY")', 15000), 'the wounded fish gets away and costs points');

// scare and return: after the shots the alarm is up; it decays, and the rockfish keep coming
const alarm = (await st()).alarm;
check(alarm >= 0 && alarm <= 1, `alarm level in range (${alarm.toFixed(2)})`);
const startled = (await fish()).filter((f) => f.spooks > 0).length;
check(startled > 0, `shots startled nearby fish (${startled})`);

// fish come back: surfperch snap back to their spot, startled rockfish calm down or return once the alarm decays
check(await until('TT.arc.state().back[2] > 0', 10000), 'a startled surfperch went back to its spot');
if (await until('TT.arc.fish().some((f) => f.s < 2 && f.spooks > 0 && !f.wound)', 8000))
  check(await until('TT.arc.state().back[0] + TT.arc.state().back[1] > 0', 20000), 'a startled rockfish calmed down or came back');
else log('--   no rockfish was spooked by these shots (only the wounded one): return not checked for this seed');

// a surfperch ends the round
check(await until('TT.arc.state().gun === "LOADED"', 8000), 'gun reloaded');
check(await shoot(0.0, null, [2]), 'found a clear surfperch');
check(await until('TT.arc.state().end === "protected"', 3000), 'surfperch hit ends the round');
check((await st()).stamp === 'WRONG FISH!', 'WRONG FISH! stamp');
await c.sleep(200); await snap('5-protected');
check(await until('TT.arc.state().phase === "tally"', 15000), 'ascent, then the tally');
const s1 = await st();
check(s1.rows.some((r) => r.outcome === 'WRONG FISH' && r.pts < 0), 'tally has the surfperch penalty');
check(await until(`TT.arc.state().tallyRows === ${s1.rows.length}`, 8000), 'one tally row with a silhouette per fish');
check(await until('document.querySelectorAll("#stats p").length === 8 && document.getElementById("verdict").textContent.length > 0', 8000), 'end stats and verdict shown');
const acc = await c.ev('document.querySelector("#stats p:nth-child(2) b").textContent'); log('accuracy', acc, '·', await c.ev('document.getElementById("verdict").textContent'));
log('score', s1.score, s1.rows.map((r) => `${r.n} ${r.cm}cm ${r.outcome} ${r.zone}@${r.frac.toFixed(2)} ${r.pts}`).join(' | '));
if (s1.score > 0) {
  check(await until('TT.arc.state().ini', 15000), 'asks for initials');
  for (const k of ['KeyT', 'KeyS', 'KeyT', 'Enter']) { await c.tap(k); await c.sleep(80); }
  check(await until('TT.arc.state().board', 3000), 'leaderboard shown');
  const lb = await c.ev('JSON.parse(localStorage.getItem("spearo.scores.tofino"))');
  check(lb && lb[0].i === 'TST' && lb[0].s === s1.score && lb[0].r === seed, 'score saved under TST with the round seed');
  if (LB) {
    const w = await (await fetch(LB + '/scores?loc=tofino')).json();
    check(w.top.some((e) => e.name === 'TST' && e.score === s1.score && e.seed === seed), 'score is on the world board (server)');
    check(/World top 10/.test(await c.ev('document.getElementById("lbt").textContent')), 'tally shows the world board');
  }
} else check(await until('TT.arc.state().board', 15000), 'leaderboard shown (score not high enough)');
await snap('6-tally');

// ---- run 2: no shots, air runs out
await c.ev('clearInterval(window.__air); TT.arc.endless(0)');
await c.ev(`TT.arc.go(${seed}); TT.arc.speed(6)`);
check(await until('TT.arc.state().end', 40000) && (await st()).end === 'air', 'without shots the air runs out (SURFACE!)');
const s2 = await st(); log('run 2 ended by', s2.end, '· curious approaches', s2.curious);
check(s2.curious > 0, 'undisturbed rockfish come in for a curious look');
check(await until('TT.arc.state().phase === "tally"', 20000), 'second tally');
check(await until('TT.arc.state().board', 15000), 'leaderboard after a scoreless round');

const errs = c.logs.filter((l) => /^(error|EXC)/.test(l));
check(errs.length === 0, 'no page errors' + (errs.length ? ':\n' + errs.join('\n') : ''));
await c.close();
log(fails.length ? `${fails.length} FAILED` : 'all passed');
process.exit(fails.length ? 1 : 0);
