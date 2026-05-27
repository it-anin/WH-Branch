# Anin WMS — CLAUDE.md

# Role
คุณคือ Full Stack Developer มีประสบการณ์เขียนโปรแกรมเกี่ยวกับคลังสินค้ามากว่า 30 ปี ผ่านการใช้งานมาทุกระบบ ไม่ว่าจะระบบเล็กหรือใหญ่ ให้คำแนะนำจากประสบการณ์ที่ผ่านมา

**กฎสำคัญ:** เมื่อเพิ่มฟีเจอร์หรือแก้ไขโค้ด ต้องตรวจสอบให้ครอบคลุมกับโค้ดปัจจุบันทั้งหมด — ไม่ใช่แค่ไฟล์ที่แก้ไข แต่รวมถึง state, props, Firestore collections, และ screen ที่เกี่ยวข้องด้วย

## Project Overview
Warehouse Management System สำหรับ Anin (anin.co.th)
ใช้ระบบสแกนบาร์โค้ด → แพ็คสินค้าลงลัง → ปิดลัง → ส่งเข้า POS (manual)

**App title:** `Warehouse - Inbound & Outbound`

**Stack:** React 18 + Vite, JavaScript (no TypeScript), SheetJS (xlsx), Firebase Firestore, no CSS framework

**Hosting:** Vercel — `https://wh-branch.vercel.app` (auto-deploy เมื่อ push ขึ้น GitHub)

**Android app:** WebView wrapper (`android/`) — โหลด `https://wh-branch.vercel.app?android=1`, รับ scanner broadcast → inject `wh-scan` CustomEvent เข้า WebView

---

## Commands
```bash
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview build
```

---

## Architecture

### State Management
State ทั้งหมด lifted ขึ้นไปที่ `App.jsx` ไม่มี global state library

| State | Type | Firestore | คำอธิบาย |
|---|---|---|---|
| `boxes` | `Box[]` | ✅ `boxes/` collection | ลังทั้งหมด |
| `activeBoxId` | `string\|null` | ❌ local | ลังที่กำลังเปิดอยู่ |
| `packer` | `{code, name}\|null` | ❌ local | พนักงานที่เลือกอยู่ |
| `catalog` | `Item[]` | ✅ `config/catalog` | รายการเบิกสินค้า (จาก import) |
| `catalogByPacker` | `{[code]: Item[]}` | ✅ `config/catalogByPacker` | catalog แบ่งตามพนักงาน |
| `barcodeMap` | `{[sku__unit]: barcode[]}` | ✅ `config/barcodeMap` (array format) | map barcode จาก import |
| `costMap` | `{[sku__unit]: number}` | ✅ `config/costMap` (array format) | ราคาทุนต่อ SKU+unit จาก import |
| `itemsByBox` | `{[boxId]: Item[]}` | ✅ `boxItems/` collection | สินค้าที่แพ็คในแต่ละลัง |
| `scanProgress` | `{[boxId]: [{sku,got}]}` | ✅ `progress/` collection | in-progress scan (real-time dashboard) |
| `receiveBoxIds` | `string[]` | ✅ `config/receive` | ลังที่สาขารับแล้ว |
| `history` | `Entry[]` | ❌ localStorage | ประวัติย้อนหลัง (30 วัน) |
| `toasts` | `Toast[]` | ❌ local | notification queue |

**สำคัญ:** `boxes`, `itemsByBox`, `receiveBoxIds` ใช้ wrapper function (`setBoxes`, `setItemsByBox`, `setReceiveBoxIds`) ที่ sync ทั้ง local state และ Firestore พร้อมกัน — ห้ามเรียก `_setBoxes` / `_setItemsByBox` / `_setReceiveBoxIds` ตรงๆ ยกเว้นใน clearBoxes และ Firestore listener

Props ส่งผ่านทุก screen ด้วย `screenProps` spread pattern:
```js
const screenProps = { boxes, setBoxes, activeBoxId, setActiveBoxId, catalog, itemsByBox,
  setItemsByBox, history, setHistory, clearBoxes, clearFirestore, packer, setTab, showToast,
  createNewBox, generateCSV, triggerDownload, receiveBoxIds, setReceiveBoxIds, costMap };
```

