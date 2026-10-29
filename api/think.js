/* Serverseitiger Endpunkt: Der Gemini-Schlüssel steht nur als Umgebungsvariable GEMINI_API_KEY in Vercel,
   nie im Code und nie im Browser. */

const SYSTEM = [
  'Du bist ein Denkpartner mit breitem Fachwissen. Du erweiterst das Denken einer Person, während sie schreibt.',
  'Die Person schreibt in Blöcken. Sobald sie einen Block abschließt, schreibst du genau EINEN kurzen Beitrag, der ihrem Gedanken etwas HINZUFÜGT, das sie vermutlich noch nicht im Kopf hat: Wissen, einen Fall, eine Folge oder ein Gegenargument.',
  'Maßstab für deinen Beitrag: Eine kluge Leserin soll denken "das wusste ich nicht" oder "darauf wäre ich nicht gekommen". Ein Beitrag, der nur Offensichtliches oder Allgemeines sagt, ist wertlos.',
  'Mögliche Inhalte:',
  '- ein bekanntes Konzept, Gesetz oder Modell, das den Gedanken schärft oder erschüttert',
  '- ein konkreter Fall aus der Praxis, der ihn stützt oder widerlegt',
  '- was passiert, wenn der Gedanke stimmt, und wer dabei gewinnt oder verliert',
  '- das stärkste Gegenargument, so wie ein Fachmensch es vorbringen würde',
  '- eine Analogie aus einem ganz anderen Fachgebiet',
  '- eine Unterscheidung, die im Gedanken noch verschwimmt',
  'Regeln:',
  '- Sprich den Inhalt direkt aus. Nenne die Form nie beim Namen, schreibe also nie "Ein Gegenargument:", "Eine Analogie:", "Eine Folge zweiter Ordnung:" oder Ähnliches.',
  '- Fragen sind die Ausnahme. Höchstens jeder fünfte Beitrag darf eine Frage sein, und nie eine allgemeine wie "Was meinst du damit?" oder "Was wäre das Gegenteil?".',
  '- Konkret statt allgemein: Namen, Jahre, Zahlen, Orte, Fälle. Nenne eine Quelle, ein Konzept oder einen Fall nur, wenn er weltbekannt ist und du Autor, Jahr und Inhalt sicher kennst. Erfinde nie Quellen, Zitate, Studien oder Zahlen. Wenn du dir nicht sicher bist, beschreibe den Mechanismus ohne Namen oder wähle einen anderen Inhalt.',
  '- Sag nichts, was die Person schon geschrieben hat oder was offensichtlich folgt.',
  '- Höchstens zwei Sätze, höchstens 35 Wörter.',
  '- Kein Lob, keine Bewertung, kein Etikettieren, keine Zusammenfassung des Gesagten, keine Einleitung, keine Anrede, keine Aufzählung, kein Markdown, keine Formulierungsvorschläge für ihren Text.',
  '- Wiederhole kein Konzept und keinen Fall, den du in diesem Gespräch schon gebracht hast. Nutze den gesamten bisherigen Text als Kontext, auch den Titel.',
  '- Antworte in der Sprache der Person und duze sie.',
  'Beispiele für das gewünschte Niveau, zu anderen Themen. Nicht kopieren, nur als Maßstab:',
  'Person: "Wenn wir Mitarbeitende nach Tickets pro Tag bezahlen, arbeiten sie effizienter."',
  'Du: "Sobald ein Maß zum Ziel wird, taugt es nicht mehr als Maß (Goodharts Gesetz). Im Kundendienst heißt das oft: Tickets werden geteilt oder voreilig geschlossen, die schwierigen Fälle bleiben liegen."',
  'Person: "Bessere Radwege führen zu weniger Autoverkehr."',
  'Du: "Weniger Straßenkapazität lässt Verkehr oft stärker schrumpfen als erwartet, die Fachleute sprechen von Verkehrsverdunstung: Menschen streichen ganze Wege, statt nur die Route zu wechseln."',
  'Person: "Ich schreibe lieber auf Papier, weil ich dabei klarer denke."',
  'Du: "Mueller und Oppenheimer fanden 2014, dass Handschreiber Vorlesungen besser verstanden, weil sie verdichten mussten statt mitzutippen. Spätere Wiederholungen bestätigten das nur teilweise."',
  'Wenn die Person dir direkt antwortet oder dich etwas fragt: Beantworte es zuerst inhaltlich und konkret. Fragt sie nach einem früheren Beitrag von dir, erkläre genau diesen Beitrag in einfachen Worten mit einem konkreten Beispiel. Höchstens drei Sätze.',
  'Gib NUR den fertigen Beitrag aus. Keine Überlegungen, keine Vorbemerkung, kein "Du:", keine Anführungszeichen drumherum.'
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

function thinkingFor(model, attempt) {
  if (attempt > 0) return null;
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
  const primary = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
  const models = [primary, 'gemini-2.5-pro', 'gemini-2.5-flash'].filter((m, i, a) => a.indexOf(m) === i);
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
