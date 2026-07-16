# Anin WMS — CLAUDE.md

# Role
คุณคือ Full Stack Developer มีประสบการณ์เขียนโปรแกรมเกี่ยวกับคลังสินค้ามากว่า 30 ปี ผ่านการใช้งานมาทุกระบบ ไม่ว่าจะระบบเล็กหรือใหญ่ ให้คำแนะนำจากประสบการณ์ที่ผ่านมา

**กฎสำคัญ:** เมื่อเพิ่มฟีเจอร์หรือแก้ไขโค้ด ต้องตรวจสอบให้ครอบคลุมกับโค้ดปัจจุบันทั้งหมด — ไม่ใช่แค่ไฟล์ที่แก้ไข แต่รวมถึง state, props, Firestore collections, และ screen ที่เกี่ยวข้องด้วย

**🔒 กฎ Flow หลัก (สถานะ: พอใจแล้ว — ห้ามแก้โดยไม่แจ้ง):**
Flow **สแกนลงลัง (PackScanC) → ส่งออก/อนุมัติเอกสาร (BoxClosedLabel/Outbound) → รับสินค้าเข้าสาขา (BranchReceive)** ถือว่าเสถียรและใช้งานจริงแล้ว
- **ถ้าการแก้ไขใด ๆ จะกระทบ flow นี้** (เช่น `createNewBox`, `doClose`, box status flow, `handleScanProgress`, `receivePending`/`problemReported`/`textExported`, การยืนยันรับ/อนุมัติ) → **ต้องแจ้งผู้ใช้ก่อนเสมอ** อธิบายผลกระทบ แล้วรอยืนยันก่อนลงมือ
- งาน UI/คอสเมติก หรือฟีเจอร์เสริม (เช่น Dashboard ตัวการ์ตูน) ที่ **ไม่แตะ** logic flow → แก้ได้ตามปกติ

## 📚 รายละเอียดราย screen อยู่ใน skill (โหลดเมื่อต้องใช้)
ไฟล์นี้เก็บเฉพาะ **ภาพรวม + กฎที่ต้องรู้ตลอด** (Architecture, state, Firestore, Box Status Flow,
Known Pitfalls) ส่วนรายละเอียดเชิงลึกของแต่ละหน้าแยกเป็น skill เพื่อลด context ที่โหลดทุก session
— **ก่อนแก้ไฟล์ในตาราง ให้เปิด skill ที่คู่กันอ่านก่อนเสมอ**

| แก้ไฟล์นี้ | อ่าน skill |
|---|---|
| `screens/PackScanC.jsx` | `wms-packscan` |
| `screens/BoxClosedLabel.jsx` | `wms-outbound` |
| `screens/BranchReceive.jsx` | `wms-receive` |
| `components/Import*.jsx` + ฟอร์แมตไฟล์ import | `wms-import` |
| `screens/PackerDashboard.jsx` | `wms-dashboard` |
| `android/**` (Kotlin/Gradle) | `android-native` |
| `public/characters/**` (sprite พนักงาน) | `packer-avatar-pixellab` |
| `git_changelog_pdf.py` | `git-changelog-script` |

⚠️ **กฎ Flow หลักด้านบนมีผลเสมอ ไม่ว่าจะเปิด skill หรือไม่** — 3 หน้าแรกในตารางคือหน้าที่อยู่ใน flow ที่ล็อกไว้

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
| `profile` | `{code, role, ...}\|null` | ❌ local (`localStorage['wh_profile']`) | โปรไฟล์ที่ login (WAREHOUSE/SRC/KKL/SSS) — `null` = ยังไม่ login → gate แสดง `<Login>` แทนทั้งแอป (ดู *Login โปรไฟล์รายที่ทำงาน*) |
| `boxes` | `Box[]` | ✅ `boxes/` collection | ลังทั้งหมด |
| `activeBoxId` | `string\|null` | ❌ local | ลังที่กำลังเปิดอยู่ |
| `packer` | `{code, name}\|null` | ❌ local | พนักงานที่เลือกอยู่ |
| `catalog` | `Item[]` | ✅ `config/catalog` | รายการเบิกสินค้า (จาก import) |
| `catalogByPacker` | `{[code]: Item[]}` | ✅ `config/catalogByPacker` | catalog แบ่งตามพนักงาน |
| `barcodeMap` | `{[sku__unit]: barcode[]}` | ✅ `config/barcodeMap` (array format) | map barcode จาก import |
| `costMap` | `{[sku__unit]: number}` | ✅ `config/costMap` (array format) | ราคาทุนต่อ SKU+unit จาก import |
| `factorMap` | `{[sku__unit]: number}` | ✅ `config/factorMap` (array format) | ตัวคูณหน่วยฐานต่อ SKU+unit (ColH R05.106) — โหล=12, กล่อง=1 |
| `nameMap` | `{[sku]: string}` | ✅ `config/nameMap` + `nameMap_1..N` (**sharded**) | ชื่อสินค้าต่อ SKU (ColF R05.106) — แหล่งชื่อสำรองตอนสแกนสินค้า**นอก Picklist** ที่หน้า Outbound. **⚠ desktop-only: listener ถูก gate ด้วย `isAndroidMode` → บน Android คงเป็น `{}` เสมอ** (555KB ไม่ต้องลง PDA เพราะหน้ารับสินค้าไม่ได้ใช้) |
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

