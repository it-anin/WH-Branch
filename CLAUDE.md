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
| `factorMap` | `{[sku__unit]: number}` | ✅ `config/factorMap` (array format) | ตัวคูณหน่วยฐานต่อ SKU+unit (ColH R05.106) — โหล=12, กล่อง=1 |
| `nameMap` | `{[sku]: string}` | ✅ `config/nameMap` + `nameMap_1..N` (**sharded**) | ชื่อสินค้าต่อ SKU (ColF R05.106 `CF_ITEMNAME`) — แหล่งชื่อสำรอง: `lookupByScan` (สแกนเพิ่มนอก Picklist) + `fixItemName` heal ลังเก่าที่ชื่อเป็นเลข SKU |
| `lotMap` | `{[sku]: [{lot, qty, exp?}]}` | ✅ `config/lotMap` + `lotMap_1..N` (**sharded**) | LOT + qty คงเหลือ + วันหมดอายุ (exp — จากไฟล์ LOT+EXP) ต่อ SKU (key by SKU only ไม่มี unit) |
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
- **Login (A1) แทน "เลือกที่ทำงาน"** — ตั้งแต่เพิ่ม login รายที่ทำงาน location มาจาก**โปรไฟล์ที่ login** (prop `profile` จาก App.jsx) ไม่ใช่ picker/`wh_branch` เดิม (ดู *Login โปรไฟล์รายที่ทำงาน* ด้านล่าง)
- **AndroidApp — flow 2 ขั้น** (เดิม 3, ตัด "เลือกที่ทำงาน" ออกเพราะ login แทน): (1) **เลือกพนักงาน** → (2) **หน้าสแกน** — gate ด้วย `if (!currentStaff)`
  - `const branch = profile` (location จาก login): **WAREHOUSE** (`warehouse:true`) → โหมดแพ็คกิ้ง · **สาขา (SRC/KKL/SSS)** → โหมดรับสินค้า
  - **ขั้นเลือกพนักงาน:** `staffList = isWarehouse ? PACKERS : branch.staff`; `currentStaff/setStaff = isWarehouse ? packer/setPacker : branchStaff/setBranchStaff` (packer = lifted ที่ App.jsx, branchStaff = local) — เภสัชมี tag 💊; ปุ่ม "← เปลี่ยนที่ทำงาน" → `changeBranch` = **`setPacker(null)` + `logout()`** (กลับหน้า Login)
    - **staff ไม่ persist** — logout ล้าง packer + AndroidApp unmount → branchStaff (local) หายเอง
  - **ขั้นหน้าสแกน:** PackScanC (warehouse) / BranchReceive (`branch={branch.code}`); header โชว์ ที่ทำงาน + 👤 พนักงาน + ปุ่ม "เปลี่ยน" (`setStaff(null)` → กลับขั้นเลือกพนักงาน)
- **เดิม** เคย hardcode `BRANCH_STAFF` (BR-01..BR-05) ซ้ำใน BranchReceive.jsx + AndroidApp.jsx — ย้ายมา `branches.js` แล้ว (BranchReceive import `ALL_BRANCH_STAFF`)

### Login โปรไฟล์รายที่ทำงาน (A1 เบา) — `src/screens/Login.jsx`
- **เป้าหมาย:** แยกมุมมองต่อที่ทำงาน (โดยเฉพาะ Desktop รับสินค้าที่เดิมเห็นทุกสาขาปนกัน) — **A1 = แยกมุมมองเท่านั้น ไม่แตะ Firestore rules/data model** (ข้อมูลยัง global โหลดหมด กรองที่ UI)
- **โปรไฟล์ = รายที่ทำงาน** (`PROFILES = [WAREHOUSE, ...BRANCHES]` ใน branches.js) — แต่ละอันมี `role`: `warehouse` / `branch`; login แล้ว**ยังเลือกพนักงานต่อ** (track `packer`/`receivedBy` เหมือนเดิม)
- **flow:** App.jsx gate `if (!profile) return <Login>` (ก่อน `isAndroidMode`) → Login เลือกที่ทำงาน + กรอกรหัส → เทียบ `config/auth.passwords` (getDoc ครั้งเดียว) → `setProfile` + `localStorage['wh_profile']` → `logout()` ล้าง + กลับ Login
- **Desktop role-based tabs** (`ROLE_TABS` module-scope ใน App.jsx): `warehouse` → `[flow, list, scan, closed]` · `branch` → `[receive]` เท่านั้น — filter `TABS` + useEffect เด้ง tab ให้ตรง role ถ้า `wh_tab` เดิมไม่อยู่ในสิทธิ์; topbar โชว์ชื่อโปรไฟล์ + ปุ่ม "ออกจากระบบ"
- **Desktop รับสินค้า scope:** `<BranchReceive branch={profile.role==='branch' ? profile.code : null} />` → สาขาเห็นเฉพาะตัวเอง (reuse `matchBranch` เดิม), **คลัง (null) เห็นทุกสาขา**
- **⚠ ต้องตั้ง `config/auth.passwords` ใน Firebase console ก่อน deploy** ไม่งั้น login ไม่ผ่าน; ทุกคน login ใหม่หลัง deploy (ไม่มี `wh_profile` เดิม)

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
├── sound.js                     # playScanSuccess() — เสียง "Success Chime" สังเคราะห์สดด้วย Web Audio API (ไม่ใช้ไฟล์เสียง)
├── main.jsx                     # React entry
├── styles.css                   # Global styles, CSS variables + media query mobile ≤640px
│
├── components/
│   ├── ImportCatalog.jsx        # Upload รายการเบิก (.csv/.xlsx)
│   ├── ImportBarcodeMap.jsx     # Upload barcode map (.xlsx เท่านั้น — .csv ทำเลข 0 นำหน้าหาย)
│   ├── ImportCostMap.jsx        # Upload ราคาทุน R05.105 (.csv/.xlsx) — ColB=SKU, ColE=unit, ColF=4(filter), ColH=cost
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
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const auth = getAuth(app);
signInAnonymously(auth).catch(() => {});
export const onAuthReady = (cb) => onAuthStateChanged(auth, (user) => { if (user) cb(user); });
```

**⚠ `ignoreUndefinedProperties: true` (สำคัญ):** ใช้ `initializeFirestore` (ไม่ใช่ `getFirestore`) เพื่อให้ Firestore **ตัด field ที่เป็น `undefined` ทิ้ง** แทนการ throw — เดิม `getFirestore` ปกติจะ throw ทั้ง `setDoc`/`writeBatch` ถ้ามี field เดียวเป็น undefined (เช่น `scannedLots: undefined`, `barcode: undefined` จาก catalog บางแถว) เนื่องจาก `setBoxes`/`setItemsByBox` เป็น optimistic (local ก่อน → Firestore ทีหลัง) write ที่ล้มจะ**เงียบ** → ลังปิดแล้วเห็นบนเครื่องที่แพ็คแต่ไม่ sync ไป Desktop/Outbound. **ถึงมี safety net นี้แล้วก็ควรใช้ `null`/`''` แทน `undefined` ในทุก field ของ box/item**

### Collections / Documents

| path | ข้อมูล | รูปแบบ |
|---|---|---|
| `boxes/{boxId}` | ข้อมูลลัง | Box object |
| `boxItems/{boxId}` | สินค้าในลัง | `{ items: Item[] }` |
| `progress/{boxId}` | in-progress scan | `{ items: [{sku, got}] }` |
| `config/catalog` | catalog ทั้งหมด | `{ items: Item[] }` |
| `config/barcodeMap` | barcode map | `{ entries: [{key, barcodes}] }` ← array format (ไม่ใช่ object) |
| `config/costMap` | ราคาทุน | `{ entries: [{key, cost}] }` ← array format (key = `sku__unit`) |
| `config/factorMap` | ตัวคูณหน่วยฐาน | `{ entries: [{key, factor}] }` ← array format (key = `sku__unit`, จาก ColH R05.106) |
| `config/nameMap` + `config/nameMap_1..N` | ชื่อสินค้าต่อ SKU (**sharded**) | `{ entries: [{key, name}] }` ← key = SKU (จาก ColF R05.106) — วัดจริง ~454KB (7.9k SKU) เกินครึ่งลิมิต → shard ตั้งแต่แรก (`NAMEMAP_CHUNK_BUDGET` 700KB, เพดาน `NAMEMAP_MAX_CHUNKS=5`); listener ใช้ prefix-range query แบบเดียวกับ lotMap แต่ upper bound ประกอบด้วย `String.fromCharCode(0xf8ff)` (เลี่ยง unicode-escape pitfall) |
| `config/lotMap` + `config/lotMap_1..N` | LOT + qty + exp (**sharded**) | `{ entries: [{key, lots: [{lot, qty, exp?}]}] }` ← key = SKU only; ทั้งก้อน (มี exp) ~1.3MB เกิน 1MB/doc → แบ่ง chunk ละ ~700KB (`LOTMAP_CHUNK_BUDGET`), `_meta` อยู่ chunk 0 (`lotMap`), เพดาน `LOTMAP_MAX_CHUNKS=10`; listener ใช้ query ช่วง `documentId()` ครอบทุก doc ที่ id ขึ้นต้นด้วย `lotMap` แล้วรวม entries ทุก chunk (doc เดี่ยวเดิม = chunk 0 → backward-compat อัตโนมัติ) |
| `history/{docId}` | ประวัติลังที่ clear (7 วัน) | `{ dateKey, label, clearedAt, boxes: [...] }` ← docId = `String(Date.now())` ตอน clear |
| `config/catalogByPacker` | การแบ่งรายการ | `{ assignments: {[code]: Item[]} }` |
| `config/receive` | ลังที่รับแล้ว | `{ ids: string[] }` |
| `config/boxCounter` | serial counter ต่อวัน | `{ [ddmm]: number }` ← atomic counter สำหรับ createNewBox |
| `config/zoneAssignments` | โซนต่อพนักงาน | `{ assignments: {[code]: string[]} }` ← array ของ zone prefix เช่น `['A','B','COOL']` |
| `config/auth` | รหัสผ่าน login รายที่ทำงาน (A1) | `{ passwords: { WAREHOUSE, SRC, KKL, SSS } }` ← **ตั้งใน Firebase console เอง** · Login อ่านด้วย `getDoc` (ครั้งเดียว) เทียบ client-side · ⚠ rules เปิด = รหัสอ่านได้ฝั่ง client ไม่ใช่ security จริง |

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
**Merge ไม่ใช่ replace** (key = `sku__unit`) — ผลคือ `item.barcode` มักเป็น **comma-separated หลายตัว**:
1. เก็บ barcode เดิมของ item จาก ColC (ถ้ามี)
2. รวม `map[sku__unit]` (barcode ที่ unit ตรงเป๊ะ)
3. รวม `skuBarcodes[sku]` — **ทุก barcode ของ SKU นั้นจาก barcode map ไม่จำกัด unit** (กวาดทุก key ที่ `key.split('__')[0] === sku` ไม่ว่า unit ส่วนหลังจะเป็นอะไร)
4. `mergeBarcodes(...)` dedupe + join `,` → ได้ `item.barcode` สุดท้าย (ถ้าไม่มีตัวไหนเลยทั้ง 3 ทาง → คง field เดิมไว้)

**ผลกระทบ:** `item.barcode` **ไม่ใช่ค่าเดียวที่ตรงกับ unit เป๊ะอีกต่อไป** — เป็น "รายการ barcode ที่เป็นไปได้" สำหรับ SKU นั้น ใช้กับ `matchBarcode()` (`src/data.js`) ตอนสแกนเท่านั้น (match bare SKU หรือ barcode ตัวใดตัวหนึ่งในลิสต์) — **ห้ามใช้ `item.barcode` ตรงๆ เป็นค่า export** ต้องใช้ `scannedBarcode` แทน (ดูบรรทัดด้านล่าง)

**สำคัญ:** unit ใน barcode map (ColG) **ต้องตรงกับ unit ในรายการเบิก (ColE)** ทุกตัวอักษร เช่น `กล่อง`, `ชิ้น`, `10ชิ้น` — ถ้า ColG ว่างเปล่า key จะเป็น `sku__` ซึ่งไม่ match กับ catalog → barcode ว่าง

**⚠ ใช้ SheetJS อ่านทุกไฟล์แล้ว** (`ImportBarcodeMap.jsx`, `ImportCatalog.jsx`, `ImportLotMap.jsx`):
- เดิม: ใช้ regex `/\.xlsx?$/i` แยก `.xlsx` (→ SheetJS) กับ `.csv`/อื่นๆ (→ custom CSV parser `splitCSVLine`)
- ปัจจุบัน: **ทุกไฟล์อ่านผ่าน `XLSX.read(buffer, {type: 'array'})`** ของ SheetJS เสมอ (รวม `.106`, `.csv`) — SheetJS detect format อัตโนมัติและจัดการ quoted fields ตาม CSV standard ครบถ้วน
- **เหตุผล:** ไฟล์ R05.106 (CSV ที่ extension `.106`) มีชื่อสินค้ามีเครื่องหมาย `"` (นิ้ว/inch) เช่น `NIPRO 18G x 1"` และมี `,` ในชื่อด้วย — custom CSV parser เดิมจะดูด column ที่เหลือเข้าเป็น field เดียว ทำให้ unit/barcode หาย
- **LOT file** ใช้ `{ cellDates: false, raw: true }` + CSV อ่านเป็น text (`type: 'string'`) → คงค่า LOT/EXP ตามตัวอักษรในไฟล์ (เช่น LOT `001/25` ไม่ถูกแปลงเป็นเลข) — EXP อ่านจากคอลัมน์ text `CF_EXPIREDATE_TEXT` อยู่แล้วจึงไม่เจอ date serial
- **อาการเดิม (ก่อนแก้):** barcode/unit ไม่ขึ้นในหน้าแพ็คกิ้ง, debug `__wh.sku('SKU')` จะเห็น key = `sku__` (unit ว่าง), `barcode: ''` ใน catalog
- **`splitCSVLine` ที่ยังเหลือใน ImportCostMap.jsx** — แก้ `"` กลางฟิลด์เป็น literal เช่นกัน แต่ไฟล์ R05.105 ปกติเป็น `.xlsx` ทำให้ไม่ค่อยกระทบ
- **⚠ ImportBarcodeMap บังคับ `.xlsx` เท่านั้น** (ต่างจาก ImportCatalog/ImportLotMap ที่ยังรับ CSV ได้): `accept=".xlsx"` + guard ใน `handleFile` (`/\.xlsx$/i.test(file.name)` ไม่ผ่าน → alert + return) — **เหตุผล:** ไฟล์ `.csv`/`.106` ดิบทำให้**เลข 0 นำหน้า**ของ barcode/SKU หาย (เช่น `0123456` → `123456`); ไฟล์ `.xlsx` ที่ผู้ใช้ save (cell เป็น text) คงเลข 0 ไว้ — `accept` เป็นแค่ filter ของ picker (เลี่ยงด้วย "All files" ได้) จึงต้อง guard ซ้ำในโค้ด

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

