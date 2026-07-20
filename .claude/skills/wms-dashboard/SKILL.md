---
name: wms-dashboard
description: Use when touching src/screens/PackerDashboard.jsx — real-time packer counters, or the WarehouseScene canvas visualisation (top-down warehouse layout, zones/bays, character sprites + procedural fallback, walk pathing, location highlight).
---

# PackerDashboard + WarehouseScene

> **อ่านคู่กับ `CLAUDE.md`** — ไฟล์นี้ถูกแยกออกมาจาก CLAUDE.md เพื่อลดขนาด context
> ที่โหลดทุก session ข้อความที่อ้าง "ดู ... ด้านบน/ด้านล่าง" อาจหมายถึง section
> ที่ยังอยู่ใน CLAUDE.md (เช่น *Architecture*, *Key Functions*, *Box Status Flow*,
> *Known Pitfalls*) กฎ Flow หลักที่ห้ามแก้โดยไม่แจ้ง อยู่ใน CLAUDE.md เช่นกัน

---
## PackerDashboard — Logic สำคัญ
- แสดง real-time counter ใหญ่: `totalGot / totalNeed ชิ้น`
- `totalGot` = closed boxes (จาก `itemsByBox`) + in-progress (จาก `scanProgress`) ต่อ packer **เฉพาะ `picklistRunId` ที่อยู่ใน assignment ปัจจุบัน**; ลังรอบเก่าไม่ถูกรวมใน Dashboard รอบใหม่
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

