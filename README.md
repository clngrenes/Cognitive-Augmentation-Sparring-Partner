# Sparring

Prototyp eines Schreibinterfaces. Du schreibst auf liniertem Papier in Blöcken (wie in Craft oder Notion), rechts denkt eine KI mit: Bei jedem Enter schreibt sie einen kurzen Nebengedanken zu dem, was du gerade geschrieben hast. Sie schreibt nie in deinen Text.

Reines HTML, CSS und JavaScript plus eine Vercel-Funktion (`api/think.js`) für die KI.

## Bedienung

- Mehrere Notizzettel: Der aktive liegt vorn, die anderen schauen links und rechts heraus. Unten wechselst du per Reiter, `+` legt einen neuen an, "Löschen" oben rechts entfernt ihn (zweimal klicken). Alles bleibt im Browser gespeichert.
- Enter beendet einen Block, die KI antwortet rechts.
- `# ` macht einen Titel, `- ` eine Liste.
- Ein Klick auf einen Gedanken der KI öffnet links einen Block für deine Antwort.
- Esc markiert einen Block (Pfeile bewegen die Auswahl, Entf löscht, Enter schreibt weiter).
- Die Beiträge der KI erscheinen Wort für Wort neben deinem Block.

## KI einrichten

Die Funktion `api/think.js` ruft Gemini auf. Der Schlüssel steht **nie** im Code, sondern nur als Umgebungsvariable in Vercel:

1. Vercel → Projekt → Settings → Environment Variables
2. `GEMINI_API_KEY` mit deinem Schlüssel anlegen (Production, Preview, Development)
3. Optional `GEMINI_MODEL` setzen (Standard: `gemini-3.1-pro-preview`, bei fehlendem Zugriff oder Limit fällt die Funktion nacheinander auf `gemini-2.5-pro` und `gemini-2.5-flash` zurück)
4. Neu deployen, damit die Variable greift

Ohne Schlüssel zeigt die Seite „Keine Verbindung zur KI“. Die Funktion begrenzt Anfragen pro IP und die Länge der Eingabe.

## Interaktionsprinzipien

1. Die KI spricht erst, wenn du einen Block abschließt, nie mitten im Satz.
2. Kurz: höchstens zwei Sätze. Die KI fügt Wissen hinzu (Konzepte, Fälle, Folgen, Gegenargumente) statt Fragen zu stellen, und sie lobt oder bewertet nicht.
3. Kein Einfügen-Knopf: Der Text bleibt deiner.