### `handleLotMapImport(map)` — sharded write
- รับ `map = {[sku]: [{lot, qty, exp?}]}` จาก ImportLotMap
- `setLotMap(map)` → local state
- แปลงเป็น `entries = [{key, lots}]` → **แบ่ง chunk ตาม JSON size** (`LOTMAP_CHUNK_BUDGET` ~700KB/doc, ทั้ง SKU อยู่ chunk เดียวกันเสมอ) → `writeBatch`: chunk 0 → `config/lotMap` (+`_meta`), chunk ถัดไป → `config/lotMap_1..N`, แล้ว `batch.delete` chunk ที่เกินจำนวนรอบนี้ถึง `LOTMAP_MAX_CHUNKS` (กัน chunk เก่าค้าง — delete doc ที่ไม่มี = no-op)
- **เหตุผล:** lotMap พร้อม exp ทั้งก้อน ~1.3MB เกินลิมิต Firestore 1MB/doc (วัดจากไฟล์จริง 31.8k lots)
- แสดง toast `LOT map: N SKU · M LOT ✓ (K doc)`

### `clearFirestore()`
- confirm dialog ก่อนลบ
- writeBatch ลบ: `boxes/*`, `boxItems/*`, `progress/*`, `history/*`, `config/catalog`, `config/barcodeMap`, `config/catalogByPacker`, `config/costMap`, `config/factorMap`, `config/lotMap` (+ shard `lotMap_1..LOTMAP_MAX_CHUNKS-1`), `config/receive`
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
| F (5) | **ชื่อสินค้า** (`CF_ITEMNAME`) → `nameMap[sku]` (first-wins ต่อ SKU, ข้ามค่าว่าง) — แหล่งชื่อสำรอง (ดู *fixItemName / lookupByScan*) |
| G (6) | หน่วย |
| H (7) | **ตัวคูณหน่วยฐาน** (`CF_BASEMULTIPLE`) — จำนวนหน่วยฐานต่อ 1 หน่วยนี้ เช่น โหล=12, กล่อง=1 |

**ColF → `nameMap`:** `rowsToMap` คืน `{ map, factorMap, nameMap }` → `onImport(map, factorMap, nameMap, meta)` → `handleBarcodeMapImport` sync `config/nameMap` แบบ **sharded** (chunk logic แยกจาก lotMap — ไม่แตะ path เดิม) — ใช้ 2 ทาง: (1) `lookupByScan` (Outbound edit mode) สแกนเพิ่มสินค้านอก Picklist → ได้ชื่อจริงเก็บถาวรลง item แทน fallback เลข SKU เดิม (2) `fixItemName(l, nameMap)` (units.js) heal ตอน render — ลังเก่าที่ item `name` ว่าง/เท่ากับ sku → เติมชื่อจาก nameMap (wrap ที่จุด derive `boxItems`/`viewingItems`/search ใน BoxClosedLabel + BranchReceive; แถวใน Excel ก็ได้ด้วย) — **ต้อง re-upload R05.106 หนึ่งครั้งเพื่อสร้าง nameMap** (ก่อนนั้นแสดงแบบเดิม ไม่พัง)

**ColH → `factorMap`:** `rowsToMap` คืน `{ map, factorMap }` — `factorMap[sku__unit] = factor` (first-wins). **factor ผูกกับ `sku__unit` ไม่ใช่ชื่อหน่วยล้วน** — ใน R05.106 หน่วย `กล่อง` มี factor ตั้งแต่ 1 ถึง 2000 แล้วแต่ SKU, `โหล` ส่วนใหญ่=12 แต่บาง SKU=1 → ห้ามใช้ตารางหน่วยตายตัว. ทุก SKU มีหน่วยฐาน (factor=1) เสมอ. `onImport(map, factorMap, meta)` → `handleBarcodeMapImport` sync `config/factorMap` (array `{key, factor}`)
- **โมเดลหน่วยฐาน (base-unit) — แก้บั๊ก "สแกนกล่องนับเป็น 1 โหล":** PackScanC คิด `need`/`gotBase` เป็นหน่วยฐาน — `needBase = picklistQty × factor(picklistUnit)`, ทุกสแกน `gotBase += factor(หน่วยของบาร์โค้ดที่สแกนจริง)` (resolve หน่วยจาก `barcodeMap`). ครบเมื่อ `gotBase >= need`. รองรับบาร์โค้ดปนกัน: สแกนบาร์โค้ดโหล +12 / บาร์โค้ดกล่อง +1. แสดงผล `gotBase/need {baseUnit}` (หน่วยฐาน). **`got` ยังเป็นจำนวนครั้งที่สแกน** (แยกจาก gotBase) ไว้ export ตามหน่วยที่สแกนจริง
- **Fallback ตัวคูณเมื่อหน่วย picklist ไม่มีใน R05.106 (PackScanC, module-level):** บางครั้ง picklist ใช้ชื่อหน่วยที่ R05.106 ไม่มีแถวนั้น (เช่น picklist "โหล" แต่ R05.106 มีแค่ "กล่อง"=1) → `factorOf` ผ่าน helper `lookupFactor(factorMap, sku, unit)` ลำดับ: **`factorMap[sku__unit]` (R05.106) ชนะเสมอ → `UNIT_FACTOR_OVERRIDE[sku__unit]` → `STANDARD_UNIT_FACTOR[unit]` → `1`**
  - **`STANDARD_UNIT_FACTOR`** = `{ 'โหล': 12, 'กุรุส': 144 }` — หน่วยสากลที่คงที่ทุก SKU
  - **`UNIT_FACTOR_OVERRIDE`** = `{ '700081__4กล่อง':4, '700352__10กล่อง':100, '100283__แพค10':10 }` — ตัวคูณเฉพาะ SKU (ค่า = จำนวนหน่วยฐานต่อ 1 หน่วย picklist, ยืนยันกับผู้ใช้) เพิ่มได้เมื่อเจอ SKU ใหม่ที่ audit พบ
  - **⚠ ห้าม parse เลขจากชื่อหน่วยอัตโนมัติ** (เช่น "10กล่อง"→10) — ตรวจแล้วใน R05.106 มี ~2% ที่เลขเป็นคำอธิบายไม่ใช่ตัวคูณ (`"แพค10"=1`, `"ซอง5ชิ้น"=1`) → parse จะได้ค่าผิด

### ไฟล์ 3: Cost Map (ImportCostMap) — ไฟล์ R05.105 (เดิม "Price" ยกเลิกแล้ว)
| Col | ข้อมูล |
|---|---|
| B (1) | SKU |
| E (4) | หน่วย |
| F (5) | Filter — เอาเฉพาะแถวที่ `= 4` (ราคาทุน) แถวอื่นเป็นราคาประเภทอื่น ข้าม |
| H (7) | ราคาทุน |

### ไฟล์ 4: LOT Map (ImportLotMap) — รองรับ 2 format, detect จากชื่อ header (case-insensitive)
| ข้อมูล | header (ไฟล์ LOT+EXP ใหม่) | ตำแหน่งใน R01.119 เดิม (fallback ถ้าไม่เจอ header) |
|---|---|---|
| LOT | `CF_LOTNO` (L) | A (0) |
| SKU | `CF_ITEMID` (J) | B (1) |
| จำนวนคงเหลือ (qty) — รวมหักลบกันก่อน filter | `CF_QUANTITY` (O) | F (5) |
| **หน่วยของ qty** (ตรงกับ R05.106 ColG) — แปลง qty เป็นหน่วยฐานด้วย `factorMap` **ตั้งแต่ import** | `CF_UNITNAME` (N) | G (6) |
| **วันหมดอายุ (exp)** — text `DD/MM/YYYY` ค.ศ. | `CF_EXPIREDATE_TEXT` (C) | — (ไฟล์เดิมไม่มี → exp ว่าง) |
| วันที่ transaction — ใช้เลือก exp เมื่อ lot เดียวกันมีหลาย exp | `CF_TRANDATE` (D) | — |

- `detectColumns(headerRow)`: เจอ `cf_lotno` + `cf_itemid` ใน header → ใช้ index ตามชื่อ; ไม่เจอ → ตำแหน่งเดิม R01.119 — **ไฟล์เก่ายังใช้ได้ต่อ** (regression-tested เทียบ logic เดิมได้ผลเหมือนเป๊ะ)
- **กติกา exp ขัดกัน:** lot เดียวกันบางครั้งมีหลาย exp ในไฟล์ (~4% ของ rows — ข้อมูลเก่า/คีย์ผิดแล้วแก้) → ใช้ exp จากแถวที่ `CF_TRANDATE` **ล่าสุด** (`tdNum()` แปลง DD/MM/YYYY → YYYYMMDD เทียบ, เสมอกัน = แถวหลังในไฟล์ชนะ)

**LOT aggregation logic (2 passes) — แปลงหน่วยฐานตอน import:**
1. แต่ละ row: `qtyBase = qty × factor(sku, unit)` (จาก `factorMap` prop — ส่งจาก App.jsx) → รวมต่อ `(SKU, LOT)` → `totals[sku][lot] = {qty: sumBase, exp, td}`
2. เก็บเฉพาะ LOT ที่ `sum > 0` → `map[sku] = [{lot, qty: sumBase, exp?}, ...]` (**qty เป็นหน่วยฐานแล้ว, ไม่เก็บ unit; exp ใส่เฉพาะเมื่อมีค่า**)

**⚠ ทำไมไม่เก็บ `unit` ต่อ lot + ทำไมต้อง shard:** เก็บ unit (ชื่อหน่วยไทย) ต่อแถวเคยทำให้ doc โต 1.39MB เกินลิมิต Firestore 1 doc = 1MB → `invalid-argument` จึงแปลงเป็น base ตั้งแต่ import; ต่อมาเพิ่ม exp ทำให้ทั้งก้อนโต ~1.3MB อีกครั้ง → **แก้ถาวรด้วย sharded write** (ดู `handleLotMapImport`) ไฟล์จริง 78k rows → 31.8k lots → 3 docs (~680KB, ~680KB, ~170KB). (`factorMap` ต้องโหลดก่อน คือ import R05.106 ก่อน LOT — ตาม import order อยู่แล้ว; ถ้ายังไม่มี factor → factor=1 ใช้ qty ตามเดิม)

**LOT usage หน่วยฐาน (PackScanC):** `getAvailableLots` ใช้ `lotMap[sku].qty` (หน่วยฐานแล้ว) ตรงๆ, `calcLotUsage` หักด้วย `จำนวนสแกน × factor(sku, scannedUnit)` → `remaining` เป็นหน่วยฐาน (สแกนบาร์โค้ดโหล 1 ครั้งหักสต็อกเท่า factor) — ลังเก่าไม่มี `scannedUnit` → factor=1 (= พฤติกรรมเดิม)

ตัวอย่าง: `F0224` มี 2 rows คือ `-36` และ `+36` → sum = 0 → **ไม่ขึ้น popup** (สต็อกหมดเพราะรับคืน/โอนออกหมด)

**`parseWorkbook` รองรับทั้ง CSV และ XLSX:** detect ด้วย `/\.csv$/i.test(file.name)` → CSV อ่านเป็น text ผ่าน `FileReader.readAsText(file, 'utf-8')` + `XLSX.read(input, { type: 'string' })`, XLSX อ่านเป็น ArrayBuffer + `type: 'array'`. ใช้ `sheet_to_json(ws, { header: 1, raw: true, defval: '' })` เพื่อให้ string cell คง LOT format เดิม (เช่น `001/25` ไม่ถูกแปลงเป็นเลข)