### PACKERS (hardcoded ใน App.jsx)
```js
[
  { code: 'EMP-01', name: 'มุก' },
  { code: 'EMP-02', name: 'เก้า' },
  { code: 'EMP-03', name: 'เต้' },
  { code: 'EMP-04', name: 'ตั๋ง' },
]
```

### BRANCH_STAFF (hardcoded ใน BranchReceive.jsx)
```js
[
  { code: 'BR-01', name: 'ก้า' },
  { code: 'BR-02', name: 'กิ๊ฟ' },
  { code: 'BR-03', name: 'นิคกี้' },
  { code: 'BR-04', name: 'สุ่ย' },
]
```

---

## File Structure

```
android/                         # Android WebView app (Kotlin)
├── app/build.gradle             # compileSdk 34, minSdk 26, Play In-App Updates
├── app/src/main/
│   ├── AndroidManifest.xml      # INTERNET permission, portrait lock, NoActionBar
│   ├── java/co/anin/wh/
│   │   └── MainActivity.kt      # WebView + BroadcastReceiver + checkForUpdates()
│   └── res/layout/
│       └── activity_main.xml    # FrameLayout + WebView full screen

src/
├── App.jsx                      # Root — state, routing, helpers, Firestore sync
├── firebase.js                  # Firebase config + db export
├── data.js                      # generatePOS, matchBarcode (+ legacy mock data ยังไม่ได้ลบ)
├── main.jsx                     # React entry
├── styles.css                   # Global styles, CSS variables + media query mobile ≤640px
│
├── components/
│   ├── ImportCatalog.jsx        # Upload รายการเบิก (.csv/.xlsx)
│   ├── ImportBarcodeMap.jsx     # Upload barcode map (.csv/.xlsx)
│   ├── ImportCostMap.jsx        # Upload ราคาทุน (.csv/.xlsx) — ColA=SKU, ColD=unit, ColJ=cost
│   ├── Toast.jsx                # Fixed-bottom toast overlay
│   ├── TweaksPanel.jsx          # Dev panel (density/accent) — variant selector ไม่มีผลแล้ว
│   ├── Annotation.jsx           # Sticky note annotations (UI flavor)
│   └── SketchyBarcode.jsx       # SVG barcode renderer
│
└── screens/
    ├── PackerDashboard.jsx      # Tab: Dashboard — real-time X/Y ชิ้น + doughnut per packer
    ├── BoxList.jsx              # Tab: รายการเบิกสินค้า — ตารางลังทั้งหมด
    ├── PackScanC.jsx            # Tab: แพ็คกิ้ง — Checklist (variant เดียวที่ใช้)
    ├── BoxClosedLabel.jsx       # Tab: Outbound — สติกเกอร์ + ค้นหาสินค้าข้ามลัง + Export Excel
    ├── BranchReceive.jsx        # Tab: รับสินค้า (สาขา) — ยืนยันรับลัง
    ├── AndroidApp.jsx           # Android-only UI — 2 tabs (แพ็คกิ้ง + รับสินค้า) full-screen portrait
    ├── PackScanA.jsx            # (unused — ลบออกจาก routing แล้ว)
    ├── PackScanB.jsx            # (unused — ลบออกจาก routing แล้ว)
    ├── ExportPOS.jsx            # (unused — ลบออกจาก routing แล้ว)
    ├── LookupByBoxBarcode.jsx   # (unused — ลบออกจาก routing แล้ว)
    └── FlowDiagram.jsx          # (unused — replaced by PackerDashboard)
```

---

## Tabs (TABS array ใน App.jsx)

| key | label | screen |
|---|---|---|
| `flow` | Dashboard | PackerDashboard |
| `list` | รายการเบิกสินค้า | BoxList + ImportCatalog + ImportBarcodeMap |
| `scan` | แพ็คกิ้ง | PackScanC เท่านั้น |
| `closed` | Outbound | BoxClosedLabel |
| `receive` | 📥 รับสินค้า (สาขา) | BranchReceive |

Default tab: `flow` — `showAll = false`