Props ส่งผ่านทุก screen ด้วย `screenProps` spread pattern (App.jsx):
```js
const screenProps = { boxes, setBoxes, activeBoxId, setActiveBoxId, catalog, catalogLoaded,
  itemsByBox, setItemsByBox, history, setHistory, clearBoxes, clearFirestore, deleteBox,
  packer, setTab, showToast, createNewBox, generateCSV, triggerDownload, receiveBoxIds,
  setReceiveBoxIds, costMap, lotMap, barcodeMap, factorMap, nameMap, pendingApprovalBoxId,
  setPendingApprovalBoxId };
```
(`profile`/`logout` ส่งแยกเป็น prop ของตัวเอง — ไม่ได้อยู่ใน `screenProps`, ดู *Login โปรไฟล์รายที่ทำงาน*)

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
แต่ละสาขามีพนักงานของตัวเอง; **login เลือกที่ทำงานก่อน** (ทั้ง Android + Desktop, ดู *Login โปรไฟล์รายที่ทำงาน*) → เลือกพนักงานของสาขานั้น (Android เท่านั้น — Desktop ไม่มีขั้นเลือกพนักงานแยก)
```js
// src/branches.js
export const BRANCHES = [
  { code: 'SRC', name: 'SRC', role: 'branch', staff: [ก้า, กิ๊ฟ, สุ่ย, นิคกี้, อ๊อฟ(pharmacist)] },
  { code: 'KKL', name: 'KKL', role: 'branch', staff: [แตงโม, ทราย, ออด(pharmacist)] },
  { code: 'SSS', name: 'SSS', role: 'branch', staff: [ออย, ฟ้าใส, เบส(pharmacist)] },
];
// WAREHOUSE = คลัง (ไม่อยู่ใน BRANCHES เพราะไม่มี staff รับสินค้า) — warehouse:true + role:'warehouse'
export const WAREHOUSE = { code: 'WAREHOUSE', name: 'WAREHOUSE', warehouse: true, role: 'warehouse' };
export const ALL_BRANCH_STAFF = ...  // flatten ทุกสาขา (+ branch code) — ใช้ใน Desktop staff filter
export const PROFILES = [WAREHOUSE, ...BRANCHES];       // โปรไฟล์ login ทั้งหมด (ใช้ใน Login.jsx)
export const resolveProfile = (code) => ...             // code → profile object (ใช้ resolve wh_profile ตอน init)
```
- **code สาขา = suffix ของ Picklist** (`Picklist_SRC` → `SRC`) → ตรงกับ `catalogMeta.branch` และ `box.branch`
- **`staff[].role: 'pharmacist'`** = สิทธิ์เดียวที่มีตอนนี้ในระดับพนักงาน — ตรวจใน `handleScan` (BranchReceive) ว่าให้เข้า recheck mode หรือบล็อก. แต่ละสาขามีเภสัช 1 คน (ต่างจาก `role` ระดับโปรไฟล์ `warehouse`/`branch` ที่ใช้กรอง tab/scope)
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
- **Desktop รับสินค้า scope:** `<BranchReceive branch={profile.role==='branch' ? profile.code : null} />` → สาขาเห็นเฉพาะตัวเอง (reuse `matchBranch`, ดู *กรองลังตามสาขา* ด้านล่าง), **คลัง (null) เห็นทุกสาขา**
- **⚠ ต้องตั้ง `config/auth.passwords` ใน Firebase console ก่อน deploy** ไม่งั้น login ไม่ผ่าน; ทุกคน login ใหม่หลัง deploy (ไม่มี `wh_profile` เดิม)

### กรองลังตามสาขา (Android receive + Desktop login + Outbound)
- **`box.branch`** (field บน box) — set ตอน `createNewBox` จาก `catalogMeta?.branch` (สาขาของ Picklist ที่ import ล่าสุด) → sync Firestore `boxes/{id}`
  - **⚠ write-once ไม่มีที่ไหนแก้ย้อนหลัง** — ทุก `setBoxes` ในระบบเป็น `{...b, <field อื่น>}` ที่ไม่แตะ branch. ลังที่เกิดมาเป็น `null` จะ **สาขาสแกนรับไม่ได้ตลอดไป** ต้องปิดทิ้งเปิดใหม่
  - **ได้ `null` เมื่อ:** เปิดลังก่อนอัป Picklist · หลัง `clearFirestore` · Android cold start ก่อน onSnapshot ตอบ · **ชื่อไฟล์ Picklist ไม่เข้าแพทเทิร์น** (`Picklist SRC.xlsx` เว้นวรรค / `Picklist.xlsx` / `PL_SRC.xlsx`) — ตอนนี้มี `window.confirm` เตือนตอน import แล้ว (ดู skill `wms-import`)
