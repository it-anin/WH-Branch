# Regression Report — รอบ P1

วันที่ทดสอบ: 19 กรกฎาคม 2026  
ขอบเขต: BUG-PACK-001, BUG-BR-001, BUG-OUT-001, BUG-ZONE-001, BUG-SYNC-001  
นโยบายข้อมูล: ใช้ pure tests และ Firebase Emulator เท่านั้น ไม่แตะ Firebase production

## สรุปผล

| ส่วนงาน | ผล | หลักฐาน |
|---|---|---|
| แพ็ค SKU+หน่วยซ้ำ 2–3 แถว | Pass (logic) | เลือกแถวที่ยังไม่ครบตามลำดับ และอัปเดตเฉพาะ object แถวนั้น |
| รับสินค้า SKU ซ้ำ | Pass (logic) | รวม `gotBase` ต่อ SKU ก่อนตรวจครบ/ขาด/เกิน และ recheck เหลือหนึ่งรายการต่อ SKU |
| ปุ่มคลัง `+/-` | Pass (logic) | ทดสอบ factor=1, factor>1, หลาย LOT/หลายหน่วย, LIFO และลังเก่า |
| การกำหนดโซน | Pass (logic) | คนไม่ถูกกำหนดได้ 0 รายการ, โซนหนึ่งมีเจ้าของคนเดียว, บล็อกบันทึกเมื่อไม่มีงานถูกแจก |
| การเขียนหลาย client | Pass (Emulator) | client หนึ่งแก้ `note` และอีก client แก้ `receivingBy` แล้วทั้งสอง field อยู่ครบ |
| Production build | Pass | `npm run build` สำเร็จ |
| UI browser / PDA จริง | Blocked | browser backend ของ session ว่าง ไม่มีอุปกรณ์ PDA เชื่อมต่อ |

## Automated regression

- `npm test`: ผ่านทุก test
- P1 pure tests ครอบคลุม duplicate packing, receive aggregate, quantity/LOT consistency, legacy row factor, zone distribution และ field patch
- `npm run test:emulator`: ผ่านกรณี two-client field merge
- `npm run build`: ผ่าน; มีเพียงคำเตือน bundle ใหญ่เดิม ไม่ใช่ build failure

## จุดที่แก้

- `PackScanC` เลือกเป้าหมายจากแถวที่ยังไม่ครบ และใช้ object identity ป้องกันการเพิ่มทุกแถว SKU+หน่วยซ้ำพร้อมกัน
- `BranchReceive` aggregate `boxItems` เป็นยอดหน่วยฐานต่อ SKU ก่อนคำนวณผลทุกเส้นทาง
- `BoxClosedLabel` ปรับเฉพาะ row index และคำนวณ `qty`, `got`, `gotBase`, `scannedLots` ใหม่จากรายการล่าสุด
- งานโซน derive สดจาก Catalog + Zone Assignments; `config/catalogByPacker` เหลือเป็น cache สำหรับ client เก่า
- การเขียนลังเดิมใช้ top-level patch แบบ merge; field ที่หายใช้ Firestore `deleteField()`

## Smoke checklist บน PDA จริง

- เลือกพนักงานที่ไม่มีโซน: ต้องเห็น 0 รายการและเปิดลังแล้วไม่มี Picklist อื่นหลุดมา
- สแกน barcode เดิมให้ SKU+หน่วยซ้ำ 3 แถวจนปิดลัง: ต้องไล่ครบทุกแถว ไม่ขึ้น “ครบแล้ว” ก่อนเวลา
- รับลังดังกล่าวแบบขาดหนึ่งหน่วยและเกินหนึ่งหน่วย: ต้องได้ fail/over จากยอดรวม SKU
- สแกนสลับ HID Enter และ `wh-scan` Broadcast อย่างน้อย 20 ครั้ง
- เปิดสอง PDA ที่ลังเดียวกัน ตรวจ takeover และยืนยันว่าเครื่องเดิมถูกเด้งออกก่อนเขียนสถานะ

## สถานะจบงานรอบ P1

ไม่พบบัค P0/P1 ใหม่จาก automated regression ส่วน UI/PDA คงสถานะ Blocked จนมี browser backend หรืออุปกรณ์จริงตาม checklist ข้างต้น
