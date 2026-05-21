# Anin WMS — CLAUDE.md

# Role
คุณคือ Full Stack Developer มีประสบการณ์เขียนโปรแกรมเกี่ยวกับคลังสินค้ามากว่า 30 ปี ผ่านการใช้งานมาทุกระบบ ไม่ว่าจะระบบเล็กหรือใหญ่ ให้คำแนะนำจากประสบการณ์ที่ผ่านมา

**กฎสำคัญ:** เมื่อเพิ่มฟีเจอร์หรือแก้ไขโค้ด ต้องตรวจสอบให้ครอบคลุมกับโค้ดปัจจุบันทั้งหมด — ไม่ใช่แค่ไฟล์ที่แก้ไข แต่รวมถึง state, props, Firestore collections, และ screen ที่เกี่ยวข้องด้วย

## Project Overview
Warehouse Management System สำหรับ Anin (anin.co.th)
ใช้ระบบสแกนบาร์โค้ด → แพ็คสินค้าลงลัง → ปิดลัง → ส่งเข้า POS (manual)

**Stack:** React 18 + Vite, JavaScript (no TypeScript), SheetJS (xlsx), Firebase Firestore, no CSS framework

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

### PACKERS (hardcoded)
```js
[
  { code: 'EMP-01', name: 'มุก' },
  { code: 'EMP-02', name: 'เก้า' },
  { code: 'EMP-03', name: 'เต้' },
  { code: 'EMP-04', name: 'ตั๋ง' },
]
```

---

## File Structure