- BranchReceive รับ prop `branch` (Android = สาขาที่เลือก, Desktop = `profile.code` ถ้า role='branch' หรือ `null` ถ้าเป็นคลัง = เห็นทุกสาขา):
  - **`matchBranch(b)` = `!branch || b.branch === branch`** (เข้มขึ้นจากเดิม — commit "Tighten branch filtering") → กรอง `approvalBoxes` + `pendingCount`/`problemCount` + **`searchResults`** (ค้นหา SKU ข้ามลัง ก็ผูกกับสาขาแล้ว ไม่ใช่ global อีกต่อไป)
  - **`handleScan`:** block + toast แดง ถ้า `branch && box.branch !== branch` — ข้อความ `"เป็นของสาขา {box.branch || 'ไม่ระบุ'} ไม่ใช่ {branch}"`
  - **⚠ ลังไม่มี `branch` (legacy/Picklist ไม่มี suffix) → มองไม่เห็น/สแกนไม่ได้จากโปรไฟล์สาขาใดๆ อีกแล้ว** (เดิม fallback ให้ผ่านได้ทุกสาขา — ตัดออกเพราะเสี่ยงลังสาขาหนึ่งไปโผล่อีกสาขา) เห็นได้เฉพาะตอน `branch=null` (คลัง/ไม่ scope)
    - **ห้ามใส่ fallback `!b.branch ||` กลับเข้าไปโดยไม่แจ้ง** — คอมเมนต์ในโค้ดเคยค้างเก่าบอกว่า "legacy → ปล่อยผ่าน" ซึ่งขัดกับ logic (แก้แล้ว)
- **Outbound มีตัวกรองสาขาของตัวเอง** (`branchFilter` + ถัง `⚠ ไม่ระบุสาขา`) — คนละเรื่องกับ scope ของ role: tab นี้ warehouse-only ทุกคนเห็นทุกสาขาอยู่แล้ว เป็นแค่ตัวกรองบนจอ ไม่ส่ง prop จาก App.jsx. **เป็นที่เดียวที่ลัง `branch: null` โผล่ให้เห็น** → ดู skill `wms-outbound`

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
├── App.jsx                      # Root — state, routing, helpers, Firestore sync, Login gate
├── firebase.js                  # Firebase config + db export
├── branches.js                  # BRANCHES + WAREHOUSE + PROFILES + resolveProfile/getBranch (shared: AndroidApp, BranchReceive, Login)
├── units.js                     # lookupFactor, buildBarcodeIndex (ตัวคูณหน่วยฐาน/บาร์โค้ด — ใช้ฝั่งรับสินค้า)
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
│   └── SketchyBarcode.jsx       # SVG barcode renderer
│
└── screens/
    ├── Login.jsx                # หน้า Login โปรไฟล์รายที่ทำงาน (A1) — gate ก่อนเข้าแอปทั้ง Android/Desktop
    ├── PackerDashboard.jsx      # Tab: Dashboard — real-time X/Y ชิ้น + doughnut per packer
    ├── BoxList.jsx              # Tab: รายการเบิกสินค้า — ตารางลังทั้งหมด
    ├── PackScanC.jsx            # Tab: แพ็คกิ้ง — Checklist (variant เดียวที่ใช้)
    ├── BoxClosedLabel.jsx       # Tab: Outbound (รายการส่งสินค้า) — สติกเกอร์ + ค้นหาข้ามลัง + filter สถานะ/พนักงาน + แก้ไขลังมีปัญหา
    ├── BranchReceive.jsx        # Tab: รับสินค้า (สาขา) — ยืนยันรับลัง
    ├── AndroidApp.jsx           # Android-only UI — flow 2 ขั้น (เลือกพนักงาน→สแกน; "เลือกที่ทำงาน" ย้ายไป Login แล้ว) full-screen portrait
    └── LookupByBoxBarcode.jsx   # ⚠ dead branch แต่ยัง import อยู่ — ดู Notes ท้ายไฟล์ ห้ามลบไฟล์เฉยๆ build จะพัง
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

