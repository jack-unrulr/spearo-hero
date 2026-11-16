// Auditions for the announcer, in voice/audition/ (kept out of git), each heard raw, punch and arena (fx.mjs).
//   node voice/audition.mjs voices           design candidate voices (ElevenLabs Voice Design, 3 per description),
//                                            each reading the same sample; writes audition/voices.html
//   node voice/audition.mjs shootout D1 A1 …  save those designed voices, then each reads the same few game lines in
//                                            3 takes, so their accents can be compared; writes audition/shootout.html
//   node voice/audition.mjs takes B2 [n] [event…]   save designed voice B2 to the account (once), then n takes
//                                            (default 4) of every line in lines.json, or only those events' lines;
//                                            writes audition/index.html to pick from
//   node voice/audition.mjs apply 'wrong-1: t3, …'   the picked takes (added to earlier picks; a line never picked
//                                            keeps take 1), through the
//                                            arena chain, become the game's clips voice/<event>-<n>.mp3
// The key comes from voice/.elevenlabs-key or ELEVENLABS_API_KEY.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fx, FX } from './fx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), AUD = path.join(here, 'audition');
const kf = path.join(here, '.elevenlabs-key');
const KEY = process.env.ELEVENLABS_API_KEY || (existsSync(kf) ? readFileSync(kf, 'utf8').trim() : '');
if (!KEY) { console.error('No key: set ELEVENLABS_API_KEY or put it in voice/.elevenlabs-key'); process.exit(1); }
const api = async (p, body, q = '') => {
  let r;
  for (let k = 0; k < 6; k++) { // busy (429: Starter runs 3 at once): wait and try again
    r = await fetch(`https://api.elevenlabs.io${p}${q}`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status !== 429) break; await new Promise((ok) => setTimeout(ok, 1500 * (k + 1)));
  }
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r;
};

const DESIGNS = {
  A: 'Booming American rodeo announcer, male, in his 50s, with a warm Texas drawl. A huge, projecting voice that fills an arena, '
    + 'theatrical and folksy, hyping up every ride. Consistent Southern American accent. Close, clean microphone.',
  B: 'Gravelly old American cowboy in his 60s with a thick Texas drawl, colorful and funny, hollering with excitement like he is '
    + 'calling a bull ride. Consistent Southern American accent. Close, clean microphone.',
  C: 'High-energy American monster truck and rodeo arena announcer, male, in his 40s, with a slight Western twang. Loud, punchy, '
    + 'larger-than-life hype voice. Consistent American accent. Close, clean microphone.',
  D: 'Goofy, excitable American cowboy cartoon character, male, in his 30s, with a strong Southern drawl. Loud and hammy with big '
    + 'comic reactions. Consistent Southern American accent. Close, clean microphone.',
};
const SAMPLE = "Spearo Hero! Alright partner, go get 'em! Well lookee there... the trophy fish! YEE-HAW, you got a HOG! WRONG FISH! "
  + "That's a perch, cowboy! Aw shucks, it broke off. NEW HIGH SCORE!";

async function voices() {
  const dir = path.join(AUD, 'voices'); mkdirSync(dir, { recursive: true });
  const items = [];
  for (const [d, desc] of Object.entries(DESIGNS)) {
    process.stdout.write(`design ${d}… `);
    const j = await (await api('/v1/text-to-voice/design', { voice_description: desc, model_id: 'eleven_ttv_v3', text: SAMPLE, loudness: 0.8, guidance_scale: 4 }, '?output_format=mp3_44100_128')).json();
    j.previews.forEach((p, k) => {
      const id = `${d}${k + 1}`, src = path.join(dir, `${id}-src.mp3`); writeFileSync(src, Buffer.from(p.audio_base_64, 'base64'));
      const files = {}; for (const f of FX) files[f] = path.relative(AUD, fx(src, path.join(dir, `${id}-${f}.mp3`), f));
      items.push({ id, group: 'voice', title: `Voice ${id}`, sub: desc, gen: p.generated_voice_id, files });
    });
    console.log(`${j.previews.length} voices`);
  }
  writeFileSync(path.join(AUD, 'voices.json'), JSON.stringify({ sample: SAMPLE, items }, null, 1));
  page('voices.html', 'Pick a voice', `Every voice reads the same lines. Play each one Raw, Punch and Arena (all at the same loudness), then pick the one that sounds most like an arcade announcer.`, items);
}

