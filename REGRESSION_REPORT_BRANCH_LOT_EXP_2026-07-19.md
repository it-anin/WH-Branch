# Regression Report — Branch PDA LOT/EXP

วันที่ทดสอบ: 19 กรกฎาคม 2026

## ขอบเขต

แสดง LOT/EXP ที่คลังแพ็คส่งมาใน Android Branch Receiving โดยใช้ข้อมูลชุดเดียวกับ Outbound export และไม่แสดงจำนวนต่อ LOT เพื่อรักษา blind receiving

## จุดแสดงผลบน PDA

- การ์ดสินค้าที่ปรากฏหลังสแกน
- รายการสินค้าที่ต้อง recheck
- ตารางผลหลังยืนยันการตรวจรับ

รูปแบบ: `LOT: <ค่า> · EXP: <ค่า>`; หากมี LOT แต่ไม่มี EXP จะแสดง `EXP: —` อย่างชัดเจน

## ผลทดสอบ

| กรณี | ผล |
|---|---|
| SKU เดียวหลาย LOT/หลายหน่วย | Pass |
| EXP ใน `scannedLots` | Pass |
| EXP ว่างและ fallback จาก `lotMap` | Pass |
| ลังเก่ามีเพียง `lot/exp` | Pass |
| SKU ซ้ำหลายแถวและ LOT ซ้ำ | Pass — รวมต่อ SKU และตัดค่าซ้ำ |
| SKU ไม่มี LOT/EXP | Pass — ไม่แสดงแถวเปล่า |
| Blind receiving | Pass (logic/code review) — ไม่ส่ง `qty` ต่อ LOT ไป component |
| Outbound Text EXP พ.ศ. | Pass — พฤติกรรมเดิมไม่เปลี่ยน |
| Firestore Emulator เก็บ `scannedLots` ตลอด lifecycle | Pass |
| Production build | Pass |
| Visual UI บน browser/PDA จริง | Blocked — ไม่มี browser backend หรือ PDA เชื่อมต่อ |

## Automated tests

- `npm test`: 14/14 ผ่าน
- `npm run test:emulator`: 3/3 ผ่าน
- `npm run build`: ผ่าน

## Smoke checklist บน PDA จริง

- สแกน SKU ที่มี 1 LOT: ค่า LOT/EXP ต้องตรงกับหน้า Outbound
- สแกน SKU ที่มี 2–3 LOT: ต้องแสดงครบทุก LOT โดยไม่แสดงจำนวนต่อ LOT
- ตรวจข้อความบนจอ 800×480 ไม่ชนช่องจำนวนหรือปุ่มปัดลบ
- ทดสอบชื่อสินค้าและ LOT ยาวมาก ต้องตัดบรรทัดได้โดยไม่ล้นจอ
- ทดสอบ EXP ว่าง ต้องแสดง `—` และยังสแกน/ยืนยันรับได้
- ปัดลบรายการแล้วสแกนใหม่ LOT/EXP ต้องกลับมาเหมือนเดิม
- ทดสอบทั้ง HID Enter และ `wh-scan` Broadcast
