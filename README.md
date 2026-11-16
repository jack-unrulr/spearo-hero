# Spearo Hero

**Breath-hold spearfishing action, right in your browser.**

One breath, a drop to the bottom off Tofino, BC, and 30 seconds of air. You lie still on the rocks and wait for the
fish to come to you, the way spearos hunt from the bottom (*aspetto*). Spear the black rockfish, land the lingcod if
you can, and leave the surfperch alone. Everything is made by code: no images, no 3D models, no sound files (except the announcer's voice clips, built into the page), one HTML file.

> **Built on [Abyssal Garden](https://github.com/Noniv/abyssal-garden) by Maksymilian Dendura ([@Noniv](https://github.com/Noniv)).**
> The gorgeous procedural underwater world, its WebGPU renderer and the ambient soundscape are theirs (MIT); this
> repo started as a fork at commit `a596354`, and their history is kept below ours. Go check out the original.

## The trip

Insert a coin (click the coin door, or press Enter), press **Start**, pick a trip, type Player 1's name, then pick a dive. A trip is three dive sites in one location
(Tofino: Kelp Forest, Whale Tail, Coral Grotto), each dived once, in any order. One of them, picked at random, has the
trophy lingcod: `TROPHY FISH!` flashes when it shows up, and the trophy slot on the dive picker fills with it if you
land it (or says *Missed*). After the third dive the trip's results add everything up, and the total goes on the board.
Esc pauses; quitting a trip throws it away.

## A dive

1. **Descent.** The view drops from the surface while the card says what to shoot. *Ready? Set… HUNT!*
2. **Bottom time.** The hunt music starts and the air bar on the right drains. It turns yellow, then red, and the
   music speeds up. At zero: `SURFACE!`.
3. **Ascent and results.** The score counts up, one row per fish with its outline and where the spear went in (lost
   and wrong fish crossed out), your stats, a verdict on dinner and badges. Then back to the dive picker.

**The fish**

| | |
|---|---|
| **Black rockfish** (slate-black, mottled grey, spiny dorsal) | The target. They cruise across the view, sometimes in pairs, stop near the bottom and sometimes come in for a look. |
| **Lingcod** (long, mottled brown, big head) | The trophy, worth double. An ambusher: it sits on the rocks for a moment, then darts to the next spot. Two surfperch tag along. |
| **Striped surfperch** (copper with blue stripes) | Off limits this round. They hold patches close in and chase any rockfish that passes, right into your line of fire. Spear one and the round ends with a penalty. |

The spear stops in the first fish it meets, so wait for a clean window.

**Where you hit matters** (points grow with the fish's length):

| Zone | What happens | Points |
|---|---|---|
| Head | **Stoned**: killed at once, a moment of slow motion | 1.5 × |
| Body | Usually holds; about 1 in 5 fights free on the way in | 1 × |
| Tail | Usually tears out | 0.6 × if it holds |

A fish that tears free bolts, bleeding: one more chance. If it leaves the view, `GOT AWAY` still pays for the hit, less 100 (at least 50). Fish taken in a
row pay a streak bonus, and a shot that slips past a surfperch scores "THREADED IT!".

**Scaring them.** Every shot raises the alarm, which dies down if you wait. Fish near the spear's path flinch, then
burst away across the view. Surfperch are back at their patch in seconds; rockfish come back once things calm down,
but leave for good after a few scares. The round ends when the air runs out, when nothing is left, or on a surfperch.

Each dive is a seeded script, and a trip's seed sets its dives' seeds and which one has the trophy: the same seed
gives the same trip (`index.html?seed=1234`).

## The announcer

A loud, hammy cowboy announcer calls the big moments: the title (as Start appears once the coin is in: the coin's
click is also what lets the page make sound), the trophy showing up, landing it or losing it, the
wrong fish, a hog, a double, three misses in a row, low air and the dinner verdict. He's kept sparing on purpose: most
lines have odds (a hog: always the first one in a dive, 75% after), some play once per dive or trip, he never repeats
the same take twice in a row, and after a line there are 1.5 s of quiet that only the trophy, the wrong fish and a new
high score can break. The hunt music ducks while he talks. **Options > Voice** turns him off (M mutes him with
everything else).

The script and those rules live in `source/voice/lines.json`; each line's clip is `source/voice/<event>-<n>.mp3`, and
a line without one is spoken by the browser's own voice as a stand-in. The clips are made with ElevenLabs (Eleven v4, from a
voice designed for the game, "D1"; a paid plan: the API needs one for designed voices) and picked by ear on a local audition page, then run through an arcade
"arena" chain (`source/voice/fx.mjs`, needs ffmpeg: EQ, hard compression, a little grit, a short slapback, all at the
same loudness). The key goes in `source/voice/.elevenlabs-key` (kept out of git); the auditions in
`source/voice/audition/` (also kept out).

```bash
cd source
node voice/audition.mjs voices            # design candidate voices; pick favourites on audition/voices.html
node voice/audition.mjs shootout D1 A1    # save them; each reads the same lines 3 times (audition/shootout.html)
node voice/audition.mjs takes D1 4        # 4 takes of every line in the winner; pick on audition/index.html
node voice/audition.mjs apply 'wrong-1: t3, hog-1: t2, …'   # the picks become the game's clips
npm run build                             # puts them into the page
```

Serve `source/voice/audition/` to listen (e.g. `python3 -m http.server -d voice/audition`). `takes` keeps the takes it
already has, so after changing a line delete its takes in `audition/takes/` and run it again.

## Try it

1. Download [`index.html`](index.html).
2. Open it in **Chrome** or **Edge** on a desktop computer.
3. Wait a few seconds while the world is built, insert a coin, then press **Start**.

Nothing to install, and it works offline. It needs a browser with **WebGPU** and a mouse.

## Controls

| | |
|---|---|
| Aim | Move the mouse: the crosshair moves freely, and the view turns a few degrees near the left and right edges |
| Fire | Click. The reel brings the spear back by itself, then the gun reloads (about 1 s) |
| Pause / menu | `Esc` |
| Sound on / off | `M` |
| Performance stats | `H`, with `?stats` in the URL |

Needs a desktop browser with **WebGPU** (Chrome or Edge) and a mouse. Nothing to install: `index.html` is the whole game.

## Leaderboards

No accounts, like an arcade cabinet: each trip starts with a name (up to 7 letters), and its total is posted under
that name when the trip ends. Each location has its own board of trip totals. The world boards live on a tiny server in [`server/`](server): a Cloudflare Worker with a D1 (SQLite)
database, well inside Cloudflare's free tier. Until it's deployed, or when it can't be reached, the game keeps a
top 10 on the device instead.

Deploy it once:

```bash
cd server && npm install
npx wrangler login
npx wrangler d1 create spearo-scores      # paste the database_id it prints into wrangler.toml
npm run db:init:remote
npm run deploy                            # prints https://spearo-hero-scores.<you>.workers.dev
```

Then set `LB_DEFAULT` near the leaderboard section of `source/src/arcade.js` to that URL and rebuild. (It is
deployed at `https://spearo-hero-scores.spearo-hero-scores.workers.dev`.) `?lb=off` on the page turns the world board off. The server
checks names and stats, rejects impossible scores and rate-limits each address; it can't make faking a score
impossible, so treat the board as a fun one.

## Locations

Each location is an entry in `LOCATIONS` at the top of `source/src/arcade.js`: its dive sites (each a spot in the
shared world: the diver's position and heading), the words on its cards, its air, the name of its board, and which
species is the target, the trophy and the fish to avoid. The photos on the trip and dive cards are taken from each
site by the game's own renderer while the page loads. Species (shape, colours, sizes, speeds, how jumpy) live in `SPEC` in `source/src/fish.js`, with
their colour pattern in the fish shader in `source/src/game.js`. Tofino is the only location so far; the world also
has a sunken ship, arches, tunnels and sponge gardens to set future ones in.

## Development

```bash
cd source && npm install
npm run build        # ../index.html, minified
npm run build:dev    # ../dev.html, readable, with the test hooks
node test/round.mjs 42                              # plays a seeded round in Chrome and checks every step
LB=http://localhost:8787 node test/round.mjs 42     # the same against a local server (npm run dev in server/)
```

| File | What's inside |
|---|---|
| [`source/src/arcade.js`](source/src/arcade.js) | The round: locations, the seeded script, fish behaviour and scaring, scoring, HUD, effects, tally, leaderboards. **Start here.** |
| [`source/src/fish.js`](source/src/fish.js) | The species table and fish meshes, the fish pool, rock and floor queries |
| [`source/src/game.js`](source/src/game.js) | The speargun, spear, line and hit test, and the shader for them and the fish |
| [`source/src/audio.js`](source/src/audio.js) | Ambient soundscape, game sounds and the hunt music, all synthesized |
| [`source/src/world.js`](source/src/world.js), [`shaders.js`](source/src/shaders.js), [`main.js`](source/src/main.js) | The world, its look and the renderer (from Abyssal Garden) |
| [`source/template.html`](source/template.html) | The page: start screen, HUD and tally styles |
| [`source/src/dev.js`](source/src/dev.js), [`devgame.js`](source/src/devgame.js), [`source/test`](source/test) | Test hooks (only in `dev.html`) and the automated round test |
| [`server/`](server) | The leaderboard Worker |

## License

[MIT](LICENSE). The underwater world, renderer and soundscape are © Maksymilian Dendura (Abyssal Garden), used and
modified under the MIT license; the license and copyright notice are kept in [LICENSE](LICENSE).
