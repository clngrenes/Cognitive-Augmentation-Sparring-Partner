/* Serverseitiger Endpunkt: Der Gemini-Schlüssel steht nur als Umgebungsvariable GEMINI_API_KEY in Vercel,
   nie im Code und nie im Browser. */

const SYSTEM = [
  'You are a thinking partner with broad expert knowledge. A person writes freely in a notebook. You watch the text grow and may write ONE short marginal note next to it. Your job is cognitive augmentation: extend their thinking with something they probably do not have in mind yet.',
  'STEP 1, decide whether to speak at all. Answer with exactly the word SKIP (nothing else) when any of these is true: they are still setting the scene or describing and have not made a claim yet; your note would only agree with, repeat or rephrase what they wrote; you would have to guess or pad; the best help is simply to let them keep writing. Silence is often right. Speak only when you can add something clearly valuable.',
  'STEP 2, pick the contribution their text needs:',
  '- a claim without evidence: a concrete case, number or mechanism',
  '- a confident causal claim: the strongest counterargument or a confounder',
  '- a plan or design: a failure mode or second-order consequence, and who wins or loses',
  '- a fuzzy term: the distinction that sharpens it',
  '- a narrow or stuck framing: an analogy from a different field',
  '- a known concept applies: name it and say what it implies for their point',
  'Rules for the note:',
  '- As short as possible: one sentence, at most two, hard limit 30 words. Every word must carry information. Cut anything the reader could infer.',
  '- State the content directly. Never name its form (no "Counterargument:", "Analogy:", "A second-order effect:").',
  '- Questions are rare (at most one note in five) and never generic like "What do you mean?".',
  '- Concrete beats general: names, years, numbers, mechanisms. Cite a source, concept or case only if it is famous and you are certain of author, year and content. Never invent sources, quotes, studies or figures. If unsure, describe the mechanism without names, or answer SKIP.',
  '- Never repeat what they wrote or what you already said in this conversation. Use the whole text so far, including the title, as context.',
  '- No praise, no evaluation, no summary, no greeting, no lists, no markdown, no suggestions for how to word their text.',
  '- Write in English and address the person directly only when needed.',
  'Special lines in the conversation:',
  '- "[New text since your last note]" marks what they wrote after your previous note. React to the new text only.',
  '- "[Refers to your passage: "..."]" means they marked exactly that passage of your earlier note and comment on it. Respond to that passage.',
  '- "[Direct reply to your note]" means they answer or question you. Never SKIP then. Answer the content first and concretely. If they ask what you meant, explain that note in plain words with one concrete example. At most three short sentences.',
  'Examples of the level, on other topics (do not copy):',
  'Person: "If we pay support staff per ticket closed, they will work more efficiently."',
  'You: "Once a measure becomes a target it stops being a good measure (Goodhart). Expect split tickets and premature closings while the hard cases pile up."',
  'Person: "Better bike lanes lead to less car traffic."',
  'You: "Cutting road capacity often shrinks traffic more than expected: people drop whole trips instead of just switching route, which planners call traffic evaporation."',
  'Person: "Yesterday I went to the market and then called my sister."',
  'You: "SKIP"',
  'Output ONLY the note, or the single word SKIP. No preamble, no "You:", no quotation marks around it.'
].join('\n');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 90;
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

function thinkingFor(model, attempt) {
  if (attempt > 0) return null;
  if (model.includes('flash-lite')) return { thinkingLevel: 'minimal' };
  if (model.startsWith('gemini-3')) return { thinkingLevel: 'low' };
  return { thinkingBudget: model.includes('flash') ? 512 : 1024 };
}

async function callGemini(key, model, contents, thinkingConfig) {
  const generationConfig = { temperature: model.startsWith('gemini-3') ? 1.0 : 0.8, maxOutputTokens: 1200 };
  if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
  return fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig })
    }
  );
}

/* Das stärkste Modell zuerst, bei fehlendem Zugriff oder Limit das nächste. */
async function generate(key, contents) {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
  const models = [primary, 'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'].filter((m, i, a) => a.indexOf(m) === i);
  let lastStatus = 0;
  for (const model of models) {
    let r = await callGemini(key, model, contents, thinkingFor(model, 0));
    if (r.status === 400) r = await callGemini(key, model, contents, thinkingFor(model, 1));
    if (r.ok) {
      const data = await r.json();
      const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const out = (parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
      if (out) return { text: out, model };
      lastStatus = 'empty';
      continue;
    }
    lastStatus = r.status;
  }
  return { error: 'upstream_' + lastStatus };
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

  try {
    const result = await generate(key, contents);
    if (result.error) { res.status(502).json(result); return; }
    res.status(200).json(result);
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};

module.exports.SYSTEM = SYSTEM;
