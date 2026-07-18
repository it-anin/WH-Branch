---
name: wms-receive
description: Use when touching the branch receive screen src/screens/BranchReceive.jsx — สแกนรับลัง, scanCounts/blind receiving, phase scan/verify/result, receivePending + Desktop approval, ล็อกลัง receivingBy, กรองลังตามสาขา, Problem Report Flow (problemReported/problemType/problemReviewed/problemResolved), Pharmacist Recheck Flow, BoxCard.
---

# BranchReceive — หน้ารับสินค้า (สาขา) + Problem/Recheck flow

> **อ่านคู่กับ `CLAUDE.md`** — ไฟล์นี้ถูกแยกออกมาจาก CLAUDE.md เพื่อลดขนาด context
> ที่โหลดทุก session ข้อความที่อ้าง "ดู ... ด้านบน/ด้านล่าง" อาจหมายถึง section
> ที่ยังอยู่ใน CLAUDE.md (เช่น *Architecture*, *Key Functions*, *Box Status Flow*,
> *Known Pitfalls*) กฎ Flow หลักที่ห้ามแก้โดยไม่แจ้ง อยู่ใน CLAUDE.md เช่นกัน

---
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
- **`scanCounts`** = `{[sku]: number}` — **หน่วยฐาน** ต่อ SKU (local state ต่อเครื่อง **ไม่เขียน Firestore**; จะ persist ก็ต่อเมื่อ snapshot ลง `problemScanCounts` ตอนแจ้งปัญหา)
  - **คูณ factor:** `handleItemScan` resolve หน่วยจากบาร์โค้ดที่ยิง → `scanCounts[sku] += factorOf(sku, scannedUnit)` — ยิงกล่อง (factor 24) = +24, ยิงชิ้น (factor 1) = +1 → รับได้ทุก multiple ปนกัน
  - `getNeeded(item)` = `item.gotBase ?? item.qty ?? item.got ?? 0` (หน่วยฐาน) · `fullyChecked` = `scanCounts[sku] >= getNeeded(item)`
  - **⚠ เอกสารเดิมเขียนผิด** ว่า "ไม่คูณ factor (ตั้งใจ) · ห้ามแปลงเป็นหน่วยฐาน" — โค้ดเปลี่ยนไปเป็นหน่วยฐานแล้วแต่เอกสารไม่ได้ตามมา (แก้ 15 ก.ค. 2026) **ยึดโค้ดเป็นหลัก**
  - **ไม่มี upper limit** — นับเกินได้ (กรณีสินค้ามาเกิน) → บันทึกจำนวนจริงเสมอ
  - **Blind receiving:** แถวจะโผล่ในรายการ**ต่อเมื่อยิงบาร์โค้ดแล้วเท่านั้น** (`scannedItems` filter `count > 0`) — ไม่มีคลิกแถวเพื่อติ๊ก ไม่มีปุ่ม "ติ๊กครบทั้งหมด" และพนักงานไม่เห็น `getNeeded`

### แก้จำนวนในแถว + ปิดสีตอนนับ (Android) — กันการเดาเลขจนไฟเขียว
- **`QTY_EDIT_MIN = 10`** (module scope) — SKU ที่ `getNeeded > 10` → แถวมี `<input type="number">` แก้จำนวนได้ แทนการยิงซ้ำทีละชิ้น; ต่ำกว่านั้นยิงเอา
  - พิมพ์เป็น**หน่วยฐาน**ตรง ๆ (ตรงกับ `unitOf(l)` ที่แถวโชว์) — `handleQtyChange` **set ค่าตรง ไม่บวก factor** (ต่างจาก `handleItemScan`)
  - **ขั้นต่ำ 1 เสมอ** — แถวนี้มีอยู่ได้เพราะยิงบาร์โค้ดแล้ว ถ้าปล่อยเป็น 0 แถวจะหายจาก `scannedItems` แล้วพิมพ์ต่อไม่ได้; จะลบจริงต้องปัดซ้าย (`handleRemoveScan`)
  - `onFocus` → `select()` (พิมพ์ทับเลขเดิมได้บน PDA) · `onTouchStart` → `stopPropagation()` (กันปัดซ้าย-ลบตอนแตะช่อง)
  - ⚠ ตัวช่องกรอกที่โผล่มา**บอกใบ้ว่า SKU นี้มี >10** (ไม่บอกเลขจริง) — ยอมรับแล้ว
