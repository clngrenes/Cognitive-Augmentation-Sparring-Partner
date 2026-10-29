# Sparring

Prototyp eines Schreibinterfaces. Links schreibst du in Blöcken (wie in Craft oder Notion), rechts liest eine KI mit, fragt nach, hält Annahmen fest und denkt weiter. Sie schreibt nie in deinen Text.

Reines HTML, CSS und JavaScript, kein Build-Schritt. `index.html` im Browser öffnen oder einen statischen Server starten (`npx serve`).

## Bedienung

- Enter beginnt einen neuen Block, Backspace am Anfang führt Blöcke zusammen.
- `# ` macht einen Titel, `- ` eine Liste.
- Esc markiert einen Block. Dann: Pfeile bewegen die Auswahl, Entf löscht, Enter schreibt weiter, Strg/⌘ + Umschalt + Pfeil verschiebt den Block.
- Der Griff links neben einem Block markiert ihn oder zieht ihn an eine neue Stelle.
- Strg/⌘ + Enter lässt die KI sofort nachhaken.
- Ein Klick auf eine Anmerkung öffnet links einen Block für deine Antwort.
- Oben stellst du ein, wie oft die KI sich meldet: Still, Am Rand, Im Gespräch.

## Interaktionsprinzipien

1. Schweigen ist der Normalfall. Die KI spricht erst nach einer Denkpause, nie mitten im Satz.
2. Fragen vor Antworten, und kein Einfügen-Knopf.
3. Jede Anmerkung zeigt auf den Satz, den sie meint (Maus über die Anmerkung).
4. Höchstens drei Anmerkungen bleiben kräftig sichtbar, ältere verblassen.
5. Zustimmung ist keine Anmerkung: Die KI meldet sich nur bei Annahmen, Lücken und Spannungen.

## Stand

Die KI ist simuliert. Die Anmerkungen kommen aus Regeln (`app.js`, Funktion `rulesFor`), nicht aus einem Sprachmodell. Pausenerkennung, Timing und Layout sind echt. Der nächste Schritt ist ein echtes Modell hinter der Schnittstelle.
