# Suna Pinku ♡

A pocket-sized pink sand garden, built on [Sandboard](https://github.com/scottstts/Sandboard) by scottstts.

Draw with multiple fingers, press heart, star, unicorn, bunny, flower, bow, cat, and dog imprints into the sand, and shake them apart. Choose sakura, candy, or lilac pink. Tap the small cog impressed into the sand to open the radial shape selector and tools. The cog survives resets. “Cuteness Impermanence” appears as an opening sand inscription, then disappears. Tools include adjustable brush/stamp sizes, a fresh-sand wash, fullscreen, and optional phone motion.

## Run locally

```sh
npm ci
npm run dev
```

The sandbox requires hardware WebGPU. Use Safari on iOS 26+ or a compatible current desktop browser. Phone motion and PWA installation need a secure context; testing from another device requires HTTPS, not an ordinary HTTP LAN address.

## Offline app

```sh
npm run build
npm run preview
```

Open the production preview, wait for “Ready for offline play” in **Keep me**, then install through the browser or iPhone's **Share → Add to Home Screen**. Development mode deliberately skips service worker registration. Palette preferences are remembered; sand drawings are not persisted across reloads.

## Roadmap

Future sparkle effects, shiny rocks and gems, and a Japanese stamp wheel are tracked in [ROADMAP.md](ROADMAP.md). These are ideas, not current features.

## Publishing

The GitHub Pages workflow builds and publishes pushes to `main`. `SITE_BASE_PATH` sets the deployment subdirectory; local development defaults to `/`. The manifest, sound assets, and offline cache respect the deployment path.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:gpu
npm run build
```

GPU tests need access to a hardware adapter. See [interaction design](docs/pinku-play.md) for simulation and PWA behavior.

## License

GPL-3.0-only. Original Sandboard code and attribution are retained; see [LICENSE](LICENSE). This fork is also distributed under GPL-3.0-only.

The bundled Caveat handwritten typeface is licensed under the [SIL Open Font License](public/fonts/OFL-Caveat.txt).
