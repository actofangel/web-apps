# web-apps

A collection of browser-based web applications by actofangel.
Each app lives in its own folder under `apps/` and runs directly in the browser, with no installation or build step.

## Apps

| App | Description | Demo |
| --- | --- | --- |
| [**Soma — Skin Overlay Studio**](apps/soma-skin-overlay-studio/) | A local-first studio for previewing tattoos and procedural scars on your own photograph, wrapped to the curves of the body | [Open](https://actofangel.github.io/web-apps/apps/soma-skin-overlay-studio/) |
| [**Chromatic Structure Lab**](apps/chromatic-structure-lab/) | Keeps the value structure of an image while moving its hues into a chosen chromatic climate, with OKLab color math on the GPU and PNG / `.cube` LUT export | [Open](https://actofangel.github.io/web-apps/apps/chromatic-structure-lab/) |
| [**Velagrafia**](apps/velagrafia/) | A precision watermark workspace with tiled, stamp and seal layouts, logo overlays, rights metadata and batch export | [Open](https://actofangel.github.io/web-apps/apps/velagrafia/) |

### Soma — Skin Overlay Studio

[![Soma — Skin Overlay Studio](apps/soma-skin-overlay-studio/screenshot.png)](apps/soma-skin-overlay-studio/)

### Chromatic Structure Lab

[![Chromatic Structure Lab](apps/chromatic-structure-lab/screenshot.png)](apps/chromatic-structure-lab/)

### Velagrafia

[![Velagrafia](apps/velagrafia/screenshot.png)](apps/velagrafia/)

## Structure

```
web-apps/
├── README.md
└── apps/
    └── <app-name>/
        ├── index.html   … the app
        └── README.md    … app-specific notes
```

To add a new app, create `apps/<app-name>/` and add a row to the table above.

## License

[MIT License](LICENSE) © 2026 actofangel

The sample images in Chromatic Structure Lab and Velagrafia are © 2026 actofangel, all rights reserved, and are not covered by the MIT License. See [LICENSE](LICENSE).