**Import order:** catalog ก่อน → barcode map → cost map → LOT map (แต่ละไฟล์ import แยกอิสระ)
**Re-import:** ต้อง import ทั้งสองไฟล์แรกใหม่ถ้าแก้ไข applyBarcodeMap logic
**LOT structure backward-compat:** Firestore listener รับได้ทั้งรูปแบบเก่า (`lots: [string]` → จะ normalize เป็น `{lot, qty: Infinity}`) และใหม่ (`lots: [{lot, qty, exp?}]`) — ต้อง re-import เพื่อ get qty จริง; ต้อง re-import **ไฟล์ LOT+EXP** เพื่อ get exp (ไฟล์ R01.119 เดิม → exp ว่างทุก lot)

### Import Button UX (หน้า Tab: รายการเบิกสินค้า)
ปุ่ม 4 ปุ่มเรียงเป็น column แยกแถว:

| ปุ่ม | ก่อนอัปโหลด | หลังอัปโหลด |
|---|---|---|
| ImportCatalog | `⇑ อัปโหลดไฟล์ Picklist` (ไม่มีสี) | `✅ อัปโหลดไฟล์ Picklist_XXX แล้ว` (สีส้ม) + badge `✅ รายการเบิก: N รายการ · ไฟล์วันที่ D/M/YYYY` |
| ImportBarcodeMap | `⇑ อัปโหลดไฟล์ R05.106` (ไม่มีสี) — **รับ `.xlsx` เท่านั้น** (.csv ทำเลข 0 นำหน้าหาย) | `✅ อัปโหลดไฟล์ {filename} แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportCostMap | `⇑ อัปโหลดไฟล์ R05.105` (ไม่มีสี) | `✅ อัปโหลดไฟล์ R05.105 แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportLotMap | `⇑ อัปโหลดไฟล์ LOT+EXP` (ไม่มีสี) | `✅ อัปโหลดไฟล์ LOT+EXP แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |

- **XXX** ใน Picklist — parse จาก filename pattern `Picklist_XXX` (regex `picklist[_-]([A-Za-z0-9]+)`) เช่น `Picklist_SRC` → `SRC`
- **{filename}** ใน Barcode — ชื่อไฟล์ไม่มีนามสกุล เช่น `R05.106`
- วันที่ใน badge ทุกปุ่มมาจาก **`new Date()` ตอนกดอัปโหลด** (วันที่อัปโหลดจริง) — เดิมใช้ `file.lastModified` (Date Modified ของไฟล์) แต่ทำให้ badge ขึ้นวันเก่าตามวันแก้ไขไฟล์ ไม่ใช่วันที่อัปล่าสุด จึงเปลี่ยนเป็นวันอัปโหลดจริงทั้ง 4 ปุ่ม
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
| `closedAt` | `doClose()` (PackScanC) — epoch ms | KPI เวลาเปิด→ปิดลัง คู่กับ `createdAt` — คอลัมน์ "เปิดลัง"/"ปิดลัง" ใน BoxList | — (ลังเก่าก่อนมี field นี้ = ไม่มีค่า → แสดง `—`) |
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
| `note` | กรอก textarea "📝 Note บนสติกเกอร์" ใต้ตัวอย่างสติกเกอร์ (คอลัมน์ขวา Outbound, save ตอน onBlur ผ่าน `saveBoxNote`) | หมายเหตุต่อลัง — **โชว์บนสติกเกอร์** (`Note: {note}`) + แก้พิมพ์ผิด/เปลี่ยนข้อความได้ตลอด | — |

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
| `wh_profile` | **โปรไฟล์ login รายที่ทำงาน (A1)** — code ('WAREHOUSE'/'SRC'/'KKL'/'SSS'); `resolveProfile()` แปลงเป็น profile object ตอน init; ล้างตอน logout → กลับหน้า Login |
| `wh_branch` | **(deprecated)** เดิม AndroidApp เก็บที่ทำงานที่เลือก — แทนที่ด้วย `wh_profile` (login) แล้ว, ไม่ได้อ่าน/เขียนอีก |
| `wh_history` | (deprecated) ประวัติลังที่ clear แล้ว — ตอนนี้ย้ายไป Firestore `history/*` แล้ว, key นี้คงไว้เป็น migration fallback (อ่านครั้งเดียวตอน init, ไม่ได้เขียนใหม่) |

---

## PackScanC — Logic สำคัญ
- `items` state เก็บ: `{ sku, barcode, name, unit, need, got, location }`
- **Init `items` หักของที่แพ็คไปแล้ว:** useState initializer คำนวณ `need = catalog.qty − จำนวนที่พนักงานคนนี้แพ็คไปแล้ว` (รวมจาก `itemsByBox` ของลัง status `closed`/`exported`/`received` ที่ `packer.code` ตรงกัน) แล้ว `.filter(need > 0)` — กันสินค้าที่ลงลังครบแล้วโผล่ซ้ำหลัง remount (สลับแท็บ) / reload
  - in-session: `doClose()` หัก `need -= got` + ตัดตัวที่ `got >= need` ออก — สอดคล้องกับ initializer (catalog total − packed ทั้งหมด)
- **`barcode` field ใน item card ต้องแสดงเสมอ** — ใช้ยืนยัน barcode ก่อนสแกน ห้ามลบออกจาก card rendering
- **`c.exp` ใน item card** — แสดงบรรทัด `EXP: {exp}` (สีส้ม accent) ใต้ barcode เฉพาะเมื่อมีค่า (มาจากไฟล์ LOT+EXP ผ่าน lotMap ตอนเลือก LOT หรือกรอกผ่าน "✎ ใส่ LOT เอง" — ดู *LOT Selection*)
- **`item.barcode` อาจเป็น comma-separated หลายตัวต่อ SKU+unit** (ผลจาก `applyBarcodeMap` ที่ merge ColC + ทุก barcode ของ SKU นั้นจาก barcode map ไม่จำกัด unit — ดู *applyBarcodeMap* ด้านบน) — `matchBarcode(item, val)` (`src/data.js`) match ได้ทั้ง bare SKU หรือ barcode ตัวใดตัวหนึ่งในลิสต์ ดังนั้น `item.barcode` **ใช้ได้แค่ตอน match สแกน ไม่ใช่ค่าที่ควร export**
- **`scannedBarcode` field** — capture บาร์โค้ดตัวจริงที่พนักงานสแกน (ต่าง SKU เดียวกันอาจสแกนด้วยบาร์โค้ดต่างตัวกันได้ถ้ามีหลายตัวใน `item.barcode`) เก็บคู่กับ `got`/`lot`/`exp` บน item — resolve ใน `processBarcode` ก่อนเข้า LOT logic:
  ```js
  const scannedBarcode = catMatch.barcode.split(',').map(b => b.trim()).includes(barcode)
    ? barcode
    : (catMatch.barcode.split(',')[0]?.trim() || '');
  ```
  ส่งผ่าน `applyScan`/`pendingLot` ไปจนถึง `doClose()` (auto-survive ผ่าน spread `{ ...it, qty: it.got }` ไม่ต้องแก้ `doClose`) → ใช้แทน `item.barcode` ตอน export (ดู *Outbound — ⇩ ส่งออกไฟล์ Text* และ *⇩ ส่งออกรายการลังทั้งหมด*) ด้วย fallback `scannedBarcode || barcode || ''` กันลังเก่า/ไม่มีค่า
- **`scannedLots` field** — breakdown จำนวนจริงต่อ **(LOT + หน่วย)** บน item (ต่างจาก `item.lot`/`item.scannedUnit` ที่เป็นค่าเดียวที่โดน overwrite ทุกครั้งที่สลับ) เก็บเป็น `[{lot, qty, exp, scannedBarcode, unit}]` — สร้าง/อัพเดทใน `addLotEntry()` ที่เรียกจาก `applyScan` **ทุกครั้ง** (ไม่ gate ด้วย `lot` แล้ว — ส่ง `lot || ''` เพื่อครอบ SKU ไม่มี LOT ด้วย): key = `l.lot === lot && (l.unit||'') === (unit||'')` — ถ้า (LOT, หน่วย) นั้นมีอยู่แล้ว → `qty += 1`, ไม่งั้น push entry ใหม่ — auto-survive เข้า `doClose()`/`itemsByBox` ผ่าน spread เดียวกับ `scannedBarcode` (ไม่ต้องแก้ `doClose`) → ใช้แยกแถวตอน export เมื่อ SKU เดียวกันในลังถูกสแกน**คนละ LOT หรือคนละหน่วย** (เช่นเบิก 8 แพ็ค แต่แพ็ค 2 แพ็ค + 1 ลัง → 2 แถว ไม่ยุบเป็นหน่วยล่าสุด — ดู *Outbound — ⇩ ส่งออกไฟล์ Text*) — ลังเก่าก่อน fix นี้ไม่มี field นี้ → export fallback ไปใช้ `item.lot`/`item.qty` แถวเดียวตามเดิม. **⚠ key ด้วย lot อย่างเดียว (เดิม) ทำให้สแกนปนหน่วยยุบเป็นหน่วยล่าสุด + บาร์โค้ดผิด → ส่ง POS หักสต็อกผิด**
- Barcode lookup ใช้ `catalog` prop (ไม่ใช่ local `items`) เพื่อให้ unit validation ทำงานถูกต้อง
- **Optimistic UI:** `setItems(newItems)` เรียกก่อน `await createNewBox()` — UI อัพทันที Firestore sync ใน background
- `handleBarcode`: validate barcode → `setItems` ทันที → `createNewBox()` ถ้าไม่มี activeBoxId (**Desktop เท่านั้น** — Android บังคับกด "เปิดลัง" ก่อนเสมอ ดู *เปิดลัง (Android)* ด้านล่าง) → `onScanProgress`
- `isClosing` state — block การสแกนระหว่าง doClose กำลัง await createNewBox
- ทุกครั้งที่สแกนสำเร็จ → เรียก `onScanProgress(boxId, newItems)` → Firestore `progress/{boxId}`
- **`doClose()`** — component-level async function (ไม่ nested ใน handleCloseBox):
  1. `setIsClosing(true)` + capture `closingBoxId = activeBoxId`
  2. บันทึก boxes (+ **`closedAt: Date.now()`** — KPI เวลาปิดลัง คู่กับ `createdAt`) + itemsByBox + clear progress
  3. **reset `items` / `page` / `search` ทันที ก่อน await** — ป้องกันสแกนซ้ำลงลังเก่า
  4. **Android: `setActiveBoxId(null)`** (ต้องกด "เปิดลัง" ใหม่ก่อนแพ็คลังถัดไป — ดู *เปิดลัง (Android)*) · **Desktop: `await createNewBox()`** เปิดลังใหม่อัตโนมัติเหมือนเดิม
  5. `setIsClosing(false)`
- **`confirmClose`** state — แทน `window.confirm`: ใช้ `createPortal(content, document.body)` render ตรงไปที่ root DOM — แสดง dialog ตรงกลางจอ ทำงานทั้ง Android และ Desktop โดยไม่ถูก stacking context ของ AndroidApp (`position: fixed; inset: 0`) บัง
  - Portal อยู่ที่ top-level ของ component (ก่อน `showHistory`) — ไม่อยู่ใน Android/Desktop branch ใดทั้งนั้น
- เมื่อปิดลัง: บันทึกเฉพาะ item ที่ `got > 0`, ลบ item ที่ `got >= need` ออกจาก checklist · **Desktop เปิดลังใหม่อัตโนมัติ / Android ต้องกด "เปิดลัง" เอง**
- **ต้องเลือกพนักงานก่อน** ถึงจะเห็นรายการสินค้า — ถ้า `packer === null` แสดง placeholder แทน PackScanC
- Toast: `'error'` สำหรับ scan ล้มเหลว, `'success'` สำหรับปิดลัง/เปิดลังใหม่สำเร็จ
  - ปิดลังสำเร็จ → `"ปิดลัง BX-xxxx แล้ว ✓"` (ไม่มีข้อความ "เปิดลังใหม่อัตโนมัติ")
- **เสียงสแกน:** `playScanSuccess()` (`src/sound.js`) เรียกทุกครั้งใน `applyScan()` ตอนสแกนสำเร็จ 1 ชิ้น (ทุกชิ้น ไม่ใช่แค่ตอนครบ) — เสียง "Success Chime" สังเคราะห์สดด้วย Web Audio API ไม่ใช้ไฟล์เสียง (เคยลองแยกเสียง "Rising Ding" เฉพาะตอนครบจำนวน แต่ผู้ใช้ให้กลับไปใช้เสียงเดียวทั้งหมด)
- **`catalogMeta` prop** — รับจาก AndroidApp → แสดงใน frame-header (Android): `เช็ค X/Y · 📋 Picklist_สาขา วันที่`
- **สแกนเกินจำนวน (over-scan) — `confirmOver` state:** ถ้าสแกนแล้ว `gotBase + factor > need` (เกิน) → `processBarcode` **หยุดก่อน** setState `confirmOver = {match, factor, scannedBarcode, scannedUnit}` → เด้ง dialog (portal) "⚠ สินค้าเกินจำนวนที่เบิก" โชว์ ต้องการ/มีแล้ว/สแกนนี้+N/เกิน N หน่วย → ปุ่ม "ยกเลิก" (ทิ้ง scan) หรือ "ยืนยัน สินค้าเกินที่เบิก" (`handleConfirmOver` → `proceedScan` ต่อ รวม LOT popup). `processBarcode` block scan ซ้อนขณะ `confirmOver !== null`. **logic กลาง `proceedScan(match, factor, scannedBarcode, scannedUnit)`** = ส่วน LOT + applyScan ที่แชร์กันระหว่าง flow ปกติ (ไม่เกิน) กับ handleConfirmOver
- **ของหมด/ของไม่พอ (Android — ปัดการ์ดซ้าย):** `ItemCard` ปัดซ้ายเกิน `SWIPE_THRESHOLD` → เด้ง dialog ยืนยัน แยก 2 กรณีตาม `hasScanned = gotBase > 0`:
  - **ยังไม่สแกน (gotBase=0 = ของหมดจริง):** แถบเผย/ปุ่ม **แดง** "🗑 ของหมด" / "ของหมด ลบรายการ" → toast `'error'` "ลบออกจากรายการแล้ว" + **เสียง `playOutOfStock()`** (2 โน้ตไล่ลง C5→F4 "ลบ/หาย")
  - **สแกนไปบ้าง (gotBase>0 = ของมีไม่พอ):** แถบเผย/ปุ่ม **ส้ม** "⚠ ของไม่พอ" / "ของไม่พอ สแกนตัวถัดไป" → toast `'warn'` "สแกนตัวถัดไป" + **เสียง `playShortSupply()`** (2 โน้ต G5 เท่ากัน "รับทราบ ไปต่อ")
  - **`handleMarkOutOfStock(sku)`** (เหมือนกันทั้ง 2 กรณี ต่างแค่ toast + เสียง): แช่ `need = gotBase` (กันถูกยกไปลังถัดไป — ดู `doClose` filter `gotBase < need`) + `dismissedSkus.add(sku)` (ซ่อนจาก checklist, item ยังอยู่ใน `items` เพื่อคงยอด `got` ที่แพ็คไปแล้ว → ยังนับใน packedItems ตอนปิดลัง)
- **กันปิดลังว่าง:** `handleCloseBox` guard แรก — ถ้า `!items.some(got > 0)` (ยังไม่มีสินค้าสแกนลงลัง เช่นเพิ่งเปิด/ยกของค้างมาแต่ยังไม่สแกน) → `playScanFail()` + toast `'error'` "⚠ ปิดลังไม่ได้ — ต้องสแกนสินค้าลงลังก่อน" แล้ว return (ไม่เข้า confirmClose/doClose)
- **ปิดลังทั้งที่ยังไม่ครบ:** `handleCloseBox` เช็ค `items.every(gotBase >= need)` — ถ้าไม่ครบ → dialog "⚠ สินค้าไม่ครบ / ปิดลังเลยไหม?" (`confirmClose`) → ยืนยัน → `doClose`
- **Android mode** (`isAndroid` = module-level const จาก `?android=1`):
  - Layout 2 rows: barcode input + ปิดลัง (row 1) / search (row 2) — ไม่ใช้ `.btn.lg` / `.input.big`; **แถวที่ 1 สลับเป็นปุ่ม "▶ เปิดลัง" เต็มความกว้างแทน เมื่อ `!activeBoxId`** (ดู *เปิดลัง (Android)* ด้านล่าง)
  - **ไม่มีปุ่ม "+ ใหม่" บน Android** — แต่ก็**ไม่ auto-open หลังปิดลังแล้วเหมือน Desktop** — ต้องกด "▶ เปิดลัง" เองทุกลัง (เปลี่ยนจากเดิมที่ auto-open — ดู *เปิดลัง (Android)*)
  - `barcodeRef` + `useEffect` (ไม่มี dependency) คืน focus กลับ barcode input หลังทุก render **ยกเว้นเมื่อ `showSearch === true`** — ป้องกัน focus ถูกดึงกลับขณะพิมพ์ค้นหา (guard `barcodeRef.current &&` กัน error ตอน input ไม่ได้ render เพราะสลับไปโชว์ปุ่ม "เปิดลัง")
  - Card: padding/font เล็กลง, ยังแสดง barcode เหมือนเดิม
  - **Sort สินค้าที่ครบ (`got >= need`) ลงท้าย list** (stable sort) — ของยังไม่ครบขึ้นบน ไม่ต้อง scroll หา

### เปิดลัง (Android) — KPI เวลาเปิด→ปิดลัง
**เป้าหมาย:** เก็บเวลาที่พนักงานเริ่มไปหาสินค้าจริง (กดปุ่ม) แทนการนับจากสแกนชิ้นแรกได้ (เดิม auto-open เวลาจะไม่รวมช่วง "เดินไปหยิบลังเปล่า+เดินไปหาสินค้า")
- **`activeBoxId === null`** (แอปเพิ่งเปิด/เพิ่งเลือกพนักงาน หรือเพิ่งปิดลังก่อนหน้า) → แถวสแกนเปลี่ยนเป็นปุ่ม **"▶ เปิดลัง"** เต็มความกว้าง (แทนที่ barcode input + 🔍 + ปิดลัง ทั้งแถว) — สแกน/ค้นหาไม่ได้จนกว่าจะกด
- **`handleOpenBox()`** → `await createNewBox()` (เหมือน Desktop's "+ เปิดลังใหม่") + toast "เปิดลังแล้ว ✓" — `createNewBox()` เดิม set `createdAt: Date.now()` อยู่แล้ว = **จุดเริ่ม KPI**
- **`processBarcode` guard บนสุด:** `if (isAndroid && !activeBoxId)` → `playScanFail()` + toast error `⚠ กด "เปิดลัง" ก่อนเริ่มสแกน` แล้ว return — กันสแกนหลุด (เช่นจากเครื่องสแกนภายนอกที่ยิงเข้ามาโดย input ไม่ได้ focus) ก่อนจะเข้า barcode matching/LOT logic ใดๆ
- **`doClose()`** — Android: `setActiveBoxId(null)` แทน `await createNewBox()` (Desktop ยังคง auto-open) → ลังถัดไปต้องกด "▶ เปิดลัง" ใหม่เสมอ; พร้อมกันนี้ set **`closedAt: Date.now()`** บน box ที่เพิ่งปิด (ทุกแพลตฟอร์ม ไม่ใช่แค่ Android) = **จุดจบ KPI**
- **`boxLabel`** (header) เปลี่ยนเป็น `'ยังไม่เปิดลัง'` แทน `'BX-????'` เมื่อ `isAndroid && !activeBoxId` (ชัดเจนกว่า placeholder เดิม)
- **`setActiveBoxId` ต้องถูกส่งเป็น prop เข้า `PackScanC`** (มีอยู่แล้วใน `screenProps` ทั้ง App.jsx desktop tab และ AndroidApp.jsx spread — แค่เพิ่มเข้า destructure ของ PackScanC)
- **`applyScan()` ยังมี auto-create fallback เดิม (`if (!activeBoxId) boxId = await createNewBox()`) ไม่ได้ลบ** — สำหรับ Android กลายเป็น dead path (เข้าไม่ถึงเพราะ `processBarcode` กันไว้ก่อนแล้ว), Desktop ยังใช้ path นี้ตามปกติ (auto-open ตอนสแกนชิ้นแรก)
- **`activeBoxId` ไม่เคย persist ข้าม reload มาตั้งแต่เดิม** (`useState(null)` ล้วน ไม่มี localStorage) — reload กลางลังจะเจอปุ่ม "เปิดลัง" ทันที (เดิม auto-open เงียบๆ ทำให้เผลอเปิดลังใหม่ซ้อน) พฤติกรรมนี้ไม่ได้แย่ลงจากการแก้ครั้งนี้ เป็น pre-existing quirk

### LOT Selection (PackScanC Android)
- รับ prop `lotMap` ผ่าน `screenProps` — มี structure `{[sku]: [{lot, qty, exp?}]}` (qty = สต็อกเริ่มต้น, exp = วันหมดอายุ ค.ศ. DD/MM/YYYY จากไฟล์ LOT+EXP — ไฟล์ R01.119 เดิมไม่มี)
- **`calcLotUsage()`**: รวมการใช้ LOT ทั้งหมด (key = `sku__lot`) จาก closed boxes (`itemsByBox` ของลัง `closed/exported/received`) + ลังปัจจุบัน (`items.got > 0`)
- **`getAvailableLots(sku)`**: filter LOT ที่ `qty − usage > 0` พร้อมคำนวณ `remaining`
- **`processBarcode` flow:**
  1. validate SKU/barcode → match item
  2. resolve `scannedBarcode` (ดู *`scannedBarcode` field* ด้านบน) — ทำก่อนเข้า LOT logic เสมอ ไม่ว่า SKU จะมี LOT หรือไม่
  3. ถ้า `allLots.length === 0` (SKU ไม่มีใน lotMap) → สแกนปกติไม่มี LOT
  4. ถ้า `availableLots.length === 0` (LOT หมดทั้งหมด) → **block scan** + toast `⚠ LOT หมดทั้งหมด สต็อกไม่พอ`
  5. ถ้า `match.lot` ยังอยู่ใน availableLots → ใช้ต่อไม่ popup
  6. Android + `>1 available` → **`playScanSuccess()` ก่อน** (เสียงยืนยันสแกนติดทันที — popup เงียบ ไม่งั้นไม่รู้ว่าสแกนสำเร็จ) → `setPendingLot({match, lots: availableLots, scannedBarcode})` → popup เด้ง → เลือก LOT แล้ว `applyScan` เล่นเสียงอีกครั้ง (สแกน+ยืนยัน = 2 ครั้ง โดยตั้งใจ)
  7. ไม่งั้น auto-pick `availableLots[0]` (ทั้ง `lot` และ `exp`)
- **`getAvailableLots(sku)` คืน `exp` ติดมาด้วย** — ทุกเส้นทางที่เลือก LOT จาก lotMap (popup / auto-pick / LOT เดิมยังใช้ได้) ส่ง exp เข้า `applyScan` → ติดไปกับ `item.exp` + `scannedLots[].exp` → Outbound/ไฟล์ Text ได้ EXP อัตโนมัติโดยพนักงานไม่ต้องกรอก
- **`applyScan(match, lot, resetLot=false, exp='', scannedBarcode='', scannedUnit='', factor=1)`**: เพิ่ม `got+1`, `gotBase+factor`, set `item.lot` (ถ้า resetLot=true จะ overwrite LOT เดิม กรณีสลับเพราะ LOT หมด), set `item.exp` เฉพาะเมื่อมี `exp` ส่งมา (จากไฟล์ LOT+EXP ผ่าน lotMap หรือกรอกเองผ่าน manual entry), set `item.scannedBarcode` เฉพาะเมื่อมีค่าส่งมา, **ถ้ามี `lot`** → เรียก `addLotEntry(it.scannedLots, lot, exp, scannedBarcode)` เพิ่ม/รวม qty ใน `item.scannedLots` ด้วย (ดู *`scannedLots` field* ด้านบน) — ทำงานทุกครั้งไม่ว่า resetLot จะเป็นค่าอะไร (ต่าง LOT ไม่ overwrite กัน ไม่เหมือน `item.lot`)
- **Popup UI** (`pendingLot` state, render ผ่าน `createPortal` → `document.body`) — 2 โหมดสลับด้วย `manualLotMode`:
  - **โหมดเลือกจาก list (default):** แสดง SKU + ชื่อสินค้า + ปุ่ม LOT แต่ละตัว (`lot` + บรรทัด `EXP {exp}` เล็กถ้ามี + `เหลือ N`) → คลิก → `handleLotSelect(lot)` → อ่าน `scannedBarcode` + หา `exp` ของ lot นั้นจาก `pendingLot.lots` → `applyScan(match, lot, true, exp, scannedBarcode, ...)` → ปิด popup, scan complete
    - ปุ่ม **"✎ ใส่ LOT เอง"** → `setManualLotMode(true)` สลับไปฟอร์มกรอกเอง
    - ปุ่ม "ยกเลิก" (ไม่นับ scan) → `closeLotPopup()`
  - **โหมดใส่ LOT เอง (`manualLotMode=true`):** ฟอร์ม LOT (text input) + **Exp ค.ศ.** 3 ช่อง DD/MM/YYYY (ทุกช่องเป็น numeric input, digit-only filter + length cap ผ่าน `.replace(/[^0-9]/g,'').slice(n)`) — **ไม่ใช้ dropdown เดือนแบบเดิม (เคยเป็น `<select>` ชื่อเดือนไทย ลบ `THAI_MONTHS` ออกไปแล้ว)**
    - **กรอกเป็น ค.ศ. ตรงกับที่พิมพ์บนสินค้าจริง** (เดิมให้กรอก พ.ศ. — เปลี่ยนเพราะพนักงานต้องแปลงเลขในหัวจากสิ่งที่เห็นบนสินค้า เสี่ยงกรอกผิด) — `item.exp`/`scannedLots[].exp` เก็บค่า ค.ศ. ดิบตามที่กรอกไว้ (ไม่แปลงตรงนี้) → แปลงเป็น พ.ศ. ตอน export แทน (ดู `toBuddhistExp()` ใน *Outbound — ⇩ ส่งออกไฟล์ Text*)
    - `handleManualLotConfirm()`: validate LOT ต้องไม่ว่าง; Exp ต้องกรอกครบทั้ง 3 ช่องหรือไม่กรอกเลย (กรอกบางช่อง → toast error) → ประกอบเป็น `DD/MM/YYYY` (zero-pad D/M ด้วย `.padStart(2,'0')`) → อ่าน `scannedBarcode` จาก `pendingLot` → `applyScan(match, lot, true, exp, scannedBarcode)`
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

**สร้าง sprite avatar ใหม่ให้พนักงาน → ดู skill `packer-avatar-pixellab`** (PixelLab.ai workflow, file structure, PACKER_SPRITE_DIRS/SPRITE_SIZE constants)

## Outbound (BoxClosedLabel) — Logic สำคัญ
- Tab label: **Outbound** (เดิม: Box & Label) — screen-label "รายการส่งสินค้า", frame title: **"เลขที่ลัง"**
- Global search ข้ามทุก closed box (frame-header) → แผงขวาแสดงตารางผล (maxHeight 450, sticky header)
- **Frame กว้างพิเศษ:** App.jsx ใส่ class `canvas-wide` บน `.canvas` เฉพาะ tab `closed` (`!showAll && tab === 'closed'`) → `max-width: 1920px` (ปกติ `.canvas` cap `1600px`) — ให้ตาราง "รายชื่อสินค้าในลัง" หลายคอลัมน์มีที่พอ; หน้าอื่นไม่กระทบ
  - **⚠ คอลัมน์ชื่อสินค้าตัดบรรทัด (`maxWidth: 200` + `whiteSpace: normal` + `wordBreak`) ไม่ใช่ `nowrap` แล้ว** — เดิม nowrap ทำให้ชื่อยาว (เช่น "Glucerna SR/Gold (Triple Care)...") ดัน track `1fr` กว้างเกินจน**คอลัมน์สติกเกอร์ 380px หลุดขอบขวา** → แก้ด้วย `minWidth: 0` บน div คอลัมน์ซ้าย (ให้ `1fr` หดได้) + จำกัดชื่อ 200px ตัดบรรทัด
- **Layout:** grid `440px 1fr`
  - ซ้าย (440px) = การ์ดลัง **grid 3 คอลัมน์** เรียงตาม id น้อย→มาก + **ปุ่ม filter 2 แถว**:
    - สถานะ (`outboundFilter`): ทั้งหมด / รออนุมัติ (`status closed`) / อนุมัติแล้ว (`exported`/`received`) / **🔴 แจ้งปัญหา** (`problemReviewed && !problemResolved`)
    - พนักงานแพ็ค (`packerFilter`): ทุกคน + รายชื่อ packer ที่มีลังจริง (derive จาก closedBoxes)
    - 2 filter ทำงานร่วมกัน → `packerBoxes` (กรอง packer) → count สถานะ → `visibleBoxes`
    - **ปุ่ม "🔴 แจ้งปัญหา"** ใช้สีแดง (`var(--red)`) แทนส้ม + ตัวอักษรแดงเมื่อ inactive และ N > 0 (เรียกความสนใจหัวหน้า)
  - ขวา (detail, grid `1fr 380px`):
    - คอลัมน์ซ้าย: **"รายชื่อสินค้าในลัง"** ตาราง SKU / ชื่อ / **Barcode** / หน่วย / จำนวน / **LOT** / **Exp** / Location (maxHeight 320) — **แตกแถวตาม LOT จริง** ผ่าน helper กลาง `lotRows(l, lotMap)` ที่ใช้ร่วมกับไฟล์ Text (`handleExportBarcode`) → ข้อมูล barcode/LOT/qty ในตารางตรงกับที่จะ export เป๊ะ (SKU เดียวสแกนคนละ LOT = หลายแถว); คอลัมน์ **Exp โชว์เฉพาะเมื่อมีลังที่กรอก exp** (`hasExp`) — แสดงเป็น **ค.ศ. ดิบตามที่พนักงานกรอก** (ไม่แปลง พ.ศ. ต่างจากไฟล์ Text ที่แปลงผ่าน `toBuddhistExp`)
      - **แก้ไขตาราง (`editMode` — ปุ่ม "✎ แก้ไข" / "✓ อนุมัติ" / "✕ ยกเลิก"):** เฉพาะลัง `closed`/`exported` — คลิก "✎ แก้ไข" → `startEdit()` copy boxItems เข้า `editItems` → ตารางเปลี่ยนเป็น input แก้ **จำนวน (number) / LOT / Exp** ต่อแถว + ปุ่ม `×` ลบแถว. **"✓ อนุมัติ" (`handleSaveEdit`)** = filter qty>0, `setItemsByBox`, อัปเดต box `totalQty`/`skuCount`, **set `scannedLots: null` ทุก item** (เพื่อให้ view mode อ่าน qty/lot/exp จาก field ที่แก้ไข ไม่ใช่ `scannedLots` เก่า — เคยเป็นบั๊ก qty ไม่อัปเดต). ไม่แตะ flow อนุมัติเอกสาร (Text→เลขเอกสาร→exported)
      - **สแกน barcode ในตาราง (edit mode):** (1) **column Barcode ต่อแถว** — สแกน/พิมพ์ + Enter → `lookupUnitByBarcode(barcodeMap, sku, barcode)` เปลี่ยน**หน่วย**ของแถวนั้นอัตโนมัติ (2) **input "🔍 สแกน…เพิ่มสินค้าใหม่"** เหนือตาราง — Enter → `lookupByScan(barcodeMap, catalog, val)` (match SKU ตรง หรือ barcode) → SKU มีอยู่แล้ว = qty+1, SKU ใหม่ = เพิ่มแถว (`handleAddByScan`). รับ prop `catalog` + `barcodeMap`
      - **หมายเหตุ (`boxNote`):** textarea "📝 Note บนสติกเกอร์" อยู่**คอลัมน์ขวา ใต้ตัวอย่างสติกเกอร์** (ย้ายจากใต้ตารางเดิม เพื่อให้แก้ได้ตรงจุดที่ Note โชว์) — save `box.note` ตอน `onBlur` ผ่าน `saveBoxNote()` → สติกเกอร์อัปเดตทันที (ดู Box object field `note` + `StickerLabel`)
    - คอลัมน์ขวา: **"ตัวอย่างสติกเกอร์ติดลัง"** (90×65mm) → ปุ่ม ⇩ ส่งออกไฟล์ Text → แถว [เลขที่เอกสาร input + อนุมัติเอกสาร] → 🖨 พิมพ์ใบปิดลัง
      - **ดีไซน์สติกเกอร์ = component `StickerLabel({ box })`** (module scope, ใช้ร่วมทั้ง preview บนจอ + ตัวพิมพ์จริง portal → เนื้อหาตรงกันเป๊ะ ไม่ drift) — สไตล์ "ป้ายพัสดุ FROM/TO": (1) แถวบน **เลขที่เอกสาร (`box.pos`) mono 16px — blank จนกว่าจะกรอก+กดอนุมัติเอกสาร** (`box.pos` ถูก set พร้อม `status='exported'` ตอนอนุมัติ → ก่อนหน้านั้นโชว์ว่างเปล่า; `minHeight` บนบรรทัดเลขสำรอง height กันป้ายขยับ) + วันที่ (2) กล่อง **จาก·FROM = คลังสินค้า** (+ แพ็คโดย `box.packer.name`) / **ถึง·TO = ชื่อสาขา** (กรอบหนากว่า) (3) barcode = `box.id` เต็มความกว้าง (`SketchyBarcode` มี `displayValue` → โชว์เลขลังใต้บาร์เอง) + บรรทัดล่างสุด **`หมายเหตุ: {box.note}`** (จากช่องหมายเหตุหน้า Outbound — **โชว์ตลอดแม้ไม่มีข้อความ** = โชว์ label "หมายเหตุ:" เปล่า; แทนเลขลังซ้ำที่เคยอยู่ตรงนี้)
      - **ชื่อสาขา (ผู้รับ):** `branchLabel(box.branch)` — map `BRANCH_NAMES` (`SRC`→สาขาชากค้อ, `KKL`→สาขาเก้ากิโล, `SSS`→สาขาสวนเสือศรีราชา; ไม่รู้จัก → `สาขา {code}`)
      - **วันที่บนสติกเกอร์ = วันที่กดพิมพ์ (`new Date()`)** ไม่ใช่วันอนุมัติจริง — ระบบไม่เก็บ `approvedAt` (จงใจ เพื่อไม่แตะ flow อนุมัติที่ล็อกไว้); ปกติพิมพ์วันเดียวกับอนุมัติ
- **selectedId:** useState lazy init — เลือก `activeBoxId` เฉพาะเมื่ออยู่ใน closedBoxes (กันเลือกลัง open ใหม่หลังปิดลัง) ไม่งั้น fallback `closedBoxes[0]` (ลังปิดล่าสุด)
  - **คลิกการ์ดลัง = set `selectedId` เท่านั้น ไม่แตะ `activeBoxId`** — ป้องกัน activeBoxId ของการแพ็คถูกเปลี่ยนเป็นลังที่ปิดแล้ว (เคยเป็นบั๊ก: สแกนต่อจะลงลังที่ปิดไปแล้ว)
- ปุ่ม "⇩ ส่งออกไฟล์ Text" → export `.txt` แบบ TSV ไม่มี header: `barcode\tจำนวนสินค้า\tทุนสินค้า\t\t\t\t\t\tLOT\tEXP`
  - **แยกแถวตาม LOT (`item.scannedLots`):** `handleExportBarcode` ใช้ `.flatMap` ไม่ใช่ `.map` — ถ้า SKU+unit นี้ในลังถูกสแกนมากกว่า 1 LOT (เช่น LOT แรกหมดกลางทาง ระบบให้สลับ — ดู *`scannedLots` field* ใน PackScanC) จะแตกเป็น**หลายแถว** แถวละ 1 LOT พร้อม qty ของ LOT นั้นจริง (ไม่รวมกันเป็นแถวเดียวเหมือนเดิม) — cost คอลัมน์เดียวกันทุกแถว (คำนวณจาก `sku__unit` ไม่ผัน LOT)
    - ตัวอย่าง (SKU เดียว สแกน 3 LOT คนละ 1 ชิ้น): `8850304070993\t1\t54.54\t\t\t\t\t\t106760591` / `...\t106760592` / `...\t106760595` (3 แถวแยกกัน)
  - **ลังเก่าก่อนมี `scannedLots`** (`item.scannedLots` ว่าง/ไม่มี) → fallback กลับไปแถวเดียวต่อ item เหมือนเดิม (`item.lot`/`item.qty`/`item.exp` ตรงๆ)
  - **Barcode source priority (ต่อแถว):** ถ้ามี `scannedLots` → `entry.scannedBarcode` ก่อน, ไม่งั้น fallback `item.scannedBarcode` (บาร์โค้ดตัวจริงที่สแกนลงลังนี้ — ดู *`scannedBarcode` field* ใน PackScanC) → fallback `item.barcode` (ค่าจาก catalog ซึ่งอาจเป็น comma-separated หลายตัว — ดู *applyBarcodeMap* — ใช้เฉพาะกรณีลังเก่าก่อนมี field นี้) → ว่าง
  - ทุนสินค้า = `costMap[sku__unit]` (0 ถ้ายังไม่ import cost map); active เมื่อ status `closed`/`exported`
    - **`COST_MARKUP` (module scope)** — บางสาขาส่งออกทุน × markup: `{ WRD: 1.013, ONN: 1.013 }` (key = `box.branch` uppercase = suffix `Picklist_XXX`). ลัง WRD/ONN → `Math.round(rawCost × 1.013 × 100)/100` (ปัด 2 ตำแหน่ง); สาขาอื่นไม่มี key → markup 1 (ค่าทุนเดิม byte-identical ไม่ปัด). เพิ่มสาขา/แก้อัตราที่ `COST_MARKUP` จุดเดียว — กระทบเฉพาะไฟล์ Text (คอลัมน์ทุน) ไม่แตะ costMap/หน้าอื่น
  - **LOT format:** หลัง cost มี **6 TABs** (สร้าง 5 column ว่างให้ตรงโครงสร้าง POS) แล้วตามด้วย LOT
  - **LOT source priority:** ถ้ามี `scannedLots` → `entry.lot` ของแต่ละแถว (เสมอมีค่า — set ตอน `addLotEntry`) — ลังเก่าไม่มี `scannedLots` → fallback `item.lot` (LOT ที่พนักงาน Android เลือกตอนสแกน) → fallback `lotMap[sku][0]?.lot` (LOT ตัวแรก, สำหรับลังที่ pack จาก desktop) → ว่าง
  - **EXP column:** อีก 1 TAB ถัดจาก LOT → ถ้ามี `scannedLots` → `entry.exp` ของแต่ละแถว — ลังเก่าไม่มี `scannedLots` → fallback `item.exp` → **fallback สุดท้าย: `lotMap[sku]` หา exp ของ lot เดียวกัน (`lotExp(lot)` ใน `lotRows`)** — ลังที่แพ็คก่อนมีไฟล์ LOT+EXP จะได้ EXP ย้อนหลังทันทีที่ import ไฟล์ใหม่ ถ้า lot ตรงกัน (ไม่ตรง → ว่าง)
  - **`toBuddhistExp(exp)` แปลง ค.ศ. → พ.ศ. ก่อน export เสมอ** (ทั้งแถวจาก `scannedLots` และแถว fallback) — พนักงาน Android กรอก Exp เป็น **ค.ศ.** (ตรงกับที่พิมพ์บนสินค้าจริง — ดู *LOT Selection*) แต่ไฟล์ Text ต้องส่งเป็น **พ.ศ.** ตามที่ POS ต้องการ: แยกปี (`y`) ออกจาก `DD/MM/YYYY` → ถ้า `y < 2400` ถือว่าเป็น ค.ศ. → `+543`, ถ้า `y >= 2400` ถือว่าเป็น พ.ศ. อยู่แล้ว (ลังเก่าก่อนเปลี่ยน label ที่กรอก พ.ศ. ไว้ตรงๆ) → ไม่แปลงซ้ำ — ว่างเปล่า (`''`) ผ่านเฉยๆ ไม่แปลง
  - ตัวอย่าง (มี exp, พนักงานกรอก ค.ศ. `22/06/2026` → export เป็น พ.ศ.): `8859243302790\t4\t8.49\t\t\t\t\t\t10012026\t22/06/2569`
  - ตัวอย่าง (ไม่มี exp): `8859243302790\t4\t8.49\t\t\t\t\t\t10012026\t`
  - **กันส่งซ้ำ:** กดแล้ว set `box.textExported = true` (sync Firestore) → ปุ่ม disable + เปลี่ยนเป็น "✓ ส่งออกไฟล์ Text แล้ว" ถาวร จนกว่าจะกด **Clear · เริ่มวันถัดไป** (clearBoxes ลบ box → flag หาย)
- ปุ่ม "🖨 พิมพ์ใบปิดลัง" → ล็อกจนกว่า `box.status === 'exported'` — `handlePrint()` แค่เรียก `window.print()`
  - **Print isolation (`.print-only-label`, portal):** สติกเกอร์ที่พิมพ์จริง render แยกจาก preview บนจอ — เป็น element ใหม่ที่ `createPortal` ไปที่ `document.body` ตรงๆ (sibling ของ `#root` ไม่ใช่ลูก) เนื้อหาใช้ component `StickerLabel({ box })` **ตัวเดียวกันกับ preview** (share แล้ว — ต่างแค่ wrapper: preview = 340×245px มีกรอบ, print = 90×65mm portal) จึงตรงกันเป๊ะเสมอ
  - **เหตุผลที่ต้องแยก:** เดิมใช้ trick `visibility:hidden` ซ่อนทั้งหน้า + `position:fixed` โชว์เฉพาะ label ตอนพิมพ์ — แต่ `visibility:hidden` ไม่ลบ element ออกจาก layout (ยังกินความสูงอยู่) ทำให้หน้า Outbound ที่ยาว (รายการลังซ้าย/ตาราง) ดัน print pagination ออกมาหลายสิบแผ่น และ Chrome จะ repeat element `position:fixed` ซ้ำทุกแผ่นที่ paginate ออกมา (ของเดิมเลยได้ 11 แผ่น ตัวอักษรทับกันมั่ว)
  - **วิธีแก้:** `styles.css` → `@media print { #root { display: none !important; } .print-only-label { display: flex !important; } }` — `display:none` ลบ `#root` ออกจาก layout จริง (ความสูง = 0 ไม่ paginate) ส่วน `.print-only-label` (portal, อยู่นอก `#root`) ไม่ถูกกระทบ จึงเหลือ element เดียวในหน้าพิมพ์ → ออกแผ่นเดียวพอดี
  - **`@page { size: 90mm 65mm; margin: 0; }`** กำหนดขนาดกระดาษจริงตรงกับ label sticker (เผื่อ driver/OS ไม่ได้ตั้ง default ตรงขนาดเครื่องพิมพ์ TSC TTP-244 Pro)
- **ปุ่ม "⇩ ส่งออกรายการลังทั้งหมด"** (frame-header ขวา, เดิมชื่อ "Export Excel") — export **ทุกลังที่ปิดแล้ว** เป็นไฟล์ `.xlsx` จริงผ่าน SheetJS (`aoa_to_sheet` + `book_new` + `writeFile`) — **ไม่ใช่ HTML-table trick แบบเดิมแล้ว**:
  - คอลัมน์: เลขที่ลังสินค้า / เลขที่เอกสาร / SKU / ชื่อสินค้า / Barcode / หน่วย / จำนวน / พนักงานแพ็คสินค้า / วันที่ส่งสินค้า (DD/MM/YYYY)
  - **แตกแถวตาม (LOT + หน่วย) ด้วย `lotRows(l, lotMap)`** (`.flatMap` เดียวกับตาราง/ไฟล์ Text) — SKU เดียวสแกนปนหน่วย (แพ็ค + ลัง) แยกคนละแถว; `Barcode/หน่วย/จำนวน` = `r.barcode`/`r.unit || l.unit`/`r.qty` ต่อแถว (เดิม map item-level `l.scannedBarcode`/`l.scannedUnit`/`l.qty` → ยุบเป็นหน่วยล่าสุดแถวเดียว)
  - Column width กำหนดด้วย `ws['!cols']` (array ของ `{wch}`); ไฟล์ชื่อ `all_boxes_{DD-MM-YYYY}.xlsx`; active เมื่อมี closedBoxes ≥ 1
- **อนุมัติเอกสาร:** ต้องกรอก **เลขที่เอกสาร** ก่อน → บันทึก `box.pos` + status → `exported`
- ปุ่ม 🔥 ล้าง Firestore ทั้งหมด → เรียก `clearFirestore()` จาก App.jsx
- **Tab badge:** ปุ่ม tab Outbound แสดง badge ส้มนับ `boxes.filter(b => b.status === 'closed').length` (ลังรออนุมัติเอกสาร)
- **Flow การอนุมัติลัง (บังคับลำดับ):**
  1. ⇩ ส่งออกไฟล์ Text — active เมื่อ `closed`/`exported` (กดได้ครั้งเดียวต่อลัง → set `textExported`)
  2. **ช่องเลขที่เอกสาร disable จนกว่า `textExported === true`** (placeholder "อัปโหลดไฟล์ Text ก่อน") → กรอก + กด "อนุมัติเอกสาร" (ปุ่ม active เมื่อ textExported && มีเลขเอกสาร) → status `exported`
  3. 🖨 พิมพ์ใบปิดลัง — active เฉพาะหลัง `exported`

## BoxList — Logic สำคัญ
- คอลัมน์ตาราง: Box ID / สถานะ / พนักงาน / SKU / ชิ้น / **เลขที่เอกสาร** / **เปิดลัง** / **ปิดลัง** / อัปเดต (ไม่มีปุ่ม action)
  - **เปิดลัง/ปิดลัง** = `formatTime(b.createdAt)` / `formatTime(b.closedAt)` (BoxList.jsx) — แปลง epoch ms → `HH:MM` ด้วย `toLocaleTimeString('th-TH')`, ไม่มีค่า (ลังเก่าก่อนมี `closedAt` หรือลังที่ยังไม่ปิด) → `—`. ใช้ร่วมกันทั้งตารางหลัก + `HistoryEntry` (component `BoxTable` เดียวกัน)
- Badge header นับ: กำลังแพ็ค = `open + packing`, ปิดลังแล้ว = `closed`, อนุมัติแล้ว = `exported`
- ปุ่ม Export: **"⇩ Export รายการลังทั้งหมด"** (เดิม: Export ทั้งวัน)
- **CSV format (`generateCSV` ใน App.jsx, ใช้ร่วม export ทั้งวัน + ประวัติ):** header `box_id,pos_number,packer,sku_count,total_qty,status,updated` — คอลัมน์ `packer` = `b.packer?.name`
  - **`csvCell()` escape** ทุกเซลล์ (quote ค่าที่มี `,`/`"`/newline, double-quote ตัว `"` ภายใน) กัน CSV parse ผิดแถวถ้าชื่อพนักงาน/ค่ามี comma
  - **`triggerDownload` เติม UTF-8 BOM (`﻿`)** นำหน้า content เฉพาะไฟล์ `.csv` (เช็คจาก mimeType `text/csv`) — ไม่มี BOM ทำให้ Excel (Windows) เดา encoding เป็น ANSI/Windows-874 ผิด ชื่อพนักงานภาษาไทยกลายเป็นตัวอักษรมั่ว (mojibake); ไฟล์ที่ไม่ใช่ CSV (เช่น .txt ไฟล์ POS) ไม่เติม BOM
- **ประวัติย้อนหลัง — ปุ่ม "⇩ CSV" ต่อวัน (`HistoryEntry.handleExport`, BoxList.jsx):** export **เฉพาะลังที่มีเลขที่เอกสาร** (`b.pos && b.pos !== '—'` = อนุมัติแล้ว) — ต่างจาก "Export รายการลังทั้งหมด" (ทั้งวัน) ที่ export ทุกลัง

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
  - **`role: 'pharmacist'`** = สิทธิ์พิเศษตอน recheck: **พนักงานคนไหนก็สแกนซ้ำลัง `problemType='incomplete'` ได้** (แก้ scan พลาด) แต่ถ้ารีเช็คแล้ว**ยังขาด/เกินจริง** เฉพาะ pharmacist ที่ยืนยัน→แจ้งคลังได้ (พนักงานทั่วไปส่งต่อเภสัช) — ดู section *Pharmacist Recheck Flow*
- Phase: `scan` → `verify` → `result` (3 phases) — **ใช้บน Android เท่านั้น** (Desktop เป็น approval-only ไม่เข้า phase verify/result)
- **`scanCounts`** = `{[sku]: number}` นับจำนวนชิ้นที่สแกนจริงต่อ SKU (ไม่ใช่ binary Set)
  - สแกน 1 ครั้ง = +1 ชิ้น
  - **ไม่มี upper limit** — สแกนเกิน qty ได้ (กรณีสินค้ามาเกิน) → บันทึกจำนวนจริงเสมอ
  - **⚠ ไม่คูณ factor (ตั้งใจ — ต่างจากหน้าแพ็ค):** การรับนับ "ชิ้นจริงในลัง" = จำนวนสแกน เทียบกับ `item.qty` ซึ่ง = จำนวนสแกนของคนแพ็ค (`it.got` ตอน `doClose`) → ตรงกันเสมอไม่ว่าหน่วยไหน (แพ็ค 12 กล่อง qty=12 → สาขาสแกน 12 ครั้ง). **ห้ามแปลงเป็นหน่วยฐาน** — สาขาสแกนได้แค่ของจริง (= จำนวนชิ้น) ไม่ใช่ base unit นามธรรม การคูณ factor จะทำให้เทียบผิด
  - **Blind receiving:** ไม่มีคลิกแถวเพื่อติ๊ก, ไม่มีปุ่ม "ติ๊กครบทั้งหมด" — ติ๊กได้วิธีเดียวคือยิงบาร์โค้ดเท่านั้น
- **เสียงสแกน:** `playScanSuccess()` (`src/sound.js`) เรียกใน `handleItemScan()` ทุกครั้งที่สแกนสินค้าเจอ (เหมือน PackScanC — ดู *เสียงสแกน* ใน section PackScanC ด้านบน)
- `fullyChecked(item)` = `scanCounts[sku] >= item.qty`
- `allChecked` = ทุก item ผ่าน fullyChecked
- `hasOver` = มี item ใด item หนึ่งที่ `scanCounts[sku] > item.qty` (สแกนเกิน)
- reset `scanCounts` เมื่อสแกนลังใหม่ / สแกนลังถัดไป / handleApprove / handleRecheck
- **ตารางตรวจสอบสินค้า (phase verify):** แสดงคอลัมน์ SKU / ชื่อ / หน่วย / สแกนแล้ว
  - **Android verify list (`ScannedItemRow`) เปลี่ยนสีแถบ+ตัวเลขตามสถานะครบ:** ยังไม่ครบ (`count < needed`)=**แดง** (`#fde8e8`/`#c0392b`) / ครบ (`=== needed`)=**เขียว** (`#e8f0d8`/`var(--green)`) / เกิน (`> needed`)=**เหลือง** (`#fff3cd`/`#e67e22`) — ส่ง `done={count>=needed}` + `over` (ชุดสีเดียวกับ result table [:1047-1050]). เดิมมี 2 สี (`over ? เหลือง : เขียว`) ครบ/ไม่ครบเขียวเหมือนกันแยกไม่ออก. **presentation-only** ไม่แตะ logic นับ/ยืนยัน; Desktop table + recheck panel 🧪 ไม่แตะ
  - **พนักงานสาขายังไม่เห็นจำนวนที่ควรมีในลัง (`needed`)** — เห็นแค่จำนวนที่สแกนไปแล้ว (`×count`) → semi-blind (สีบอกสถานะครบ แต่ไม่บอกว่าต้องกี่ชิ้น)
- **กันกดยืนยันรับทั้งที่สแกนไม่ครบ:** ปุ่ม "✓ ยืนยันรับสินค้า" เรียก `requestConfirm` (ไม่ใช่ `handleConfirm` ตรง) — ถ้า `!allChecked` (ยังสแกนไม่ครบทุกรายการ) → เด้ง dialog (portal) **"⚠ ยังสแกนสินค้าไม่ครบ · เหลืออีก N รายการ · ต้องการยืนยันรับเลยหรือไม่?"** → "ยกเลิก · สแกนต่อ" (`setConfirmIncomplete(false)`) หรือ "ยืนยันรับ" (`handleConfirm` ต่อ → result `fail`); ครบแล้ว → `handleConfirm` เลยไม่ถาม (over ก็ครบ = ผ่านตรง ไม่เด้ง — ดูเฉพาะ "ไม่ครบ")
- **Phase `result`** (Android — หลังกด ✓ ยืนยันรับสินค้า):
  - `verifyResult` = `'ok'` / `'over'` / `'fail'`
    - `'ok'`: allChecked && !hasOver → `handleConfirm` ตั้ง `receivePending: true` บน box → แสดงกล่อง **"✓ ส่งให้หัวหน้าอนุมัติเอกสารแล้ว"** (ไม่มีปุ่มอนุมัติบน Android — อนุมัติที่ Desktop)
    - `'over'`: allChecked && hasOver → badge **"สินค้าเกินจำนวน"** (ส้ม) + รหัสหัวหน้างาน + **🔄 รีเช็ค** (ไม่ persist)
    - `'fail'`: !allChecked → badge **"สินค้าไม่ถูกต้อง"** (แดง) + รหัสหัวหน้างาน + **🔄 รีเช็ค** (ไม่ persist)
  - ตาราง result: `count > needed` → row สีเหลือง + วงกลม `!` สีส้ม + แสดง `count +N` (ส่วนเกิน)
- **Desktop layout (approval-only):**
  - แผงซ้าย: `approvalBoxes` = boxes ที่ `receivePending`/`problemReported` หรืออยู่ใน `receiveBoxIds` — **grid 2 คอลัมน์** (`repeat(2,1fr)`, คอลัมน์ซ้าย 420px); sortRank: problem(0) > pending(1) > อื่น(2)
  - badge header: chip "N รออนุมัติ" (`pendingCount`) + chip แดง "🔴 N แจ้งปัญหา" (`problemCount`) — เคารพตัวกรองพนักงาน
  - แผงขวา: คลิก card → `isViewingOther` → ตารางรายการสินค้า read-only (เลขที่ลัง / SKU / ชื่อ / หน่วย / จำนวน) + **ปุ่ม action ท้ายตาราง** (pending→"✓ อนุมัติเอกสาร" ส้ม / problemFixed→"✓ แก้ไขแล้ว/อนุมัติเอกสาร" เขียว → `handleApprove(viewingId)`); ไม่คลิก → placeholder
  - **BoxCard (ดีไซน์ "Sketchy Paper" — status-only, ไม่มีปุ่มบนการ์ด):** พื้นครีม `#fffdf8` + กรอบ `2px solid var(--line)` radius 12 + **เงา offset/press mechanic มาจาก class `.box-card` (styles.css: เงา 4px 4px 0, hover ลอย, `.is-selected` จม) — ห้ามใส่ `boxShadow` inline จะทับกลไกกด** + **chip สถานะเอียง `rotate(-1.5deg)`** (กรอบ 2px สีตามสถานะ พื้นขาว) + field labels "เลขที่เอกสาร / เลขที่ลัง / แพ็คโดย / ตรวจสอบโดย" (**ไม่มี chips SKU/ชิ้นแล้ว** — เอาออกให้การ์ดโปร่ง; ดูจำนวนได้จากตาราง detail แผงขวา). **ปุ่ม action (อนุมัติ/ตรวจสอบ/รีเช็ค) ย้ายไปแผงขวาทั้งหมด** — คลิกการ์ด = เปิด detail: hasProblem→หน้าตรวจสอบ/รีเช็ค (มี "📦 แจ้งคลังสินค้า"), อื่น→read-only + ปุ่มอนุมัติ. `isViewing` = `brightness(0.96)`, inactive ธรรมดา = `opacity 0.65` (แกลเลอรีดีไซน์: `card-styles.html` — เลือกแบบ 9)
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
- **`scannedBoxId`** (local state ต่อเครื่อง) = ลังที่ "เครื่องนี้" กำลังตรวจ — `foundBox = boxes.find(b => b.id === scannedBoxId)`; set ตอน `startReceive`, เคลียร์ตอน `handleScanNext`/`handleReportProblem`/`handleApprove` (กลับ phase 'scan'). **⚠ เดิม `foundBox` ดึงจาก `receiveBoxIds[last]` ซึ่ง sync ข้ามเครื่องผ่าน Firestore → 2 เครื่องสแกนคนละลัง จอเด้งเห็นลังเดียวกัน (ตัวที่ sync ล่าสุดชนะ) เสี่ยงกดยืนยันรับผิดลัง** — `receiveBoxIds` ยังคงไว้ใช้กับรายการอนุมัติ Desktop/`sortRank` เหมือนเดิม (แค่ไม่ใช้ derive ลังที่ verify แล้ว). Desktop = approval-only ไม่เข้า verify → `scannedBoxId` คง null, ไม่กระทบ
- **กันสแกนลังซ้ำ (Android, `handleScan`):** บล็อก + toast แดง ไม่เข้า verify ถ้าลังอยู่ในสถานะที่จัดการแล้ว — `status === 'received'` / `receivePending` / `problemReported && !problemResolved`
- **ล็อกลัง (`receivingBy`):** ตอน `startReceive` set `box.receivingBy = branchStaff` (sync Firestore) + ปลดล็อกลังเก่าของตัวเอง (ถือทีละลัง) — พนักงานอื่นสแกนลังนี้ → บล็อก "⚠ พนักงาน {ชื่อ} กำลังตรวจลังนี้อยู่" (เจ้าของล็อกสแกนซ้ำได้)
  - **ไม่มี timeout** — ปลดล็อกเฉพาะเมื่อ: ยืนยันรับ (`handleConfirm` ผล ok) / แจ้งปัญหา (`handleReportProblem`) / ไปลังถัดไป (`handleScanNext`)
  - กรณีปิดแอปกลางคัน → ล็อกค้าง (เจ้าของสแกนใหม่ได้, clearBoxes ล้างได้)
- **`handleScanNext`** (ปุ่ม "+ รับลังถัดไป" / Android "+ ลังถัดไป"): reset ทุก state รวมถึง `verifyResult`, `supervisorCode` → `phase = 'scan'`
- **ไม่มีปุ่ม "ข้ามลัง" แล้ว** (ลบ `handleSkip` ออก — ซ้ำซ้อนกับ "ลังถัดไป" + toast เดิม "แจ้งปัญหาแล้ว" ทำให้สับสน); การแจ้งปัญหาจริงใช้ `handleReportProblem` เท่านั้น
- **`pendingApprovalBoxId`** (App.jsx state) — local-only, ใช้ track result phase บน Android เท่านั้น (ไม่ sync ข้ามเครื่อง — การข้ามเครื่องใช้ `box.receivePending` แทน)
- **BoxCard `isPendingApproval`**: `box.receivePending` — chip สถานะ "📥 รออนุมัติเอกสาร" (สีส้ม) + การ์ดจม (`.is-selected`); **ปุ่มอนุมัติอยู่แผงขวา ไม่ใช่บนการ์ด** (คลิกการ์ด → detail → "✓ อนุมัติเอกสาร" → `handleApprove(viewingId)`)
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
   → **2 ปุ่มแยก (แก้ไข ↔ อนุมัติ):**
     - **"✎ แก้ไขรายการสินค้า"** (ส้ม) → `setProblemEditing(true)` + `startEdit()` → **เด้งไปตาราง "รายชื่อสินค้าในลัง" แบบ edit mode เต็ม** (แก้ qty/LOT/Exp, เพิ่ม/ลบแถว, สแกนเพิ่ม) โดย**ยังไม่ resolve** — `problemEditing` gate หน้าปัญหา (`&& !problemEditing`) ให้ตกไป view ปกติ; กด "✓ บันทึกการแก้ไข" (handleSaveEdit) หรือ "✕ ยกเลิก" → `setProblemEditing(false)` กลับหน้าปัญหา (ยังไม่ resolve)
     - **"✓ อนุมัติ"** (เขียว) → `resolveProblem` → `problemResolved=true` + recompute skuCount/totalQty (ไม่ต้องผ่าน flow Text/เลขเอกสาร/พิมพ์)
   - **เหตุผล:** เดิมปุ่มเดียว "✓ แก้ไข/อนุมัติ" ทำทั้งแก้+อนุมัติพร้อมกัน (แก้ได้แค่ +/- ในหน้าปัญหา) → แยกเป็นแก้ในตารางเต็มก่อน แล้วค่อยอนุมัติ เพื่อแก้สินค้าจริงได้ครบ (LOT/Exp/เพิ่ม-ลบ)
4. **กลับ Desktop รับสินค้า:** card → "✓ แก้ไขปัญหาแล้ว · รออนุมัติ" + ปุ่มเขียว **"✓ แก้ไขแล้ว/อนุมัติเอกสาร"** (กดได้ → `handleApprove` → status `received`) → จากนั้น card เป็น "เภสัชอนุมัติเอกสารแล้ว ✓"
   - `problemFixed = problemReported && problemResolved && status !== 'received'` (priority ปุ่ม/label: hasProblem > pending > problemFixed > received)
- **Tab badge:** receive รวม `problemReported && !problemResolved`, Outbound (closed) รวม `problemReviewed && !problemResolved`; header รับสินค้ามี chip "🔴 N แจ้งปัญหา"
- **status chip priority ใน BoxCard:** hasProblem > pending > problemFixed > received (ไม่มีปุ่มบนการ์ดแล้ว — action ทั้งหมดอยู่แผงขวา)

## Pharmacist Recheck Flow (Android) — เภสัชสแกนซ้ำลังที่แจ้งปัญหา

**Permission (อัปเดต):** **พนักงานสาขาคนไหนก็ recheck ลัง `problemType='incomplete'` ได้** (สแกนใหม่แก้ scan พลาดของตัวเอง โดยไม่ต้องรอเภสัช) — เดิมจำกัดเฉพาะ `role: 'pharmacist'`. ลัง **`damaged`** (มีรูป/ปัญหาจริง) ยังบล็อก staff ทั่วไป (`⚠ แจ้งปัญหาแล้ว · รอเภสัชตรวจสอบ`). **ความต่าง pharmacist ↔ พนักงานทั่วไป ย้ายไปอยู่ที่ `handleConfirm` ตอน recheck แล้วยังไม่ตรง** (ดู 4-way ด้านล่าง) — สแกนพลาดใครแก้ก็ได้ แต่ **ของขาด/เกินจริงต้องเภสัชยืนยัน**

### State + Derived
- **`recheckMode`** (useState): true เมื่อ**พนักงานคนไหนก็ได้**สแกนซ้ำลัง `problemType='incomplete'` → reset เป็น false ใน `handleScanNext` / `handleApprove` / `handleRecheck`
- **`verifyItems`** (derived): filter boxItems ให้เหลือเฉพาะ SKU ที่ `problemScanCounts[sku] < qty` (เฉพาะที่ไม่ครบในรอบแรก) — `allChecked` / `doneCount` / `scannedSkuCount` ใช้ `verifyItems` แทน `boxItems` ใน recheck mode
- **`getDeficit(item)`** (derived — สำคัญ): ใน recheck mode เภสัชต้องสแกน**เฉพาะส่วนที่ขาด** (`needed − problemScanCounts[sku]`) ไม่ใช่ qty เต็ม เช่น เบิก 10 รอบแรกได้ 7 → deficit=3 → เภสัชสแกน 3 ก็ครบ. `fullyChecked` = `scanCounts[sku] >= getDeficit(item)`, `hasOver` (handleConfirm) เทียบกับ `getDeficit` ด้วย. normal mode: `getDeficit = needed` (พฤติกรรมเดิม)

### Flow
- **⚠ ลำดับ guard ใน `handleScan` (สำคัญ):** เช็ค `problemReported && !problemResolved` (→ pharmacist recheck / block คนอื่น) **ก่อน** `receivePending` — กัน edge case ที่ลังมีทั้ง `receivePending` และ `problemReported` พร้อมกัน (Firestore race) แล้วเภสัชโดนบล็อกที่ receivePending ก่อนถึง pharmacist exception
1. **handleScan:** เจอลัง `problemReported && !problemResolved && problemType='incomplete'` (**ไม่เช็ค `role` แล้ว** — พนักงานคนไหนก็ได้; เดิมต้อง `role === 'pharmacist'`) → `setRecheckMode(true)` + `startReceive(box)` + toast `🔁 รีเช็คลัง {id}` (success). `damaged` ยังตกไปบล็อก `รอเภสัชตรวจสอบ`
2. **handleItemScan:** ใน recheck mode ถ้าสแกน SKU ที่ `problemScanCounts[sku] >= needed` (ครบในรอบแรก) → reject + `scanError = "SKU นี้สแกนครบแล้วในรอบแรก"` (กันสแกนนอก verifyItems)
   - **Android แสดงรายการของที่ต้องรีเช็คก่อนสแกน:** panel "🧪 สินค้าที่ต้องรีเช็ค ({doneCount}/{verifyItems.length} SKU)" — แต่ละแถวโชว์ชื่อ/SKU + `{scanCounts}/{getDeficit} {unit}` (สแกนแล้ว/ต้องสแกน) เขียวเมื่อครบ — กันเภสัชไม่รู้ว่าตัวไหนขาดเท่าไหร่
3. **handleConfirm branch (recheck × role) — 4 ทาง:**
   - **recheck + ok (พนักงานคนไหนก็ได้):** `problemResolved=true`, `problemResolvedBy/At`, `receivePending=true` → รออนุมัติเอกสาร (= แก้ scan พลาดสำเร็จ ไม่ต้องรอเภสัช)
   - **recheck + fail/over + `role==='pharmacist'`:** keep `problemReported=true`, **`problemReviewed=true`** (auto — Outbound badge ขึ้นทันที), `problemNote = auto-generated` ลิสต์ SKU ที่ขาด/เกินพร้อมชื่อ + จำนวน, `problemConfirmedBy/At=pharmacist`, merge `problemScanCounts` รอบใหม่; toast `⚠ เภสัชยืนยันสินค้า{kindLabel} · แจ้งคลังสินค้าแล้ว` (error)
     - **`kindLabel` = ขาด / เกิน / ขาด/เกิน** (คำนวณจาก `shortList`: `diff = need − got`, บวก=ขาด ลบ=เกิน) — ใช้ทั้งหัวข้อ note + toast; **เดิม hardcode "ขาด" ตายตัว → กรณีสินค้าเกินแจ้งผิดเป็น "ขาด"** (bug fixed)
   - **recheck + fail/over + พนักงานทั่วไป (ใหม่):** = ของขาด/เกิน**จริง** (สแกนใหม่แล้วยังไม่ตรง ไม่ใช่ scan พลาด) → คงเป็น problem `problemReported=true` · **ไม่ set `problemReviewed`/`problemConfirmedBy`** (ไม่ยืนยันแทนเภสัช) · merge `problemScanCounts` รอบล่าสุด; toast `รีเช็คแล้วยังไม่ตรง · รอเภสัชตรวจสอบ` — ส่งต่อเภสัช (ด่านตรวจของขาด/เกินยังอยู่)
   - **ยืนยันครั้งแรก (ไม่ recheck) + fail/over:** flow เดิม — `problemReported=true` รอรีเช็ค (ไม่ trigger `problemReviewed`)

### Auto-generated `problemNote` format
```
🧪 เภสัชยืนยันสินค้า{kindLabel}:      ← kindLabel = ขาด / เกิน / ขาด/เกิน (ตามรายการจริง)
• {SKU1} {name1} ขาด {N} ชิ้น
• {SKU2} {name2} ขาด {M} ชิ้น
• {SKU3} {name3} เกิน {K} ชิ้น    ← กรณีเกิน (over)
```

### ผลกระทบกับ Desktop view (`saveProblemNote`)
- Desktop ที่หัวหน้าพิมพ์ note + กด `📦 แจ้งคลังสินค้า` **ยังใช้งานได้เหมือนเดิม** — เก็บไว้สำหรับ damaged box (มีรูป) หรือ incomplete ที่ไม่ได้ผ่าน pharmacist recheck
- ถ้า pharmacist recheck-fail ก่อน → Outbound badge ขึ้นทันที + note auto-fill — หัวหน้า Desktop อาจไม่ต้องทำซ้ำ
- Desktop "🔁 รีเช็คสินค้า" view **เก็บไว้ดูประวัติ/ให้หัวหน้ารู้ว่าตัวไหนขาด** ไม่ใช่หน้าสแกน
  - หัวข้อตาราง **"รายการสินค้าที่ต้องรีเช็ค"** + `{N} SKU` + subtitle "สินค้าที่สแกนไม่ตรงจำนวน (ขาด หรือ เกิน) — เภสัชต้องรีเช็คตามรายการนี้"
  - **กรองเฉพาะ SKU ที่ `problemScanCounts[sku] !== needed`** (ทั้งขาดและเกิน — เดิมกรองแค่ `< needed` ทำให้กรณีสแกนเกินทุกตัวตารางว่าง)
  - คอลัมน์: SKU/ชื่อ / หน่วย / **ต้องมี** / **รอบแรกได้** / **ผลต่าง** (ขาด = `−N` ส้ม พื้นส้มอ่อน / เกิน = `+N` น้ำตาลทอง พื้นเหลืองอ่อน)
  - useEffect ที่ sync `problemNote` textarea — dep ต้องมี `viewingBox?.problemNote` ไม่งั้น Firestore update จากเภสัช Android จะไม่ refresh ในหน้า Desktop จนกว่า user จะคลิกลังอื่นแล้วกลับมา (เคยเป็นบั๊ก)
  - useEffect ที่ sync `problemNote` textarea — dep ต้องมี `viewingBox?.problemNote` ไม่งั้น Firestore update จากเภสัช Android จะไม่ refresh ในหน้า Desktop จนกว่า user จะคลิกลังอื่นแล้วกลับมา (เคยเป็นบั๊ก)

### Verify phase UI (ทั้ง Android และ Desktop)
- **Title:** "ตรวจสอบสินค้าในลัง" + **`box.id` แสดงข้างกัน** (mono สีส้ม) — เห็นเลขลังตลอดเวลา
- **ไม่มี panel "สแกนแล้ว N ชิ้น"** — ลบออกแล้ว ลด clutter (ตารางรายการสินค้าด้านล่างแสดงรายละเอียดเต็มอยู่แล้ว)
- **สแกนสินค้าที่ไม่อยู่ในลัง:** showToast `⚠ ไม่มี SKU นี้ในลัง` (สีแดง) + inline `scanError` ใต้ input — โดดเด่นทั้งสองแบบ

## Toast Types
`showToast(message, type?)` รองรับ 4 type — นิยามสีใน `Toast.jsx`:

| type | สี | ใช้เมื่อ |
|---|---|---|
| `'default'` (ค่า default) | พื้นดำ / ตัวขาว | แจ้งทั่วไป |
| `'error'` | พื้นแดง | validation fail, ข้อผิดพลาด, scan ไม่พบ |
| `'success'` | พื้นเขียว | บันทึกสำเร็จ, อนุมัติแล้ว, ปิดลังสำเร็จ |
| `'warn'` | พื้นส้ม `#e67e22` | เตือนแบบไม่ใช่ error เช่น "สแกนตัวถัดไป" ตอนของไม่พอ (PackScanC) |

```js
showToast('บันทึกแล้ว ✓')                        // default
showToast('⚠ กรุณากรอกเลขที่เอกสาร', 'error')   // แดง
showToast('อนุมัติแล้ว ✓', 'success')            // เขียว
showToast('สแกนตัวถัดไป', 'warn')                // ส้ม
```

**Animation (Elastic Bounce) — 2 เฟสใน `showToast` (App.jsx):** โผล่ = สปริงเด้งขึ้น (`toastIn` .55s `cubic-bezier(.34,1.56,.34,1)`) → ค้าง 2s → **mark `leaving: true`** (เฟส 1) เล่นขาออกตกลง+จาง (`toastOut` .34s) → **ลบจริงที่ 2340ms** (เฟส 2, ต้องตรงกับ 340ms ของ `toastOut`). `Toast.jsx` ใส่ class `toast-anim` + `toast-leaving` (เมื่อ `t.leaving`); keyframes อยู่ `styles.css` — ขาออก override ขาเข้าด้วย **specificity** (`.toast-anim.toast-leaving` 2 คลาส ชนะ `.toast-anim` คลาสเดียว, ไม่ขึ้นกับลำดับบรรทัด) — **ห้ามลดเหลือ `.toast-leaving` เดี่ยว** จะเสมอ specificity แล้วแพ้ลำดับ. `id = Date.now() + Math.random()` กัน toast โผล่ ms เดียวกันชนกันตอน `.map` mark leaving (bug ที่ single-phase filter เดิมไม่เจอ แต่ 2 เฟสใหม่จะ mark leaving ผิดตัว)

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

**แก้ไฟล์ใน `android/` (Kotlin/Gradle/Manifest, scanner broadcast, APK build) → ดู skill `android-native`**

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

**รัน/แก้ `git_changelog_pdf.py` (สร้าง changelog.pdf จาก git log) → ดู skill `git-changelog-script`**

---

## Known Pitfalls
- **Firestore 1MB/doc ชนมาแล้ว 2 รอบที่ `config/lotMap`** — รอบแรกเก็บ unit ต่อ lot (1.39MB), รอบสองเพิ่ม exp (~1.3MB) → ตอนนี้ shard แล้ว (ดู *handleLotMapImport*) — **config doc ใหม่ที่โตตามข้อมูล ให้คิดเรื่อง shard ตั้งแต่แรก**
- **`\uf8ff` ใน query bound (App.jsx lotMap listener) ต้องเป็น escape sequence เสมอ** — เคยถูกเขียนเป็น literal char (มองไม่เห็นใน editor/grep) ทำให้แก้ไฟล์/หา string ไม่เจอ — ถ้าแตะบรรทัดนี้ให้ตรวจระดับ char code ว่าไม่มี U+F8FF แฝง
- **ไฟล์ LOT+EXP กับ R01.119 คนละ scope** — วัดจริง: LOT+EXP มี 4,981 SKU / R01.119 มี 5,168 SKU (ต่าง ~200) — ถ้า SKU ไหน LOT popup ไม่ขึ้นหลังเปลี่ยนไฟล์ ให้เช็คก่อนว่ารายงานต้นทางครอบคลุมหรือไม่ ไม่ใช่บั๊ก parser
- **exp ขัดกันใน lot เดียวกัน ~4% ของ rows ในไฟล์จริง** — ตัดสินด้วยแถว `CF_TRANDATE` ล่าสุด (ดู *ไฟล์ 4*) — อย่าใช้ first-wins เพราะข้อมูลเก่า/คีย์ผิดมักอยู่แถวแรกๆ
- **Toast exit-animation ผูก 2 ที่ที่ต้อง sync กันเอง** — เวลา 2 เฟสใน `showToast` (App.jsx: mark leaving 2000ms → ลบจริง 2340ms) ต้องเท่ากับ 2000ms + duration ของ `toastOut` (styles.css 340ms); แก้ที่ใดที่หนึ่งต้องแก้อีกที่ ไม่งั้น toast หายก่อน/ค้างหลัง animation จบ. อีกจุด: `id` ต้อง unique จริง — เดิม `Date.now()` ล้วนชนกันได้ถ้า toast โผล่ ms เดียวกัน แล้ว `.map(t => t.id === id ...)` จะ mark leaving **ผิดตัว/หลายตัว** (single-phase filter เก่าไม่โผล่บั๊กนี้) → ใช้ `Date.now() + Math.random()`
- **breakdown ต่อ SKU ต้อง key ด้วย (LOT + หน่วย) ไม่ใช่ LOT อย่างเดียว** — `addLotEntry` (PackScanC) เดิม dedup ด้วย lot อย่างเดียว → SKU เดียวสแกนปนหน่วย (แพ็ค + ลัง lot เดียวกัน) ยุบเป็น entry เดียว หน่วย/บาร์โค้ดกลายเป็นตัวล่าสุด qty รวมกัน → ตาราง/ไฟล์ Text/Excel แสดงหน่วยเดียว **ส่ง POS หักสต็อกผิด** (บาร์โค้ดผิด+จำนวนผิด). แก้: key `(lot, unit)` + สร้าง `scannedLots` เสมอ (ครอบ SKU ไม่มี LOT). `item.gotBase`/`item.qty` คิดถูกอยู่แล้ว — ที่หายคือ breakdown หน่วยตอน export
- **อย่าใช้ state ที่ sync ข้ามเครื่อง (Firestore) มา derive "สิ่งที่เครื่องนี้กำลังทำ"** — BranchReceive เดิม `foundBox = boxes.find(id === receiveBoxIds[last])` แต่ `receiveBoxIds` sync ผ่าน `config/receive` ทุกเครื่องเห็นก้อนเดียว → 2 พนักงาน 2 เครื่องสแกนคนละลัง จอเด้งเห็นลังเดียวกัน (ตัว sync ล่าสุดชนะ) **เสี่ยงกดยืนยันรับผิดลัง**. แก้ด้วย local state ต่อเครื่อง (`scannedBoxId`) ตั้งตอนเครื่องนี้สแกนเอง — "ลังที่เครื่องนี้กำลังตรวจ" ต้องเป็น local เสมอ ไม่ใช่ค่าที่ broadcast ให้ทุกเครื่อง

## Notes
- ไฟล์ที่ไม่ได้ใช้แล้ว: `PackScanA.jsx`, `PackScanB.jsx`, `ExportPOS.jsx`, `LookupByBoxBarcode.jsx`, `FlowDiagram.jsx`, `TweaksPanel.jsx`, `Annotation.jsx` — ยังอยู่ในโปรเจกต์แต่ไม่ได้ import
- Accent color ตรึงเป็น orange (`#e8692b` / `#f5c9a8`) ใน App.jsx โดยตรง — ไม่มี TweaksPanel หรือ DEFAULT_TWEAKS แล้ว
- `data.js` ยังมี mock data ที่ไม่ได้ใช้ — ควรลบออก
- ไม่มี TypeScript, ไม่มี test suite
- PDA support: **แนะนำ Broadcast Mode** (`com.kte.scan.result`) — ไม่มีปัญหา barcode ต่อกัน ไม่ต้องพึ่ง HID keyboard
- Firestore Security Rules: `request.auth != null` — Firebase Anonymous Auth enabled (ไม่มีวันหมดอายุ)
