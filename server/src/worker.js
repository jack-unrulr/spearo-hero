// Spearo Hero leaderboard API (Cloudflare Worker + D1)
//   GET  /scores?loc=tofino[&limit=10]     -> { top: [{ name, score, seed, at }] }
//   POST /scores { loc, name, score, seed, stats: { shots, hits, stoned, landed } }
//                                          -> { rank, top }
// No accounts, like an arcade cabinet: anyone can post a name. The checks below keep out malformed and obviously
// impossible scores and limit how fast one address can post; they do not make faking a score impossible.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const LOC = /^[a-z0-9-]{1,24}$/, NAME = /^[A-Z0-9]{1,7}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

async function top(env, loc, limit) {
  const { results } = await env.DB.prepare('SELECT name, score, seed, at FROM scores WHERE loc = ? ORDER BY score DESC, at ASC LIMIT ?').bind(loc, limit).all();
  return results;
}
async function ipHash(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local', data = new TextEncoder().encode((env.SALT || 'spearo') + ip);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/scores') return json({ error: 'not found' }, 404);

    if (req.method === 'GET') {
      const loc = url.searchParams.get('loc') || '', limit = Math.min(50, Math.max(1, +url.searchParams.get('limit') || 10));
      if (!LOC.test(loc)) return json({ error: 'bad location' }, 400);
      return json({ top: await top(env, loc, limit) });
    }

    if (req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const s = b.stats || {}, name = String(b.name || '').toUpperCase().trim();
      if (!LOC.test(b.loc || '') || !NAME.test(name)) return json({ error: 'bad location or name' }, 400);
      if (!int(b.score, 1, 100000) || !int(b.seed, 0, 1e9)) return json({ error: 'bad score' }, 400);
      for (const k of ['shots', 'hits', 'stoned', 'landed']) if (!int(s[k], 0, 200)) return json({ error: 'bad stats' }, 400);
      // sanity: hits (shots that hit) within shots, at most two fish landed per hit (a double), and a ceiling of about
      // 5000 points per fish landed
      if (s.hits > s.shots || s.landed > 2 * s.hits || s.stoned > s.landed || b.score > 5000 * Math.max(1, s.landed) + 1000) return json({ error: 'implausible score' }, 400);
      const ip = await ipHash(req, env), now = Date.now();
      const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip = ? AND at > ?').bind(ip, now - 60000).first();
      if (recent.n >= 5) return json({ error: 'slow down' }, 429);
      await env.DB.prepare('INSERT INTO scores (loc, name, score, seed, shots, hits, stoned, landed, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(b.loc, name, b.score, b.seed, s.shots, s.hits, s.stoned, s.landed, ip, now).run();
      const better = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE loc = ? AND score > ?').bind(b.loc, b.score).first();
      return json({ rank: better.n + 1, top: await top(env, b.loc, 10) });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