// the audition page: a card per take with Raw / Punch / Arena buttons and a Pick button (one pick per group); the
// picks are kept in this browser and shown at the bottom, ready to copy back to Claude
function page(file, title, intro, items) {
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Announcer auditions</title>
<style>
:root{--bg:#06141c;--card:#0c2230;--line:#1d4356;--ink:#e8fbff;--dim:#8fb6c4;--acc:#ffe24a;--on:#19c3d6;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 120px}
h1{margin:0 0 6px;font-size:28px;color:var(--acc)} p.i{color:var(--dim);margin:0 0 18px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:26px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.c{background:var(--card);border:2px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:8px}
.c.pk{border-color:var(--acc);box-shadow:0 0 0 2px #ffe24a33}
.c b{font-size:17px} .c small{color:var(--dim);display:block;max-height:4.4em;overflow:auto}
.r{display:flex;gap:6px;flex-wrap:wrap}
button{font:600 14px system-ui;border:0;border-radius:8px;padding:8px 12px;background:#163a4c;color:var(--ink);cursor:pointer}
button.pl{background:var(--on);color:#032;} button.p{margin-left:auto;background:#2a2a10;color:var(--acc)} .pk button.p{background:var(--acc);color:#221}
footer{position:fixed;left:0;right:0;bottom:0;background:#031018ee;border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center}
footer code{flex:1;overflow:auto;white-space:nowrap;color:var(--acc)}
</style><main><h1>${title}</h1><p class=i>${intro}</p><div id=list></div></main>
<footer><span>Picks:</span><code id=out>none yet</code><button id=cp>Copy</button></footer>
<script>
const ITEMS=${JSON.stringify(items)}, KEY='aud:'+${JSON.stringify(title)};
let picks={}; try{picks=JSON.parse(localStorage[KEY]||'{}')}catch{}
const a=new Audio(); let cur=null;
const list=document.getElementById('list'), groups=[...new Set(ITEMS.map(i=>i.group))];
for(const g of groups){ if(groups.length>1){const h=document.createElement('h2');h.textContent=g;list.append(h);}
  const d=document.createElement('div');d.className='g';list.append(d);
  for(const it of ITEMS.filter(i=>i.group===g)){ const c=document.createElement('div');c.className='c';c.dataset.id=it.id;
    c.innerHTML='<b></b><small></small><div class=r></div>';c.querySelector('b').textContent=it.title;c.querySelector('small').textContent=it.sub||'';
    const r=c.querySelector('.r');
    for(const [k,f] of Object.entries(it.files)){const b=document.createElement('button');b.textContent=k[0].toUpperCase()+k.slice(1);
      b.onclick=()=>{ if(cur===b&&!a.paused){a.pause();return;} document.querySelectorAll('.pl').forEach(x=>x.classList.remove('pl')); a.src=f;a.play();cur=b;b.classList.add('pl');};r.append(b);}
    const p=document.createElement('button');p.className='p';p.textContent='Pick';p.onclick=()=>{picks[g]=picks[g]===it.id?undefined:it.id;save();};r.append(p);d.append(c);} }
a.onended=()=>document.querySelectorAll('.pl').forEach(x=>x.classList.remove('pl'));
function save(){ for(const k in picks) if(!picks[k]) delete picks[k]; try{localStorage[KEY]=JSON.stringify(picks)}catch{}
  document.querySelectorAll('.c').forEach(c=>c.classList.toggle('pk',Object.values(picks).includes(c.dataset.id)));
  const s=Object.entries(picks).map(([g,i])=>g+': '+i).join(', '); document.getElementById('out').textContent=s||'none yet'; }
document.getElementById('cp').onclick=()=>navigator.clipboard.writeText(document.getElementById('out').textContent);
save();
</script></html>`;
  writeFileSync(path.join(AUD, file), html);
  console.log('wrote', path.join(AUD, file));
}

// the picked designed voice, saved to the account once (audition/voice.json remembers it)
async function savedVoice(pick) {
  const vf = path.join(AUD, 'voice.json'), had = existsSync(vf) ? JSON.parse(readFileSync(vf, 'utf8')) : {};
  if (had[pick]) return had[pick];
  const it = JSON.parse(readFileSync(path.join(AUD, 'voices.json'), 'utf8')).items.find((i) => i.id === pick);
  if (!it) throw new Error(`no voice ${pick} in voices.json`);
  const j = await (await api('/v1/text-to-voice', { voice_name: `Spearo Hero announcer ${pick}`, voice_description: it.sub, generated_voice_id: it.gen })).json();
  had[pick] = j.voice_id; writeFileSync(vf, JSON.stringify(had, null, 1)); console.log(`saved voice ${pick} as ${j.voice_id}`);
  return j.voice_id;
}
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4'; // v4: steadier voice (and accent) than v3
const LINES = () => Object.entries(JSON.parse(readFileSync(path.join(here, 'lines.json'), 'utf8'))).filter(([k]) => k !== '_')
  .flatMap(([ev, e]) => e.lines.map((text, i) => ({ id: `${ev}-${i + 1}`, text, level: e.level || 0 })));
async function takes(pick, n = 4, only = []) {
  const voice = await savedVoice(pick), dir = path.join(AUD, 'takes'); mkdirSync(dir, { recursive: true });
  const jobs = LINES().filter((l) => !only.length || only.includes(l.id.split('-')[0])).flatMap((l) => Array.from({ length: n }, (_, k) => ({ ...l, t: `t${k + 1}` })));
  let done = 0;
  const one = async (j) => {
    const src = path.join(dir, `${j.id}-${j.t}-src.mp3`);
    if (!existsSync(src)) {
      const r = await api(`/v1/text-to-speech/${voice}`, { text: j.text, model_id: MODEL, seed: Math.random() * 4e9 | 0 }, '?output_format=mp3_44100_128');
      writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    }
    for (const f of ['raw', 'arena']) fx(src, path.join(dir, `${j.id}-${j.t}-${f}.mp3`), f, { level: f === 'arena' ? j.level : 0 });
    process.stdout.write(`\r${++done}/${jobs.length} takes`);
  };
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map(one)); // 3 at a time: Starter's limit
  console.log('');
  const items = jobs.map((j) => ({ id: j.t, group: j.id, title: j.t, sub: j.text, files: { arena: `takes/${j.id}-${j.t}-arena.mp3`, raw: `takes/${j.id}-${j.t}-raw.mp3` } }));
  page('index.html', `Pick the takes · voice ${pick}`, `Every line in ${n} takes, arena first. Pick the best take of each line, and skip any that slip out of the accent. A line you don't pick keeps take 1.`, items);
}
const SHOOT = ['title-1', 'trophyIn-1', 'wrong-2', 'hog-1', 'trophyLanded-1', 'noShots-1'];
const tts = async (voice, text, out) => {
  if (existsSync(out)) return out;
  const r = await api(`/v1/text-to-speech/${voice}`, { text, model_id: MODEL, seed: Math.random() * 4e9 | 0 }, '?output_format=mp3_44100_128');
  writeFileSync(out, Buffer.from(await r.arrayBuffer())); return out;
};
async function shootout(picks) {
  const dir = path.join(AUD, 'shootout'); mkdirSync(dir, { recursive: true });
  const lines = LINES().filter((l) => SHOOT.includes(l.id)), jobs = [];
  for (const v of picks) { const id = await savedVoice(v); for (const l of lines) for (let k = 1; k <= 3; k++) jobs.push({ v, id, l, t: `t${k}` }); }
  let done = 0;
  const one = async (j) => {
    const base = path.join(dir, `${j.v}-${j.l.id}-${j.t}`);
    fx(await tts(j.id, j.l.text, `${base}-src.mp3`), `${base}-arena.mp3`, 'arena', { level: j.l.level });
    process.stdout.write(`\r${++done}/${jobs.length} takes`);
  };
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map(one));
  console.log('');
  const items = jobs.map((j) => ({ id: j.v, group: `Voice ${j.v}`, title: `${j.l.id} ${j.t}`, sub: j.l.text, files: { arena: `shootout/${j.v}-${j.l.id}-${j.t}-arena.mp3` } }));
  page('shootout.html', `Which voice holds up? · ${MODEL}`, `Each voice reads the same lines, 3 takes each, the way the game will make them (${MODEL}, arena). Listen for the one whose accent and energy stay put from take to take.`, items);
}
// the picks ('wrong-1: t3, hog-2: t1') -> the game's clips, through the arena chain at game size
function apply(text) {
  const pf = path.join(AUD, 'picks.json'); // earlier picks are kept: send only the lines that changed
  const picks = { ...(existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}), ...Object.fromEntries([...String(text).matchAll(/([a-zA-Z]+-\d+):\s*(t\d+)/g)].map((m) => [m[1], m[2]])) };
  writeFileSync(pf, JSON.stringify(picks, null, 1));
  for (const f of readdirSync(here)) if (/^[a-zA-Z]+-\d+\.mp3$/.test(f)) unlinkSync(path.join(here, f)); // the old clips
  let n = 0;
  for (const l of LINES()) {
    const src = path.join(AUD, 'takes', `${l.id}-${picks[l.id] || 't1'}-src.mp3`);
    if (!existsSync(src)) { console.log(`  ${l.id}: no take, the stand-in speaks it`); continue; }
    fx(src, path.join(here, `${l.id}.mp3`), 'arena', { game: true, level: l.level }); n++;
  }
  console.log(`${n} clips (${Object.keys(picks).length} picked, the rest take 1); now npm run build`);
}

const cmd = process.argv[2];
if (cmd === 'voices') await voices();
else if (cmd === 'shootout') await shootout(process.argv.slice(3));
else if (cmd === 'takes') await takes(process.argv[3], +(process.argv[4] || 4), process.argv.slice(5));
else if (cmd === 'apply') apply(process.argv.slice(3).join(' '));
else { console.error('usage: node voice/audition.mjs voices | shootout <voice…> | takes <voice> [n] [event…] | apply <picks>'); process.exit(1); }