Default tab: `flow` (`wh_tab` initial) — `showAll = false`; **แต่ role ที่ login กรองว่าเห็น tab ไหนได้บ้าง** (`ROLE_TABS`, ดู *Login โปรไฟล์รายที่ทำงาน*) — role `branch` เห็นแค่ `receive` เท่านั้น จึงเด้งไป tab นั้นเสมอไม่ว่า `wh_tab` จะเป็นอะไร

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
| `config/nameMap` + `config/nameMap_1..N` | ชื่อสินค้าต่อ SKU (**sharded**) | `{ entries: [{key, name}] }` ← key = SKU only, จาก ColF R05.106 (`CF_ITEMNAME`); วัดไฟล์จริง 7,868 SKU = ~555KB (ลง doc เดียวได้ แต่ shard ตั้งแต่แรกเพราะ `config/lotMap` เคยชน 1MB มาแล้ว 2 รอบ) — `NAMEMAP_CHUNK_BUDGET` ~700KB, เพดาน `NAMEMAP_MAX_CHUNKS=5`; **listener gate ด้วย `isAndroidMode` → Android ไม่ subscribe** (ต่างจาก lotMap ที่ทุกเครื่องโหลด) |
| `config/lotMap` + `config/lotMap_1..N` | LOT + qty + exp (**sharded**) | `{ entries: [{key, lots: [{lot, qty, exp?}]}] }` ← key = SKU only; ทั้งก้อน (มี exp) ~1.3MB เกิน 1MB/doc → แบ่ง chunk ละ ~700KB (`LOTMAP_CHUNK_BUDGET`), `_meta` อยู่ chunk 0 (`lotMap`), เพดาน `LOTMAP_MAX_CHUNKS=10`; listener ใช้ query ช่วง `documentId()` ครอบทุก doc ที่ id ขึ้นต้นด้วย `lotMap` แล้วรวม entries ทุก chunk (doc เดี่ยวเดิม = chunk 0 → backward-compat อัตโนมัติ) |
| `history/{docId}` | ประวัติลังที่ clear (7 วัน) | `{ dateKey, label, clearedAt, boxes: [...] }` ← docId = `String(Date.now())` ตอน clear |
| `config/catalogByPacker` | การแบ่งรายการ | `{ assignments: {[code]: Item[]} }` |
| `config/receive` | ลังที่รับแล้ว | `{ ids: string[] }` |
| `config/boxCounter` | serial counter ต่อวัน | `{ [ddmm]: number }` ← atomic counter สำหรับ createNewBox |
| `dismissals/{autoId}` | ประวัติการปัด "ของหมด" (PackScanC) | `{ sku, name, unit, need, gotBase, kind: 'out'\|'short', packer, boxId, at }` ← **append-only ไม่มี listener** (ไม่มีใคร subscribe → ทุกเครื่องโหลดเท่าเดิม) อ่านเฉพาะตอนเรียก `__wh.audit(sku)` · `clearBoxes` **ไม่ลบ** (ร่องรอยต้องอยู่ข้ามวัน) · `clearFirestore` ลบ |
| `config/zoneAssignments` | โซนต่อพนักงาน | `{ assignments: {[code]: string[]} }` ← array ของ zone prefix เช่น `['A','B','COOL']` |
| `config/auth` | รหัสผ่าน login รายที่ทำงาน (A1) | `{ passwords: { WAREHOUSE, SRC, KKL, SSS } }` ← **ตั้งใน Firebase console เอง** · Login อ่านด้วย `getDoc` (ครั้งเดียว) เทียบ client-side · ⚠ rules เปิด = รหัสอ่านได้ฝั่ง client ไม่ใช่ security จริง |

**barcodeMap ใช้ array format** เพื่อหลีก Firestore "too many index entries" limit

### Real-time Sync Pattern
- **Write:** wrapper functions (`setBoxes`, `setItemsByBox`, etc.) → optimistic local update + Firestore write
  - **⚠ `setBoxes` เขียน "เฉพาะลังที่เปลี่ยน" เท่านั้น** (เทียบ `prevById.get(id) !== box` ก่อน `batch.set` — reference equality เพราะทุก caller ใช้ `prev.map(b => id===X ? {...b} : b)` ลังไม่เปลี่ยนคง reference; pattern เดียวกับ `setItemsByBox` ที่เช็ค `prev[boxId] !== items`) — **ห้ามกลับไปเขียนลังทุกใบทั้งชุด** (`next.forEach(batch.set)`) เด็ดขาด: เดิมทำแบบนั้นทำให้เครื่องที่ snapshot ยังไม่ sync **เขียนทับลังที่เครื่องอื่นเพิ่งปิด กลับเป็น open → ลังปิดแล้วหายจาก Outbound** (ดู Known Pitfalls). `batch.commit()` มี `.catch` → toast เตือนถ้าเขียนพลาด (ไม่เงียบ)
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

### `handleBarcodeMapImport(map, importedFactorMap, importedNameMap, meta)`
ไฟล์ R05.106 ไฟล์เดียวป้อน 3 map — ImportBarcodeMap parse แล้วส่งมาพร้อมกัน
- อัพเดท `catalog`, `catalogByPacker`, `barcodeMap` พร้อมกัน → sync `config/catalog`, `config/catalogByPacker`, `config/barcodeMap`
- `importedFactorMap` (ColH) → `config/factorMap` (doc เดียว, array format)
- `importedNameMap` (ColF) → `config/nameMap` + `nameMap_1..N` (**sharded** — chunk logic แยกของตัวเอง ไม่แตะ path ของ lotMap) แล้ว `batch.delete` chunk ที่เกินรอบนี้จนถึง `NAMEMAP_MAX_CHUNKS`
- **factorMap/nameMap เขียนเฉพาะเมื่อมีข้อมูลจริง** (`Object.keys(...).length > 0`) — ไฟล์ผิดฟอร์แมตจะได้ไม่ล้างของเดิมทิ้ง

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