```
src/
├── App.jsx                      # Root — state, routing, helpers, Firestore sync
├── firebase.js                  # Firebase config + db export
├── data.js                      # generatePOS, matchBarcode (+ legacy mock data ยังไม่ได้ลบ)
├── main.jsx                     # React entry
├── styles.css                   # Global styles, CSS variables
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
    ├── BoxClosedLabel.jsx       # Tab: Box & Label — สติกเกอร์ + ค้นหาสินค้าข้ามลัง
    ├── BranchReceive.jsx        # Tab: รับสินค้า (สาขา) — ยืนยันรับลัง
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
| `closed` | Box & Label | BoxClosedLabel |
| `receive` | 📥 รับสินค้า (สาขา) | BranchReceive |

Default tab: `flow` — `showAll = false`

---

## Firebase / Firestore

### Config
ไฟล์: `src/firebase.js` — export `db` จาก `getFirestore(app)`
Project: `warehousetobranch` (asia-southeast1)

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

**barcodeMap ใช้ array format** เพื่อหลีก Firestore "too many index entries" limit

### Real-time Sync Pattern
- **Write:** wrapper functions (`setBoxes`, `setItemsByBox`, etc.) → optimistic local update + Firestore write
- **Read:** `onSnapshot` listeners ใน single `useEffect` → อัพเดท local state อัตโนมัติ
- **clearBoxes:** bypass wrapper, ใช้ `writeBatch` delete ตรงๆ (boxes + boxItems + progress) แล้วอัพเดท refs และ _set* functions
- **clearFirestore:** full reset — ลบทุก collection รวมถึง config/* ด้วย, reset local state ทั้งหมด

---

## Key Functions (App.jsx)

### `createNewBox()`
```js
const newId = generateBoxId(boxesRef.current);  // ใช้ ref ไม่ใช่ state
const newBox = { id: newId, ..., createdAt: Date.now() };
setBoxes(prev => [newBox, ...prev]);  // wrapper → sync Firestore
setActiveBoxId(newId);
return newId;  // PackScanC ใช้ return value นี้ใน handleBarcode
```

### `applyBarcodeMap(items, map)`
Logic 3 ระดับ:
1. SKU + unit ตรงกับ map → ใช้ barcode จาก map ✓
2. SKU อยู่ใน map แต่ unit ไม่ตรง → `barcode: ''` (ป้องกัน wrong unit match) ✓
3. SKU ไม่มีใน map เลย → ใช้ barcode เดิมจาก ColC (fallback) ✓

### `handleBarcodeMapImport(map)`
- อัพเดท `catalog`, `catalogByPacker`, `barcodeMap` พร้อมกัน
- Sync ทั้ง 3 ไปยัง Firestore (`config/catalog`, `config/catalogByPacker`, `config/barcodeMap`)

### `handleScanProgress(boxId, items)`
- เรียกจาก PackScanC ทุกครั้งที่สแกน 1 ชิ้น
- `items = []` → `deleteDoc(progress/{boxId})` (กรณีปิดลัง)
- `items มีข้อมูล` → `setDoc(progress/{boxId}, { items: [{sku, got}] })`

### `clearBoxes()`
- บันทึก snapshot ลัง → localStorage history (เก็บ 30 วัน)
- writeBatch ลบ: `boxes/*`, `boxItems/*`, `progress/*`
- reset refs และ local state (_setBoxes, _setItemsByBox)

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
- Barcode lookup ใช้ `catalog` prop (ไม่ใช่ local `items`) เพื่อให้ unit validation ทำงานถูกต้อง
- `handleBarcode`: capture `boxId = createNewBox()` return value ถ้า activeBoxId ยังเป็น null
- ทุกครั้งที่สแกนสำเร็จ → เรียก `onScanProgress(boxId, newItems)` → Firestore `progress/{boxId}`
- เมื่อปิดลัง: บันทึกเฉพาะ item ที่ `got > 0`, ลบ item ที่ `got >= need` ออกจาก checklist, เรียก `onScanProgress(activeBoxId, [])` เพื่อ clear progress, เปิดลังใหม่อัตโนมัติ
- **ต้องเลือกพนักงานก่อน** ถึงจะเห็นรายการสินค้า — ถ้า `packer === null` แสดง placeholder แทน PackScanC

## PackerDashboard — Logic สำคัญ
- แสดง real-time counter ใหญ่: `totalGot / totalNeed ชิ้น`
- `totalGot` = closed boxes (จาก `itemsByBox`) + in-progress (จาก `scanProgress`) ต่อ packer
- `scanProgress` ข้าม-reference กับ `boxes` เพื่อหา packer ของแต่ละ in-progress box
- Props: `catalogByPacker, boxes, itemsByBox, PACKERS, scanProgress`

## Box & Label — Logic สำคัญ
- Global search ข้ามทุก closed box โดยไม่ต้องเลือกลังก่อน
- สติกเกอร์ขนาด 90×65mm — barcode ใช้ Box ID
- รายชื่อสินค้ามีตาราง: SKU / ชื่อสินค้า / หน่วย / จำนวน / Location
- ปุ่ม "⇩ ส่งออกไฟล์ Text" → export `.txt` แบบ TSV ไม่มี header: `barcode\tจำนวนสินค้า\tทุนสินค้า`
  - ทุนสินค้า = ดึงจาก `costMap[sku__unit]` (0 ถ้ายังไม่ได้ import cost map)
  - guard: ถ้า boxItems ว่าง → แสดง toast แทน (กรณีลังเก่าก่อน Firestore sync)
- ปุ่ม 🗑 ลบ ต่อ history entry → ลบออกจาก localStorage เท่านั้น (Firestore ถูกลบไปแล้วตอน clearBoxes)
- ปุ่ม 🔥 ล้าง Firestore ทั้งหมด → เรียก `clearFirestore()` จาก App.jsx

## BranchReceive — Logic สำคัญ
- Phase: `scan` (สแกนบาร์โค้ดลัง) → `verify` (ตรวจสินค้าในลัง)
- **`scanCounts`** = `{[sku]: number}` นับจำนวนชิ้นที่สแกนจริงต่อ SKU (ไม่ใช่ binary Set)
  - สแกน 1 ครั้ง = +1 ชิ้น, ต้องครบ `item.qty` ถึงจะผ่าน
  - สแกนเกิน qty → แสดง error "ครบ X ชิ้นแล้ว"
  - คลิกแถว → toggle ระหว่าง 0 และเต็ม qty (กรณีตรวจมือ)
  - ปุ่ม "ติ๊กครบทั้งหมด" → ตั้งทุก SKU เป็น qty เต็ม
- `fullyChecked(item)` = `scanCounts[sku] >= item.qty`
- `allChecked` = ทุก item ผ่าน fullyChecked
- reset `scanCounts` เมื่อสแกนลังใหม่ / ข้ามลัง / สแกนลังถัดไป / ยืนยันรับ
- **`viewingId`** = local state สำหรับดูสินค้าในลังใดก็ได้จากแผงซ้าย (แยกจาก activeBoxId)
  - คลิกการ์ดลัง → toggle `viewingId` (ถ้าคลิกซ้ำ → null = ปิด)
  - `isViewingOther = viewingId !== null && (phase === 'scan' || viewingId !== activeBoxId)`
    - **ใน phase `scan`:** คลิกการ์ดใด ๆ → `isViewingOther = true` → แสดง read-only view
    - **ใน phase `verify`:** คลิกการ์ด active → `isViewingOther = false` → แสดง checklist ปกติ; คลิกการ์ดอื่น → `isViewingOther = true` → แสดง read-only view
  - ปุ่ม "× ปิด" ใน read-only view → `setViewingId(null)` → กลับ panel ปกติ
- **Re-scan fix:** `setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id])` — ย้ายลังที่สแกนซ้ำไปท้าย array เสมอ (ทำให้เป็น activeBoxId ใหม่)
- **One-at-a-time:** `handleConfirm` auto-reset ทุก state กลับ phase `scan` ทันที พร้อม toast "พร้อมสแกนลังถัดไป"
- **`handleScanNext`** (ปุ่ม "+ สแกนลังถัดไป"): reset `scanCounts`, `query`, `viewingId` → `phase = 'scan'`
- ปุ่ม "+ สแกนลังถัดไป" แสดงเฉพาะ `phase === 'verify'` (ไม่ขึ้นกับ `isReceived`)

---

## Notes
- ไฟล์ที่ไม่ได้ใช้แล้ว: `PackScanA.jsx`, `PackScanB.jsx`, `ExportPOS.jsx`, `LookupByBoxBarcode.jsx`, `FlowDiagram.jsx` — ยังอยู่ในโปรเจกต์แต่ไม่ได้ import ใน routing
- `data.js` ยังมี mock data ที่ไม่ได้ใช้ — ควรลบออก
- ไม่มี TypeScript, ไม่มี test suite
- PDA support: scanner ทำงานเป็น HID keyboard → Enter key → รองรับแล้ว
- Firestore Security Rules: test mode (expire 2026-05-26) — ต้องกำหนด rules จริงก่อน expire
