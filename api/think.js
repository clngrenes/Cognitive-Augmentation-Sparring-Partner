/* Serverseitiger Endpunkt: Der Gemini-Schlüssel steht nur als Umgebungsvariable GEMINI_API_KEY in Vercel,
   nie im Code und nie im Browser. */

const SYSTEM = [
  'Du bist der perfekte Sparringspartner für Gedanken beim Schreiben.',
  'Die Person schreibt in Blöcken. Sobald sie einen Block abschließt, schreibst du genau EINEN kurzen Nebengedanken dazu, der ihr Denken erweitert.',
  'Das kann sein: eine präzise Rückfrage, eine Gegenposition, eine übersehene Perspektive, ein konkretes Beispiel oder eine Verbindung zu einem früheren Block.',
  'Länge: höchstens zwei kurze Sätze, höchstens 25 Wörter.',
  'Verboten: Lob, Bewertung, Etikettieren (zum Beispiel "das ist eine Annahme"), Zusammenfassen, Einleitung, Anrede, Aufzählungen, Markdown, Formulierungsvorschläge für den Text der Person.',
  'Beziehe dich auf konkrete Wörter oder Ideen der Person. Antworte in ihrer Sprache und in ihrem Ton, ohne sie zu kopieren.',
  'Wenn die Person dir direkt antwortet oder dich etwas fragt, antworte knapp und ehrlich, wieder höchstens zwei Sätze, und gib den Gedanken mit einer Frage zurück an sie.',
  'Gib nur den Gedanken aus, sonst nichts.'
].join('\n');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 40;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 1500;
const MAX_TOTAL_CHARS = 8000;
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return false;
}

function validate(body) {
  const msgs = body && body.messages;
  if (!Array.isArray(msgs) || msgs.length < 1 || msgs.length > MAX_MESSAGES) return null;
  let total = 0;
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') return null;
    if (!m.text.trim() || m.text.length > MAX_MESSAGE_CHARS) return null;
    total += m.text.length;
  }
  if (total > MAX_TOTAL_CHARS || msgs[msgs.length - 1].role !== 'user') return null;
  return msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

async function callGemini(key, model, contents, withThinkingOff) {
  const generationConfig = { temperature: 0.9, maxOutputTokens: 200 };
  if (withThinkingOff) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig })
    }
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(503).json({ error: 'no_key' }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  if (limited(ip)) { res.status(429).json({ error: 'rate_limited' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const contents = validate(body);
  if (!contents) { res.status(400).json({ error: 'bad_request' }); return; }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    let r = await callGemini(key, model, contents, true);
    if (r.status === 400) r = await callGemini(key, model, contents, false);
    if (!r.ok) { res.status(502).json({ error: 'upstream_' + r.status }); return; }
    const data = await r.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const out = (parts || []).map((p) => p.text || '').join('').trim();
    if (!out) { res.status(502).json({ error: 'empty' }); return; }
    res.status(200).json({ text: out });
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};
