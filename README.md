# anin-stock · Warehouse Scan & Pack

React + Vite starter for the warehouse scan wireframes. Open this folder in VS Code and run:

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Scripts

- `npm run dev` — start Vite dev server with HMR
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the built bundle

## Project structure

```
vite-app/
├── index.html                  # HTML entry + Google Fonts
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                # ReactDOM root
    ├── App.jsx                 # Tabs + routing + tweaks state
    ├── styles.css              # All the sketchy styling
    ├── data.js                 # Sample SKU / box / checklist data
    ├── components/
    │   └── SketchyBarcode.jsx
    └── screens/
        ├── BoxList.jsx
        ├── PackScanC.jsx       # Variant C — packing checklist
        ├── BoxClosedLabel.jsx
        └── LookupByBoxBarcode.jsx
```

> ⚠️ README นี้เขียนไว้ตั้งแต่ยุค prototype และ **ล้าสมัยไปมาก** (ผังไฟล์ด้านบนตัดเฉพาะไฟล์ที่ถูกลบออกแล้ว
> แต่ยังไม่ครบของจริง) — **ให้ยึด `CLAUDE.md` เป็นเอกสารหลักของโปรเจกต์**

## Where to go next

- **Wire real data** — replace `src/data.js` with API calls (fetch / axios / tanstack-query).
- **Router** — add `react-router-dom` if you want actual URLs per screen.
- **Scanner hook** — listen for `keydown` bursts with short gaps; most USB scanners act as keyboards and end with `Enter`.
- **Print** — the sticker preview in `BoxClosedLabel.jsx` is ready for `window.print()` + a print-only stylesheet.
- **POS number format** — still TBD; currently a 14-digit placeholder in `BoxClosedLabel.jsx`.
- **Auth / users** — no login yet; the top bar shows a hard-coded "ผู้ใช้: ต้น".

## Open in VS Code

```bash
code vite-app
```

Recommended extensions: **ES7+ React snippets**, **Prettier**, **Live Share**.