**แก้ระบบ import 4 ไฟล์ (`Import*.jsx`, Picklist/R05.106/R05.105/LOT+EXP) → ดู skill `wms-import`**

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

**แก้หน้าแพ็คกิ้ง (`PackScanC.jsx`) — สแกน/ปิดลัง/LOT/หน่วยฐาน → ดู skill `wms-packscan`**

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

---

**แก้ Dashboard / WarehouseScene (`PackerDashboard.jsx`) → ดู skill `wms-dashboard`**

**แก้หน้า Outbound (`BoxClosedLabel.jsx`) — ไฟล์ Text/Excel/สติกเกอร์/อนุมัติเอกสาร → ดู skill `wms-outbound`**

## BoxList — Logic สำคัญ
- คอลัมน์ตาราง: Box ID / สถานะ / พนักงาน / SKU / ชิ้น / **เลขที่เอกสาร** / **เปิดลัง** / **ปิดลัง** / อัปเดต (ไม่มีปุ่ม action)
  - **เปิดลัง/ปิดลัง** = `formatTime(b.createdAt)` / `formatTime(b.closedAt)` (BoxList.jsx) — แปลง epoch ms → `HH:MM` ด้วย `toLocaleTimeString('th-TH')`, ไม่มีค่า (ลังเก่าก่อนมี `closedAt` หรือลังที่ยังไม่ปิด) → `—`. ใช้ร่วมกันทั้งตารางหลัก + `HistoryEntry` (component `BoxTable` เดียวกัน)
- Badge header นับ: กำลังแพ็ค = `open + packing`, ปิดลังแล้ว = `closed`, อนุมัติแล้ว = `exported`
- ปุ่ม Export: **"⇩ Export รายการลังทั้งหมด"** (เดิม: Export ทั้งวัน)
- **CSV format (`generateCSV` ใน App.jsx, ใช้ร่วม export ทั้งวัน + ประวัติ):** header `box_id,pos_number,packer,sku_count,total_qty,status,updated` — คอลัมน์ `packer` = `b.packer?.name`
  - **`csvCell()` escape** ทุกเซลล์ (quote ค่าที่มี `,`/`"`/newline, double-quote ตัว `"` ภายใน) กัน CSV parse ผิดแถวถ้าชื่อพนักงาน/ค่ามี comma
  - **`triggerDownload` เติม UTF-8 BOM (`﻿`)** นำหน้า content เฉพาะไฟล์ `.csv` (เช็คจาก mimeType `text/csv`) — ไม่มี BOM ทำให้ Excel (Windows) เดา encoding เป็น ANSI/Windows-874 ผิด ชื่อพนักงานภาษาไทยกลายเป็นตัวอักษรมั่ว (mojibake); ไฟล์ที่ไม่ใช่ CSV (เช่น .txt ไฟล์ POS) ไม่เติม BOM
- **ประวัติย้อนหลัง — ปุ่ม "⇩ CSV" ต่อวัน (`HistoryEntry.handleExport`, BoxList.jsx):** export **เฉพาะลังที่มีเลขที่เอกสาร** (`b.pos && b.pos !== '—'` = อนุมัติแล้ว) — ต่างจาก "Export รายการลังทั้งหมด" (ทั้งวัน) ที่ export ทุกลัง

---

**แก้หน้ารับสินค้า (`BranchReceive.jsx`) — สแกนรับ/อนุมัติ/แจ้งปัญหา/รีเช็คเภสัช → ดู skill `wms-receive`**

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

**AndroidApp.jsx (`src/screens/AndroidApp.jsx`):** — flow 2 ขั้นเต็มจอ (เดิม 3 ขั้น — "เลือกที่ทำงาน" ถูกแทนด้วย `<Login>` ใน App.jsx แล้ว เข้ามาถึง AndroidApp คือ login แล้วเสมอ) — **ไม่มี tab/bottom bar แล้ว** (ของเดิมเป็น 2 tabs ด้านล่าง ลบออกไปนานแล้ว)
- `const branch = profile` (prop, ไม่ใช่ local state อีกต่อไป) — location มาจากโปรไฟล์ login โดยตรง
- ขั้นเลือกพนักงาน (`!currentStaff`): full-screen picker (`position: fixed; inset: 0`), การ์ดปุ่มเลือกพนักงาน — ปุ่ม "← เปลี่ยนที่ทำงาน" → `changeBranch()` = `setPacker(null)` + `logout()` (กลับหน้า Login)
- หน้าสแกน (`currentStaff` เลือกแล้ว): header แถวเดียว (ที่ทำงาน + 👤 พนักงาน + ปุ่ม "เปลี่ยน") ต่อด้วย content เต็มพื้นที่ที่เหลือ — `isWarehouse ? <PackScanC> : <BranchReceive branch={branch.code}>`
  - PackScanC ได้ `key={packer.code}-${packCatalog.length}` — remount ทุกครั้งที่สลับพนักงานหรือ catalog เปลี่ยน (ขนาด) เพื่อ reset state ภายใน (รวม manual LOT form — ดู *LOT Selection*)
  - ส่ง `catalogMeta` prop ไปให้ PackScanC เพื่อแสดง Picklist info ใน frame-header
  - BranchReceive ได้ `branchStaff`/`setBranchStaff` (controlled mode, state อยู่ที่ AndroidApp) + `isAndroid={true}`
