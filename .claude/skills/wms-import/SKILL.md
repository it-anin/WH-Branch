---
name: wms-import
description: Use when touching import components src/components/Import*.jsx (ImportCatalog, ImportBarcodeMap, ImportCostMap, ImportLotMap) or the file formats they read — column mapping for Picklist/R05.106/R05.105/LOT+EXP, SheetJS parseWorkbook, barcode map + factorMap (CF_BASEMULTIPLE), cost map filter, LOT aggregation/exp conflict rules, import button UX/badges.
---

# Four-File Import System — Picklist / R05.106 / R05.105 / LOT+EXP

> **อ่านคู่กับ `CLAUDE.md`** — ไฟล์นี้ถูกแยกออกมาจาก CLAUDE.md เพื่อลดขนาด context
> ที่โหลดทุก session ข้อความที่อ้าง "ดู ... ด้านบน/ด้านล่าง" อาจหมายถึง section
> ที่ยังอยู่ใน CLAUDE.md (เช่น *Architecture*, *Key Functions*, *Box Status Flow*,
> *Known Pitfalls*) กฎ Flow หลักที่ห้ามแก้โดยไม่แจ้ง อยู่ใน CLAUDE.md เช่นกัน

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
| H (7) | **ตัวคูณหน่วยฐาน** (`CF_BASEMULTIPLE`) — จำนวนหน่วยฐานต่อ 1 หน่วยนี้ เช่น โหล=12, กล่อง=1 |

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
ปุ่ม 4 ปุ่มเรียงเป็น column แยกแถว **มีเลขลำดับนำหน้า `1 · ` … `4 · `** และ **บังคับลำดับ** (ดู *ลำดับอัปโหลด* ด้านล่าง):

| ปุ่ม | ก่อนอัปโหลด | หลังอัปโหลด |
|---|---|---|
| ImportCatalog | `1 · ⇑ อัปโหลดไฟล์ Picklist` (ไม่มีสี) | `1 · ✅ อัปโหลดไฟล์ Picklist_XXX แล้ว` (สีส้ม) + badge `✅ รายการเบิก: N รายการ · ไฟล์วันที่ D/M/YYYY` |
| ImportBarcodeMap | `2 · ⇑ อัปโหลดไฟล์ R05.106` (ไม่มีสี) — **รับ `.xlsx` เท่านั้น** (.csv ทำเลข 0 นำหน้าหาย) | `2 · ✅ อัปโหลดไฟล์ {filename} แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportCostMap | `3 · ⇑ อัปโหลดไฟล์ R05.105` (ไม่มีสี) | `3 · ✅ อัปโหลดไฟล์ R05.105 แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |
| ImportLotMap | `4 · ⇑ อัปโหลดไฟล์ LOT+EXP` (ไม่มีสี) | `4 · ✅ อัปโหลดไฟล์ LOT+EXP แล้ว` (สีส้ม) + badge `ไฟล์วันที่ D/M/YYYY` |

