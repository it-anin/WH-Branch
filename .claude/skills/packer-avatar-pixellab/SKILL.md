---
name: packer-avatar-pixellab
description: Use when onboarding a new packer avatar/sprite or asked about PixelLab.ai — sprite generation settings, prompt templates, public/characters/emp-XX file structure, PACKER_SPRITE_DIRS, SPRITE_SIZE/FOOT_PAD/TOP_PAD/WALK_FRAMES constants, or per-character hair/outfit overrides in PackerDashboard.jsx.
---

# PixelLab.ai — Character Generation Workflow

สำหรับสร้าง sprite avatars ใหม่ — ไม่ต้องวาดเอง

**Tool:** [PixelLab.ai](https://pixellab.ai) (v3 character generator) — รองรับ 8-direction rotation + walk animation อัตโนมัติ

## Settings ที่ต้องใช้
| Field | ค่า |
|---|---|
| Character Type | **Humanoid** |
| Generation Mode | **v3 NEW** |
| Camera View | **Low Top-Down** (มุม Gather.town) |
| Sprite Size | **48px** (สำคัญ — output canvas จะเป็น 68×68 พร้อม padding) |
| Detail | Highly detailed |
| Outline | **Black outline** |

## Prompt Template (ภาษาอังกฤษ)
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

## Workflow ใน PixelLab UI
1. **Generate v3 Character** — รอ ~30 วินาที → ได้ 8 รูปยืน (idle) ครบ 8 ทิศ
2. **เปิดตัวการ์ตูน → Add Animation → Walking (4 frames)** — รอ gen 30-60 วินาที → ได้ 32 รูป (4 เฟรม × 8 ทิศ)
3. **Download** — PixelLab จะให้ ZIP ที่มีโครงสร้าง:
   ```
   {ชื่อ}/
   ├── rotations/{south,south-east,east,north-east,north,north-west,west,south-west}.png
   └── animations/Walking-{hash}/{south,south-east,...}/frame_000.png ... frame_003.png
   ```

## File Structure ที่โค้ดต้องการ
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

## Integration ในโค้ด
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

## วิธีวัด padding ของ sprite (PowerShell)
```powershell
Add-Type -AssemblyName System.Drawing
$img = New-Object System.Drawing.Bitmap 'public\characters\emp-03\S.png'
# วน scan pixel หา row บนสุด/ล่างสุดที่มี alpha > 0
# → topPad = head row, footPad = (Height-1) - foot row
```

## Tips
- **PixelLab gen ตัวเดียวกัน 2 variants** บ่อย (เช่น 2 north folders) — เลือกอันที่ดูดีกว่า ลบอีกอัน
- **PixelLab ขนาด canvas ไม่คงที่** — emp-01/02 ได้ 68×68 แต่ emp-03 ได้ 96×96 (ขึ้นกับ Sprite Size setting ตอน gen) → ต้อง override ผ่าน `PACKER_SPRITE_SIZES`
- **อาการถ้า spriteSize ผิด:** sprite วาดไม่ centered, เงาอยู่กลางตัว, ชื่อห่างจากหัว — fix โดยวัด `S.png` แล้ว set ทั้ง 3 overrides
- **ทางเดินระหว่างชั้น (`AW = SW * 0.8`) แคบกว่า sprite 68px** — sprite อาจล้ำเข้าชั้นข้างเคียงเล็กน้อย ยอมรับได้

## เกี่ยวข้องกับ
ดู skill `warehouse-scene` สำหรับ logic การวาดตัวละครเดิน/sprite-vs-procedural fallback ใน `PackerDashboard.jsx` (คนละหัวข้อ — skill นี้เป็นแค่ workflow การ "สร้าง" sprite ใหม่)
