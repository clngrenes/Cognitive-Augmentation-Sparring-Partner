# Sparring

Prototyp eines Schreibinterfaces: ein altes Notizbuch, in dem du links schreibst und rechts eine KI mitdenkt. Bei jedem Enter schreibt sie einen kurzen Nebengedanken zu dem, was du gerade geschrieben hast, mit demselben Stift in derselben Handschrift. Sie schreibt nie in deinen Text.

Reines HTML, CSS und JavaScript plus eine Vercel-Funktion (`api/think.js`) für die KI.

## Bedienung

- Enter beendet einen Block, die KI antwortet rechts. Ein Füller schreibt mit.
- Ist die Seite voll, wird automatisch umgeblättert.
- Blättern: auf die aufgerollten Ecken unten klicken, mit `Bild auf` und `Bild ab`, oder auf dem Handy wischen.
- Jede Notiz hat einen farbigen Klebereiter am rechten Rand. Ein Klick darauf blättert zu dieser Notiz, `+` legt eine neue an.
- `# ` macht einen Titel, `- ` eine Liste.
- Ein Klick auf einen Gedanken der KI öffnet einen Block für deine Antwort. Beim Darüberfahren leuchtet die Stelle, auf die er sich bezieht, wie mit einem Textmarker auf.
- Esc markiert einen Block (Pfeile bewegen die Auswahl, Entf löscht, Enter schreibt weiter).

Notizen liegen nur im Browser (`localStorage`). Nichts wird auf einem Server gespeichert.

## KI einrichten

Die Funktion `api/think.js` ruft Gemini auf. Der Schlüssel steht **nie** im Code, sondern nur als Umgebungsvariable in Vercel:

1. Vercel → Projekt → Settings → Environment Variables
2. `GEMINI_API_KEY` mit deinem Schlüssel anlegen (Production, Preview, Development)
3. Optional `GEMINI_MODEL` setzen (Standard: `gemini-3.1-flash-lite-preview`, schnell mit etwa einer Sekunde Antwortzeit. Für tiefere, aber langsamere Beiträge `gemini-3.1-pro-preview` setzen. Bei fehlendem Zugriff oder Limit fällt die Funktion nacheinander auf `gemini-3-flash-preview`, `gemini-3.1-pro-preview` und `gemini-2.5-flash` zurück)
4. Neu deployen, damit die Variable greift

Ohne Schlüssel zeigt die Seite „Keine Verbindung zur KI“. Die Funktion begrenzt Anfragen pro IP und die Länge der Eingabe.

## Interaktionsprinzipien

1. Die KI spricht erst, wenn du einen Block abschließt, nie mitten im Satz.
2. Kurz: höchstens zwei Sätze. Die KI fügt Wissen hinzu (Konzepte, Fälle, Folgen, Gegenargumente) statt Fragen zu stellen, und sie lobt oder bewertet nicht.
3. Kein Einfügen-Knopf: Der Text bleibt deiner.
4. Beide schreiben in derselben Schrift und Größe. Nur die Tinte unterscheidet sich (Blauschwarz für dich, Rotbraun für die KI).

## Schrift

[Klee One](https://fonts.google.com/specimen/Klee+One) von Fontworks, lizenziert unter der SIL Open Font License 1.1. Die Dateien liegen lokal in `fonts/`, es werden keine Schriften von fremden Servern geladen.
