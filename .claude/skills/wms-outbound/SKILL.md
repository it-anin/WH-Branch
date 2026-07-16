---
name: wms-outbound
description: Use when touching the outbound screen src/screens/BoxClosedLabel.jsx — ส่งออกไฟล์ Text (TSV/POS format, cost/LOT/EXP columns, toBuddhistExp, COST_MARKUP), ส่งออกรายการลังทั้งหมด (xlsx), lotRows helper, edit mode ตารางสินค้า, สติกเกอร์ StickerLabel + print isolation, เลขที่เอกสาร/อนุมัติเอกสาร flow, box note.
---

# Outbound (BoxClosedLabel) — หน้าส่งออก/อนุมัติเอกสาร

> **อ่านคู่กับ `CLAUDE.md`** — ไฟล์นี้ถูกแยกออกมาจาก CLAUDE.md เพื่อลดขนาด context
> ที่โหลดทุก session ข้อความที่อ้าง "ดู ... ด้านบน/ด้านล่าง" อาจหมายถึง section
> ที่ยังอยู่ใน CLAUDE.md (เช่น *Architecture*, *Key Functions*, *Box Status Flow*,
> *Known Pitfalls*) กฎ Flow หลักที่ห้ามแก้โดยไม่แจ้ง อยู่ใน CLAUDE.md เช่นกัน

---
## Outbound (BoxClosedLabel) — Logic สำคัญ
- Tab label: **Outbound** (เดิม: Box & Label) — screen-label "รายการส่งสินค้า", frame title: **"เลขที่ลัง"**
- Global search ข้ามทุก closed box (frame-header) → แผงขวาแสดงตารางผล (maxHeight 450, sticky header)
- **Frame กว้างพิเศษ:** App.jsx ใส่ class `canvas-wide` บน `.canvas` เฉพาะ tab `closed` (`!showAll && tab === 'closed'`) → `max-width: 1920px` (ปกติ `.canvas` cap `1600px`) — ให้ตาราง "รายชื่อสินค้าในลัง" หลายคอลัมน์มีที่พอ; หน้าอื่นไม่กระทบ
  - **⚠ คอลัมน์ชื่อสินค้าตัดบรรทัด (`maxWidth: 200` + `whiteSpace: normal` + `wordBreak`) ไม่ใช่ `nowrap` แล้ว** — เดิม nowrap ทำให้ชื่อยาว (เช่น "Glucerna SR/Gold (Triple Care)...") ดัน track `1fr` กว้างเกินจน**คอลัมน์สติกเกอร์ 380px หลุดขอบขวา** → แก้ด้วย `minWidth: 0` บน div คอลัมน์ซ้าย (ให้ `1fr` หดได้) + จำกัดชื่อ 200px ตัดบรรทัด
- **Layout:** grid `440px 1fr`
  - ซ้าย (440px) = การ์ดลัง **grid 3 คอลัมน์** เรียงตาม id น้อย→มาก + **ปุ่ม filter 3 แถว**:
    - **สาขา (`branchFilter`)** — แถวบนสุด ดู *ตัวกรองสาขา* ด้านล่าง
    - สถานะ (`outboundFilter`): ทั้งหมด / รออนุมัติ (`status closed`) / อนุมัติแล้ว (`exported`/`received`) / **🔴 แจ้งปัญหา** (`problemReviewed && !problemResolved`)
    - พนักงานแพ็ค (`packerFilter`): ทุกคน + รายชื่อ packer ที่มีลังจริง (**derive จาก `closedBoxes` ไม่ใช่ `branchBoxes`** — ไม่งั้นชิปพนักงานหาย ๆ โผล่ ๆ ตามสาขา อ่านเหมือน "ลังของคนนี้หายไป")
    - 3 filter ทำงานร่วมกัน: `closedBoxes` → **`branchBoxes`** → `packerBoxes` (ใช้คำนวณ count สถานะ) → `visibleBoxes`
    - **ปุ่ม "🔴 แจ้งปัญหา"** ใช้สีแดง (`var(--red)`) แทนส้ม + ตัวอักษรแดงเมื่อ inactive และ N > 0 (เรียกความสนใจหัวหน้า)

