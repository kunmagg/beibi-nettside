# Beibi & Gutane

Static band website with interactive portrait stretching, reversible flips, instrument lists, and Cuelume sounds.

## Run locally

From this directory, run `python3 -m http.server 8765`, then open http://localhost:8765/.

## Deploy

Import this repository directly into Vercel. The included `vercel.json` selects the Other framework preset, skips dependency installation and building, and serves the repository root. No `package.json` is needed. The website requires no backend, environment variables, or package installation.

`index.html` is the homepage. Keep the `assets/` directory beside it. Fonts and the wordmark are embedded in the HTML. Cuelume 0.2.2 is included locally with its MIT license in `assets/vendor/cuelume/LICENSE`.

## Editing

Layout and portrait styling: `assets/landing-stretch.css`. Interactions and fixed effect settings: `assets/landing-stretch.js`. Names, instruments, booking links, and page content: `index.html`.
