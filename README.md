# Sparring

Prototype of a writing interface: a vintage notebook where you write on the left and an AI thinks along on the right. When it has something worth adding, it writes one short thought in the margin, in the same handwriting, and gradually, word by word. It never writes into your text.

Plain HTML, CSS and JavaScript plus one Vercel function (`api/think.js`) that talks to Gemini.

## How it works

- There is no send button and no need to press Enter. Write. When you pause after a sentence (or after a few seconds mid-sentence) and there is enough new text, the AI looks at it and decides itself whether it can add something valuable. If not, it stays silent (the model answers `SKIP`). Enter simply starts a new paragraph.
- The notes are deliberately short: one sentence, at most two, no questions, no praise. A concept, a case, a consequence or the strongest counterargument.
- The cursor on the right page is a highlighter. Drag over a passage of an AI note to mark it. A reply block opens on the left, quoting the passage, and the AI sees exactly what you refer to. Click a marked passage, or the empty right page, to take marks back (empty reply blocks disappear with them). Click a note without dragging to reply to the whole note.
- Turning pages: click the curled corners, use `Page Up` and `Page Down`, click a tab, or swipe on a phone. The leaf bends like paper.
- Every note has a sticky tab on the edge of the book. Notes before the open spread hang on the left, later ones on the right. The cream "new" tab starts a note.
- `# ` makes a title, `- ` a list. `Esc` selects a block (arrows move, `Del` removes, `Enter` continues writing).

## When a new page starts

1. Your text runs line by line to the last rule and continues on the next page. A long paragraph never jumps as a whole.
2. If there is no room left beside your block for a note, your next block starts at the top of the next page. The page turns when you keep writing or click the corner.
3. If a block with its note slides to the next page, the book turns with it.

Notes live only in your browser (`localStorage`). Nothing is stored on a server.

## Setting up the AI

The function `api/think.js` calls Gemini. The key is **never** in the code, only an environment variable in Vercel:

1. Vercel → Project → Settings → Environment Variables
2. Add `GEMINI_API_KEY` with your key (Production, Preview, Development)
3. Optionally set `GEMINI_MODEL` (default: `gemini-3.1-flash-lite-preview`, about one second per answer. Set `gemini-3.1-pro-preview` for deeper but slower notes. On missing access or rate limits the function falls back to `gemini-3-flash-preview`, `gemini-3.1-pro-preview` and `gemini-2.5-flash`)
4. Redeploy so the variable takes effect

Without a key the page shows "No connection to the AI". The function limits requests per IP and the input length.

## Principles

1. The AI never speaks mid-sentence. It waits for a pause and stays silent when it has nothing valuable to add.
2. Short: at most two sentences. It adds knowledge (concepts, cases, consequences, counterarguments) instead of asking questions, and it neither praises nor judges.
3. There is no insert button: the text stays yours.
4. You and the AI write in the same handwriting and size. Only the ink differs (blue-black for you, red-brown for the AI).

## Font

[Klee One](https://fonts.google.com/specimen/Klee+One) by Fontworks, licensed under the SIL Open Font License 1.1. The files are served locally from `fonts/`, no fonts are loaded from third-party servers.
