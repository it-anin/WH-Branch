---
name: wms-packscan
description: Use when touching the packing screen src/screens/PackScanC.jsx — barcode scan flow, processBarcode/applyScan/doClose, เปิดลัง (Android) + KPI createdAt/closedAt, LOT selection popup + manual LOT entry, scannedLots/scannedBarcode/gotBase base-unit math, over-scan confirm, ของหมด/ของไม่พอ swipe, factor lookup/UNIT_FACTOR_OVERRIDE.
---

# PackScanC — หน้าแพ็คกิ้ง (สแกนลงลัง)

> **อ่านคู่กับ `CLAUDE.md`** — ไฟล์นี้ถูกแยกออกมาจาก CLAUDE.md เพื่อลดขนาด context
> ที่โหลดทุก session ข้อความที่อ้าง "ดู ... ด้านบน/ด้านล่าง" อาจหมายถึง section
> ที่ยังอยู่ใน CLAUDE.md (เช่น *Architecture*, *Key Functions*, *Box Status Flow*,
> *Known Pitfalls*) กฎ Flow หลักที่ห้ามแก้โดยไม่แจ้ง อยู่ใน CLAUDE.md เช่นกัน

---
## PackScanC — Logic สำคัญ
- `items` state เก็บ: `{ sku, barcode, name, unit, need, got, location }`
- **Init `items` หักของที่แพ็คไปแล้ว → `buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap })` ใน `units.js`** (ย้ายออกจากไฟล์นี้แล้ว): `need = catalog.qty × factor − จำนวนที่พนักงานคนนี้แพ็คไปแล้ว` (รวมจาก `itemsByBox` ของลัง status `closed`/`exported`/`received` ที่ `packer.code` ตรงกัน) แล้ว `.filter(need > 0)` — กันสินค้าที่ลงลังครบแล้วโผล่ซ้ำหลัง remount (สลับแท็บ) / reload
  - **⚠ `__wh.audit(sku)` (App.jsx) เรียก `buildPackItems` ตัวเดียวกันนี้** เพื่อตรวจข้อพิพาท "จอขึ้น 3 แต่ Picklist สั่ง 4" → **ห้าม copy สูตรกลับมาไว้ในไฟล์นี้** ไม่งั้น audit จะยืนยันเลขผิดทันทีที่ 2 ชุดเพี้ยนกัน (ดู *ตรวจข้อพิพาท* ใน CLAUDE.md)
  - **`STANDARD_UNIT_FACTOR` / `UNIT_FACTOR_OVERRIDE` / `lookupFactor` อยู่ที่ `units.js` ที่เดียวแล้ว** — ไฟล์นี้ `import` เอา (เดิมประกาศซ้ำเองแล้วต้องแก้ 2 ไฟล์ให้ตรงกันทุกครั้ง)
  - **edge case ที่ตั้งใจคงไว้:** `packer = null` → `b.packer?.code !== packer?.code` เทียบ `undefined !== undefined` = false ⇒ **นับลังที่ไม่มี packer เป็นของตัวเอง** · ลังเก่าไม่มี `gotBase` → fallback `(qty ?? got ?? 0) × factor`
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
  - **บันทึกลง `dismissals/` (audit trail):** เรียก `onDismiss?.({sku, name, unit, need, gotBase, boxId})` → App.jsx `handleDismiss` → `addDoc` (เติม `kind: 'out'|'short'`, `packer`, `at`). **ไม่มี listener** — อ่านตอนเรียก `__wh.audit(sku)` เท่านั้น
    - **⚠ ห่อ `try/catch` ไว้ ห้ามเอาออก** — App.jsx กัน promise reject ด้วย `.catch` แล้ว แต่ `addDoc` **throw แบบ synchronous ได้** → เคยทะลุมาบล็อกการปัดจริง (เทสต์จับได้ก่อน deploy). **การบันทึกเพื่อตรวจสอบต้องไม่มีวันขวางงานหน้างาน**
  - **⚠ การปัด "ซ่อนทั้งแถว" ไม่ใช่ลดเลข** และ `dismissedSkus` เป็น local state ไม่ sync ที่ไหน → **รีโหลด/remount รายการกลับมาครบ พนักงานลบความต้องการทิ้งถาวรไม่ได้** — ถ้ามีคนสงสัยว่า "พนักงานปัดของทิ้ง" ให้ดู `dismissals/` ผ่าน `__wh.audit` ไม่ใช่เดา
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