- `setTab={() => {}}` — ปิด navigation ที่ไม่เกี่ยว
- Props: `screenProps, profile, logout, packer, setPacker, PACKERS, catalogByPacker, onScanProgress, catalogMeta`

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

## ตรวจข้อพิพาท "จำนวนบนจอ Android ไม่ตรง Picklist" — `__wh.audit(sku)`

**อาการที่พนักงานแจ้งบ่อย: "Picklist สั่ง 4 แต่จอขึ้น 3"** — โดยปกติ **ไม่ใช่บั๊ก**
เลขบนจอคือ **"เหลือต้องแพ็คอีกเท่าไหร่"** ไม่ใช่ "Picklist สั่งเท่าไหร่":

```
need = qty(Picklist) × factor(หน่วย) − Σ ที่ "พนักงานคนนั้นเอง" แพ็คไปแล้วในลัง closed/exported/received
```
คำนวณใหม่จาก Firestore ทุกครั้งที่ mount (`buildPackItems` ใน `units.js`) — แพ็คไป 1 แล้วปิดลัง → ขึ้น 3

**วิธีตรวจ:** เปิด Desktop คลัง → console → `await __wh.audit('800038')` (async ต้อง `await`)
พิมพ์ทั้งเส้นทาง: แถวใน Picklist (เตือนถ้า SKU มีหลายแถว = `distributeCatalog` แบ่งคนละคน) ·
factor + ที่มา · **ลังที่แต่ละคนแพ็คไปแล้ว (พร้อม box id)** · เลขบนจอพร้อมบรรทัดคำนวณ `4 × 1 − 1 (BX-…) = 3` ·
ลังที่ยังไม่ปิด (ยังไม่ถูกหัก) · **ประวัติการปัด "ของหมด"**

**`audit` ใช้ `buildPackItems` ตัวเดียวกับที่ PackScanC ใช้จริง** — จึงยืนยันเลขบนจอได้ ไม่ใช่คำนวณเลียนแบบ
**ห้ามแยกสูตรเป็น 2 ชุด** ไม่งั้น audit จะโกหกทันทีที่เพี้ยนจากกัน (เดิม PackScanC เคยประกาศตัวคูณซ้ำเอง — ยุบแล้ว)

### การปัด "ของหมด" (swipe) — สิ่งที่ต้องรู้ก่อนสงสัยพนักงาน
- **การปัด "ซ่อนทั้งแถว"** (`dismissedSkus` กรองใน `visibleItems`) → **อธิบายอาการ "ขึ้น 3" ไม่ได้**
  ถ้าปัดจริงพนักงานจะ*ไม่เห็นรายการนั้นเลย* ไม่ใช่เห็นเลขน้อยลง
- **ปัดแล้วของไม่หายถาวร** — `dismissedSkus` เป็น local state (`useState(() => new Set())`) ไม่ sync ที่ไหน
  รีโหลด/สลับพนักงาน (PackScanC มี `key=` → remount) รายการกลับมาครบ **พนักงานลบความต้องการทิ้งถาวรไม่ได้**
- **แต่ทุกการปัดถูกบันทึกลง `dismissals/` แล้ว** (ใคร/เมื่อไหร่/ลังไหน/สแกนไปแล้วกี่/ของหมดหรือของไม่พอ)
  — เดิมไม่มีร่องรอยเลย เพราะ `handleScanProgress` เขียนแค่ตัวที่ `got > 0` → ปัดตอนยังไม่สแกนคือเงียบสนิท
- **⚠ การบันทึกต้องไม่มีวันขวางการปัด** — `onDismiss?.()` ใน `handleMarkOutOfStock` **ห่อ try/catch ไว้ ห้ามเอาออก**:
  ฝั่ง App.jsx กัน promise reject ด้วย `.catch` แล้ว แต่ `addDoc` **throw แบบ synchronous ได้** →
  เคยทะลุมาบล็อกการปัดจริง (เทสต์จับได้ก่อน deploy) พนักงานต้องทำงานต่อได้เสมอแม้ log เขียนไม่ผ่าน

