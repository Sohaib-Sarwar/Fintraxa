# Text fonts

The app's text faces are **Monety** (body) and **Artonex** (headings). Both are
commercial fonts, so they are not committed here until a licence is bought:

- Monety — Burntilldead / Eric Kurniawan (MyFonts, Creative Market)
- Artonex — Twinletter (MyFonts); the free FontSpace copy is a non-commercial trial

To enable them:

1. Buy a web licence and export `Monety-Regular.woff2` and `Artonex-Regular.woff2`
   (add weights if bought, e.g. `Monety-SemiBold.woff2`).
2. Put the files in this folder.
3. In `src/index.css`, uncomment the `url('/fonts/…')` part of each `@font-face`.

Until then the app falls back to Inter. Numbers use Inter Tight (open source, Google Fonts).