#### ลำดับอัปโหลด (บังคับ) — Picklist → R05.106 → R05.105 → LOT+EXP
- **ปุ่มที่ยังไม่ถึงคิวถูก `disabled`** + แสดง chip `🔒 อัปโหลดไฟล์ {ไฟล์ก่อนหน้า} ก่อน` แทน badge วันที่
- **props:** ทุก component (ยกเว้น ImportCatalog ที่เป็นขั้น 1 ไม่เคยล็อก) รับ `locked` + `lockedHint`; `handleFile` มี guard `if (locked) return` ซ้ำอีกชั้น กันไฟล์หลุดเข้ามาทางอื่น
- **เงื่อนไขคิว (App.jsx, ใกล้ `showAll`):** `hasCatalog = catalog.length > 0` · `hasBarcodeMap` / `hasCostMap` = `Object.keys(...).length > 0` — **เช็คจากข้อมูลจริง ไม่ใช่ `_meta`** เพราะข้อมูลเก่าที่ import ก่อนจะมี field `_meta` จะมี data ครบแต่ meta ว่าง → ถ้า gate ด้วย meta ปุ่มจะล็อกค้างทั้งที่ข้อมูลมาแล้ว
- **⚠ เหตุผลเชิงข้อมูล ไม่ใช่แค่ UX:** LOT+EXP ต้องมาหลัง R05.106 เพราะ `ImportLotMap` เอา `factorMap` ไปคูณแปลง qty เป็นหน่วยฐาน**ตั้งแต่ตอน import** — ถ้า factorMap ยังว่างจะได้ `factor=1` ทุกแถว แล้ว**สต็อกผิดทั้งก้อนแบบเงียบๆ ไม่มี error** (ดู *LOT aggregation logic* ด้านบน)
- **ครบ 4 แล้วปลดล็อกหมด** — re-import รายไฟล์ได้ตามปกติ ไม่ต้องไล่ใหม่ทั้งชุด. `clearBoxes` (เริ่มวันถัดไป) **ไม่** reset → วันรุ่งขึ้นอัปแค่ Picklist ใหม่ได้เลย; `clearFirestore` (ล้างทั้งระบบ) reset ทั้ง 3 → กลับไปล็อกเหลือขั้น 1
- **`.btn:disabled` (styles.css)** — เพิ่มพร้อมฟีเจอร์นี้ (เดิม**ไม่มี**สไตล์ disabled เลย ปุ่มที่ disable หน้าตาเหมือนปุ่มปกติ): `opacity .4` + `grayscale(.55)` + ยุบเงา. เป็น global → กระทบปุ่ม disabled อื่นที่มีอยู่เดิมด้วย (ส่งออกไฟล์ Text, แจ้งคลังสินค้า, pagination PackScanC, Login) ซึ่งล้วนได้สไตล์ที่ควรมีตั้งแต่แรก

- **XXX** ใน Picklist — parse จาก filename pattern `Picklist_XXX` (regex `picklist[_-]([A-Za-z0-9]+)`) เช่น `Picklist_SRC` → `SRC`
- **{filename}** ใน Barcode — ชื่อไฟล์ไม่มีนามสกุล เช่น `R05.106`
- วันที่ใน badge ทุกปุ่มมาจาก **`new Date()` ตอนกดอัปโหลด** (วันที่อัปโหลดจริง) — เดิมใช้ `file.lastModified` (Date Modified ของไฟล์) แต่ทำให้ badge ขึ้นวันเก่าตามวันแก้ไขไฟล์ ไม่ใช่วันที่อัปล่าสุด จึงเปลี่ยนเป็นวันอัปโหลดจริงทั้ง 4 ปุ่ม
- badge sync ผ่าน Firestore `_meta` field — **ทุกเครื่องเห็นเหมือนกัน** และยังอยู่หลัง reload (App.jsx อ่าน `catalogMeta` / `barcodeMapMeta` / `costMapMeta` จาก `onSnapshot` → ส่งเป็น `meta` prop ให้แต่ละ component)
- **ImportLotMap มี progress bar ระหว่างอัปโหลด** (ไฟล์ LOT มักใหญ่ + aggregation 2-pass + Firestore write ก้อนใหญ่ → ช้ากว่าไฟล์อื่น): state `stage` (`reading` 15% → `parsing` 45% → `saving` 75% → `done` 100%) แสดงแถบ progress + label แทนปุ่ม/chip ปกติระหว่างอัปโหลด, ปุ่ม disable กันกดซ้ำ; ใช้ `setTimeout(fn, 0)` คั่นก่อนงาน sync หนัก (parse) เพื่อให้ browser repaint stage label ก่อน freeze
  - **`handleLotMapImport` (App.jsx) return promise ของ `setDoc`** (ไม่ fire-and-forget แบบไฟล์อื่น) — ให้ ImportLotMap รู้ว่า Firestore เขียนเสร็จจริงเมื่อไหร่ ก่อนโชว์ `done` + toast success

---