- **`blind` prop บน `ScannedItemRow`** = `!recheckMode` → ตรวจนับปกติแถวเป็น**สีกลาง** (`var(--paper-dark)` + ตัวเลข `var(--ink)`) เห็นสีแดง/เขียว/เหลืองตอน **phase `result`** เท่านั้น; **recheck mode ยังโชว์สี** (เภสัชต้องรู้ว่าตัวไหนขาด/เกิน — ตั้งใจ)
- **`requestConfirm` เด้ง dialog ทุกครั้ง** ไม่ว่านับครบหรือไม่ และ dialog **เป็นกลาง** ("ยืนยันรับสินค้า · ตรวจนับครบถ้วนแล้วใช่หรือไม่?") ไม่บอกว่าครบ/เหลือกี่รายการ
  - **⚠ ห้ามเอาข้อมูลความครบกลับเข้า dialog หรือคืนสีตอนนับ** — เดิม dialog เด้งเฉพาะ `!allChecked` + บอก "(เหลืออีก N รายการ)" + กดยกเลิกกลับไปแก้ได้ = **oracle**: ปรับเลข → กดยืนยัน → อ่านว่าเหลือเท่าไหร่ → ยกเลิก → วนจนไม่เด้ง = ได้เลขที่ถูกโดยไม่ต้องนับของ ยิ่งแก้จำนวนในแถวได้ยิ่งง่าย → **การซ่อนสีจะไร้ความหมายทันทีถ้า dialog บอกใบ้**
  - dialog ยังทำหน้าที่เดิมคือกันกดพลาด; ผล `ok`/`over`/`fail` ไปโผล่ที่ phase `result` เหมือนเดิม
- **`handleRecheck` ไม่มีใครเรียกแล้ว (dead code)** — กดยืนยันแล้วย้อนกลับมาแก้ในรอบเดียวกันไม่ได้ (การตรวจซ้ำต้องผ่าน problem flow ซึ่งหัวหน้าเห็น)
- **เสียงสแกน:** `playScanSuccess()` (`src/sound.js`) เรียกใน `handleItemScan()` ทุกครั้งที่สแกนสินค้าเจอ (เหมือน PackScanC — ดู *เสียงสแกน* ใน section PackScanC ด้านบน)
- `fullyChecked(item)` = `scanCounts[sku] >= item.qty`
- `allChecked` = ทุก item ผ่าน fullyChecked
- `hasOver` = มี item ใด item หนึ่งที่ `scanCounts[sku] > item.qty` (สแกนเกิน)
- reset `scanCounts` เมื่อสแกนลังใหม่ / สแกนลังถัดไป / handleApprove / handleRecheck
- **ตารางตรวจสอบสินค้า (phase verify):** แสดงคอลัมน์ SKU / ชื่อ / หน่วย / สแกนแล้ว
  - **`ScannedItemRow` มีชุดสี แดง(ไม่ครบ)/เขียว(ครบ)/เหลือง(เกิน)** (`#fde8e8`/`#c0392b` · `#e8f0d8`/`var(--green)` · `#fff3cd`/`#e67e22`) — **แต่ตอนตรวจนับปกติถูกปิดด้วย `blind` แล้ว** สีจะเห็นเฉพาะ recheck mode + phase `result` (ดู *แก้จำนวนในแถว + ปิดสีตอนนับ* ด้านบน)
  - **พนักงานสาขายังไม่เห็นจำนวนที่ควรมีในลัง (`needed`)** — เห็นแค่จำนวนที่สแกนไปแล้ว (`×count`) → semi-blind (สีบอกสถานะครบ แต่ไม่บอกว่าต้องกี่ชิ้น)
