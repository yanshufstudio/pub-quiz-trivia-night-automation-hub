# Self-hosted fonts

Loaded through `next/font/local` in `src/app/layout.tsx`, so the build never
has to reach Google Fonts (a sandboxed build environment cannot, and a
production build should not depend on a third party being up).

Latin subset only, woff2 only. Files are the unmodified builds published by
[Fontsource](https://fontsource.org/) (v5.3.0 packages):

| File | Family | Licence |
|---|---|---|
| `alfa-slab-one-latin-400-normal.woff2` | Alfa Slab One — display / wordmark | SIL OFL 1.1 — © 2016 The Alfa Slab One Project Authors (jmsole.cl), Reserved Font Name "Alfa Slab" |
| `nunito-sans-latin-wght-normal.woff2` | Nunito Sans (variable, wght 200–1000) — body | SIL OFL 1.1 — © 2016 The Nunito Sans Project Authors |
| `ibm-plex-mono-latin-500-normal.woff2`, `…-600-normal.woff2` | IBM Plex Mono — codes and eyebrow labels | SIL OFL 1.1 — © 2017 IBM Corp. |

The OFL permits bundling and web serving; it does not permit selling the
fonts on their own or shipping modified versions under the reserved names.