## Known Pitfalls
- **`gotBase` คือค่าที่ "ฝั่งสาขาใช้จริง" ไม่ใช่ `qty`** — `getNeeded = gotBase ?? qty ?? got` (BranchReceive) เอา `gotBase` ก่อนเสมอ → **โค้ดไหนที่แก้จำนวนในลังแล้วไม่อัปเดต `gotBase` ด้วย = สาขายังเห็นเลขเดิม** (`handleSaveEdit` เคยเป็นแบบนี้ ทำให้ลังที่จำนวนผิดซ่อมจากหน้า Outbound ไม่ได้เลย)
  - **⚠ `qty × factor` ใช้กับแถวที่ "สแกนปนหน่วย" ไม่ได้** — `qty` = จำนวนครั้งที่สแกน**รวมทุกหน่วย** (picklist โหล: สแกน 1 โหล + 12 ชิ้น → `qty=13` แต่ `gotBase=24`) → ต้องเช็ค `scannedLots` ว่ามีหลาย `unit` ไหมก่อนคำนวณทับ
- **หน่วย picklist ที่ R05.106 ไม่รู้จัก → `lookupFactor` ตกเป็น `1` เงียบ ๆ ไม่มีอะไรเตือน** — เคสจริง SKU `700129` หน่วย `3ลัง` ควร = 30 ขวด แต่คิดเป็น 1 → **ผิด 30 เท่า** ทั้งหน้าแพ็คและฝั่งรับ (ลัง BX-1507-0042) · ตอนนี้มี `derivedPackFactor` (`N × factor(หน่วยท้าย)`) ครอบหน่วยแบบ `3ลัง`/`4กล่อง` แล้ว (ดู skill `wms-import`) **แต่หน่วยที่ไม่เข้าแพทเทิร์นยังตกเป็น 1 เงียบ ๆ เหมือนเดิม** — ถ้าเจออาการ "จำนวนผิดเป็นเท่าตัว" ให้สงสัย factor ก่อนเสมอ (`await __wh.audit('700129')` ดูข้อ 2 ว่า factor มาจากไหน)
- **ลังที่ปิดไปแล้วไม่ได้คำนวณ factor ใหม่อัตโนมัติ** — `gotBase` ถูกแช่ไว้ใน `boxItems` ตั้งแต่ `doClose` → แก้ factor แล้วลังเก่ายังผิดอยู่ ต้องเข้า Outbound → ✎ แก้ไข → ✓ อนุมัติ ทีละลังเพื่อให้คำนวณใหม่
- **Firestore 1MB/doc ชนมาแล้ว 2 รอบที่ `config/lotMap`** — รอบแรกเก็บ unit ต่อ lot (1.39MB), รอบสองเพิ่ม exp (~1.3MB) → ตอนนี้ shard แล้ว (ดู *handleLotMapImport*) — **config doc ใหม่ที่โตตามข้อมูล ให้คิดเรื่อง shard ตั้งแต่แรก**
- **`\uf8ff` ใน query bound (App.jsx lotMap listener) ต้องเป็น escape sequence เสมอ** — เคยถูกเขียนเป็น literal char (มองไม่เห็นใน editor/grep) ทำให้แก้ไฟล์/หา string ไม่เจอ — ถ้าแตะบรรทัดนี้ให้ตรวจระดับ char code ว่าไม่มี U+F8FF แฝง
- **ไฟล์ LOT+EXP กับ R01.119 คนละ scope** — วัดจริง: LOT+EXP มี 4,981 SKU / R01.119 มี 5,168 SKU (ต่าง ~200) — ถ้า SKU ไหน LOT popup ไม่ขึ้นหลังเปลี่ยนไฟล์ ให้เช็คก่อนว่ารายงานต้นทางครอบคลุมหรือไม่ ไม่ใช่บั๊ก parser
- **exp ขัดกันใน lot เดียวกัน ~4% ของ rows ในไฟล์จริง** — ตัดสินด้วยแถว `CF_TRANDATE` ล่าสุด (ดู *ไฟล์ 4*) — อย่าใช้ first-wins เพราะข้อมูลเก่า/คีย์ผิดมักอยู่แถวแรกๆ
- **Toast exit-animation ผูก 2 ที่ที่ต้อง sync กันเอง** — เวลา 2 เฟสใน `showToast` (App.jsx: mark leaving 2000ms → ลบจริง 2340ms) ต้องเท่ากับ 2000ms + duration ของ `toastOut` (styles.css 340ms); แก้ที่ใดที่หนึ่งต้องแก้อีกที่ ไม่งั้น toast หายก่อน/ค้างหลัง animation จบ. อีกจุด: `id` ต้อง unique จริง — เดิม `Date.now()` ล้วนชนกันได้ถ้า toast โผล่ ms เดียวกัน แล้ว `.map(t => t.id === id ...)` จะ mark leaving **ผิดตัว/หลายตัว** (single-phase filter เก่าไม่โผล่บั๊กนี้) → ใช้ `Date.now() + Math.random()`
- **breakdown ต่อ SKU ต้อง key ด้วย (LOT + หน่วย) ไม่ใช่ LOT อย่างเดียว** — `addLotEntry` (PackScanC) เดิม dedup ด้วย lot อย่างเดียว → SKU เดียวสแกนปนหน่วย (แพ็ค + ลัง lot เดียวกัน) ยุบเป็น entry เดียว หน่วย/บาร์โค้ดกลายเป็นตัวล่าสุด qty รวมกัน → ตาราง/ไฟล์ Text/Excel แสดงหน่วยเดียว **ส่ง POS หักสต็อกผิด** (บาร์โค้ดผิด+จำนวนผิด). แก้: key `(lot, unit)` + สร้าง `scannedLots` เสมอ (ครอบ SKU ไม่มี LOT). `item.gotBase`/`item.qty` คิดถูกอยู่แล้ว — ที่หายคือ breakdown หน่วยตอน export
- **อย่าใช้ state ที่ sync ข้ามเครื่อง (Firestore) มา derive "สิ่งที่เครื่องนี้กำลังทำ"** — BranchReceive เดิม `foundBox = boxes.find(id === receiveBoxIds[last])` แต่ `receiveBoxIds` sync ผ่าน `config/receive` ทุกเครื่องเห็นก้อนเดียว → 2 พนักงาน 2 เครื่องสแกนคนละลัง จอเด้งเห็นลังเดียวกัน (ตัว sync ล่าสุดชนะ) **เสี่ยงกดยืนยันรับผิดลัง**. แก้ด้วย local state ต่อเครื่อง (`scannedBoxId`) ตั้งตอนเครื่องนี้สแกนเอง — "ลังที่เครื่องนี้กำลังตรวจ" ต้องเป็น local เสมอ ไม่ใช่ค่าที่ broadcast ให้ทุกเครื่อง
- **`setBoxes` ห้ามเขียนลังทุกใบทั้งชุด — เขียนเฉพาะลังที่เปลี่ยน** (bug จริงที่เจอในโปรดักชัน: ลังปิดแล้วหายจาก Outbound เป็นบางใบ). เดิม `setBoxes` `batch.set` **ทุกลังในอาเรย์** จาก `boxesRef.current` (snapshot ของเครื่องนั้น) ทุกครั้งที่เรียก → พนักงานหลายคนแพ็คคนละเครื่องพร้อมกัน: เครื่อง A ปิดลัง X, อีกเสี้ยววิเครื่อง B ปิดลังตัวเอง **แต่ snapshot ของ B ยังไม่เห็นว่า X ปิดแล้ว** → batch ของ B เขียน X = `open` ทับกลับ → การปิดของ A หาย. **หลักฐานตอนเจอ:** ลังที่ `boxItems` มีของครบ + `progress` ถูกลบแล้ว (= `doClose` รันจริง) แต่ `status` ค้าง `open` (setBoxes write โดน clobber). แก้: เทียบ `prevById.get(id) !== box` เขียนเฉพาะลังที่ reference เปลี่ยน (เหมือน `setItemsByBox`) → เครื่อง B ไม่แตะลัง X ที่ไม่ได้แก้อีก. **การ debug ที่ชี้ขาด:** อย่าดูแค่ `box.totalQty` (เป็น 0 เสมอตอน open) — ดู **`progress/` collection** (สแกนค้างที่ box ยัง open) + **`boxItems/` ที่ box ยัง open** = ร่องรอย "ปิดไม่สำเร็จ"