- **ปุ่ม "✓ ยืนยันรับสินค้า" เรียก `requestConfirm`** (ไม่ใช่ `handleConfirm` ตรง) → เด้ง dialog (portal) **เป็นกลาง ทุกครั้ง** — ดู *แก้จำนวนในแถว + ปิดสีตอนนับ* ด้านบนว่าทำไมห้ามให้ dialog บอกความครบ
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
- **ล็อกลัง (`receivingBy`):** ตอน `startReceive` set `box.receivingBy = branchStaff` (sync Firestore) + ปลดล็อกลังเก่าของตัวเอง (ถือทีละลัง) — พนักงานอื่นสแกนลังนี้ → **เด้ง dialog "⚠ ลังนี้มีคนกำลังตรวจอยู่ · {ชื่อ} กำลังตรวจลัง X · ตรวจแทน?"** (เจ้าของล็อกสแกนซ้ำได้ตามปกติ ไม่เด้ง dialog)
  - **"ตรวจแทน" (`confirmTakeover`, state `takeoverBox`):** แก้เคสเจ้าของล็อกเดินหาย/ติดงาน แล้วไม่มี timeout ปลดให้ — กด "ตรวจแทน" → เรียก `startReceive(box)` ทับ `receivingBy` เป็นคนใหม่ + reset นับใหม่ (blind receiving) + เข้า verify → **ผลเท่ากับสแกนลังปกติ ต่างแค่ข้ามด่านบล็อก**; audit ครบเอง (`receivedBy` = คนที่กดยืนยันรับจริง)
  - **เป็น "เพิ่มทางเลือก" ไม่ใช่ "ลดการป้องกัน"** — ต้องกดยืนยันเจตนาใน dialog จึงแซง กันสองคนสแกนลังเดียวกันโดยบังเอิญได้เหมือนเดิม
  - **Guard กันตรวจซ้อน (แก้ 18 ก.ค. — เดิมเอกสารเรียกว่า "race หายาก" ซึ่งไม่จริง: จอเครื่องถูกแซงค้าง verify ได้นานไม่จำกัด แล้วกดยืนยัน/แจ้งปัญหาทับสถานะที่คนใหม่ทำได้เต็มที่ เช่น ทับ `receivePending` ที่ครบแล้วเป็น `problemReported`):**
    1. **effect เด้งออก** — watch `foundBox.receivingBy` ขณะ `phase==='verify'`: มีค่าและไม่ใช่เรา → `resetToScan()` เด้งกลับหน้าสแกน + toast บอกใครแซง + ปิด dialog ที่ค้าง (`confirmIncomplete`/`confirmNext`/`reportOpen`); **null ไม่เด้ง** (เราเองยืนยัน/แจ้งปัญหา set null พร้อมเปลี่ยน phase ไปแล้ว) — Desktop ไม่โดน (phase ค้าง scan)
    2. **guard บนสุด `handleConfirm` + `handleReportProblem`** — บล็อกถ้า (ก) `receivingBy` เป็นคนอื่น (ข) `receivePending`/`received` ไปแล้ว → `resetToScan()` ไม่เขียนอะไร; ข้อ (ข) ยังครอบเคส **2 เครื่องเลือกโปรไฟล์พนักงานเดียวกัน** (ระบบแยกคนไม่ออก effect ไม่เด้ง แต่เครื่องช้ากดยืนยันซ้ำจะถูกบล็อก)
    3. **`confirmTakeover` re-check สถานะล่าสุดจาก `boxes` ก่อนเข้า** — dialog เปิดค้างได้นาน snapshot `takeoverBox` อาจเก่า: ลัง `received`/`receivePending`/ปัญหาค้าง → toast "จัดการไปแล้ว" ไม่เข้า verify (เงื่อนไขชุดเดียวกับ guard ใน `handleScan`)
    - **`resetToScan(msg)`** = helper reset ชุดเดียวกับ `handleScanNext` **แต่ไม่แตะ `receivingBy`** (ล็อกไม่ใช่ของเราแล้ว) — ใช้ร่วม 3 จุดข้างบน ห้าม copy แยก
  - **ไม่มี timeout** — ปลดล็อกเฉพาะเมื่อ: ยืนยันรับ (`handleConfirm` ผล ok) / แจ้งปัญหา (`handleReportProblem`) / ไปลังถัดไป (`handleScanNext`)
  - กรณีปิดแอปกลางคัน → ล็อกค้าง (เจ้าของสแกนใหม่ได้, clearBoxes ล้างได้)
- **`handleScanNext`** (ปุ่ม "+ รับลังถัดไป" / Android "+ ลังถัดไป"): reset ทุก state รวมถึง `verifyResult`, `supervisorCode` → `phase = 'scan'` + ปลดล็อก `receivingBy`
  - **⚠ ทิ้ง `scanCounts` ทั้งหมด กู้ไม่ได้** (local state ต่อเครื่อง ไม่เขียน Firestore) → กดพลาดตอนนับ = ต้องรื้อลังนับใหม่
  - **ปุ่ม Android มี dialog ยืนยัน (`confirmNext`) เฉพาะ phase `verify`** — `onClick={() => (phase === 'verify' ? setConfirmNext(true) : handleScanNext())}`; phase `result` (ยืนยันรับส่งหัวหน้าไปแล้ว ไม่มีอะไรเสีย) กดแล้วไปเลย **ตั้งใจไม่ถาม** — ถ้าถามทุกครั้งพนักงานจะกดผ่านอัตโนมัติจนไม่อ่านตอนที่สำคัญจริง
  - **ข้อความ dialog ต้องคงที่เสมอ ห้าม derive จาก `scanCounts`/`allChecked`/`doneCount`** (กฎ oracle เดียวกับ `requestConfirm` — ดู *แก้จำนวนในแถว + ปิดสีตอนนับ*)
  - **ปุ่ม Desktop "+ รับลังถัดไป" + ปุ่ม "+ สแกนลังถัดไป" (ตอนลังไม่มีข้อมูลสินค้า) เรียก `handleScanNext` ตรง ไม่มี dialog** (ตั้งใจ — ไม่มี scanCounts จะเสีย; Desktop เป็น approval-only ไม่เข้า verify)
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

