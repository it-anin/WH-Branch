# Anin WMS — CLAUDE.md

# Role
คุณคือ Full Stack Developer มีประสบการณ์เขียนโปรแกรมเกี่ยวกับคลังสินค้ามากว่า 30 ปี ผ่านการใช้งานมาทุกระบบ ไม่ว่าจะระบบเล็กหรือใหญ่ ให้คำแนะนำจากประสบการณ์ที่ผ่านมา

**กฎสำคัญ:** เมื่อเพิ่มฟีเจอร์หรือแก้ไขโค้ด ต้องตรวจสอบให้ครอบคลุมกับโค้ดปัจจุบันทั้งหมด — ไม่ใช่แค่ไฟล์ที่แก้ไข แต่รวมถึง state, props, Firestore collections, และ screen ที่เกี่ยวข้องด้วย

**🔒 กฎ Flow หลัก (สถานะ: พอใจแล้ว — ห้ามแก้โดยไม่แจ้ง):**
Flow **สแกนลงลัง (PackScanC) → ส่งออก/อนุมัติเอกสาร (BoxClosedLabel/Outbound) → รับสินค้าเข้าสาขา (BranchReceive)** ถือว่าเสถียรและใช้งานจริงแล้ว
- **ถ้าการแก้ไขใด ๆ จะกระทบ flow นี้** (เช่น `createNewBox`, `doClose`, box status flow, `handleScanProgress`, `receivePending`/`problemReported`/`textExported`, การยืนยันรับ/อนุมัติ) → **ต้องแจ้งผู้ใช้ก่อนเสมอ** อธิบายผลกระทบ แล้วรอยืนยันก่อนลงมือ
- งาน UI/คอสเมติก หรือฟีเจอร์เสริม (เช่น Dashboard ตัวการ์ตูน) ที่ **ไม่แตะ** logic flow → แก้ได้ตามปกติ

## Project Overview
Warehouse Management System สำหรับ Anin (anin.co.th)
ใช้ระบบสแกนบาร์โค้ด → แพ็คสินค้าลงลัง → ปิดลัง → ส่งเข้า POS (manual)

**App title:** `Warehouse - Inbound & Outbound`

**Stack:** React 18 + Vite, JavaScript (no TypeScript), SheetJS (xlsx), Firebase Firestore, no CSS framework

**Fonts:** `system-ui` (sans-serif default ของ OS) ทุกที่ + `JetBrains Mono` (`.mono` class) สำหรับ SKU/barcode/box ID — เดิมใช้ Patrick Hand / Caveat / Kalam แต่ sweep ออกหมดแล้ว, index.html โหลด Google Fonts แค่ JetBrains Mono ตัวเดียว

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
| `lotMap` | `{[sku]: [{lot, qty}]}` | ✅ `config/lotMap` (array format) | LOT + qty คงเหลือต่อ SKU (key by SKU only ไม่มี unit) |
| `itemsByBox` | `{[boxId]: Item[]}` | ✅ `boxItems/` collection | สินค้าที่แพ็คในแต่ละลัง |
| `scanProgress` | `{[boxId]: [{sku,got}]}` | ✅ `progress/` collection | in-progress scan (real-time dashboard) |
| `receiveBoxIds` | `string[]` | ✅ `config/receive` | ลังที่สาขารับแล้ว |
| `pendingApprovalBoxId` | `string\|null` | ❌ local | ลังที่รอการอนุมัติ (BranchReceive) — เก็บใน App.jsx เพื่อคงอยู่เมื่อสลับ tab |
| `history` | `Entry[]` | ✅ `history/{docId}` collection | ประวัติย้อนหลัง 7 วัน — sync ทุกเครื่อง (localStorage เก่าเป็น migration fallback ตอน first load) |
| `toasts` | `Toast[]` | ❌ local | notification queue |
| `zoneAssignments` | `{[code]: string[]}` | ✅ `config/zoneAssignments` | โซนที่กำหนดให้แต่ละพนักงาน (desktop only) |
| `showZoneAssign` | `boolean` | ❌ local | toggle modal กำหนดโซน |
| `catalogMeta` | `{branch, fileDate}\|null` | ✅ `config/catalog._meta` | metadata ของ Picklist ที่ import ล่าสุด |
| `barcodeMapMeta` | `{fileName, fileDate}\|null` | ✅ `config/barcodeMap._meta` | metadata ของ barcode map ที่ import ล่าสุด |
| `costMapMeta` | `{fileDate}\|null` | ✅ `config/costMap._meta` | metadata ของ cost map ที่ import ล่าสุด |
| `lotMapMeta` | `{fileDate}\|null` | ✅ `config/lotMap._meta` | metadata ของ LOT map ที่ import ล่าสุด |

**สำคัญ:** `boxes`, `itemsByBox`, `receiveBoxIds` ใช้ wrapper function (`setBoxes`, `setItemsByBox`, `setReceiveBoxIds`) ที่ sync ทั้ง local state และ Firestore พร้อมกัน — ห้ามเรียก `_setBoxes` / `_setItemsByBox` / `_setReceiveBoxIds` ตรงๆ ยกเว้นใน clearBoxes และ Firestore listener

Props ส่งผ่านทุก screen ด้วย `screenProps` spread pattern:
```js
const screenProps = { boxes, setBoxes, activeBoxId, setActiveBoxId, catalog, itemsByBox,
  setItemsByBox, history, setHistory, clearBoxes, clearFirestore, packer, setTab, showToast,
  createNewBox, generateCSV, triggerDownload, receiveBoxIds, setReceiveBoxIds, costMap, lotMap,
  pendingApprovalBoxId, setPendingApprovalBoxId };
```

### PACKERS (hardcoded ใน App.jsx)
```js
[
  { code: 'EMP-01', name: 'มุก' },
  { code: 'EMP-02', name: 'แล็ค' },
  { code: 'EMP-03', name: 'พี' },     // เปิดสล็อตเดิม (เต้ ออกแล้ว) ให้พนักงานใหม่ — ใช้ procedural avatar (ยังไม่มี sprite)
  { code: 'EMP-04', name: 'ตั๋ง' },
]
```

### BRANCHES + พนักงานต่อสาขา (`src/branches.js` — single source of truth)
แต่ละสาขามีพนักงานของตัวเอง; **เลือกสาขาตอนเปิดแอป Android** (หน้าแรก) → เลือกพนักงานของสาขานั้น
```js
// src/branches.js
export const BRANCHES = [
  { code: 'SRC', name: 'SRC', staff: [ก้า, กิ๊ฟ, สุ่ย, นิคกี้, อ๊อฟ(pharmacist)] },
  { code: 'KKL', name: 'KKL', staff: [แตงโม, ทราย, ออด(pharmacist)] },
  { code: 'SSS', name: 'SSS', staff: [ออย, ฟ้าใส, เบส(pharmacist)] },
];
export const ALL_BRANCH_STAFF = ...  // flatten ทุกสาขา (+ branch code) — ใช้ใน Desktop staff filter
```
- **code สาขา = suffix ของ Picklist** (`Picklist_SRC` → `SRC`) → ตรงกับ `catalogMeta.branch` และ `box.branch`
- **`role: 'pharmacist'`** = สิทธิ์เดียวที่มีตอนนี้ — ตรวจใน `handleScan` (BranchReceive) ว่าให้เข้า recheck mode หรือบล็อก. แต่ละสาขามีเภสัช 1 คน
- **AndroidApp — flow 3 ขั้น:** (1) **เลือกที่ทำงาน** → (2) **เลือกพนักงาน** → (3) **หน้าสแกน** — แต่ละขั้นเป็นหน้าจอเต็ม gate ด้วย `if (!branch)` / `if (!currentStaff)`
  - **ขั้น 1 เลือกที่ทำงาน:** **WAREHOUSE** + 3 สาขา; location เก็บใน `localStorage['wh_branch']`
    - **WAREHOUSE** (sentinel `{code:'WAREHOUSE', warehouse:true}` — module-level, **ไม่อยู่ใน BRANCHES**) → โหมดแพ็คกิ้ง
    - **สาขา (SRC/KKL/SSS)** → โหมดรับสินค้า
  - **ขั้น 2 เลือกพนักงาน:** `staffList = isWarehouse ? PACKERS : branch.staff`; `currentStaff/setStaff = isWarehouse ? packer/setPacker : branchStaff/setBranchStaff` (packer = lifted ที่ App.jsx, branchStaff = local) — เภสัชมี tag 💊; ปุ่ม "← เปลี่ยนที่ทำงาน" → `changeBranch`
    - **staff ไม่ persist** — `selectBranch`/`changeBranch` ล้าง packer+branchStaff เสมอ → reload แล้วต้องเลือกพนักงานใหม่ทุกครั้ง (location ยังจำได้)
  - **ขั้น 3 หน้าสแกน:** PackScanC (warehouse) / BranchReceive (`branch={branch.code}`); header โชว์ ที่ทำงาน + 👤 พนักงาน + ปุ่ม "เปลี่ยน" (`setStaff(null)` → กลับขั้น 2) — ไม่มี bottom bar / tab switching แล้ว (เคยมีป้ายโหมด "📦 แพ็คกิ้ง"/"📥 รับสินค้า" ใต้จอ ลบออกแล้วเพราะซ้ำซ้อนกับ header)
- **เดิม** เคย hardcode `BRANCH_STAFF` (BR-01..BR-05) ซ้ำใน BranchReceive.jsx + AndroidApp.jsx — ย้ายมา `branches.js` แล้ว (BranchReceive import `ALL_BRANCH_STAFF`, AndroidApp import `BRANCHES`)