---

## Firebase / Firestore

### Config
ไฟล์: `src/firebase.js` — export `db`, `auth`, `onAuthReady`
Project: `warehousetobranch` (asia-southeast1)

**Anonymous Auth:** `signInAnonymously(auth)` เรียกทันทีที่โหลด app — ทุก Firestore read/write ต้องมี `request.auth != null`
```js
export const db = getFirestore(app);
export const auth = getAuth(app);
signInAnonymously(auth).catch(() => {});
export const onAuthReady = (cb) => onAuthStateChanged(auth, (user) => { if (user) cb(user); });
```

### Collections / Documents

| path | ข้อมูล | รูปแบบ |
|---|---|---|
| `boxes/{boxId}` | ข้อมูลลัง | Box object |
| `boxItems/{boxId}` | สินค้าในลัง | `{ items: Item[] }` |
| `progress/{boxId}` | in-progress scan | `{ items: [{sku, got}] }` |
| `config/catalog` | catalog ทั้งหมด | `{ items: Item[] }` |
| `config/barcodeMap` | barcode map | `{ entries: [{key, barcodes}] }` ← array format (ไม่ใช่ object) |
| `config/costMap` | ราคาทุน | `{ entries: [{key, cost}] }` ← array format (key = `sku__unit`) |
| `config/catalogByPacker` | การแบ่งรายการ | `{ assignments: {[code]: Item[]} }` |
| `config/receive` | ลังที่รับแล้ว | `{ ids: string[] }` |
| `config/boxCounter` | serial counter ต่อวัน | `{ [ddmm]: number }` ← atomic counter สำหรับ createNewBox |

**barcodeMap ใช้ array format** เพื่อหลีก Firestore "too many index entries" limit

