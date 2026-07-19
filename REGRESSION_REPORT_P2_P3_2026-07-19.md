# Regression Report — รอบ P2/P3

วันที่ทดสอบ: 19 กรกฎาคม 2026  
ขอบเขต: Search รายการลังวันนี้, ลบ history จริง, retention 30 วัน  
นโยบายข้อมูล: ใช้ pure tests และ Firebase Emulator เท่านั้น ไม่แตะ Firebase production

## สรุปผล

| ส่วนงาน | ผล | หลักฐาน |
|---|---|---|
| Search Box ID / POS / SKU / Barcode / ชื่อ | Pass (logic) | ค้นแบบ case-insensitive หลัง branch filter |
| Summary และ Export ไม่ถูก search ลดขอบเขต | Pass (code path) | summary/export ใช้ `branchBoxes`; เฉพาะตารางใช้ `todayBoxes` |
| ลบ `history/{id}` | Pass (Emulator) | ลบจาก client แรกแล้ว client ที่สองอ่านไม่พบ |
| Optimistic rollback เมื่อ delete fail | Pass (code review) | คืน entry ตาม id และ sort เวลาเดิม พร้อม error toast |
| Retention 30 วัน | Pass (logic + Emulator) | ครบ 30 วันพอดียังอยู่; เก่ากว่าแม้ 1 ms ถูกลบ |
| Lifecycle `open → closed → exported → receivePending → received` | Pass (Emulator) | สถานะสุดท้าย received และ `boxItems` ไม่กำพร้า |
| Production build | Pass | `npm run build` สำเร็จ |
| UI browser / reload จริง | Blocked | browser backend ของ session ว่าง |

## พฤติกรรมหลังแก้

- Search กรองเฉพาะตาราง “รายการลังวันนี้” และไม่ค้น snapshot ประวัติ
- ประวัติถูกลบด้วย document id จริงจาก App; `BoxList` ไม่มีการเขียน Firestore โดยตรง
- ใช้ `HISTORY_RETENTION_DAYS = 30` แหล่งเดียวกับ dialog, toast, cutoff และข้อความหน้า list
- กด “Clear · เริ่มวันถัดไป” จะลบเฉพาะ entry ที่เก่ากว่า 30 วัน; entry ที่ครบ 30 วันพอดียังคงอยู่

## Smoke checklist เมื่อ browser/PDA พร้อม

- เลือกสาขา SSS แล้วค้นคำที่มีเฉพาะลังสาขาอื่น: ตารางต้องว่าง แต่ summary/export ของ SSS ต้องไม่เปลี่ยน
- ค้นด้วย Box ID, POS ตัวพิมพ์สลับ, SKU, barcode และชื่อไทย/อังกฤษ
- ลบประวัติหนึ่งวัน แล้ว reload และเปิด client ที่สอง: entry ต้องไม่กลับมา
- จำลอง delete permission error: entry ต้องกลับตำแหน่งตามเวลาและมี error toast
- ตรวจข้อความ dialog/toast/header ทุกจุดแสดง 30 วันตรงกัน

## สถานะจบงานรอบ P2/P3

Automated regression ผ่านทั้งหมด ส่วน interaction และ visual UI คงสถานะ Blocked ตามข้อกำหนดเมื่อ browser backend ไม่พร้อม