### กรองลังตามสาขา (Android receive)
- **`box.branch`** (field บน box) — set ตอน `createNewBox` จาก `catalogMeta?.branch` (สาขาของ Picklist ที่ import ล่าสุด) → sync Firestore `boxes/{id}`
- BranchReceive รับ prop `branch` (Android = สาขาที่เลือก, Desktop = `null` เห็นทุกสาขา):
  - `matchBranch(b)` = `!branch || !b.branch || b.branch === branch` → กรอง `approvalBoxes` + `pendingCount`/`problemCount`
  - **`handleScan`:** block + toast แดง ถ้า `box.branch && box.branch !== branch` ("เป็นของสาขา X ไม่ใช่ Y")
  - ลังไม่มี `branch` (legacy/Picklist ไม่มี suffix) → เห็นได้/สแกนได้ทุกสาขา (fallback)

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
│   ├── ImportLotMap.jsx         # Upload LOT (.csv/.xlsx) — ColA=LOT, ColB=SKU, ColF=qty
│   ├── ZoneAssign.jsx           # Modal กำหนดโซน (desktop only) — checkbox table packer × zone
│   ├── Toast.jsx                # Fixed-bottom toast overlay
│   ├── TweaksPanel.jsx          # (unused — ไม่ได้ import แล้ว)
│   ├── Annotation.jsx           # (unused — ไม่ได้ import แล้ว)
│   └── SketchyBarcode.jsx       # SVG barcode renderer
│
└── screens/
    ├── PackerDashboard.jsx      # Tab: Dashboard — real-time X/Y ชิ้น + doughnut per packer
    ├── BoxList.jsx              # Tab: รายการเบิกสินค้า — ตารางลังทั้งหมด
    ├── PackScanC.jsx            # Tab: แพ็คกิ้ง — Checklist (variant เดียวที่ใช้)
    ├── BoxClosedLabel.jsx       # Tab: Outbound (รายการส่งสินค้า) — สติกเกอร์ + ค้นหาข้ามลัง + filter สถานะ/พนักงาน + แก้ไขลังมีปัญหา
    ├── BranchReceive.jsx        # Tab: รับสินค้า (สาขา) — ยืนยันรับลัง
    ├── AndroidApp.jsx           # Android-only UI — flow 3 ขั้น (เลือกที่ทำงาน→พนักงาน→สแกน) full-screen portrait
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
| `config/lotMap` | LOT + qty | `{ entries: [{key, lots: [{lot, qty}]}] }` ← key = SKU only, lots = array ของ object |
| `history/{docId}` | ประวัติลังที่ clear (7 วัน) | `{ dateKey, label, clearedAt, boxes: [...] }` ← docId = `String(Date.now())` ตอน clear |
| `config/catalogByPacker` | การแบ่งรายการ | `{ assignments: {[code]: Item[]} }` |
| `config/receive` | ลังที่รับแล้ว | `{ ids: string[] }` |
| `config/boxCounter` | serial counter ต่อวัน | `{ [ddmm]: number }` ← atomic counter สำหรับ createNewBox |
| `config/zoneAssignments` | โซนต่อพนักงาน | `{ assignments: {[code]: string[]} }` ← array ของ zone prefix เช่น `['A','B','COOL']` |

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
// todayKey = `${dd}${mm}` (DDMM — วัน-เดือน, ค.ศ. ไม่มีปี)
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

**Box ID format:** `BX-{DDMM}-{NNNN}` เช่น `BX-0206-0001` (วันที่ 2 มิ.ย. ลังที่ 1) — `NNNN` reset ทุกวันที่ counter key เปลี่ยน. **ลังเก่าก่อน 1 มิ.ย. 2026** จะมี format เก่า `BX-{MMDD}-{NNNN}` — ระบบยังอ่านได้ปกติเพราะใช้ exact match ตรง box.id ไม่มี logic ที่ parse วัน/เดือนจากตัวเลข

### `applyBarcodeMap(items, map)`
Logic 3 ระดับ (key = `sku__unit`):
1. `sku__unit` ตรงกับ map → ใช้ barcode จาก map ✓
2. SKU อยู่ใน map แต่ unit ไม่ตรง → `barcode: ''` (ป้องกัน wrong unit match) ✓
3. SKU ไม่มีใน map เลย → ใช้ barcode เดิมจาก ColC (fallback) ✓

**สำคัญ:** unit ใน barcode map (ColG) **ต้องตรงกับ unit ในรายการเบิก (ColE)** ทุกตัวอักษร เช่น `กล่อง`, `ชิ้น`, `10ชิ้น` — ถ้า ColG ว่างเปล่า key จะเป็น `sku__` ซึ่งไม่ match กับ catalog → barcode ว่าง

**⚠ ใช้ SheetJS อ่านทุกไฟล์แล้ว** (`ImportBarcodeMap.jsx`, `ImportCatalog.jsx`, `ImportLotMap.jsx`):
- เดิม: ใช้ regex `/\.xlsx?$/i` แยก `.xlsx` (→ SheetJS) กับ `.csv`/อื่นๆ (→ custom CSV parser `splitCSVLine`)
- ปัจจุบัน: **ทุกไฟล์อ่านผ่าน `XLSX.read(buffer, {type: 'array'})`** ของ SheetJS เสมอ (รวม `.106`, `.csv`) — SheetJS detect format อัตโนมัติและจัดการ quoted fields ตาม CSV standard ครบถ้วน
- **เหตุผล:** ไฟล์ R05.106 (CSV ที่ extension `.106`) มีชื่อสินค้ามีเครื่องหมาย `"` (นิ้ว/inch) เช่น `NIPRO 18G x 1"` และมี `,` ในชื่อด้วย — custom CSV parser เดิมจะดูด column ที่เหลือเข้าเป็น field เดียว ทำให้ unit/barcode หาย
- **LOT file** ใช้ `{raw: false}` เพิ่ม → SheetJS คืน formatted text แทน raw datetime serial (เช่น LOT `"01/02/2026"` แทน `45669`)
- **อาการเดิม (ก่อนแก้):** barcode/unit ไม่ขึ้นในหน้าแพ็คกิ้ง, debug `__wh.sku('SKU')` จะเห็น key = `sku__` (unit ว่าง), `barcode: ''` ใน catalog
- **`splitCSVLine` ที่ยังเหลือใน ImportCostMap.jsx** — แก้ `"` กลางฟิลด์เป็น literal เช่นกัน แต่ไฟล์ Price ปกติเป็น `.xlsx` ทำให้ไม่ค่อยกระทบ

### `handleBarcodeMapImport(map)`
- อัพเดท `catalog`, `catalogByPacker`, `barcodeMap` พร้อมกัน
- Sync ทั้ง 3 ไปยัง Firestore (`config/catalog`, `config/catalogByPacker`, `config/barcodeMap`)

### `handleScanProgress(boxId, items)`
- เรียกจาก PackScanC ทุกครั้งที่สแกน 1 ชิ้น
- `items = []` → `deleteDoc(progress/{boxId})` (กรณีปิดลัง)
- `items มีข้อมูล` → `setDoc(progress/{boxId}, { items: [{sku, got}] })`

### `clearBoxes()`
- บันทึก snapshot ลัง → Firestore `history/{Date.now()}` (sync ทุกเครื่อง) + optimistic local update
- writeBatch ทำในรอบเดียว: `batch.set(history/{id}, entry)` + `batch.delete(history/{id})` entries เก่ากว่า 7 วัน + ลบ `boxes/*`, `boxItems/*`, `progress/*`, `config/receive`
- reset refs และ local state (_setBoxes, _setItemsByBox, _setReceiveBoxIds)
- **migration:** ตอน app load ครั้งแรก ถ้ามี `wh_history` ใน localStorage เก่า → ใช้เป็น initial state ก่อน Firestore listener overwrite

### `handleCostMapImport(map)`
- รับ `map = {[sku__unit]: cost}` จาก ImportCostMap
- `setCostMap(map)` → local state
- แปลงเป็น `entries = [{key, cost}]` → `setDoc(config/costMap, { entries })`
- แสดง toast จำนวนรายการที่ import

### `handleLotMapImport(map)`
- รับ `map = {[sku]: [{lot, qty}]}` จาก ImportLotMap
- `setLotMap(map)` → local state
- แปลงเป็น `entries = [{key, lots: [{lot, qty}]}]` → `setDoc(config/lotMap, { entries })`
- แสดง toast `LOT map: N SKU · M LOT ✓`

### `clearFirestore()`
- confirm dialog ก่อนลบ
- writeBatch ลบ: `boxes/*`, `boxItems/*`, `progress/*`, `history/*`, `config/catalog`, `config/barcodeMap`, `config/catalogByPacker`, `config/costMap`, `config/lotMap`, `config/receive`
- reset local state ทั้งหมด (boxes, itemsByBox, receiveBoxIds, catalog, catalogByPacker, barcodeMap, costMap, lotMap, history)

### `handleZoneAssign(assignments)`
- รับ `assignments = {[code]: string[]}` จาก ZoneAssign modal (desktop only)
- `setZoneAssignments(assignments)` → local state
- กรอง catalog ตาม zone ที่กำหนด → สร้าง `catalogByPacker` ใหม่:
  - พนักงานที่มี zone assigned → items ที่ location prefix ตรงกับ zone นั้น
  - พนักงานที่ไม่มี zone → ได้รับ catalog ทั้งหมด (fallback)
- sync `config/zoneAssignments` + `config/catalogByPacker` ไปยัง Firestore
- PackScanC re-mount ทันทีด้วย `key={packer.code}-${(catalogByPacker[packer.code] || catalog).length}`

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

## Four-File Import System

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

### ไฟล์ 4: LOT Map (ImportLotMap)
| Col | ข้อมูล |
|---|---|
| A (0) | LOT |
| B (1) | SKU |
| F (5) | จำนวนคงเหลือ (qty) — ใช้รวมหักลบกันก่อน filter |

**LOT aggregation logic (2 passes):**
1. รวม qty ของแต่ละ `(SKU, LOT)` ทุก row → `totals[sku][lot] = sum`
2. เก็บเฉพาะ LOT ที่ `sum > 0` → `map[sku] = [{lot, qty: sum}, ...]`

ตัวอย่าง: `F0224` มี 2 rows คือ `-36` และ `+36` → sum = 0 → **ไม่ขึ้น popup** (สต็อกหมดเพราะรับคืน/โอนออกหมด)

**`parseWorkbook` รองรับทั้ง CSV และ XLSX:** detect ด้วย `/\.csv$/i.test(file.name)` → CSV อ่านเป็น text ผ่าน `FileReader.readAsText(file, 'utf-8')` + `XLSX.read(input, { type: 'string' })`, XLSX อ่านเป็น ArrayBuffer + `type: 'array'`. ใช้ `sheet_to_json(ws, { header: 1, raw: true, defval: '' })` เพื่อให้ string cell คง LOT format เดิม (เช่น `001/25` ไม่ถูกแปลงเป็นเลข)

**Import order:** catalog ก่อน → barcode map → cost map → LOT map (แต่ละไฟล์ import แยกอิสระ)
**Re-import:** ต้อง import ทั้งสองไฟล์แรกใหม่ถ้าแก้ไข applyBarcodeMap logic
**LOT structure backward-compat:** Firestore listener รับได้ทั้งรูปแบบเก่า (`lots: [string]` → จะ normalize เป็น `{lot, qty: Infinity}`) และใหม่ (`lots: [{lot, qty}]`) — ต้อง re-import เพื่อ get qty จริง

### Import Button UX (หน้า Tab: รายการเบิกสินค้า)
ปุ่ม 4 ปุ่มเรียงเป็น column แยกแถว:

| ปุ่ม | ก่อนอัปโหลด | หลังอัปโหลด |
|---|---|---|
| ImportCatalog | `⇑ อัปโหลดไฟล์ Picklist` (ไม่มีสี) | `✅ อัปโหลดไฟล์ Picklist_XXX แล้ว` (สีส้ม) + badge `✅ รายการเบิก: N รายการ · ไฟล์วันที่ D/M/YYYY` |
| ImportBarcodeMap | `⇑ อัปโหลดไฟล์ R05.106` (ไม่มีสี) | `✅ อัปโหลดไฟล์ {filename} แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportCostMap | `⇑ อัปโหลดไฟล์ Price` (ไม่มีสี) | `✅ อัปโหลดไฟล์ Price แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportLotMap | `⇑ อัปโหลดไฟล์ LOT` (ไม่มีสี) | `✅ อัปโหลดไฟล์ LOT แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |

- **XXX** ใน Picklist — parse จาก filename pattern `Picklist_XXX` (regex `picklist[_-]([A-Za-z0-9]+)`) เช่น `Picklist_SRC` → `SRC`
- **{filename}** ใน Barcode — ชื่อไฟล์ไม่มีนามสกุล เช่น `R05.106`
- วันที่ใน badge ทุกปุ่มมาจาก **`file.lastModified`** (Date Modified จริงของไฟล์ ไม่ใช่วันที่อัปโหลด)
- badge sync ผ่าน Firestore `_meta` field — **ทุกเครื่องเห็นเหมือนกัน** และยังอยู่หลัง reload (App.jsx อ่าน `catalogMeta` / `barcodeMapMeta` / `costMapMeta` จาก `onSnapshot` → ส่งเป็น `meta` prop ให้แต่ละ component)
- **ImportLotMap มี progress bar ระหว่างอัปโหลด** (ไฟล์ LOT มักใหญ่ + aggregation 2-pass + Firestore write ก้อนใหญ่ → ช้ากว่าไฟล์อื่น): state `stage` (`reading` 15% → `parsing` 45% → `saving` 75% → `done` 100%) แสดงแถบ progress + label แทนปุ่ม/chip ปกติระหว่างอัปโหลด, ปุ่ม disable กันกดซ้ำ; ใช้ `setTimeout(fn, 0)` คั่นก่อนงาน sync หนัก (parse) เพื่อให้ browser repaint stage label ก่อน freeze
  - **`handleLotMapImport` (App.jsx) return promise ของ `setDoc`** (ไม่ fire-and-forget แบบไฟล์อื่น) — ให้ ImportLotMap รู้ว่า Firestore เขียนเสร็จจริงเมื่อไหร่ ก่อนโชว์ `done` + toast success

---

## Box Status Flow
```
open → packing → closed → exported → received
```

### Box object — fields เสริม (นอกจาก id/status/packer/pos/skuCount/totalQty/updated/createdAt)
| field | ตั้งค่าเมื่อ | ใช้ที่ | ล้างเมื่อ |
|---|---|---|---|
| `textExported` | กดส่งออกไฟล์ Text (Outbound) | disable ปุ่มส่งออก Text กันส่งซ้ำ | clearBoxes (ลบ box) |
| `receivePending` | Android กดยืนยันรับ (ผล ok) | Desktop receive แสดง card รออนุมัติ + tab badge | handleApprove (→ received) |
| `receivedBy` | Android กดยืนยันรับ | BoxCard "ตรวจสอบโดย:" + staff filter (desktop) | — (คงไว้) |
| `receivingBy` | Android `startReceive` (กำลังตรวจ) | ล็อกลัง — กันพนักงานอื่นสแกนซ้ำขณะตรวจ (ไม่มี timeout) | confirm/report/scanNext |
| `problemReported` / `problemResolved` | Android ยืนยันแจ้งปัญหา / Outbound กดแก้ไข-อนุมัติ | Desktop รับสินค้า: card กรอบแดง + ปุ่ม ตรวจสอบ/แก้ไขแล้ว | — (คงไว้เป็นประวัติ) |
| `problemReviewed` | (1) เภสัชกด "บันทึกรายละเอียด" Desktop, (2) **auto-set** เมื่อ pharmacist recheck-fail (Android) | gate ให้ Outbound ขึ้น badge + ตารางแก้ไข (ไม่ขึ้นทันทีตอน Android แจ้ง) | — |
| `problemImage` | Android แนบรูป (ย่อ base64 JPEG ~800px) | Desktop ตรวจสอบ/Outbound แสดงรูปหลักฐาน | — |
| `problemType` | `'incomplete'` (สแกนไม่ครบ+ยืนยัน) / `'damaged'` (แจ้งปัญหา+รูป) | ปุ่ม card: incomplete→"🔁 รีเช็คสินค้า" (ส้ม), damaged→"🔍 ตรวจสอบ" (แดง) | — |
| `problemBy` / `problemAt` / `problemScanCounts` / `problemNote` | Android แจ้งปัญหา/ยืนยันไม่ครบ (+ หัวหน้าบันทึก note หรือ auto-gen note จาก pharmacist recheck) | หาว่าสินค้าตัวไหนขาด (ตัวแดง) + รายละเอียด | — |
| `problemConfirmedBy` / `problemConfirmedAt` | pharmacist กด ยืนยัน recheck-fail (Android) | audit trail — เภสัชยืนยันสินค้าขาดจริง (ไม่ใช่ staff error) | — |
| `problemResolvedBy` / `problemResolvedAt` | pharmacist กด ยืนยัน recheck-ok (Android) | audit trail — สินค้าครบหลังคลังแก้ไข | — |

**สำคัญ:** fields เหล่านี้ sync ผ่าน `setBoxes` (เขียนทั้ง box object → Firestore `boxes/{id}`) — ข้ามเครื่องได้ (Android ↔ Desktop)

### Status Badge Colors (BoxList.jsx)
| status | label | สี |
|---|---|---|
| open / packing | กำลังแพ็ค | 🟡 เหลือง `#ffd080` |
| closed | ปิดลังแล้ว | 🔵 ฟ้า `#b8d4f0` |
| exported | อนุมัติแล้ว | 🟢 เขียว `#96e096` |
| received | **สาขารับสินค้าแล้ว** | 🩷 ชมพู `#f5b8d4` (border `#c04080`) |

สีกำหนดด้วย inline style ตรงที่ `<span className="chip" style={{ background, borderColor }}>` — ไม่ใช้ CSS class เพื่อให้ชัดเจนต่างกัน

**Summary chip row (เหนือตาราง):** มี 5 chips นับสถานะ — `ทั้งหมด` / `กำลังแพ็ค` / `ปิดลังแล้ว` / `อนุมัติแล้ว` / `สาขารับสินค้าแล้ว` (ใช้สีเดียวกันกับ status badge ในตาราง)

---

## LocalStorage Keys
| key | ข้อมูล |
|---|---|
| `wh_tab` | tab ที่เปิดอยู่ |
| `wh_history` | (deprecated) ประวัติลังที่ clear แล้ว — ตอนนี้ย้ายไป Firestore `history/*` แล้ว, key นี้คงไว้เป็น migration fallback (อ่านครั้งเดียวตอน init, ไม่ได้เขียนใหม่) |

---

## PackScanC — Logic สำคัญ
- `items` state เก็บ: `{ sku, barcode, name, unit, need, got, location }`
- **Init `items` หักของที่แพ็คไปแล้ว:** useState initializer คำนวณ `need = catalog.qty − จำนวนที่พนักงานคนนี้แพ็คไปแล้ว` (รวมจาก `itemsByBox` ของลัง status `closed`/`exported`/`received` ที่ `packer.code` ตรงกัน) แล้ว `.filter(need > 0)` — กันสินค้าที่ลงลังครบแล้วโผล่ซ้ำหลัง remount (สลับแท็บ) / reload
  - in-session: `doClose()` หัก `need -= got` + ตัดตัวที่ `got >= need` ออก — สอดคล้องกับ initializer (catalog total − packed ทั้งหมด)
- **`barcode` field ใน item card ต้องแสดงเสมอ** — ใช้ยืนยัน barcode ก่อนสแกน ห้ามลบออกจาก card rendering
- **`c.exp` ใน item card** — แสดงบรรทัด `EXP: {exp}` (สีส้ม accent) ใต้ barcode เฉพาะเมื่อมีค่า (กรอกผ่าน "✎ ใส่ LOT เอง" เท่านั้น — ดู *LOT Selection*)
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
- **`confirmClose`** state — แทน `window.confirm`: ใช้ `createPortal(content, document.body)` render ตรงไปที่ root DOM — แสดง dialog ตรงกลางจอ ทำงานทั้ง Android และ Desktop โดยไม่ถูก stacking context ของ AndroidApp (`position: fixed; inset: 0`) บัง
  - Portal อยู่ที่ top-level ของ component (ก่อน `showHistory`) — ไม่อยู่ใน Android/Desktop branch ใดทั้งนั้น
- เมื่อปิดลัง: บันทึกเฉพาะ item ที่ `got > 0`, ลบ item ที่ `got >= need` ออกจาก checklist, เปิดลังใหม่อัตโนมัติ
- **ต้องเลือกพนักงานก่อน** ถึงจะเห็นรายการสินค้า — ถ้า `packer === null` แสดง placeholder แทน PackScanC
- Toast: `'error'` สำหรับ scan ล้มเหลว, `'success'` สำหรับปิดลัง/เปิดลังใหม่สำเร็จ
  - ปิดลังสำเร็จ → `"ปิดลัง BX-xxxx แล้ว ✓"` (ไม่มีข้อความ "เปิดลังใหม่อัตโนมัติ")
- **`catalogMeta` prop** — รับจาก AndroidApp → แสดงใน frame-header (Android): `เช็ค X/Y · 📋 Picklist_สาขา วันที่`
- **Android mode** (`isAndroid` = module-level const จาก `?android=1`):
  - Layout 2 rows: barcode input + ปิดลัง (row 1) / search (row 2) — ไม่ใช้ `.btn.lg` / `.input.big`
  - ไม่มีปุ่ม "+ ใหม่" บน Android — ปิดลังแล้วเปิดลังใหม่อัตโนมัติจาก `doClose()` เสมอ
  - `barcodeRef` + `useEffect` (ไม่มี dependency) คืน focus กลับ barcode input หลังทุก render **ยกเว้นเมื่อ `showSearch === true`** — ป้องกัน focus ถูกดึงกลับขณะพิมพ์ค้นหา
  - Card: padding/font เล็กลง, ยังแสดง barcode เหมือนเดิม
  - **Sort สินค้าที่ครบ (`got >= need`) ลงท้าย list** (stable sort) — ของยังไม่ครบขึ้นบน ไม่ต้อง scroll หา

### LOT Selection (PackScanC Android)
- รับ prop `lotMap` ผ่าน `screenProps` — มี structure `{[sku]: [{lot, qty}]}` (qty = สต็อกเริ่มต้น)
- **`calcLotUsage()`**: รวมการใช้ LOT ทั้งหมด (key = `sku__lot`) จาก closed boxes (`itemsByBox` ของลัง `closed/exported/received`) + ลังปัจจุบัน (`items.got > 0`)
- **`getAvailableLots(sku)`**: filter LOT ที่ `qty − usage > 0` พร้อมคำนวณ `remaining`
- **`processBarcode` flow:**
  1. validate SKU/barcode → match item
  2. ถ้า `allLots.length === 0` (SKU ไม่มีใน lotMap) → สแกนปกติไม่มี LOT
  3. ถ้า `availableLots.length === 0` (LOT หมดทั้งหมด) → **block scan** + toast `⚠ LOT หมดทั้งหมด สต็อกไม่พอ`
  4. ถ้า `match.lot` ยังอยู่ใน availableLots → ใช้ต่อไม่ popup
  5. Android + `>1 available` → `setPendingLot({match, lots: availableLots})` → popup เด้ง
  6. ไม่งั้น auto-pick `availableLots[0].lot`
