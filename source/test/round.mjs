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
await c.goto(new URL('../../dev.html', import.meta.url).href + '?lb=' + (LB ? encodeURIComponent(LB) : 'off')); // never the real board
await c.waitFor('window.TT && TT.ready && TT.arc && document.body.className !== "l"');
await c.ev('localStorage.removeItem("spearo.scores.tofino-trip"); localStorage.removeItem("spearo.name")');
const Q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

// ---- home: just Start and the options button; options has the detail level and the controls
check(await c.ev(`!document.getElementById("loc") && getComputedStyle(${Q('#d')}).display !== "none" && TT.arc.state().scr === "home"`), 'home screen: Start, no location row');
await c.ev(`${Q('#ob')}.click()`); await c.sleep(150);
check(await c.ev(`!${Q('#opt')}.hidden && ${Q('#opt #q')}.textContent.includes("Detail") && ${Q('#opt #k')}.textContent.includes("Fire")`), 'options popup: detail level and controls');
await snap('0a-options');
await c.tap('Escape'); await c.sleep(100);
check(await c.ev(`${Q('#opt')}.hidden && document.body.className === "m"`), 'Esc closes the options');
// ---- Start > trip picker (a card per location, its Top 10 popup) > Player 1's name > dive picker
await c.ev(`${Q('#d')}.click()`);
check(await until('TT.arc.state().scr === "trips" && document.querySelectorAll("#tripc .tcard .go").length === 1', 3000), 'Start opens the trip picker: one trip card');
check(await c.ev(`${Q('#tripc .tcard canvas')}.width > 0 && !${Q('#tripc .hs')} && !!${Q('#tripc .under .top')}`), 'the card has a photo; Top 10 sits under it, no hi-score line');
await c.sleep(300); await snap('0b-trips');
await c.ev(`${Q('#tripc .top')}.click()`); await c.sleep(200);
check(await c.ev('!document.getElementById("pop").hidden && document.getElementById("popl").textContent.includes("No scores yet")'), 'Top 10 opens the leaderboard popup');
await c.tap('Escape'); await c.sleep(100);
check(await c.ev('document.getElementById("pop").hidden && TT.arc.state().scr === "trips"'), 'Esc closes the popup, trip picker still up');
await c.ev(`${Q('#tripc .go')}.click()`);
check(await until('TT.arc.state().ini && TT.arc.state().scr === "name"', 3000), 'picking a trip asks for Player 1\'s name');
await c.sleep(200);
for (const k of ['KeyZ', 'KeyE', 'Digit5', 'KeyD', 'KeyM']) { await c.tap(k); await c.sleep(60); }
check(await c.ev('document.getElementById("nm").value') === 'ZEDM', 'typing fills the name box, letters only (M does not mute)');
await snap('0c-player');
await c.tap('Enter');
check(await until('TT.arc.state().scr === "dives" && TT.arc.trip().on && TT.arc.state().phase === "idle"', 3000), 'Enter goes to the dive picker');
check(await c.ev('localStorage.getItem("spearo.name")') === 'ZEDM', 'the name is kept');
check(await c.ev('document.querySelectorAll("#divec .dcard:not(.done)").length === 3 && document.querySelector("#divec .tslot").className === "tslot"'), 'three dives to pick and an empty trophy slot');
await c.sleep(300); await snap('0d-dives');
await c.ev('document.querySelectorAll("#divec .dcard")[2].click()');
check(await until('TT.arc.state().phase === "descent" && !TT.arc.state().menu && TT.arc.trip().cur === 2', 3000), 'clicking a dive card starts that dive');
await c.sleep(1500); await snap('0e-site3');
// ---- Esc pauses on the home screen: Resume, and Quit trip (asks twice, then the trip is gone)
await c.tap('Escape');
check(await until('TT.arc.state().menu && TT.arc.state().scr === "home"', 2000) && await c.ev('document.getElementById("d").textContent === "Resume" && !document.getElementById("quit").hidden'), 'Esc pauses: Resume and Quit trip');
await c.sleep(600); await snap('0f-paused');
await c.ev('document.getElementById("d").click()');
check(await until('!TT.arc.state().menu && TT.arc.state().phase === "descent"', 2000), 'Resume goes back to the dive');
await c.tap('Escape'); await c.sleep(100);
await c.ev('document.getElementById("quit").click()');
check((await c.ev('TT.arc.trip().on')) === 1 && /again/i.test(await c.ev('document.getElementById("quit").textContent')), 'Quit trip asks first');
await c.ev('document.getElementById("quit").click()');
check(await c.ev('!TT.arc.trip().on && TT.arc.state().scr === "home" && TT.arc.state().phase === "idle" && document.getElementById("d").textContent === "Start" && document.getElementById("quit").hidden'), 'the second click ends the trip: home with Start');

