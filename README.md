# MeshPrep — 3D Print Optimizer & STL Editor

**v1.0.0** — A browser-based 3D model viewer and optimizer for FDM/SLA 3D printing preparation. Runs entirely in the browser — no installation, no server, no dependencies beyond a modern web browser.

## Features

- **Load OBJ models** — drag & drop or file picker for Wavefront `.obj` files
- **Built-in presets** — Calibration Cube, Twisted Vase, Mechanical Gear, Hollow Sphere
- **Dimensional scaling** — uniform scale (0.1x–4.0x) and per-axis X/Y/Z sliders
- **Wall thickness** — surface normal displacement (±4mm) with Uniform / XY Planar / Z Height modes
- **Filament emulation** — 8 color presets + custom, Matte / Metal / Shiny / Translucent finishes
- **Slicer telemetry** — bounding envelope, solid volume (cm³), estimated PLA mass (g), triangle count, bed fit check
- **Auto-orient** — aligns the largest flat face to the build plate
- **UI themes** — Cyber Dark (cyan), Void Purple, Matrix Green, Forge Amber
- **Export STL** — watertight binary STL via native Save-As dialog or browser download fallback

## How to use

1. **Select a model** — pick a preset or load your own `.obj` file (drag & drop or click "Open OBJ File…")
2. **Scale the model** — use the Uniform Aspect Ratio slider or fine-tune X / Y / Z axes independently
3. **Adjust wall thickness** — offset shell vertices along normals to compensate for material shrinkage
4. **Style the preview** — pick a filament color and surface finish to visualize the print
5. **Review telemetry** — check the Slicer Telemetry Core panel for dimensions, weight, and bed fit
6. **Export** — click "Build & Export Watertight STL" to download the optimized model

**3D viewport controls:** Left-click drag = rotate · Right-click drag = pan · Scroll = zoom

## Running locally

Requires [Node.js](https://nodejs.org/) ≥ 18 and [npm](https://npmjs.com/).

```bash
git clone https://github.com/doccaz/meshprep
cd meshprep
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### Build for production

```bash
npm run build
# Output in dist/
```

## Tech stack

| Layer | Library |
|-------|---------|
| UI framework | React 19 + TypeScript |
| 3D rendering | Three.js v0.184 (WebGL) |
| Styling | Tailwind CSS v4 |
| Build | Vite 6 |
| Icons | Lucide React |

## Project structure

```
src/
├── App.tsx                 # Main component — controls, layout, theme, dialogs
├── index.css               # Tailwind, theme CSS variables, global styles
├── components/
│   └── ThreeViewer.tsx     # WebGL scene — mesh, lights, camera, grid
└── utils/
    └── meshUtils.ts        # OBJ parser, STL exporter, geometry generators, print analysis
```

## Credits

Made by **Erico Mendonça**

---

*Licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-or-later).*
