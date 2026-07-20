# Regression Report — Picklist Run Isolation

วันที่ทดสอบ: 20 กรกฎาคม 2026

## ผลลัพธ์

| ส่วนงาน | ผล | หมายเหตุ |
|---|---|---|
| Unit/regression tests | PASS | 35/35 tests |
| Production build | PASS | Vite build สำเร็จ; มีเพียงคำเตือน chunk เดิม >500 kB |
| Firestore Emulator | BLOCKED | เครื่องนี้ไม่มี Firebase Emulator CLI/Java; เพิ่ม test ไว้แล้วและถูก skip เมื่อไม่มี `FIRESTORE_EMULATOR_HOST` |
| Browser UI smoke | BLOCKED | session นี้ไม่มี browser backend ให้เชื่อมต่อ |
| Production Firestore | NOT RUN | ไม่อ่าน/เขียนข้อมูลจริงในรอบทดสอบนี้ |

## บัคที่แก้

1. ลังรอบเก่าที่มี SKU+หน่วยตรงกันทำให้ Picklist ใหม่ขึ้นว่าแพ็คครบ
2. อัปโหลดไฟล์เนื้อหาเดิมแต่ PDA ไม่ remount และถือ checklist รอบเก่า
3. Picklist ปกติและเบิกด่วนที่มี SKU+หน่วยซ้ำกันเลือกแถวสแกนข้ามรอบ
4. `activeBoxId` ค้างหลังเปลี่ยน Picklist และเสี่ยงสแกนสินค้ารอบใหม่ลงลังรอบเก่า
5. Dashboard และ `__wh.audit()` ยังนับลังข้ามรอบแม้ checklist ถูกแก้แล้ว
6. การปัดของหมดและ React key ผูกด้วย SKU ทำให้ SKU ซ้ำหลายแถวถูกกระทบพร้อมกัน
7. Catalog และ `catalogByPacker` เขียนแยกกัน ทำให้มีโอกาสสำเร็จเพียงครึ่งเดียวและแสดง success ก่อน Firestore ยืนยัน
8. อัปโหลด Picklist ขณะมีลังที่กำลังสแกน ทำให้ local state ของลังนั้นสูญหายเมื่อ PackScan remount

## กติกาข้อมูลหลังแก้

- อัปโหลด Picklist ปกติแต่ละครั้งสร้าง `picklistRunId` ใหม่และแทนที่รายการเดิมทั้งหมด
- อัปโหลด Picklist เบิกด่วนสร้าง Run ID แยก โดยรักษา Run ID ของ Picklist ปกติไว้
- ยอดแพ็คจับคู่ด้วย `picklistRunId + SKU + unit`
- Run ID ถูกเก็บใน Catalog, `boxItems` และข้อมูลลัง; `progress` เก็บ Run ID เพื่อให้ Dashboard กรองได้
- Catalog/ลังเก่าที่ไม่มี Run ID ยังจับคู่กันแบบ legacy โดยไม่ migration
- ลังเก่ายังคงส่งออก รับเข้าสาขา เปิดดู และเก็บประวัติได้ตามเดิม
- เมื่อเริ่ม Run ใหม่ ลัง legacy/รอบเก่าจะไม่ถูกนำมาหักกับ Picklist ใหม่

## Regression ที่ผ่าน

- รอบใหม่ไม่ถูกยอดลังรอบเก่าหัก แม้ SKU+หน่วยเหมือนกัน
- ลังรอบเดียวกันหักยอดและทำให้แถวครบได้ถูกต้อง
- Legacy catalog + legacy box ยังทำงานแบบเดิม
- Legacy box ไม่หักยอด catalog หลังอัปเดต
- ลัง `open` และลังของพนักงานคนอื่นไม่หัก checklist รายบุคคล
- Picklist ปกติ/เบิกด่วนคนละ Run อยู่ในลังผสมได้โดย item-level Run ID ไม่ปนกัน
- ไฟล์เนื้อหาเหมือนเดิมแต่ Run ใหม่ทำให้ `catalogSig` เปลี่ยน
- Normal import และ urgent replacement รักษา semantics การแทนที่ถูกต้อง
- กล่อง homogeneous/mixed/legacy บันทึก metadata และตรวจ stale box ได้
- Barcode ซ้ำข้าม normal/urgent เลือกแถวที่ยังไม่ครบของ Run ที่ถูกต้อง
- Flow รับสินค้า, LOT/EXP, receive problems, startup race, zone assignment, search และ retention เดิมยังผ่านทั้งหมด

## Smoke checklist ก่อนใช้งานจริง

1. Deploy แล้วปิด/เปิดแอป PDA คลังทุกเครื่องเพื่อโหลด JavaScript รุ่นใหม่
2. ตรวจว่าไม่มีลัง `open/packing` ที่มีรายการสแกนค้าง
3. อัปโหลด Picklist ปกติไฟล์ปัจจุบันอีกครั้งเพื่อสร้าง Run ID ครั้งแรก
4. เปิด “รายการ Picklist” ต้องขึ้น `แพ็คครบ 0 / N` หากยังไม่มีลังของ Run ใหม่นี้
5. เลือกพนักงานบน PDA และยืนยันว่ารายการตามโซนครบ
6. แพ็ค/ปิดลังหนึ่งใบ แล้วตรวจว่าหน้า Picklist และ Dashboard เพิ่มเฉพาะ Run ปัจจุบัน
7. ยืนยันว่าลังเก่าที่ `exported` ยังสแกนรับเข้าสาขาได้ตามปกติ
8. ทดสอบอัป Picklist เบิกด่วน แล้วตรวจว่างานปกติไม่ถูกรีเซ็ตและงานด่วนเริ่ม Run ใหม่