// ---- run 1
// a fresh trip with the trophy on this dive, and exactly this seed
await c.ev(`TT.arc.go(${seed}); TT.arc.speed(1.5)`);
check((await st()).phase === 'descent', 'round starts with the descent');
check((await st()).trophyIn, 'the trophy is in this dive\'s script');
await snap('1-descent');
check(await until('TT.arc.state().phase === "bottom"', 15000), 'reaches the bottom');
// run 1 tests shots, not the air: keep it topped up (run 2 lets it run out)
await c.ev('window.__tf = false; setInterval(() => { if (TT.arc.state().stamp === "TROPHY FISH!") window.__tf = true; }, 50); window.__ling = null; setInterval(() => { const f = TT.arc.fish().find((f) => f.s === 1 && f.st !== "off"); if (f && window.__ling == null) window.__ling = f.d; }, 50)');
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
{ const torn = await until(`TT.arc.fish().filter((f) => f.wound).length > ${before}`, 5000), q = await st();
  check(torn, 'tail shot tears off: a wounded fish' + (torn ? '' : ` (state: ${JSON.stringify({ gun: q.gun, end: q.end, sp: q.spFish, sp2: q.spFish2, rows: q.rows.map((r) => r.outcome + ' ' + r.zone) })})`)); }
await c.sleep(200); await snap('4-tore-off');
await c.ev('TT.arc.rig(null)');
check(await until('TT.arc.state().rows.some((r) => r.outcome === "GOT AWAY")', 15000), 'the wounded fish gets away (its points cut by 100)');
check(await c.ev('TT.arc.state().rows.find((r) => r.outcome === "GOT AWAY").pts >= 50'), 'a fish that got away still pays at least 50');

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

// a double: two rockfish lined up 20 cm apart, the spear goes through the near one into the far one
check(await until('TT.arc.state().gun === "LOADED"', 8000), 'gun reloaded for the double');
{
  await c.ev('TT.arc.hold(1); TT.arc.mouse(0.5, 0.45)'); await c.sleep(100);
  const [x, y, z, ax, ay, az] = await c.ev('TT.arc.eye()'), a = await c.ev('TT.arc.spawn(0)'), b = await c.ev(`TT.arc.spawn(0, ${a})`);
  check(a >= 0 && b >= 0, 'two free rockfish for the double');
  await c.ev(`TT.arc.put(${a}, ${x + ax * 3}, ${y + ay * 3}, ${z + az * 3}, 0); TT.arc.put(${b}, ${x + ax * 3.22}, ${y + ay * 3.22}, ${z + az * 3.22}, 0)`);
  await c.sleep(100);
  const d0 = (await st()).doubles;
  check(await c.ev(`TT.arc.aim(${a}, 0.3)`) === a, 'the near rockfish is in the line of fire');
  await c.ev('TT.arc.rig({ hold: true }); TT.arc.fire()');
  await until('TT.arc.state().stopped > 0', 3000);
  const s = await st();
  check(s.spFish === a && s.spFish2 === b && s.doubles === d0 + 1, `both rockfish on one spear: a double (${s.spFish}, ${s.spFish2})`);
  await c.sleep(300); await snap('4b-double');
  await c.ev('TT.arc.hold(0)');
  check(await until('TT.arc.state().gun === "RELOADING" || TT.arc.state().gun === "LOADED"', 8000), 'both reeled in');
  await c.ev('TT.arc.rig(null)');
}

// the lingcod's first entrance is out of the kelp ahead
check(await until('window.__ling != null', 30000), 'the lingcod showed up');
check(await c.ev('window.__ling') > 9, `it came out of the kelp ahead (first seen ${(await c.ev('window.__ling')).toFixed(1)} m out)`);

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
log('score', s1.score, s1.rows.map((r) => `${r.n} ${r.inch}in ${r.outcome} ${r.zone}@${r.frac.toFixed(2)} ${r.pts}`).join(' | '));
check(await until('TT.arc.state().board', 15000) && (await st()).again === 'Next dive' && (await st()).mode === 'dive', 'dive results end with Next dive');
check(await c.ev('document.getElementById("lb").children.length === 0 && document.getElementById("th").textContent === "Kelp Forest" && /Dive 1 of 3/.test(document.getElementById("why").textContent)'), 'no board yet; titled with the site and "Dive 1 of 3"');
check(await c.ev('window.__tf') === true, 'TROPHY FISH! flashed when the lingcod came in');
await snap('6-tally');

// ---- back to the dive picker: the first dive is done, the trophy slot shows the lingcod or Missed
await c.ev('clearInterval(window.__air); TT.arc.endless(0); document.getElementById("again").click()');
check(await until('TT.arc.state().scr === "dives" && TT.arc.state().menu', 3000), 'Next dive goes back to the dive picker');
const got = s1.rows.some((r) => r.s === 1 && r.outcome !== 'GOT AWAY');
check(await c.ev('document.querySelectorAll("#divec .dcard")[0].className === "dcard done" && document.querySelectorAll("#divec .dcard:not(.done)").length === 2'), 'the dived site is ticked off');
check((await c.ev('document.querySelectorAll("#divec .dcard")[0].textContent')).includes(s1.score + ' pts'), 'its score is on the card');
check(await c.ev('document.querySelector("#divec .tslot").className') === (got ? 'tslot got' : 'tslot miss'), `trophy slot: ${got ? 'landed' : 'Missed'}`);
await c.sleep(300); await snap('7-dives');