- **`applyScan(match, lot, resetLot=false, exp='')`**: เพิ่ม `got+1`, set `item.lot` (ถ้า resetLot=true จะ overwrite LOT เดิม กรณีสลับเพราะ LOT หมด), set `item.exp` เฉพาะเมื่อมี `exp` ส่งมา (จาก manual entry เท่านั้น — LOT ที่เลือกจาก list ไม่มี exp)
- **Popup UI** (`pendingLot` state, render ผ่าน `createPortal` → `document.body`) — 2 โหมดสลับด้วย `manualLotMode`:
  - **โหมดเลือกจาก list (default):** แสดง SKU + ชื่อสินค้า + ปุ่ม LOT แต่ละตัว (`lot` + `เหลือ N`) → คลิก → `handleLotSelect(lot)` → `applyScan(match, lot, true)` → ปิด popup, scan complete
    - ปุ่ม **"✎ ใส่ LOT เอง"** → `setManualLotMode(true)` สลับไปฟอร์มกรอกเอง
    - ปุ่ม "ยกเลิก" (ไม่นับ scan) → `closeLotPopup()`
  - **โหมดใส่ LOT เอง (`manualLotMode=true`):** ฟอร์ม LOT (text input) + Exp พ.ศ. 3 ช่อง DD/MM/YYYY (ทุกช่องเป็น numeric input, digit-only filter + length cap ผ่าน `.replace(/[^0-9]/g,'').slice(n)`) — **ไม่ใช้ dropdown เดือนแบบเดิม (เคยเป็น `<select>` ชื่อเดือนไทย ลบ `THAI_MONTHS` ออกไปแล้ว)**
    - `handleManualLotConfirm()`: validate LOT ต้องไม่ว่าง; Exp ต้องกรอกครบทั้ง 3 ช่องหรือไม่กรอกเลย (กรอกบางช่อง → toast error) → ประกอบเป็น `DD/MM/YYYY` (zero-pad D/M ด้วย `.padStart(2,'0')`) → `applyScan(match, lot, true, exp)`
    - ปุ่ม "← กลับ" → `setManualLotMode(false)` (กลับไป list, ไม่ปิด popup)
  - **`closeLotPopup()` ไม่เคลียร์ฟอร์ม manual entry** (`manualLot`/`manualExpD`/`manualExpM`/`manualExpY` คงค่าเดิมไว้ข้าม SKU/scan) — ของจริงมักแพ็คจากลอตเดียวกันหลาย SKU ต่อเนื่อง ครั้งถัดไปกด "✎ ใส่ LOT เอง" จะเห็นค่าล่าสุดเดิมพร้อมยืนยัน ไม่ต้องพิมพ์ซ้ำ; ฟอร์มจะเคลียร์ก็ต่อเมื่อ component remount เท่านั้น (สลับพนักงาน/catalog — ดู `key` prop ที่ AndroidApp.jsx)
- **`processBarcode` block ขณะ `pendingLot !== null`** — กันสแกนซ้ำขณะรอเลือก LOT

## ZoneAssign — Logic สำคัญ
- แสดงเฉพาะ **Desktop** — ไม่ render ใน Android mode (`isAndroidMode`)
- ปุ่ม "กำหนดโซน" อยู่แถวเดียวกับ ImportCatalog (ชิดขวา) ใน Tab: รายการเบิกสินค้า
- Modal: `position: fixed; inset: 0; zIndex: 1000` render ที่ root level ของ App.jsx (ก่อน `<Toast>`) — ไม่ถูก stacking context บัง
- Props: `catalog, packers, zoneAssignments, onSave, onClose`
- `extractZone(location)`: regex `/^([A-Za-z]+)/` → ดึง prefix ตัวอักษรจาก location เช่น `A11` → `A`, `COOL01` → `COOL`
- **Zone sort:** single-letter ก่อน (A–Z) แล้วตามด้วย multi-letter alphabetically — `COOL` จะอยู่หลัง `S`
  ```js
  .sort((a, b) => a.length !== b.length ? a.length - b.length : a.localeCompare(b))
  ```
- ตาราง: rows = พนักงาน, columns = zones (ดึงจาก catalog locations), checkbox = assigned/not
- คอลัมน์ SKU: live count ของ items ที่จะได้รับตาม zone ที่ tick ไว้
- warning ถ้ามี SKU ที่ไม่ถูก assign ให้ใครเลย

## PackerDashboard — Logic สำคัญ
- แสดง real-time counter ใหญ่: `totalGot / totalNeed ชิ้น`
- `totalGot` = closed boxes (จาก `itemsByBox`) + in-progress (จาก `scanProgress`) ต่อ packer
- `scanProgress` ข้าม-reference กับ `boxes` เพื่อหา packer ของแต่ละ in-progress box
- Props: `catalogByPacker, boxes, itemsByBox, PACKERS, scanProgress`

### WarehouseScene — มุมมองคลังจำลอง Top-Down (อ่านอย่างเดียว ไม่แตะ flow)
- **เป้าหมาย:** วิช่วลไลซ์เรียลไทม์ — ตัวการ์ตูน 8-bit ต่อพนักงาน เดินไปโซน/เชลฟ์ที่ "เพิ่งสแกน" ตามผังคลังจริง วาดด้วย `<canvas>` ล้วน (ไม่ใช้ไฟล์อาร์ต) ใน `PackerDashboard.jsx`
- **เป็นแค่การแสดงผล** อ่านจาก `scanProgress` + `catalogByPacker` (location) — **ไม่เขียน Firestore, ไม่แตะ flow สแกน/รับสินค้า**
- **มุมมอง Top-Down:** มองจากด้านบนลงมา — ชั้นวางแสดงเป็นแท่งสี่เหลี่ยมพร้อม **bay grid** (เชลฟ์ย่อยตามแนวลึก) แทนหน้าตัดด้านหน้า
  - `N_BAYS = { A: 6, default: 8 }` — โซน A มี 6 เชลฟ์, โซนอื่น 8 เชลฟ์ (นับจากทางเดินหลักเข้าผนัง)
  - `tile()` — วาดพื้นมีลายตาราง แยกสีสำหรับ room / aisle / outside
  - `aisleRects` — `buildLayout()` คืน rect ของทางเดินย่อยระหว่างโซนคู่ด้วย (ใช้วาด tile floor)
- **ผังจริง (hardcoded):** ในห้อง = A ชิดผนังซ้าย · คู่ B-C/D-E/F-G/H-I/J-K หลังชนกัน · ทางเดินหลักล่าง · ประตูกลาง — `ZONE_AISLE` map โซน→ทางเดิน, `buildLayout()` คำนวณตำแหน่ง
- **โซนนอกอาคาร** (`OUTSIDE_ZONES = L,M,N,S,COOL`) = พื้นที่กว้างใต้ห้อง (COOL โทนฟ้า) — ตัวละครเดินออก**ประตู**ไปถึง (waypoint แยก in/out)
- **Location parsing:** `skuLocation = { [sku]: locationString }` สร้างพร้อมกับ `skuZone` — parse `"B65"` → เชลฟ์ 6, ชั้น 5 ด้วย regex `/^[A-Za-z]+(\d)(\d)?/`
- **Location highlight:** เมื่อพนักงานสแกน → bay นั้นถูก highlight ด้วยสีพนักงาน + โค้ด location + `L[ชั้น]` บน canvas
  - `ch.targetShelf`, `ch.targetLevel`, `ch.targetLocation` — set ทุกครั้งที่ `got` เพิ่มขึ้น
  - `drawShelfTop()` รับ `marks = [{shelf, level, color, code}]` → วาดกรอบสีบน bay นั้น
- **ยืนค้างที่โซน/เชลฟ์ของสินค้าที่หยิบล่าสุด** ไม่กลับบ้าน; ยังไม่เคยหยิบ → ยืนโซนหลัก (`packerZones[code][0]`)
- **ตรวจจับการหยิบ:** เทียบ `scanProgress` กับ `prevProgRef` — ลังที่เพิ่งโผล่ = baseline เงียบ ๆ ไม่อนิเมท, อนิเมทเฉพาะ `got` เพิ่ม → match `box.packer.code` → ตัวละครคนนั้น
- **Y destination ตาม bay จริง:** เมื่อรู้ `targetShelf` → คำนวณ Y ของ bay นั้น (`sr.y + H16 + idx * bayH + bayH/2`) ให้ตัวละครเดินไปยืนตรงตำแหน่งนั้น (ไม่ใช่กลางชั้นอีกต่อไป)
- **เดิน L-path:** ลงทางเดินหลัก → แนวนอน → เข้าทางเดินย่อย → ถึง bay Y; โซนนอกอาคารเดินผ่านประตู
- **ตัวละคร 2 ระดับ:** PNG sprite จริง (PixelLab.ai, 8 ทิศ × 4 walk frames) → fallback procedural pixel art (`drawChar`)
  - **Sprite-based:** `PACKER_SPRITE_DIRS` map code → folder path, `spriteCache` preload ทั้ง idle + walk frames ตอน module load
  - **Procedural fallback (Gather.town Classic):** หัวโต hoodie + spike hair + แว่น/หมวก/แก้มแดง — ใช้ `PACKER_STYLES` config สีต่อ code
  - `getSprite(ch)`: เลือก `walk[dir][frame]` ถ้ามี waypoint, ไม่งั้น `idle[dir]` — return `null` → fallback procedural
  - `dirFromVec(dx, dy)`: คำนวณ 8 ทิศ → set `ch.dir` ('N'/'NE'/'E'/'SE'/'S'/'SW'/'W'/'NW') ใน game loop

### PixelLab.ai — Character Generation Workflow
สำหรับสร้าง sprite avatars ใหม่ — ไม่ต้องวาดเอง

