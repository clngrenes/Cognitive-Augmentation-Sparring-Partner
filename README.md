# Sparring

Prototyp eines Schreibinterfaces. Links schreibst du in Blöcken (wie in Craft oder Notion), rechts denkt eine KI mit: Bei jedem Enter schreibt sie einen kurzen Nebengedanken zu dem, was du gerade geschrieben hast. Sie schreibt nie in deinen Text.

Reines HTML, CSS und JavaScript plus eine Vercel-Funktion (`api/think.js`) für die KI.

## Bedienung

- Enter beendet einen Block, die KI antwortet rechts.
- `# ` macht einen Titel, `- ` eine Liste.
- Ein Klick auf einen Gedanken der KI öffnet links einen Block für deine Antwort.
- Esc markiert einen Block (Pfeile bewegen die Auswahl, Entf löscht, Enter schreibt weiter).

## KI einrichten

Die Funktion `api/think.js` ruft Gemini auf. Der Schlüssel steht **nie** im Code, sondern nur als Umgebungsvariable in Vercel:

1. Vercel → Projekt → Settings → Environment Variables
2. `GEMINI_API_KEY` mit deinem Schlüssel anlegen (Production, Preview, Development)
3. Optional `GEMINI_MODEL` setzen (Standard: `gemini-2.5-flash`)
4. Neu deployen, damit die Variable greift

Ohne Schlüssel antwortet die Seite mit wenigen einfachen Regel-Fragen. Die Funktion begrenzt Anfragen pro IP und die Länge der Eingabe.

## Interaktionsprinzipien

1. Die KI spricht erst, wenn du einen Block abschließt, nie mitten im Satz.
2. Kurz: höchstens zwei Sätze. Fragen, Gegenpositionen und Verbindungen statt Lob oder Bewertung.
3. Kein Einfügen-Knopf: Der Text bleibt deiner.