// ---- dive 2 (picked out of order: the third site): no shots, air runs out; no trophy on this one
await c.ev('document.querySelectorAll("#divec .dcard")[2].click()');
check(await until('TT.arc.state().phase === "descent"', 3000), 'the third site\'s dive starts');
await c.ev('TT.arc.speed(6)');
check(!(await st()).trophyIn, 'no trophy on a second dive');
check(await c.ev('document.getElementById("sc").textContent') === '0', 'the dive\'s score counter starts at 0, not the trip total');
check(await until('TT.arc.state().end', 40000) && (await st()).end === 'air', 'without shots the air runs out (SURFACE!)');
const s2 = await st(); log('dive 2 ended by', s2.end, '· curious approaches', s2.curious);
check(s2.curious > 0, 'undisturbed rockfish come in for a curious look');
check(await until('TT.arc.state().phase === "tally" && TT.arc.state().board', 30000) && (await st()).again === 'Next dive', 'second dive results');
// ---- dive 3, then the trip's results and the board
await c.ev('document.getElementById("again").click()');
check(await until('TT.arc.state().scr === "dives" && document.querySelectorAll("#divec .dcard:not(.done)").length === 1', 3000), 'one dive left');
await c.ev('document.querySelector("#divec .dcard:not(.done)").click()'); await c.ev('TT.arc.speed(6)');
check(await until('TT.arc.state().phase === "tally" && TT.arc.state().board', 60000) && (await st()).again === 'Trip results', 'third dive results end with Trip results');
const trip = await c.ev('TT.arc.trip()'); log('trip', JSON.stringify(trip));
check(trip.left === 0 && trip.total === s1.score + trip.scores[1] + trip.scores[2] && trip.order.join() === '0,2,1', 'the trip adds up its three dives, in the order dived');
await c.ev('document.getElementById("again").click()');
await c.sleep(900);
check(await c.ev('getComputedStyle(document.getElementById("again")).display === "none" && document.getElementById("tally").classList.contains("cnt") && document.querySelector("#tally .tc").getBoundingClientRect().width < 2'), 'while the rows count: no button, no stats column');
{ const r = await c.ev('JSON.stringify(document.getElementById("rows").getBoundingClientRect())'), x = JSON.parse(r); check(Math.abs(x.left + x.width / 2 - 480) < 12, 'the rows are centred while they count'); }
await snap('8a-counting');
check(await until('TT.arc.state().mode === "trip" && TT.arc.state().board', 20000), 'trip results with the board');
await c.sleep(1000);
check(await c.ev('document.getElementById("rows").getBoundingClientRect().right < 480 && !document.getElementById("tally").classList.contains("cnt")'), 'then they slide left and the stats come in');
check(await c.ev('document.getElementById("th").textContent === "Trip over" && document.querySelectorAll("#rows .row").length === 4'), 'a row per dive and one for the trophy');
check(await until(`document.getElementById("tsc").textContent === "${trip.total}"`, 5000), 'the total is the trip score');
check((await c.ev('document.querySelector("#rows .row:last-child b").textContent')).length > 0, 'the trophy row shows its points (0 if missed)');
{ const o = await c.ev('document.querySelector("#rows .row:last-child .o").textContent'), pts = await c.ev('document.querySelector("#rows .row:last-child b").textContent');
  log('trophy row:', o, pts);
  check(o === 'LANDED' || (pts === '0' ? o === 'TROPHY MISSED' : o === 'BROKE OFF'), 'the trophy row says landed, missed (0 pts) or broke off (some pts)'); }
check(await c.ev('document.querySelectorAll("#stats p").length === 8 && document.getElementById("again").textContent === "Play again"'), 'trip stats and Play again');
if (trip.total > 0) {
  const lb = await c.ev('JSON.parse(localStorage.getItem("spearo.scores.tofino-trip"))');
  check(lb && lb.some((e) => e.i === 'TST' && e.s === trip.total && e.r === seed), 'trip total posted automatically under TST with the trip seed');
  if (LB) {
    const w = await (await fetch(LB + '/scores?loc=tofino-trip')).json();
    check(w.top.some((e) => e.name === 'TST' && e.score === trip.total && e.seed === seed), 'trip total is on the world board (server)');
    check(/World top 10/.test(await c.ev('document.getElementById("lbt").textContent')), 'results show the world board');
  }
}
await c.sleep(600); await snap('8-trip');
// ---- Play again: back to the trip picker; the name screen is filled with the last name
await c.ev('document.getElementById("again").click()');
check(await until('TT.arc.state().scr === "trips" && !TT.arc.trip().on', 3000), 'Play again goes to the trip picker');
await c.ev('document.querySelector("#tripc .go").click()');
check(await until('TT.arc.state().ini', 3000) && await c.ev('document.getElementById("nm").value') === 'ZEDM', 'the last name typed is filled in');

const errs = c.logs.filter((l) => /^(error|EXC)/.test(l));
check(errs.length === 0, 'no page errors' + (errs.length ? ':\n' + errs.join('\n') : ''));
await c.close();
log(fails.length ? `${fails.length} FAILED` : 'all passed');
process.exit(fails.length ? 1 : 0);