**Tool:** [PixelLab.ai](https://pixellab.ai) (v3 character generator) — รองรับ 8-direction rotation + walk animation อัตโนมัติ

#### Settings ที่ต้องใช้
| Field | ค่า |
|---|---|
| Character Type | **Humanoid** |
| Generation Mode | **v3 NEW** |
| Camera View | **Low Top-Down** (มุม Gather.town) |
| Sprite Size | **48px** (สำคัญ — output canvas จะเป็น 68×68 พร้อม padding) |
| Detail | Highly detailed |
| Outline | **Black outline** |

#### Prompt Template (ภาษาอังกฤษ)
```
Chibi young Asian male warehouse worker, big head small body,
friendly anime face with big eyes and rosy cheeks.
[HAIR DESCRIPTION] [ACCESSORY].
[OUTFIT COLOR] zip-up hoodie with hood down on back.
Dark jeans. White sneakers. Standing pose, arms relaxed at sides.
```

แทนที่ในส่วน `[...]` ต่อพนักงาน:

| Code | ลุค |
|---|---|
| **มุก** | brown spiky hair / royal blue hoodie |
| **แล็ค** | blonde spiky messy hair + black-framed rectangular glasses / navy blue hoodie |
| **N/A** (EMP-03) | dark brown messy short hair / forest green hoodie |
| **ตั๋ง** | medium brown spiky hair / royal blue hoodie |

**Keywords ห้ามลืม:** `chibi`, `big head small body`, `friendly anime face`, `rosy cheeks`, `hood down on back`, `Standing pose, arms relaxed at sides`

#### Workflow ใน PixelLab UI
1. **Generate v3 Character** — รอ ~30 วินาที → ได้ 8 รูปยืน (idle) ครบ 8 ทิศ
2. **เปิดตัวการ์ตูน → Add Animation → Walking (4 frames)** — รอ gen 30-60 วินาที → ได้ 32 รูป (4 เฟรม × 8 ทิศ)
3. **Download** — PixelLab จะให้ ZIP ที่มีโครงสร้าง:
   ```
   {ชื่อ}/
   ├── rotations/{south,south-east,east,north-east,north,north-west,west,south-west}.png
   └── animations/Walking-{hash}/{south,south-east,...}/frame_000.png ... frame_003.png
   ```

#### File Structure ที่โค้ดต้องการ
หลัง extract แล้วต้องจัด layout เป็น:
```
public/characters/emp-XX/
├── N.png, NE.png, E.png, SE.png, S.png, SW.png, W.png, NW.png   ← idle (8 ทิศ)
└── walking/
    ├── N/frame_000.png frame_001.png frame_002.png frame_003.png
    ├── NE/, E/, SE/, S/, SW/, W/, NW/                            ← walk cycle 4 เฟรม × 8 ทิศ
```

**ขั้นตอน restructure (bash):**
```bash
cd public/characters/emp-XX
# rotations → flat
mv rotations/north.png N.png; mv rotations/north-east.png NE.png; mv rotations/east.png E.png
mv rotations/south-east.png SE.png; mv rotations/south.png S.png; mv rotations/south-west.png SW.png
mv rotations/west.png W.png; mv rotations/north-west.png NW.png; rmdir rotations
# animations → walking/
mkdir walking
mv animations/Walking-*/north walking/N; mv animations/Walking-*/north-east walking/NE
mv animations/Walking-*/east walking/E; mv animations/Walking-*/south-east walking/SE
mv animations/Walking-*/south walking/S; mv animations/Walking-*/south-west walking/SW
mv animations/Walking-*/west walking/W; mv animations/Walking-*/north-west walking/NW
rmdir animations/Walking-* animations
```

#### Integration ในโค้ด
เปิด [PackerDashboard.jsx](src/screens/PackerDashboard.jsx) — เพิ่ม entry ใน `PACKER_SPRITE_DIRS`:
```js
const PACKER_SPRITE_DIRS = {
  'EMP-01': '/characters/emp-02',   // มุก ใช้ตัวการ์ตูนจาก emp-02
  'EMP-02': '/characters/emp-01',   // แล็ค ใช้ตัวการ์ตูนจาก emp-01 (ผมบลอนด์ + แว่น)
  // 'EMP-03': '/characters/emp-03',
  'EMP-04': '/characters/emp-03',   // ตั๋ง ใช้ emp-03 (sprite 96×96 — ต่างจาก default 68×68)
};
```

**Constants ที่ปรับได้ใน `PackerDashboard.jsx`:**
- `SPRITE_SIZE` (68) — default canvas size ของ PixelLab v3 sprite
- `SPRITE_FOOT_PAD` (14) — default padding ใต้ฝ่าเท้า (PixelLab v3 68×68)
- `SPRITE_TOP_PAD` (8) — default padding เหนือหัว
- `WALK_FRAMES` (4) — จำนวนเฟรม walk animation
- `SPRITE_DIRS` — 8 ทิศ ['N','NE','E','SE','S','SW','W','NW']

**Per-character overrides** (ถ้า PixelLab gen sprite ขนาด/padding ต่าง):
```js
const PACKER_SPRITE_SIZES = { 'EMP-04': 96 };  // ตั๋ง — canvas 96×96 ไม่ใช่ 68×68
const PACKER_FOOT_PADS    = { 'EMP-04': 24 };  // ตั๋ง — วัดได้ 24px ใต้เท้า
const PACKER_TOP_PADS     = { 'EMP-04': 24 };  // ตั๋ง — วัดได้ 24px เหนือหัว
```
- **`drawSpriteChar` วาดที่ native size** (ไม่ scale) — pixel art คมสุดทุก sprite
- **headTop ยึดหัวจริง** ผ่าน `(topPad - SPRITE_TOP_PAD)` delta → ชื่ออยู่เหนือหัวจริงตรงทุก sprite
- **shadow ที่ `y + 2`** = ใต้ฝ่าเท้า 2px (anchor `y` คือฝ่าเท้า) — อิงจาก footPad ต่อคน ทำให้เงาตรงเท้าเสมอ

#### วิธีวัด padding ของ sprite (PowerShell)
```powershell
Add-Type -AssemblyName System.Drawing
$img = New-Object System.Drawing.Bitmap 'public\characters\emp-03\S.png'
# วน scan pixel หา row บนสุด/ล่างสุดที่มี alpha > 0
# → topPad = head row, footPad = (Height-1) - foot row
```

#### Tips
- **PixelLab gen ตัวเดียวกัน 2 variants** บ่อย (เช่น 2 north folders) — เลือกอันที่ดูดีกว่า ลบอีกอัน
- **PixelLab ขนาด canvas ไม่คงที่** — emp-01/02 ได้ 68×68 แต่ emp-03 ได้ 96×96 (ขึ้นกับ Sprite Size setting ตอน gen) → ต้อง override ผ่าน `PACKER_SPRITE_SIZES`
- **อาการถ้า spriteSize ผิด:** sprite วาดไม่ centered, เงาอยู่กลางตัว, ชื่อห่างจากหัว — fix โดยวัด `S.png` แล้ว set ทั้ง 3 overrides
- **ทางเดินระหว่างชั้น (`AW = SW * 0.8`) แคบกว่า sprite 68px** — sprite อาจล้ำเข้าชั้นข้างเคียงเล็กน้อย ยอมรับได้

## Outbound (BoxClosedLabel) — Logic สำคัญ
- Tab label: **Outbound** (เดิม: Box & Label) — screen-label "รายการส่งสินค้า", frame title: **"เลขที่ลัง"**
- Global search ข้ามทุก closed box (frame-header) → แผงขวาแสดงตารางผล (maxHeight 450, sticky header)
- **Layout:** grid `340px 1fr`
  - ซ้าย (440px) = การ์ดลัง **grid 3 คอลัมน์** เรียงตาม id น้อย→มาก + **ปุ่ม filter 2 แถว**:
    - สถานะ (`outboundFilter`): ทั้งหมด / รออนุมัติ (`status closed`) / อนุมัติแล้ว (`exported`/`received`) / **🔴 แจ้งปัญหา** (`problemReviewed && !problemResolved`)
    - พนักงานแพ็ค (`packerFilter`): ทุกคน + รายชื่อ packer ที่มีลังจริง (derive จาก closedBoxes)
    - 2 filter ทำงานร่วมกัน → `packerBoxes` (กรอง packer) → count สถานะ → `visibleBoxes`
    - **ปุ่ม "🔴 แจ้งปัญหา"** ใช้สีแดง (`var(--red)`) แทนส้ม + ตัวอักษรแดงเมื่อ inactive และ N > 0 (เรียกความสนใจหัวหน้า)
  - ขวา (detail, grid `1fr 380px`):
    - คอลัมน์ซ้าย: **"รายชื่อสินค้าในลัง"** ตาราง SKU / ชื่อ / หน่วย / จำนวน / Location (maxHeight 450)
    - คอลัมน์ขวา: **"ตัวอย่างสติกเกอร์ติดลัง"** (90×65mm, barcode = Box ID, "คลังสินค้า · WH-01") → ปุ่ม ⇩ ส่งออกไฟล์ Text → แถว [เลขที่เอกสาร input + อนุมัติเอกสาร] → 🖨 พิมพ์ใบปิดลัง
- **selectedId:** useState lazy init — เลือก `activeBoxId` เฉพาะเมื่ออยู่ใน closedBoxes (กันเลือกลัง open ใหม่หลังปิดลัง) ไม่งั้น fallback `closedBoxes[0]` (ลังปิดล่าสุด)
  - **คลิกการ์ดลัง = set `selectedId` เท่านั้น ไม่แตะ `activeBoxId`** — ป้องกัน activeBoxId ของการแพ็คถูกเปลี่ยนเป็นลังที่ปิดแล้ว (เคยเป็นบั๊ก: สแกนต่อจะลงลังที่ปิดไปแล้ว)
- ปุ่ม "⇩ ส่งออกไฟล์ Text" → export `.txt` แบบ TSV ไม่มี header: `barcode\tจำนวนสินค้า\tทุนสินค้า\t\t\t\t\t\tLOT\tEXP`
  - ทุนสินค้า = `costMap[sku__unit]` (0 ถ้ายังไม่ import cost map); active เมื่อ status `closed`/`exported`
  - **LOT format:** หลัง cost มี **6 TABs** (สร้าง 5 column ว่างให้ตรงโครงสร้าง POS) แล้วตามด้วย LOT
  - **LOT source priority:** `item.lot` (LOT ที่พนักงาน Android เลือกตอนสแกน) → fallback `lotMap[sku][0]?.lot` (LOT ตัวแรก, สำหรับลังที่ pack จาก desktop) → ว่าง
  - **EXP column:** อีก 1 TAB ถัดจาก LOT → `item.exp` (วันหมดอายุ พ.ศ. `DD/MM/YYYY` ตัวเลขทั้งหมด — กรอกได้เฉพาะตอนพนักงาน Android เลือก "✎ ใส่ LOT เอง"; LOT จาก lotMap ไม่มี exp ไม่มี fallback → ว่าง)
  - ตัวอย่าง (มี exp): `8859243302790\t4\t8.49\t\t\t\t\t\t10012026\t22/06/2569`
  - ตัวอย่าง (ไม่มี exp): `8859243302790\t4\t8.49\t\t\t\t\t\t10012026\t`
  - **กันส่งซ้ำ:** กดแล้ว set `box.textExported = true` (sync Firestore) → ปุ่ม disable + เปลี่ยนเป็น "✓ ส่งออกไฟล์ Text แล้ว" ถาวร จนกว่าจะกด **Clear · เริ่มวันถัดไป** (clearBoxes ลบ box → flag หาย)
- ปุ่ม "🖨 พิมพ์ใบปิดลัง" → ล็อกจนกว่า `box.status === 'exported'` — `handlePrint()` แค่เรียก `window.print()`
  - **Print isolation (`.print-only-label`, portal):** สติกเกอร์ที่พิมพ์จริง render แยกจาก preview บนจอ — เป็น element ใหม่ที่ `createPortal` ไปที่ `document.body` ตรงๆ (sibling ของ `#root` ไม่ใช่ลูก) เนื้อหา (sticker JSX) เหมือน preview บนจอทุกอย่างแต่ duplicate ไว้คนละ element โดยตั้งใจ (ไม่ share component — สั้นพอที่ไม่คุ้มทำ abstraction)
  - **เหตุผลที่ต้องแยก:** เดิมใช้ trick `visibility:hidden` ซ่อนทั้งหน้า + `position:fixed` โชว์เฉพาะ label ตอนพิมพ์ — แต่ `visibility:hidden` ไม่ลบ element ออกจาก layout (ยังกินความสูงอยู่) ทำให้หน้า Outbound ที่ยาว (รายการลังซ้าย/ตาราง) ดัน print pagination ออกมาหลายสิบแผ่น และ Chrome จะ repeat element `position:fixed` ซ้ำทุกแผ่นที่ paginate ออกมา (ของเดิมเลยได้ 11 แผ่น ตัวอักษรทับกันมั่ว)
  - **วิธีแก้:** `styles.css` → `@media print { #root { display: none !important; } .print-only-label { display: flex !important; } }` — `display:none` ลบ `#root` ออกจาก layout จริง (ความสูง = 0 ไม่ paginate) ส่วน `.print-only-label` (portal, อยู่นอก `#root`) ไม่ถูกกระทบ จึงเหลือ element เดียวในหน้าพิมพ์ → ออกแผ่นเดียวพอดี
  - **`@page { size: 90mm 65mm; margin: 0; }`** กำหนดขนาดกระดาษจริงตรงกับ label sticker (เผื่อ driver/OS ไม่ได้ตั้ง default ตรงขนาดเครื่องพิมพ์ TSC TTP-244 Pro)
- **ปุ่ม "⇩ ส่งออกรายการลังทั้งหมด"** (frame-header ขวา, เดิมชื่อ "Export Excel") — export **ทุกลังที่ปิดแล้ว** เป็นไฟล์ `.xls` HTML table:
  - คอลัมน์: เลขที่ลังสินค้า / เลขที่เอกสาร / SKU / ชื่อสินค้า / Barcode / หน่วย / จำนวน / พนักงานแพ็คสินค้า / วันที่ส่งสินค้า (DD/MM/YYYY)
  - Font: Anuphan, column width กำหนดด้วย `<col width>` + inline style บน cell; active เมื่อมี closedBoxes ≥ 1
- **อนุมัติเอกสาร:** ต้องกรอก **เลขที่เอกสาร** ก่อน → บันทึก `box.pos` + status → `exported`
- ปุ่ม 🔥 ล้าง Firestore ทั้งหมด → เรียก `clearFirestore()` จาก App.jsx
- **Tab badge:** ปุ่ม tab Outbound แสดง badge ส้มนับ `boxes.filter(b => b.status === 'closed').length` (ลังรออนุมัติเอกสาร)
- **Flow การอนุมัติลัง (บังคับลำดับ):**
  1. ⇩ ส่งออกไฟล์ Text — active เมื่อ `closed`/`exported` (กดได้ครั้งเดียวต่อลัง → set `textExported`)
  2. **ช่องเลขที่เอกสาร disable จนกว่า `textExported === true`** (placeholder "อัปโหลดไฟล์ Text ก่อน") → กรอก + กด "อนุมัติเอกสาร" (ปุ่ม active เมื่อ textExported && มีเลขเอกสาร) → status `exported`
  3. 🖨 พิมพ์ใบปิดลัง — active เฉพาะหลัง `exported`

## BoxList — Logic สำคัญ
- คอลัมน์ตาราง: Box ID / สถานะ / พนักงาน / SKU / ชิ้น / **เลขที่เอกสาร** / อัปเดต (ไม่มีปุ่ม action)
- Badge header นับ: กำลังแพ็ค = `open + packing`, ปิดลังแล้ว = `closed`, อนุมัติแล้ว = `exported`
- ปุ่ม Export: **"⇩ Export รายการลังทั้งหมด"** (เดิม: Export ทั้งวัน)

## BranchReceive — Logic สำคัญ
- **แยกหน้าที่ Android ↔ Desktop:**
  - **Android (พนักงานหน้าร้าน):** สแกนบาร์โค้ดลัง → สแกนสินค้า (phase scan→verify) → กดยืนยันรับ (ผล `ok`) → ลัง `receivePending: true` (sync Firestore) → แสดง "ส่งให้หัวหน้าอนุมัติเอกสารแล้ว"
  - **Desktop (หัวหน้างาน):** ไม่มีการสแกน — แสดง card ลังที่ `receivePending` (รออนุมัติ) ในแผงซ้าย, คลิก card → ดูตารางรายการสินค้า (read-only) ทางขวา, กดปุ่ม **✓ อนุมัติเอกสาร** บน card → status `received` + `receivePending: false`
- **`receivePending`** (field บน box, sync ผ่าน `setBoxes` → Firestore `boxes/{id}`) — สะพานข้ามเครื่องระหว่าง Android (สแกนรับ) กับ Desktop (อนุมัติ) แทน `pendingApprovalBoxId` ที่เป็น local-only
- **`receivedBy`** (field บน box) — พนักงานหน้าร้านที่สแกนรับ (`{code, name}`) แสดงใน BoxCard บรรทัด "รับโดย:"
- **Desktop ไม่บังคับเลือกพนักงานก่อน** — แสดง card list ทันที, เลือกพนักงานผ่านปุ่ม dropdown `👤` ใน frame header (state `staffMenuOpen` + click-outside ปิดเมนู)
- **Controlled mode (Android):** รับ `branchStaff` / `setBranchStaff` เป็น optional props จาก AndroidApp
  - ถ้ามี props → ใช้ external state, ซ่อน staff dropdown ใน header (`!isControlled`)
  - ถ้าไม่มี props (Desktop) → ใช้ internal state + ปุ่ม dropdown ใน header
- **`BRANCH_STAFF`** (hardcoded ใน BranchReceive.jsx และ AndroidApp.jsx — ต้อง sync 2 ไฟล์) — label selector: `"พนักงาน:"`:
  ```js
  [{ code: 'BR-01', name: 'ก้า' }, { code: 'BR-02', name: 'กิ๊ฟ' },
   { code: 'BR-03', name: 'นิคกี้' }, { code: 'BR-04', name: 'สุ่ย' },
   { code: 'BR-05', name: 'อ๊อฟ', role: 'pharmacist' }]
  ```
  - **`role: 'pharmacist'`** ปลดล็อก **recheck mode** บน Android — สแกนซ้ำลัง `problemType='incomplete'` ได้ (รายละเอียดดู section *Pharmacist Recheck Flow*)
- Phase: `scan` → `verify` → `result` (3 phases) — **ใช้บน Android เท่านั้น** (Desktop เป็น approval-only ไม่เข้า phase verify/result)
- **`scanCounts`** = `{[sku]: number}` นับจำนวนชิ้นที่สแกนจริงต่อ SKU (ไม่ใช่ binary Set)
  - สแกน 1 ครั้ง = +1 ชิ้น
  - **ไม่มี upper limit** — สแกนเกิน qty ได้ (กรณีสินค้ามาเกิน) → บันทึกจำนวนจริงเสมอ
  - **Blind receiving:** ไม่มีคลิกแถวเพื่อติ๊ก, ไม่มีปุ่ม "ติ๊กครบทั้งหมด" — ติ๊กได้วิธีเดียวคือยิงบาร์โค้ดเท่านั้น
- `fullyChecked(item)` = `scanCounts[sku] >= item.qty`
- `allChecked` = ทุก item ผ่าน fullyChecked
- `hasOver` = มี item ใด item หนึ่งที่ `scanCounts[sku] > item.qty` (สแกนเกิน)
- reset `scanCounts` เมื่อสแกนลังใหม่ / สแกนลังถัดไป / handleApprove / handleRecheck
- **ตารางตรวจสอบสินค้า (phase verify):** แสดงคอลัมน์ SKU / ชื่อ / หน่วย / สแกนแล้ว
  - ไม่มีคอลัมน์ ✓ และไม่มีตัวเลขเปลี่ยนสีเมื่อครบ — ตัวเลขสีดำเสมอ (Blind)
  - **พนักงานสาขาไม่เห็นจำนวนที่ควรมีในลัง (`needed`)** — เห็นแค่จำนวนที่สแกนไปแล้ว (`count`)
- **Phase `result`** (Android — หลังกด ✓ ยืนยันรับสินค้า):
  - `verifyResult` = `'ok'` / `'over'` / `'fail'`
    - `'ok'`: allChecked && !hasOver → `handleConfirm` ตั้ง `receivePending: true` บน box → แสดงกล่อง **"✓ ส่งให้หัวหน้าอนุมัติเอกสารแล้ว"** (ไม่มีปุ่มอนุมัติบน Android — อนุมัติที่ Desktop)
    - `'over'`: allChecked && hasOver → badge **"สินค้าเกินจำนวน"** (ส้ม) + รหัสหัวหน้างาน + **🔄 รีเช็ค** (ไม่ persist)
    - `'fail'`: !allChecked → badge **"สินค้าไม่ถูกต้อง"** (แดง) + รหัสหัวหน้างาน + **🔄 รีเช็ค** (ไม่ persist)
  - ตาราง result: `count > needed` → row สีเหลือง + วงกลม `!` สีส้ม + แสดง `count +N` (ส่วนเกิน)
- **Desktop layout (approval-only):**
  - แผงซ้าย: `approvalBoxes` = boxes ที่ `receivePending`/`problemReported` หรืออยู่ใน `receiveBoxIds` — **grid 2 คอลัมน์** (`repeat(2,1fr)`, คอลัมน์ซ้าย 420px); sortRank: problem(0) > pending(1) > อื่น(2)
  - badge header: chip "N รออนุมัติ" (`pendingCount`) + chip แดง "🔴 N แจ้งปัญหา" (`problemCount`) — เคารพตัวกรองพนักงาน
  - แผงขวา: คลิก card → `isViewingOther` → ตารางรายการสินค้า read-only (เลขที่ลัง / SKU / ชื่อ / หน่วย / จำนวน); ไม่คลิก → placeholder
  - **BoxCard:** field labels "เลขที่เอกสาร / เลขที่ลัง / แพ็คโดย / ตรวจสอบโดย"; คลิก (viewing) = `filter: brightness(0.9)` (เข้มขึ้น ไม่เปลี่ยนสีพื้น) ไม่มี watermark
  - **statusLabel (เฉพาะหน้านี้):** `closed`→"รอคลังอนุมัติเอกสาร", `exported`→"รอผู้ช่วยตรวจสอบสินค้า", received→"เภสัชอนุมัติเอกสารแล้ว ✓"
  - **frame-header date:** prefix "รอบเบิก {วันที่}"
  - **ปุ่มเลือกพนักงาน (dropdown 🔽):** = **filter** ลังตามผู้ตรวจรับ (`box.receivedBy.code`) ไม่ใช่เลือกผู้รับ — `staffFilter = !isControlled && branchStaff?.code`; มีตัวเลือก "ทุกพนักงาน" ล้างตัวกรอง
  - **ช่องค้นหา (`itemSearch`):** ค้น SKU/ชื่อ ว่าอยู่ลังไหน — ค้นข้ามทุกลัง status `closed`/`exported`/`received`/`receivePending` (ไม่ผูกตัวกรองพนักงาน) → แผงขวาแสดงตารางผล (อยู่ลังที่ / SKU/ชื่อ / หน่วย / จำนวน) แทน detail; คลิกแถว → `setViewingId(boxId)` + ล้างค้นหา
  - **`searchQ` มี priority สูงสุด** ในแผงขวา (override isViewingOther/placeholder)
- **Tab badge (App.jsx):** badge สีส้ม `#e8692b` บนปุ่ม tab เมื่อ count > 0
  - `receive` → `receivePending` + `problemReported && !problemResolved` (นับรวมทุกพนักงาน)
  - `closed` (Outbound) → `status === 'closed'` + `problemReviewed && !problemResolved`
- **`viewingId`** = local state สำหรับดูสินค้าในลังใดก็ได้จากแผงซ้าย
  - `isViewingOther = viewingId !== null && phase !== 'result'` (Desktop phase = `scan` เสมอ → คลิกแล้วโชว์ detail)
  - ปุ่ม "× ปิด" ใน read-only view → `setViewingId(null)` → กลับ placeholder
- **Re-scan fix:** `setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id])` — ย้ายลังที่สแกนซ้ำไปท้าย array เสมอ (`startReceive`)
- **กันสแกนลังซ้ำ (Android, `handleScan`):** บล็อก + toast แดง ไม่เข้า verify ถ้าลังอยู่ในสถานะที่จัดการแล้ว — `status === 'received'` / `receivePending` / `problemReported && !problemResolved`
- **ล็อกลัง (`receivingBy`):** ตอน `startReceive` set `box.receivingBy = branchStaff` (sync Firestore) + ปลดล็อกลังเก่าของตัวเอง (ถือทีละลัง) — พนักงานอื่นสแกนลังนี้ → บล็อก "⚠ พนักงาน {ชื่อ} กำลังตรวจลังนี้อยู่" (เจ้าของล็อกสแกนซ้ำได้)
  - **ไม่มี timeout** — ปลดล็อกเฉพาะเมื่อ: ยืนยันรับ (`handleConfirm` ผล ok) / แจ้งปัญหา (`handleReportProblem`) / ไปลังถัดไป (`handleScanNext`)
  - กรณีปิดแอปกลางคัน → ล็อกค้าง (เจ้าของสแกนใหม่ได้, clearBoxes ล้างได้)
- **`handleScanNext`** (ปุ่ม "+ รับลังถัดไป" / Android "+ ลังถัดไป"): reset ทุก state รวมถึง `verifyResult`, `supervisorCode` → `phase = 'scan'`
- **ไม่มีปุ่ม "ข้ามลัง" แล้ว** (ลบ `handleSkip` ออก — ซ้ำซ้อนกับ "ลังถัดไป" + toast เดิม "แจ้งปัญหาแล้ว" ทำให้สับสน); การแจ้งปัญหาจริงใช้ `handleReportProblem` เท่านั้น
- **`pendingApprovalBoxId`** (App.jsx state) — local-only, ใช้ track result phase บน Android เท่านั้น (ไม่ sync ข้ามเครื่อง — การข้ามเครื่องใช้ `box.receivePending` แทน)
- **BoxCard `isPendingApproval`**: `box.receivePending` — ซ่อนบรรทัด label สถานะ, ปุ่มสีส้ม **✓ อนุมัติเอกสาร** บน card → `handleApprove(box.id)` (ไม่มี watermark แล้ว)
- **BoxCard selected state** (isActive / isViewing / isPendingApproval): ใช้ raised button style เหมือน Topbar tab active
  - `box-shadow: 3px 3px 0 var(--line)`, `transform: translate(-1px,-1px)`, พื้นหลัง `var(--accent-soft)`
  - การ์ดที่ไม่ถูกเลือก → `opacity: 0.65`

---

## Problem Report Flow (แจ้งปัญหาลัง) — ข้าม 3 หน้าจอ
- **2 ทางเข้า (`problemType`):**
  - **`'incomplete'`:** สแกนสินค้าไม่ครบ/เกิน แล้วกด **"✓ ยืนยันรับสินค้า"** → `handleConfirm` (result ≠ ok) persist เป็นปัญหา → Android แสดง "✓ ส่งให้หัวหน้ารีเช็คสินค้าแล้ว"; ปุ่ม card desktop = **"🔁 รีเช็คสินค้า"** (ส้ม) — *ไม่มีรหัสหัวหน้างาน/recheck บน Android แล้ว*
  - **`'damaged'`:** กด **"⚠ แจ้งปัญหา"** → แนบรูป (`compressImage` → base64) → "ยืนยันแจ้งปัญหา" (`handleReportProblem`); ปุ่ม card desktop = **"🔍 ตรวจสอบ"** (แดง)
1. ทั้งสองทาง → set บน box: `problemReported`, `problemType`, `problemBy`, `problemScanCounts` (snapshot), `problemAt` (+ `problemImage` เฉพาะ damaged)
2. **Desktop รับสินค้า:** card กรอบแดง + label "🔴 พบปัญหา · รอตรวจสอบ" + ปุ่มแดง "🔍 ตรวจสอบ" (`onInspect` → setViewingId)
   → แผงขวา: ตารางรายการ (สินค้าขาด = แถวแดง, เทียบ `problemScanCounts` กับ qty) + รูปหลักฐาน + textarea "รายละเอียดปัญหาที่พบ"
   → **กด "📦 แจ้งคลังสินค้า"** (`saveProblemNote`, เดิมชื่อ "บันทึกรายละเอียด") = set `problemNote` + **`problemReviewed=true`** ← gate ส่งต่อให้ Outbound (Outbound จะยังไม่ขึ้น badge จนกว่าจะกดอันนี้)
3. **Desktop Outbound:** card กรอบแดง + badge "🔴 แจ้งปัญหา" **เมื่อ `problemReviewed && !problemResolved`** → คลิก → ตาราง **"แก้ไขสินค้าที่มีปัญหา"** (+/- จำนวน ผ่าน `adjustQty` → setItemsByBox) + แสดง note/รูป
   → ปุ่มแดง **"✓ แก้ไข/อนุมัติ"** ใต้ตาราง (`resolveProblem`) → `problemResolved=true` + recompute skuCount/totalQty (ไม่ต้องผ่าน flow Text/เลขเอกสาร/พิมพ์)
4. **กลับ Desktop รับสินค้า:** card → "✓ แก้ไขปัญหาแล้ว · รออนุมัติ" + ปุ่มเขียว **"✓ แก้ไขแล้ว/อนุมัติเอกสาร"** (กดได้ → `handleApprove` → status `received`) → จากนั้น card เป็น "เภสัชอนุมัติเอกสารแล้ว ✓"
   - `problemFixed = problemReported && problemResolved && status !== 'received'` (priority ปุ่ม/label: hasProblem > pending > problemFixed > received)
- **Tab badge:** receive รวม `problemReported && !problemResolved`, Outbound (closed) รวม `problemReviewed && !problemResolved`; header รับสินค้ามี chip "🔴 N แจ้งปัญหา"
- **ปุ่ม/label priority ใน BoxCard:** hasProblem > pending > problemFixed > received

## Pharmacist Recheck Flow (Android) — เภสัชสแกนซ้ำลังที่แจ้งปัญหา

**Permission:** เฉพาะ staff ที่มี `role: 'pharmacist'` ใน BRANCH_STAFF (ตอนนี้คือ **BR-05 อ๊อฟ**) — staff อื่นยังบล็อกตามเดิม (`⚠ แจ้งปัญหาแล้ว · รอเภสัชตรวจสอบ`)

### State + Derived
- **`recheckMode`** (useState): true เมื่อ pharmacist สแกนซ้ำลัง `problemType='incomplete'` → reset เป็น false ใน `handleScanNext` / `handleApprove` / `handleRecheck`
- **`verifyItems`** (derived): filter boxItems ให้เหลือเฉพาะ SKU ที่ `problemScanCounts[sku] < qty` (เฉพาะที่ไม่ครบในรอบแรก) — `allChecked` / `doneCount` / `scannedSkuCount` ใช้ `verifyItems` แทน `boxItems` ใน recheck mode

### Flow
1. **handleScan:** เจอลัง `problemReported && !problemResolved && problemType='incomplete'` + `branchStaff?.role === 'pharmacist'` → `setRecheckMode(true)` + `startReceive(box)` + toast `🔁 รีเช็คลัง {id}` (success)
2. **handleItemScan:** ใน recheck mode ถ้าสแกน SKU ที่ `problemScanCounts[sku] >= needed` (ครบในรอบแรก) → reject + `scanError = "SKU นี้สแกนครบแล้วในรอบแรก"` (กันสแกนนอก verifyItems)
3. **handleConfirm 3-way split:**
   - **recheck + ok:** `problemResolved=true`, `problemResolvedBy/At=pharmacist`, `receivePending=true` → รอเภสัชอนุมัติเอกสาร (เหมือนรับปกติ)
   - **recheck + fail/over (Option B auto-notify):** keep `problemReported=true`, **`problemReviewed=true`** (auto — Outbound badge ขึ้นทันที), `problemNote = auto-generated` ลิสต์ SKU ที่ขาด/เกินพร้อมชื่อ + จำนวน, `problemConfirmedBy/At=pharmacist`, merge `problemScanCounts` รอบใหม่; toast `⚠ เภสัชยืนยันสินค้าขาด · แจ้งคลังสินค้าแล้ว` (error)
   - **non-pharmacist + fail/over:** flow เดิม — `problemReported=true` รอเภสัชตรวจ (ไม่ trigger `problemReviewed`)

### Auto-generated `problemNote` format
```
🧪 เภสัชยืนยันสินค้าขาด:
• {SKU1} {name1} ขาด {N} ชิ้น
• {SKU2} {name2} ขาด {M} ชิ้น
• {SKU3} {name3} เกิน {K} ชิ้น    ← กรณีเกิน (over)
```

### ผลกระทบกับ Desktop view (`saveProblemNote`)
- Desktop ที่หัวหน้าพิมพ์ note + กด `📦 แจ้งคลังสินค้า` **ยังใช้งานได้เหมือนเดิม** — เก็บไว้สำหรับ damaged box (มีรูป) หรือ incomplete ที่ไม่ได้ผ่าน pharmacist recheck
- ถ้า pharmacist recheck-fail ก่อน → Outbound badge ขึ้นทันที + note auto-fill — หัวหน้า Desktop อาจไม่ต้องทำซ้ำ
- Desktop "🔁 รีเช็คสินค้า" view (blind: SKU/ชื่อ/หน่วย/สแกนแล้ว) **เก็บไว้ดูประวัติเท่านั้น** ไม่ใช่หน้าสแกน
  - มีหัวข้อตาราง **"รายการสินค้าที่ต้องรีเช็ค"** + subtitle "ผลสแกนรอบแรก (จากพนักงานสาขา)"
  - คอลัมน์: SKU/ชื่อ / หน่วย / **จำนวนที่สแกนได้** (เปลี่ยนจาก "สแกนแล้ว")
  - **Hint banner สีแดง** ด้านบนตาราง: `สแกนสินค้าที่ app เพื่อรีเช็ค` (เน้นว่า supervisor ไม่ทำ recheck บน Desktop — ต้องให้เภสัช scan ใน Android)
  - useEffect ที่ sync `problemNote` textarea — dep ต้องมี `viewingBox?.problemNote` ไม่งั้น Firestore update จากเภสัช Android จะไม่ refresh ในหน้า Desktop จนกว่า user จะคลิกลังอื่นแล้วกลับมา (เคยเป็นบั๊ก)

### Verify phase UI (ทั้ง Android และ Desktop)
- **Title:** "ตรวจสอบสินค้าในลัง" + **`box.id` แสดงข้างกัน** (mono สีส้ม) — เห็นเลขลังตลอดเวลา
- **ไม่มี panel "สแกนแล้ว N ชิ้น"** — ลบออกแล้ว ลด clutter (ตารางรายการสินค้าด้านล่างแสดงรายละเอียดเต็มอยู่แล้ว)
- **สแกนสินค้าที่ไม่อยู่ในลัง:** showToast `⚠ ไม่มี SKU นี้ในลัง` (สีแดง) + inline `scanError` ใต้ input — โดดเด่นทั้งสองแบบ

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
- **File chooser (`<input type=file>`):** override `WebChromeClient.onShowFileChooser()` → เปิด chooser กล้อง (ACTION_IMAGE_CAPTURE ผ่าน FileProvider `${applicationId}.fileprovider` → `cacheDir/images`) + แกลเลอรี (`params.createIntent()`) — **ถ้าไม่ override ปุ่มเลือกรูปจะกดแล้วเงียบ** ใช้กับหน้าแจ้งปัญหา (แนบรูปหลักฐาน)
  - ต้องมี `<provider>` ใน AndroidManifest + `res/xml/file_paths.xml` (`<cache-path name="images" path="images/" />`)
- **หน้าจอเปิดแอปพื้นขาว:** theme `@style/AppTheme` (`values/themes.xml` + `values-v31/themes.xml`) ตั้ง `windowBackground`/`windowSplashScreenBackground` = ขาว + `webView.setBackgroundColor(WHITE)` — กัน splash/flash ดำตอนเปิด
- **App icon:** adaptive icon พื้นขาว (`mipmap-anydpi-v26/ic_launcher.xml` → foreground PNG 108–432px + `@color/ic_launcher_background` ขาว) + legacy fallback + web favicon (`public/`) — สร้างจากรูปเดียวด้วยสคริปต์ PIL (pad จัตุรัส → ย่อทุกขนาด)

### Scanner Broadcast Integration
| ยี่ห้อ | Action | Extra key |
|---|---|---|
| **KTE (เครื่องที่ใช้จริง)** | `com.kte.scan.result` | **`code`** |
| KTE (บางรุ่น) | `com.kte.scan.result` | `scanResult` |
| Zebra | `com.kte.scan.result` | `SCAN_BARCODE_1` |
| Honeywell | — | `data` |
| DataWedge | — | `com.symbol.datawedge.data_string` |

**⚠ สำคัญ:** Extra key ของ KTE เครื่องที่ใช้งานจริงคือ `"code"` — ถ้าเปลี่ยนรุ่น scanner ให้ตรวจ key ก่อน แก้ใน MainActivity.kt → ต้องลง APK ใหม่

**Android 13+ (API 33+):** ต้องใช้ `RECEIVER_EXPORTED` ใน `registerReceiver` — มิฉะนั้น broadcast จาก scanner app ภายนอกจะถูกบล็อก

Android inject barcode → WebView ด้วย:
```kotlin
webView.evaluateJavascript(
    "window.dispatchEvent(new CustomEvent('wh-scan',{detail:'$safe'}))", null
)
```

**React รับ `wh-scan` event 2 ระดับ:**
- **PackScanC** — `useEffect` รับ `wh-scan` โดยตรง → `processBarcode()` (ไม่ผ่าน input injection)
- **App.jsx** — fallback สำหรับ BranchReceive และหน้าอื่น → inject เข้า focused input via native setter
- ถ้า `[data-android-barcode]` อยู่ใน DOM (PackScanC mount) → App.jsx handler skip ไม่ inject ซ้ำ

### Play Store In-App Updates
ใช้ `com.google.android.play:app-update-ktx:2.1.0` — Flexible update (ดาวน์โหลดใน background)
เรียก `checkForUpdates()` ทุกครั้งที่ `onResume` — จะแสดง dialog อัตโนมัติเมื่อมีเวอร์ชันใหม่ใน Play Store

### วิธี Build
1. เปิด folder `android/` ใน Android Studio
2. รัน `gradle wrapper` ครั้งแรก (สร้างไฟล์ `gradlew`)
3. Build APK / AAB → upload Play Console

**GitHub Actions:** push ไฟล์ใน `android/**` → build debug APK อัตโนมัติ → download จาก Actions Artifacts

### ต้องลง APK ใหม่หรือไม่?

| ไฟล์ที่แก้ไข | ต้องลง APK ใหม่? |
|---|---|
| ไฟล์ใน `src/` (React, CSS, JS) | ❌ ไม่ต้อง — Vercel auto-deploy, WebView โหลดใหม่อัตโนมัติ |
| `android/app/src/main/java/**.kt` | ✅ ต้องลงใหม่ — native Kotlin code |
| `android/app/src/main/AndroidManifest.xml` | ✅ ต้องลงใหม่ — permissions / config |
| `android/app/build.gradle` | ✅ ต้องลงใหม่ — dependencies / SDK version |
| `android/app/src/main/res/**` | ✅ ต้องลงใหม่ — icons / layout XML |
| `CLAUDE.md`, `README`, `.github/**` | ❌ ไม่ต้อง — ไม่กระทบ runtime |

**กฎง่ายๆ:** แก้ไฟล์ใน `android/` → ต้องลงใหม่ / แก้ไฟล์ใน `src/` → ไม่ต้อง

---

## Android Mode (`?android=1`)

**Target device:** 800×480px physical resolution, portrait lock → CSS viewport ≈ **480px wide × 800px tall** (ขึ้นกับ pixel density ของเครื่อง)
`@media (max-width: 640px)` ใน styles.css ครอบคลุม 480px เสมอ


**Detection:** `const isAndroidMode = new URLSearchParams(window.location.search).get('android') === '1';`
- ใช้ใน `App.jsx` (module scope) และ `PackScanC.jsx` (module scope)
- `isAndroid` ใน PackScanC, `isAndroidMode` ใน App.jsx

**App.jsx:** ถ้า `isAndroidMode` → render `<AndroidApp>` แทน desktop layout ทั้งหมด
- ไม่มี topbar, tabs, canvas
- `--note-display` ตั้งเป็น `none` ตายตัว (Annotation component ไม่ได้ใช้แล้ว)

**AndroidApp.jsx (`src/screens/AndroidApp.jsx`):** — flow 3 ขั้นเต็มจอ (ดูรายละเอียด logic ที่ section *BRANCHES + พนักงานต่อสาขา* ด้านบน) — **ไม่มี tab/bottom bar แล้ว** (ของเดิมเป็น 2 tabs ด้านล่าง ลบออกไปนานแล้ว)
- ขั้น 1/2 (`!branch` / `!currentStaff`): full-screen picker (`position: fixed; inset: 0`), การ์ดปุ่มเลือกที่ทำงาน/พนักงาน
- ขั้น 3 (หน้าสแกน): header แถวเดียว (ที่ทำงาน + 👤 พนักงาน + ปุ่ม "เปลี่ยน") ต่อด้วย content เต็มพื้นที่ที่เหลือ — `isWarehouse ? <PackScanC> : <BranchReceive branch={branch.code}>`
  - PackScanC ได้ `key={packer.code}-${packCatalog.length}` — remount ทุกครั้งที่สลับพนักงานหรือ catalog เปลี่ยน (ขนาด) เพื่อ reset state ภายใน (รวม manual LOT form — ดู *LOT Selection*)
  - ส่ง `catalogMeta` prop ไปให้ PackScanC เพื่อแสดง Picklist info ใน frame-header
  - BranchReceive ได้ `branchStaff`/`setBranchStaff` (controlled mode, state อยู่ที่ AndroidApp) + `isAndroid={true}`
- `setTab={() => {}}` — ปิด navigation ที่ไม่เกี่ยว
- Props: `screenProps, packer, setPacker, PACKERS, catalogByPacker, onScanProgress, catalogMeta`

**PackScanC Android layout:**
- Scan area: row เดียว — barcode input + 🔍 toggle + ปิดลัง
- **Search toggle:** search input ซ่อนอยู่โดย default — กด 🔍 ถึงจะเปิด ป้องกัน focus โดยบังเอิญขณะสแกน
- ปุ่มปิดลัง: `.btn.primary` ขนาดปกติ (ไม่ใช้ `.btn.lg`)
- `barcodeRef` + `useEffect` (ไม่มี dependency) คืน focus หลังทุก render
- Barcode input: `inputMode="none"` กัน Android soft keyboard ปรากฏ (ใน HID mode จะไม่ดัก Enter)
- `data-android-barcode="true"` attribute บน barcode input — ใช้ระบุตำแหน่งจาก App.jsx
- **`processBarcode(val)`** — logic กลางสำหรับทั้ง Broadcast (wh-scan) และ HID (onKeyDown Enter)
- Card: padding 8px, font 13px, barcode แสดงเสมอ (10px สีแดง)
- Pagination Android: แสดงแค่ `← หน้า X/Y →` (ไม่มีปุ่มตัวเลข กัน overflow)

---

## Mobile / PDA CSS (styles.css)
`@media (max-width: 640px)` — สำหรับเครื่อง handheld scanner แนวตั้ง 600px wide:
- Canvas padding ลดเหลือ 8px
- `.grid-2`, `.grid-3-pack` stack เป็น single column
- Tab font เล็กลง, chip/btn sm compact
- `index.html`: `user-scalable=no` ป้องกัน pinch-zoom

---

## Utility Scripts

### `git_changelog_pdf.py`
สร้างไฟล์ `changelog.pdf` สรุปประวัติ Git Commit ทั้งหมดในโปรเจกต์

```bash
pip install reportlab   # ติดตั้งครั้งแรกเท่านั้น
python git_changelog_pdf.py
```

ตั้งค่าในไฟล์:
| ค่า | default | คำอธิบาย |
|---|---|---|
| `AUTHOR_FILTER` | `""` | กรองเฉพาะผู้แก้ไขคนนั้น — ว่างเปล่า = ทุกคน |
| `DATE_AFTER` | `""` | ดูตั้งแต่วันที่นี้ เช่น `"2026-01-01"` — ว่างเปล่า = ทั้งหมด |
| `PROJECT_NAME` | `"PROJECT WAREHOUSE INBOUND &"` | ชื่อโปรเจกต์บน PDF |
| `OUTPUT_FILE` | `"changelog.pdf"` | ชื่อไฟล์ output |

ตาราง PDF มีคอลัมน์: `#` / วันที่-เวลา / ผู้แก้ไข / รายละเอียด (commit message) / Commit hash (7 ตัว)

---

## Notes
- ไฟล์ที่ไม่ได้ใช้แล้ว: `PackScanA.jsx`, `PackScanB.jsx`, `ExportPOS.jsx`, `LookupByBoxBarcode.jsx`, `FlowDiagram.jsx`, `TweaksPanel.jsx`, `Annotation.jsx` — ยังอยู่ในโปรเจกต์แต่ไม่ได้ import
- Accent color ตรึงเป็น orange (`#e8692b` / `#f5c9a8`) ใน App.jsx โดยตรง — ไม่มี TweaksPanel หรือ DEFAULT_TWEAKS แล้ว
- `data.js` ยังมี mock data ที่ไม่ได้ใช้ — ควรลบออก
- ไม่มี TypeScript, ไม่มี test suite
- PDA support: **แนะนำ Broadcast Mode** (`com.kte.scan.result`) — ไม่มีปัญหา barcode ต่อกัน ไม่ต้องพึ่ง HID keyboard
- Firestore Security Rules: `request.auth != null` — Firebase Anonymous Auth enabled (ไม่มีวันหมดอายุ)