### Real-time Sync Pattern
- **Write:** wrapper functions (`setBoxes`, `setItemsByBox`, etc.) → optimistic local update + Firestore write
- **Read:** `onSnapshot` listeners ใน single `useEffect` → อัพเดท local state อัตโนมัติ
- **clearBoxes:** bypass wrapper, ใช้ `writeBatch` delete ตรงๆ (boxes + boxItems + progress) แล้วอัพเดท refs และ _set* functions
- **clearFirestore:** full reset — ลบทุก collection รวมถึง config/* ด้วย, reset local state ทั้งหมด

---

## Key Functions (App.jsx)

### `createNewBox()` — async
```js
// ใช้ Firestore Transaction กับ config/boxCounter เพื่อป้องกัน Box ID ซ้ำข้ามพนักงาน
await runTransaction(db, async (tx) => {
  const snap = await tx.get(counterRef);
  const next = (data[todayKey] || 0) + 1;
  tx.set(counterRef, { ...data, [todayKey]: next });
  newId = `BX-${todayKey}-${String(next).padStart(4, '0')}`;
});
setBoxes(prev => [newBox, ...prev]);
setActiveBoxId(newId);
return newId;
```
**สำคัญ:** เป็น async — ทุก caller ต้อง `await createNewBox()` เสมอ

### `applyBarcodeMap(items, map)`
Logic 3 ระดับ (key = `sku__unit`):
1. `sku__unit` ตรงกับ map → ใช้ barcode จาก map ✓
2. SKU อยู่ใน map แต่ unit ไม่ตรง → `barcode: ''` (ป้องกัน wrong unit match) ✓
3. SKU ไม่มีใน map เลย → ใช้ barcode เดิมจาก ColC (fallback) ✓

**สำคัญ:** unit ใน barcode map (ColG) **ต้องตรงกับ unit ในรายการเบิก (ColE)** ทุกตัวอักษร เช่น `กล่อง`, `ชิ้น`, `10ชิ้น` — ถ้า ColG ว่างเปล่า key จะเป็น `sku__` ซึ่งไม่ match กับ catalog → barcode ว่าง

### `handleBarcodeMapImport(map)`
- อัพเดท `catalog`, `catalogByPacker`, `barcodeMap` พร้อมกัน
- Sync ทั้ง 3 ไปยัง Firestore (`config/catalog`, `config/catalogByPacker`, `config/barcodeMap`)

### `handleScanProgress(boxId, items)`
- เรียกจาก PackScanC ทุกครั้งที่สแกน 1 ชิ้น
- `items = []` → `deleteDoc(progress/{boxId})` (กรณีปิดลัง)
- `items มีข้อมูล` → `setDoc(progress/{boxId}, { items: [{sku, got}] })`

### `clearBoxes()`
- บันทึก snapshot ลัง → localStorage history (เก็บ 30 วัน)
- writeBatch ลบ: `boxes/*`, `boxItems/*`, `progress/*`, `config/receive`
- reset refs และ local state (_setBoxes, _setItemsByBox, _setReceiveBoxIds)

### `handleCostMapImport(map)`
- รับ `map = {[sku__unit]: cost}` จาก ImportCostMap
- `setCostMap(map)` → local state
- แปลงเป็น `entries = [{key, cost}]` → `setDoc(config/costMap, { entries })`
- แสดง toast จำนวนรายการที่ import

### `clearFirestore()`
- confirm dialog ก่อนลบ
- writeBatch ลบ: `boxes/*`, `boxItems/*`, `progress/*`, `config/catalog`, `config/barcodeMap`, `config/catalogByPacker`, `config/costMap`, `config/receive`
- reset local state ทั้งหมด (boxes, itemsByBox, receiveBoxIds, catalog, catalogByPacker, barcodeMap, costMap)

### `distributeCatalog(items)`
สุ่มแบ่ง round-robin → เรียงตาม original file row order → sync `config/catalogByPacker`

### Android Scanner Bridge (App.jsx `useEffect`)
Global listener รับ `wh-scan` CustomEvent ที่ Android inject เข้ามา → หา input ที่ focused → inject barcode ผ่าน native setter trick → dispatch Enter keydown:
```js
const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
nativeSetter.call(input, barcode);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
```
**สำคัญ:** handler ใน BranchReceive (`handleScan`, `handleItemScan`) ต้องอ่าน `e.target.value` (DOM) ไม่ใช่ state — เพราะ state update เป็น async และ closure อาจ stale

---

## Three-File Import System

### ไฟล์ 1: รายการเบิกสินค้า (ImportCatalog)
| Col | ข้อมูล |
|---|---|
| B (1) | SKU |
| C (2) | Barcode (ColC — fallback ถ้า SKU ไม่มีใน barcode map) |
| D (3) | ชื่อสินค้า |
| E (4) | หน่วย |
| F (5) | จำนวน (qty) |
| G (6) | Location |

### ไฟล์ 2: Barcode Map (ImportBarcodeMap)
| Col | ข้อมูล |
|---|---|
| A (0) | Barcode |
| E (4) | SKU |
| G (6) | หน่วย |

### ไฟล์ 3: Cost Map (ImportCostMap)
| Col | ข้อมูล |
|---|---|
| A (0) | SKU |
| D (3) | หน่วย |
| J (9) | ราคาทุน |

**Import order:** catalog ก่อน → barcode map → cost map (แต่ละไฟล์ import แยกอิสระ)
**Re-import:** ต้อง import ทั้งสองไฟล์แรกใหม่ถ้าแก้ไข applyBarcodeMap logic

---

## Box Status Flow
```
open → packing → closed → exported → received
```

### Status Badge Colors (BoxList.jsx)
| status | label | สี |
|---|---|---|
| open / packing | กำลังแพ็ค | 🟡 เหลือง `#ffd080` |
| closed | ปิดลังแล้ว | 🔵 ฟ้า `#b8d4f0` |
| exported | อนุมัติแล้ว | 🟢 เขียว `#96e096` |
| received | รับที่สาขาแล้ว | 🟣 ม่วง `#d4b8f5` |

สีกำหนดด้วย inline style ตรงที่ `<span className="chip" style={{ background, borderColor }}>` — ไม่ใช้ CSS class เพื่อให้ชัดเจนต่างกัน

---

## LocalStorage Keys
| key | ข้อมูล |
|---|---|
| `wh_tab` | tab ที่เปิดอยู่ |
| `wh_tweaks` | TweaksPanel settings |
| `wh_history` | ประวัติลังที่ clear แล้ว (30 วัน) |

---

## PackScanC — Logic สำคัญ
- `items` state เก็บ: `{ sku, barcode, name, unit, need, got, location }`
- **`barcode` field ใน item card ต้องแสดงเสมอ** — ใช้ยืนยัน barcode ก่อนสแกน ห้ามลบออกจาก card rendering
- Barcode lookup ใช้ `catalog` prop (ไม่ใช่ local `items`) เพื่อให้ unit validation ทำงานถูกต้อง
- **Optimistic UI:** `setItems(newItems)` เรียกก่อน `await createNewBox()` — UI อัพทันที Firestore sync ใน background
- `handleBarcode`: validate barcode → `setItems` ทันที → `createNewBox()` ถ้าไม่มี activeBoxId → `onScanProgress`
- `isClosing` state — block การสแกนระหว่าง doClose กำลัง await createNewBox
- ทุกครั้งที่สแกนสำเร็จ → เรียก `onScanProgress(boxId, newItems)` → Firestore `progress/{boxId}`
- **`doClose()`** — component-level async function (ไม่ nested ใน handleCloseBox):
  1. `setIsClosing(true)` + capture `closingBoxId = activeBoxId`
  2. บันทึก boxes + itemsByBox + clear progress
  3. **reset `items` / `page` / `search` ทันที ก่อน await** — ป้องกันสแกนซ้ำลงลังเก่า
  4. `await createNewBox()` — เปิดลังใหม่
  5. `setIsClosing(false)`
- **`confirmClose`** state — แทน `window.confirm`: inline popover เหนือปุ่มปิดลัง แสดงเมื่อสินค้ายังไม่ครบ
- เมื่อปิดลัง: บันทึกเฉพาะ item ที่ `got > 0`, ลบ item ที่ `got >= need` ออกจาก checklist, เปิดลังใหม่อัตโนมัติ
- **ต้องเลือกพนักงานก่อน** ถึงจะเห็นรายการสินค้า — ถ้า `packer === null` แสดง placeholder แทน PackScanC
- Toast: `'error'` สำหรับ scan ล้มเหลว, `'success'` สำหรับปิดลัง/เปิดลังใหม่สำเร็จ
- **Android mode** (`isAndroid` = module-level const จาก `?android=1`):
  - Layout 2 rows: barcode input + ปิดลัง (row 1) / search (row 2) — ไม่ใช้ `.btn.lg` / `.input.big`
  - `barcodeRef` + `useEffect` คืน focus กลับ barcode input หลังทุก render — ป้องกัน scanner ยิงผิด field
  - Card: padding/font เล็กลง, ยังแสดง barcode เหมือนเดิม

## PackerDashboard — Logic สำคัญ
- แสดง real-time counter ใหญ่: `totalGot / totalNeed ชิ้น`
- `totalGot` = closed boxes (จาก `itemsByBox`) + in-progress (จาก `scanProgress`) ต่อ packer
- `scanProgress` ข้าม-reference กับ `boxes` เพื่อหา packer ของแต่ละ in-progress box
- Props: `catalogByPacker, boxes, itemsByBox, PACKERS, scanProgress`

## Outbound (BoxClosedLabel) — Logic สำคัญ
- Tab label: **Outbound** (เดิม: Box & Label)
- Global search ข้ามทุก closed box โดยไม่ต้องเลือกลังก่อน
- สติกเกอร์ขนาด 90×65mm — barcode ใช้ Box ID — ชื่อคลัง: "คลังสินค้า · WH-01"
- รายชื่อสินค้ามีตาราง: SKU / ชื่อสินค้า / หน่วย / จำนวน / Location
- ปุ่ม "⇩ ส่งออกไฟล์ Text" → export `.txt` แบบ TSV ไม่มี header: `barcode\tจำนวนสินค้า\tทุนสินค้า`
  - ทุนสินค้า = ดึงจาก `costMap[sku__unit]` (0 ถ้ายังไม่ได้ import cost map)
  - **ล็อก:** ใช้งานได้เฉพาะเมื่อ `box.status === 'exported'` เท่านั้น
- ปุ่ม "🖨 พิมพ์ใบปิดลัง" → **ล็อกเช่นกัน** จนกว่า `box.status === 'exported'`
- **ปุ่ม "⇩ Export Excel"** (frame-header ขวา) — export **ทุกลังที่ปิดแล้ว** เป็นไฟล์ `.xls` HTML table:
  - คอลัมน์: เลขที่ลังสินค้า / เลขที่เอกสาร / SKU / ชื่อสินค้า / Barcode / หน่วย / จำนวน / พนักงานแพ็คสินค้า / วันที่ส่งสินค้า (DD/MM/YYYY)
  - Font: Anuphan, column width กำหนดด้วย `<col width>` + inline style บน cell
  - active เมื่อมี closedBoxes อย่างน้อย 1 ลัง (ไม่ต้องเลือกลัง)
- **อนุมัติเอกสาร:** ต้องกรอก **เลขที่เอกสาร** ก่อน → บันทึก `box.pos` + status → `exported`
- ปุ่ม 🔥 ล้าง Firestore ทั้งหมด → เรียก `clearFirestore()` จาก App.jsx

## BoxList — Logic สำคัญ
- คอลัมน์ตาราง: Box ID / สถานะ / พนักงาน / SKU / ชิ้น / **เลขที่เอกสาร** / อัปเดต (ไม่มีปุ่ม action)
- Badge header นับ: กำลังแพ็ค = `open + packing`, ปิดลังแล้ว = `closed`, อนุมัติแล้ว = `exported`

## BranchReceive — Logic สำคัญ
- **ต้องเลือกพนักงานก่อน** ถึงจะใช้หน้านี้ได้ — ถ้า `branchStaff === null` แสดง placeholder
- **`BRANCH_STAFF`** (hardcoded ใน BranchReceive.jsx):
  ```js
  [{ code: 'BR-01', name: 'ก้า' }, { code: 'BR-02', name: 'กิ๊ฟ' },
   { code: 'BR-03', name: 'นิคกี้' }, { code: 'BR-04', name: 'สุ่ย' }]
  ```
- Phase: `scan` → `verify` → `result` (3 phases)
- **`scanCounts`** = `{[sku]: number}` นับจำนวนชิ้นที่สแกนจริงต่อ SKU (ไม่ใช่ binary Set)
  - สแกน 1 ครั้ง = +1 ชิ้น, ต้องครบ `item.qty` ถึงจะผ่าน
  - สแกนเกิน qty → แสดง error "ครบ X ชิ้นแล้ว"
  - **Blind receiving:** ไม่มีคลิกแถวเพื่อติ๊ก, ไม่มีปุ่ม "ติ๊กครบทั้งหมด" — ติ๊กได้วิธีเดียวคือยิงบาร์โค้ดเท่านั้น
- `fullyChecked(item)` = `scanCounts[sku] >= item.qty`
- `allChecked` = ทุก item ผ่าน fullyChecked
- reset `scanCounts` เมื่อสแกนลังใหม่ / ข้ามลัง / สแกนลังถัดไป / handleApprove / handleRecheck
- **ตารางตรวจสอบสินค้า (phase verify):** แสดงคอลัมน์ SKU / ชื่อ / Barcode / หน่วย / สแกนแล้ว
  - ไม่มีคอลัมน์ ✓ และไม่มีตัวเลขเปลี่ยนสีเมื่อครบ — ตัวเลขสีดำเสมอ (Blind)
  - **พนักงานสาขาไม่เห็นจำนวนที่ควรมีในลัง (`needed`)** — เห็นแค่จำนวนที่สแกนไปแล้ว (`count`)
- **Phase `result`** (หลังกด ✓ ยืนยันรับสินค้า):
  - `verifyResult` = `'ok'` (allChecked) หรือ `'fail'` (ไม่ครบ)
  - **OK:** badge "สินค้าถูกต้อง" (เขียว) + ปุ่ม **✓ อนุมัติ** → `handleApprove()` → status `received`
  - **Fail:** badge "สินค้าไม่ถูกต้อง" (แดง) + input รหัสหัวหน้างาน + ปุ่ม **🔄 รีเช็คสินค้า** → `handleRecheck()` → reset + phase `verify`
  - `isViewingOther` = `false` เสมอใน phase `result` (ไม่ override ด้วย viewingId)
  - การ์ด active ใน phase `result` แสดง watermark **"รออนุมัติ"** กระพริบ 45deg มุมขวาบน
- **badge จำนวนลัง** แสดง `scannedBoxes.length` (ไม่ใช่ `receiveBoxIds.length`) เพื่อป้องกันตัวเลขเกินจริงกรณี stale IDs
- **`viewingId`** = local state สำหรับดูสินค้าในลังใดก็ได้จากแผงซ้าย (ใช้ได้เฉพาะ phase `scan` และ `verify`)
  - `isViewingOther = viewingId !== null && phase !== 'result' && (phase === 'scan' || viewingId !== activeBoxId)`
  - ปุ่ม "× ปิด" ใน read-only view → `setViewingId(null)` → กลับ panel ปกติ
- **Re-scan fix:** `setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id])` — ย้ายลังที่สแกนซ้ำไปท้าย array เสมอ
- **`handleScanNext`** (ปุ่ม "+ สแกนลังถัดไป"): reset ทุก state รวมถึง `verifyResult`, `supervisorCode` → `phase = 'scan'`
- ปุ่ม "+ สแกนลังถัดไป" แสดงเฉพาะ `phase === 'verify'` หรือ `phase === 'result'`
- **BoxCard `isPendingApproval`**: `i === 0 && phase === 'result'` → watermark CSS `@keyframes blink` ใน styles.css

---

## Toast Types
`showToast(message, type?)` รองรับ 3 type — นิยามสีใน `Toast.jsx`:

| type | สี | ใช้เมื่อ |
|---|---|---|
| `'default'` (ค่า default) | พื้นดำ / ตัวขาว | แจ้งทั่วไป |
| `'error'` | พื้นแดง | validation fail, ข้อผิดพลาด, scan ไม่พบ |
| `'success'` | พื้นเขียว | บันทึกสำเร็จ, อนุมัติแล้ว, ปิดลังสำเร็จ |

```js
showToast('บันทึกแล้ว ✓')                        // default
showToast('⚠ กรุณากรอกเลขที่เอกสาร', 'error')   // แดง
showToast('อนุมัติแล้ว ✓', 'success')            // เขียว
```

## CSS Chip Classes (styles.css)
| class | สี | ใช้เมื่อ |
|---|---|---|
| `chip` | cream/paper | neutral, default |
| `chip ok` | เขียว `#d8e8c4` | สำเร็จ |
| `chip warn` | เหลือง `#fae5b0` | เตือน, in-progress |
| `chip err` | แดง `#f5c2bb` | error |
| `chip info` | ฟ้า `#c4d8f5` | ข้อมูล |

**หมายเหตุ:** BoxList ใช้ inline style บน chip โดยตรง (ไม่ใช้ class) เพื่อสีที่ชัดเจนและไม่ซ้ำกัน

---

## Android App (`android/`)

### โครงสร้าง
```
android/
├── settings.gradle / build.gradle / gradle.properties
├── gradle/wrapper/gradle-wrapper.properties  (Gradle 8.2)
└── app/
    ├── build.gradle            compileSdk 34, minSdk 26 (Android 8+)
    └── src/main/
        ├── AndroidManifest.xml  portrait lock, NoActionBar, INTERNET permission
        ├── java/co/anin/wh/
        │   └── MainActivity.kt
        └── res/layout/activity_main.xml
```

### MainActivity.kt — สิ่งสำคัญ
- `WEBAPP_URL = "https://wh-branch.vercel.app?android=1"` — `?android=1` trigger Android-only UI (AndroidApp.jsx)
- WebView: `javaScriptEnabled`, `domStorageEnabled`, `setSupportZoom(false)`, `MIXED_CONTENT_NEVER_ALLOW`
- **BroadcastReceiver** ลงทะเบียนใน `onResume` / ยกเลิกใน `onPause`

### Scanner Broadcast Integration
| ยี่ห้อ | Action | Extra key |
|---|---|---|
| KTE | `com.kte.scan.result` | `scanResult` |
| Zebra | `com.kte.scan.result` | `SCAN_BARCODE_1` |
| Honeywell | — | `data` |
| DataWedge | — | `com.symbol.datawedge.data_string` |

Android inject barcode → WebView ด้วย:
```kotlin
webView.evaluateJavascript(
    "window.dispatchEvent(new CustomEvent('wh-scan',{detail:'$safe'}))", null
)
```
React (App.jsx) รับด้วย `window.addEventListener('wh-scan', ...)` → inject เข้า focused input

### Play Store In-App Updates
ใช้ `com.google.android.play:app-update-ktx:2.1.0` — Flexible update (ดาวน์โหลดใน background)
เรียก `checkForUpdates()` ทุกครั้งที่ `onResume` — จะแสดง dialog อัตโนมัติเมื่อมีเวอร์ชันใหม่ใน Play Store

### วิธี Build
1. เปิด folder `android/` ใน Android Studio
2. รัน `gradle wrapper` ครั้งแรก (สร้างไฟล์ `gradlew`)
3. Build APK / AAB → upload Play Console

**GitHub Actions:** push ไฟล์ใน `android/**` → build debug APK อัตโนมัติ → download จาก Actions Artifacts

---

## Android Mode (`?android=1`)

**Detection:** `const isAndroidMode = new URLSearchParams(window.location.search).get('android') === '1';`
- ใช้ใน `App.jsx` (module scope) และ `PackScanC.jsx` (module scope)
- `isAndroid` ใน PackScanC, `isAndroidMode` ใน App.jsx

**App.jsx:** ถ้า `isAndroidMode` → render `<AndroidApp>` แทน desktop layout ทั้งหมด
- ไม่มี topbar, tabs, canvas, TweaksPanel
- Annotations ซ่อนด้วย `--note-display: none`

**AndroidApp.jsx (`src/screens/AndroidApp.jsx`):**
- Full-screen fixed layout (`position: fixed; inset: 0`)
- 2 tabs ด้านล่าง (height 56px): 📦 แพ็คกิ้ง / 📥 รับสินค้า
- Pack tab: packer selector strip (compact) + PackScanC fills remaining height
- Receive tab: BranchReceive fills full height
- `setTab={() => {}}` — ปิด navigation ที่ไม่เกี่ยว

**PackScanC Android layout:**
- Scan area: 2 rows แทน 1 row (barcode+ปิดลัง / search)
- ปุ่มปิดลัง: `.btn.primary` ขนาดปกติ (ไม่ใช้ `.btn.lg`)
- `barcodeRef` + `useEffect` (ไม่มี dependency) คืน focus หลังทุก render
- Card: padding 8px, font 13px, barcode แสดงเสมอ (10px สีแดง)

---

## Mobile / PDA CSS (styles.css)
`@media (max-width: 640px)` — สำหรับเครื่อง handheld scanner แนวตั้ง 600px wide:
- Canvas padding ลดเหลือ 8px
- `.grid-2`, `.grid-3-pack` stack เป็น single column
- Tab font เล็กลง, chip/btn sm compact
- `index.html`: `user-scalable=no` ป้องกัน pinch-zoom

---

## Notes
- ไฟล์ที่ไม่ได้ใช้แล้ว: `PackScanA.jsx`, `PackScanB.jsx`, `ExportPOS.jsx`, `LookupByBoxBarcode.jsx`, `FlowDiagram.jsx` — ยังอยู่ในโปรเจกต์แต่ไม่ได้ import ใน routing
- `data.js` ยังมี mock data ที่ไม่ได้ใช้ — ควรลบออก
- ไม่มี TypeScript, ไม่มี test suite
- PDA support: **แนะนำ Broadcast Mode** (`com.kte.scan.result`) — ไม่มีปัญหา barcode ต่อกัน ไม่ต้องพึ่ง HID keyboard
- Firestore Security Rules: `request.auth != null` — Firebase Anonymous Auth enabled (ไม่มีวันหมดอายุ)
