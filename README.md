# Beibi & Gutane

Static band website with interactive portrait stretching, reversible flips, instrument lists, and Cuelume sounds.

## Run locally

From this directory, run `python3 -m http.server 8765`, then open http://localhost:8765/.

## Deploy

Import this repository directly into Vercel. The included `vercel.json` selects the Other framework preset, skips dependency installation and building, and serves the repository root. No `package.json` is needed. The website requires no backend, environment variables, or package installation.

`index.html` is the homepage. Keep the `assets/` directory beside it. Fonts and the wordmark are embedded in the HTML. Cuelume 0.2.2 is included locally with its MIT license in `assets/vendor/cuelume/LICENSE`.

## Editing

Layout and portrait styling: `assets/landing-stretch.css`. Interactions and fixed effect settings: `assets/landing-stretch.js`. Names, instruments, booking links, and page content: `index.html`.

When exactly Henrik and Tormod are flipped and every other portrait faces forward, `assets/wordmark-language.js` switches the lettering and instruments to Bokmål. The title reuses the original vector letters at the same width and height, with a staggered spring animation. Turning either portrait back or flipping any other portrait restores Nynorsk. Reduced-motion preferences skip the animation.

Two consecutive flips of Live (each turn counts) make `assets/disco-ball.js` lower a spinning mirror ball between Henrik and Øystein in half a second, dim the scene, and scatter moving reflected lights. Before it appears, flipping another portrait resets the streak. Once lowered, it stays until the ball is tapped, swiped upward, or dismissed with the keyboard; dismissing restores the lighting and resets the streak. Sideways/downward drags and canceled gestures leave it in place. Its position follows the responsive portrait layout. Reflections use CSS transforms and opacity, the ball paints at 30 fps, and animations pause in hidden tabs. Reduced motion keeps the ball and reflections stationary.

Upward swipes carry their release speed into the lift, measured over the last 100 ms. A quick short flick can dismiss the ball; slower swipes require more distance. The ball continues from its dragged position and the cable gently accelerates it offscreen. Tapping retains the normal retraction.
