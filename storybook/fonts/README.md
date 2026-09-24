# Fonts

Self-hosted so that no visit contacts a third party. Loaded by `css/fonts.css`.

| File | Font | Weights | Subset |
|---|---|---|---|
| `andika-latin-400-normal.woff2` | Andika | 400 | Latin |
| `andika-latin-ext-400-normal.woff2` | Andika | 400 | Latin Extended |
| `andika-latin-700-normal.woff2` | Andika | 700 | Latin |
| `andika-latin-ext-700-normal.woff2` | Andika | 700 | Latin Extended |
| `fredoka-latin-wght-normal.woff2` | Fredoka (variable) | 300–700 | Latin |
| `fredoka-latin-ext-wght-normal.woff2` | Fredoka (variable) | 300–700 | Latin Extended |

- **Andika** © 2004–2022 SIL International. SIL Open Font License 1.1: `Andika-OFL.txt`.
- **Fredoka** © 2016 The Fredoka Project Authors. SIL Open Font License 1.1: `Fredoka-OFL.txt`.

Source: the npm packages `@fontsource/andika@5.3.0` and
`@fontsource-variable/fredoka@5.3.0` (Google Fonts builds: Andika v27,
Fredoka v17), copied unmodified. To add a script (for example Vietnamese or
Cyrillic names), copy that subset's `.woff2` from the same packages and add an
`@font-face` with its `unicode-range` to `css/fonts.css`.