### ตัวกรองสาขา (`branchFilter`) + ถัง `NO_BRANCH` — กันลัง "หายจากสายตา"
- **`NO_BRANCH = '__none'`** (module scope) = ถังลังที่ `!b.branch` — lowercase ชนกับ code จริงไม่ได้เพราะ `extractBranch()` uppercase เสมอ
- **`branchFilter`**: `'all' | box.branch | NO_BRANCH` — **ไม่ persist** (เหมือน filter อีก 2 ตัว): ถ้าจำค่าไว้ พนักงานเปิดจอเช้าวันถัดไปเจอมุมมองสาขาเดียวค้าง แล้วแจ้งว่า "ลังหาย"
- **`branchCounts` / `branchOpts` / `untaggedN`** derive จาก `closedBoxes` จริง **ไม่ใช่ `BRANCH_NAMES`** — code ที่ไม่รู้จัก (เช่น `SRC2` จากชื่อไฟล์เพี้ยน) ต้องโผล่ด้วย; label ใช้ `branchLabel()` ที่ fallback `สาขา {code}` อยู่แล้ว
- **ทุกชิปต้องมีจำนวน** (ต่างจากชิปพนักงานที่ไม่มี) — `ทุกสาขา (8)` · `สาขาชากค้อ (4)` · `สาขาเก้ากิโล (2)` · `สาขาสวนเสือศรีราชา (1)` · `⚠ ไม่ระบุสาขา (1)` → **4+2+1+1 = 8 ให้พนักงานบวกเองได้ว่าไม่มีลังตกนอกถังไหน = คำตอบของ "ลังหายไหม" ที่พิสูจน์ได้โดยไม่ต้องคลิก** ห้ามเอาจำนวนออก
- **⚠ ห้าม leak ลัง untagged เข้ามุมมองสาขา** — `b.branch === branchFilter` เข้มงวด (ห้ามใส่ `!b.branch ||`) ให้ตรงกับ `matchBranch` ฝั่ง receive ที่ commit `2a23385` ตัด fallback ออกไปแล้วเพราะเสี่ยงลังสาขาหนึ่งไปโผล่อีกสาขา
- **ทำไมต้องมีถัง `⚠ ไม่ระบุสาขา` + ชิปแดงบนการ์ด:** ลัง `branch: null` **สาขาสแกนรับไม่ได้เลยทุกสาขา** (matchBranch เข้มงวด) และ `box.branch` set ครั้งเดียวใน `createNewBox` **แก้ย้อนหลังไม่ได้** → หน้านี้คือที่เดียวที่ลังพวกนี้โผล่ ถ้าตัวกรองกลบก็ตกค้างถาวรโดยไม่มีใครรู้ (ต้นเหตุ = ชื่อไฟล์ Picklist ไม่เข้าแพทเทิร์น → ดู skill `wms-import`)
- **empty state บอกจำนวนที่ถูกซ่อน + ปุ่ม `× ล้างตัวกรอง`** (`resetFilters` ล้างทั้ง 3 filter) — "ไม่มีลังในกลุ่มนี้" เฉย ๆ คือสิ่งที่ทำให้คนคิดว่าลังหาย
- **`⇩ ส่งออกรายการลังทั้งหมด` + ช่องค้นหา ไม่ผูกกับตัวกรอง** (ยังใช้ `closedBoxes`) — ตั้งใจ: ปุ่มบอกว่า "ทั้งหมด" ถ้าเงียบ ๆ ตัดสาขาออกตามชิปที่กดค้างไว้ = แถวหายจากไฟล์โดยไม่มีใครตรวจ; ส่วนค้นหาคือเครื่องมือ "ลังนี้อยู่ไหน" ต้องเจอทุกอย่างเสมอ

### แถบเตือน `hiddenBanner` — ลังที่เลือกอยู่นอกตัวกรอง
- **`selectedHidden`** = `activeBox && !isSearching && !visibleBoxes.some(id ตรง)` — เกิดเพราะ `activeBox = boxes.find(...)` หาจาก **`boxes` ที่ยังไม่กรอง** → กรองสาขาแล้วแผงขวายังค้างลังเดิมพร้อมปุ่มอนุมัติที่กดได้ = **เสี่ยงอนุมัติผิดลัง**
- แถบแดง `⚠ ลัง {id} ({สาขา}) ไม่อยู่ในตัวกรองที่เลือกอยู่ — ตรวจสอบก่อนอนุมัติ` + ปุ่ม `แสดงทุกลัง`
- **ตัดสินใจแล้ว (ผู้ใช้): เตือนอย่างเดียว ไม่ปิดปุ่ม** — ไม่ขวางการทำงาน
- **⚠ ห้าม auto-deselect** (แผงที่กำลังทำงานอยู่ว่างเปล่า = "ลังหาย" ของจริง) **และห้าม auto-select ตัวแรก** (selection ขยับเองตอนคนกำลังจะกดอนุมัติ = อันตรายกว่าเดิม)
- render 2 จุด: arm `problemReviewed` (`padding:20` ธรรมดา) และ arm ปกติ — **arm ปกติเป็น `grid '1fr 380px'` แถบต้องมี `gridColumn:'1 / -1'`** ไม่งั้นไปแทรกในคอลัมน์ `1fr`
- quirk นี้มีอยู่เดิมกับ `packerFilter`/`outboundFilter` อยู่แล้ว (ไม่เคยเตือน) — แถบนี้แก้ให้ทั้งหมดไปพร้อมกัน
- **⚠ `selectedHidden` ต้องประกาศหลัง `isSearching`/`visibleBoxes`/`activeBox` เสมอ** — `const` อยู่ใน TDZ ถ้าย้ายขึ้นไปจะ `ReferenceError` ตอนรัน (build ไม่จับ — ดู memory `vite-build-misses-tdz`)
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