## Notes
- **ไฟล์ตายถูกลบออกแล้ว** (15 ก.ค. 2026): `PackScanA.jsx`, `PackScanB.jsx`, `ExportPOS.jsx`, `FlowDiagram.jsx`, `TweaksPanel.jsx`, `Annotation.jsx` — ไม่มีใคร import, build ผ่านหลังลบ
- **⚠ `LookupByBoxBarcode.jsx` ยังอยู่ และยัง `import` จริงใน App.jsx** (บรรทัด 8 + JSX block `{(showAll || tab === 'lookup') && ...}`) — **ลบไฟล์เฉยๆ ไม่ได้ build จะพัง** ต้องลบ import + JSX block ด้วย
  - มันเป็น **dead branch** (render ไม่ถึง) ไม่ใช่ "ลบออกจาก routing แล้ว" อย่างที่เอกสารเดิมเขียนผิดไว้: `showAll = false` ตรึงตายตัว + `'lookup'` ไม่อยู่ใน `TABS` + useEffect เด้ง tab กลับถ้าไม่อยู่ใน `ROLE_TABS` → `tab === 'lookup'` เป็นจริงไม่ได้
  - ตัดสินใจ (ผู้ใช้): **เก็บไว้ก่อน** ไม่แตะ App.jsx
- Accent color ตรึงเป็น orange (`#e8692b` / `#f5c9a8`) ใน App.jsx โดยตรง — ไม่มี TweaksPanel หรือ DEFAULT_TWEAKS แล้ว
- `data.js` ยังมี mock data ที่ไม่ได้ใช้ — ควรลบออก
- ไม่มี TypeScript, ไม่มี test suite
- PDA support: **แนะนำ Broadcast Mode** (`com.kte.scan.result`) — ไม่มีปัญหา barcode ต่อกัน ไม่ต้องพึ่ง HID keyboard
- Firestore Security Rules: `request.auth != null` — Firebase Anonymous Auth enabled (ไม่มีวันหมดอายุ)

