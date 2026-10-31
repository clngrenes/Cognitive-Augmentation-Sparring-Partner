# Sparring

Prototype of a writing interface: an endless scroll of vintage paper where you write on the left and an AI thinks along on the right. When it has something worth adding, it writes one short thought in the margin, in the same handwriting, word by word. It never writes into your text.

Plain HTML, CSS and JavaScript plus one Vercel function (`api/think.js`) that talks to Gemini.

## How it works

- **Scrolls instead of pages.** Each note is one endless scroll: the paper is wound around a wooden rod at the top, with knobs in the scroll's colour, and just keeps growing downwards. No page breaks, no flipping. The scroll hangs in the middle of the screen.
- **A rack for your scrolls.** On the left a wooden rack holds all scrolls, each in its own round slot (the end of the rolled paper with the knob in its colour). Hover and the scroll slides out a little, press and it is pushed back, the open one sits pulled out. "New scroll" is the empty slot. Hover a slot for the colour dot and the ×. Switching scrolls rolls the old one up and unrolls the other. The wastebasket stands below the rack.
- There is no send button and no need to press Enter. Write. When you pause (about 1.5 s after a sentence, a few seconds mid-sentence) or have written two to three sentences, the AI looks at the new text and decides itself whether it can add something valuable. If not, it stays silent (the model answers `SKIP`). Enter simply starts a new paragraph.
- **It notices edits.** If you delete or correct something further up, the AI is told what was removed and what replaced it, so it does not keep arguing with words that are gone. It also sees what you wrote after a passage.
- The notes are deliberately short (one or two sentences) and work on *your* thinking, not on the topic: the assumption under your claim, a tension between two of your statements (also across scrolls), the sharpest objection to exactly what you wrote, the step you did not take. No trivia, no praise. It answers in the language you write in.
- **The right side never outgrows the left.** Next to your text the AI column is at most six lines high (or as tall as your own text, if that is longer). Anything beyond that is folded: "Show all" unfolds it, "Fold" puts it back. Every thought has its own × (hover it) to remove just that one; a reply you wrote to it stays as your own text.
- The cursor on the right half is a highlighter. Drag over a passage of an AI note to mark it. A new paragraph with an ink dot opens on the left, and the AI sees exactly which passage you refer to. Click a marked passage, or the empty right half, to take marks back (empty reply blocks disappear with them). Click a note without dragging to reply to the whole note.
- Hover a scroll in the rack and a small × appears: it asks whether you really want to delete the scroll, then the sheet crumples and flies into the wastebasket at the bottom (the basket itself works too, for the open scroll).
- `# ` makes a title, `- ` a list. `Esc` selects a block (arrows move, `Del` removes, `Enter` continues writing). On a phone (or a narrow window) the rack moves to the top and the scroll becomes a single column.

Scrolls live only in your browser (`localStorage`). Nothing is stored on a server. Notes from the earlier book version are carried over as scrolls.

## Setting up the AI

The function `api/think.js` calls Gemini. The key is **never** in the code, only an environment variable in Vercel:

1. Vercel → Project → Settings → Environment Variables
2. Add `GEMINI_API_KEY` with your key (Production, Preview, Development)
3. Optionally set `GEMINI_MODEL` (default: `gemini-3-flash-preview`, good notes in about a second or two. Set `gemini-3.1-pro-preview` for deeper but slower notes. On missing access or rate limits the function falls back to `gemini-3.1-flash-lite-preview`, `gemini-3.1-pro-preview` and `gemini-2.5-flash`)
4. Redeploy so the variable takes effect

Without a key the page shows "No connection to the AI". The function limits requests per IP and the input length.

## Principles

1. The AI never speaks mid-sentence. It waits for a pause and stays silent when it has nothing valuable to add.
2. Short: at most two sentences. It adds knowledge (concepts, cases, consequences, counterarguments) instead of asking questions, and it neither praises nor judges.
3. There is no insert button: the text stays yours.
4. You and the AI write in the same handwriting and size. Only the ink differs (blue-black for you, red-brown for the AI).

## Font

[Klee One](https://fonts.google.com/specimen/Klee+One) by Fontworks, licensed under the SIL Open Font License 1.1. The files are served locally from `fonts/`, no fonts are loaded from third-party servers.
