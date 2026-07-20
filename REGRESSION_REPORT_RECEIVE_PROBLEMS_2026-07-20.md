# Regression Report — แจ้งปัญหาหลายสินค้าระหว่างรับเข้าด้วย PDA

วันที่ทดสอบ: 20 กรกฎาคม 2026
ขอบเขต: พนักงานสาขาสแกนสินค้า → บันทึก/แก้/ลบ Draft ราย SKU → ยืนยัน/รีเช็ค → คลังตรวจและ Resolve

## ผลสรุป

| ชุดทดสอบ | ผล | หมายเหตุ |
|---|---|---|
| Pure unit/regression | PASS | `npm test` ผ่าน 25/25 |
| Production build | PASS | `npm run build` ผ่าน; มีเฉพาะคำเตือน chunk เดิม > 500 kB |
| Firestore Emulator | BLOCKED | Firebase CLI เริ่มได้ แต่เครื่องไม่มี Java (`spawn java ENOENT`) จึงไม่มี emulator process และไม่มีการแตะ production |
| Browser/PDA smoke | BLOCKED | แอปเชื่อม production โดยตรง; เมื่อ emulator ใช้ไม่ได้จึงไม่เปิด UI เพื่อหลีกเลี่ยง write `config/test` และข้อมูลจริง |

## Regression ที่ผ่านด้วย automated test

- ID ปัญหาเป็น deterministic ต่อ `boxId + SKU`; แจ้ง SKU เดิมซ้ำแก้รายการเดิม ไม่เพิ่มรายการซ้ำ
- เก็บประเภทหลายค่า, LOT/EXP, จำนวนหน่วยฐานแบบ optional และแปลงจำนวนที่ไม่ใช่จำนวนเต็มบวกเป็นค่าว่าง
- จำนวนตรงและไม่มี Draft → flow `receivePending` เดิม
- จำนวนตรงและมี Draft → `submitted` และปัญหาแบบ `item`
- จำนวนไม่ตรงและมี Draft → `pending_recheck`
- เภสัชยืนยันขาด/เกินพร้อม Draft → `submitted` และปัญหาแบบ `mixed`
- Draft และ pending recheck ไม่หมดอายุตาม retention; submitted/resolved เก็บครบขอบเขต 30 วัน
- การแสดง LOT/EXP และ regression เดิมของ packing/receiving/zone/search/history ยังผ่านทั้งหมด

## การป้องกัน race/write failure ในโค้ด

- บันทึก Draft รอ Firestore สำเร็จก่อนปิด modal; ล้มเหลวแล้วข้อมูลใน modal ยังอยู่และลองใหม่ได้
- ใช้ submitting state กันกดบันทึก/ยืนยันซ้ำจากเครื่องเดียว
- การยืนยันใช้ Firestore transaction อัปเดตลังและปัญหาทั้งชุด พร้อมตรวจ lock/status ล่าสุดก่อนเขียน
- การโหลด Draft ล้มเหลวจะบล็อกการยืนยัน ไม่ยอมส่งลังโดยทำรายการเดิมหาย
- หน้าคลังบล็อกปุ่มอนุมัติเมื่อโหลดปัญหาล้มเหลวหรือจำนวนเอกสารไม่ครบ
- ลบลังจะลบเฉพาะ Draft/pending recheck ทันที; submitted/resolved คงไว้ตาม retention 30 วัน
- ลังปัญหารูปแบบเก่า (`problemImage`, `problemNote`, `problemType`) ยังใช้หน้าจอเดิมได้

## Smoke checklist ที่ต้องทำเมื่อมี Java/Emulator หรือ PDA ทดสอบ

1. สแกนลัง → สินค้า 1 → บันทึกปัญหา → สแกนสินค้า 2/3 → สินค้า 4 → บันทึกปัญหา และตรวจว่าจำนวนสแกนไม่หาย
2. กดยกเลิก modal, แก้ Draft, ลบ Draft และแจ้ง SKU เดิมซ้ำ
3. ปิด/เปิด session ลังเดิมและตรวจว่า Draft โหลดกลับมา
4. ทดสอบจำนวนตรง, จำนวนไม่ตรง, รีเช็คผ่าน และเภสัชยืนยันขาด/เกิน
5. เปิดสอง PDA ลังเดียวกันและกดยืนยันใกล้กัน; ต้องมีเพียงเครื่องที่ถือ lock ล่าสุดสำเร็จ
6. ตัดอินเทอร์เน็ตตอนบันทึก Draft/ยืนยัน; modal หรือจำนวนสแกนต้องยังอยู่และลองใหม่ได้
7. ตรวจหน้าคลังว่าปัญหาแยก SKU พร้อมประเภท จำนวน LOT/EXP หมายเหตุ และรูป ก่อนกด Resolve
8. ยิงทั้ง HID Enter และ `wh-scan` Broadcast บน PDA จริง
