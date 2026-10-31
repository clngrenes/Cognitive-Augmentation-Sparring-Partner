# Sparring

Prototyp eines Schreibinterfaces: ein altes Notizbuch, in dem du links schreibst und rechts eine KI mitdenkt. Bei jedem Enter schreibt sie einen kurzen Nebengedanken zu dem, was du gerade geschrieben hast, in derselben Handschrift. Sie schreibt nie in deinen Text.

Reines HTML, CSS und JavaScript plus eine Vercel-Funktion (`api/think.js`) für die KI.

## Bedienung

- Enter beendet einen Block, die KI schreibt rechts einen Gedanken dazu, Wort für Wort.
- Rechts ist der Cursor ein Textmarker: Eine Stelle im Gedanken der KI mit gedrückter Maustaste anstreichen, und darunter öffnet sich ein Block für deinen Kommentar zu genau dieser Stelle. Die KI sieht die Stelle und geht darauf ein. Ein Klick auf den Gedanken antwortet ohne Stelle. Erneut anstreichen nimmt die Markierung zurück.
- Zwischen zwei Gedanken bleibt eine freie Zeile, dazu ein kleiner Tintenpunkt am Anfang. Keine Trennlinie, denn die gibt es im Notizbuch nicht.
- Blättern: auf die aufgerollten Ecken unten klicken, mit `Bild auf` und `Bild ab`, auf einen Reiter klicken oder auf dem Handy wischen. Das Blatt biegt sich dabei wie Papier.
- Jede Notiz hat einen Klebereiter am Buchrand. Notizen vor der aufgeschlagenen Stelle hängen links, die danach rechts. Der cremefarbene Reiter „neu“ legt eine neue Notiz an.
- `# ` macht einen Titel, `- ` eine Liste.
- Esc markiert einen Block (Pfeile bewegen die Auswahl, Entf löscht, Enter schreibt weiter).

## Wann eine neue Seite beginnt

1. Dein Text läuft Zeile für Zeile bis zur letzten Linie und setzt sich auf der nächsten Seite fort. Ein langer Absatz springt nicht als Ganzes.
2. Der Gedanke der KI braucht Platz neben deinem Block. Reicht der Rest der Seite dafür nicht mehr, beginnt dein nächster Block oben auf der nächsten Seite. Du siehst die KI noch schreiben, die Seite wird erst umgeschlagen, wenn du weiterschreibst oder die Ecke anklickst.
3. Rutscht ein Block samt Gedanke auf die nächste Seite, blättert das Buch mit.

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
