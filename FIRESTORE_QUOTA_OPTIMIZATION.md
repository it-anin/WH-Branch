# แผนลดโควต้า Firestore

> เอกสารหลักสำหรับทำงานเรื่องโควต้า Firestore ในครั้งถัดไป
> ก่อนแก้โค้ด ให้ AI/ผู้พัฒนาอ่านไฟล์นี้ทั้งหมดและตรวจสถานะจริงใน Git/Firebase Console ก่อนเสมอ

อัปเดตล่าสุด: 23 กรกฎาคม 2026
โปรเจกต์: WH-Branch
สถานะปัจจุบัน: ทำ Phase 1, ระบบแจ้ง Firestore error กลาง, จำกัด `progress` และ `history` listener แล้ว ให้เก็บ Usage หลังใช้งานจริงก่อนแตะ `boxes`/`boxItems`

## 1. สรุปเหตุการณ์และข้อวินิจฉัย

ข้อมูลจาก Firebase Console ช่วง 22–23 กรกฎาคม 2026 (Last 24 hours):

| รายการ | การใช้งาน | Free tier ต่อวัน | สถานะ |
|---|---:|---:|---|
| Document reads | 69,000 | 50,000 | เกินประมาณ 19,000 |
| Document writes | 9,200 | 20,000 | ยังไม่เกิน |
| Document deletes | 54 | 20,000 | ยังไม่เกิน |

Firebase Console แสดงข้อความ `Your project has exceeded no-cost limits` จึงมีหลักฐานว่าเกิน Free tier จริง โดยตัวที่น่าจะเกินคือ **Document reads**

กราฟ `Last 24 hours` เป็นช่วงเวลาเลื่อนย้อนหลัง 24 ชั่วโมง จึงอาจไม่ตรงกับรอบคำนวณโควต้ารายวันแบบเป๊ะ แต่ตัวเลข Reads 69K สูงกว่าเพดาน 50K ชัดเจน

โควต้ารายวันรีเซ็ตประมาณเที่ยงคืนตามเวลา Pacific:

- ช่วงสหรัฐใช้ Daylight Saving Time: ประมาณ 14:00 น. เวลาไทย
- ช่วงสหรัฐไม่ใช้ Daylight Saving Time: ประมาณ 15:00 น. เวลาไทย
- ไม่ควรเขียนระบบให้ยึดเวลา 14:00 น. ตายตัว เพราะเวลาเปลี่ยนตาม DST และ Firebase ระบุว่ารีเซ็ต “ประมาณ” เที่ยงคืน

เอกสารอ้างอิง:

- [Firestore quotas and limits](https://firebase.google.com/docs/firestore/quotas)
- [Firestore pricing](https://firebase.google.com/docs/firestore/pricing)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## 2. สาเหตุหลักที่พบ

เส้นทางเดิมของ `progress`:

1. พนักงานแพ็คสแกนสินค้า
2. `PackScanC` เรียก `onScanProgress` ทุกครั้งที่สแกน
3. `App.handleScanProgress` เขียน `progress/{boxId}` ทุกครั้ง
4. ทุกเครื่องที่เปิดแอป subscribe ทั้ง collection `progress`
5. การเปลี่ยน progress หนึ่งครั้งจึงทำให้ทุกเครื่องที่เชื่อมต่อถูกคิด Document read

ตัวอย่างผลคูณ:

```text
จำนวน progress writes × จำนวนเครื่องที่ subscribe = จำนวน reads โดยประมาณ
9,200 writes × 7 เครื่อง ≈ 64,400 reads
```

ตัวเลขนี้ใกล้กับ Reads 69K ที่เห็นใน Console มาก จึงสรุปว่า **ต้นเหตุหลักไม่ใช่ตัวหน้า Dashboard เพียงอย่างเดียว แต่เป็นการ broadcast `progress` ไปยัง listener ของทุกเครื่อง**

ปัจจัยรองที่ยังต้องแก้:

- ทุกเครื่อง subscribe `boxes` ทั้ง collection
- ทุกเครื่อง subscribe `boxItems` ทั้ง collection
- ทุกเครื่อง subscribe `history` ทั้ง collection แม้ไม่ได้เปิดหน้าประวัติ
- Desktop subscribe `progress` ตลอดเวลา แม้ไม่ได้เปิด Dashboard
- ยังไม่มีการแจ้งผู้ใช้ที่ชัดเจนเมื่อ Firestore ตอบ `resource-exhausted`
- หลายคำสั่งเขียนใช้ `.catch(console.error)` หรือ error handler ที่แสดงแค่ใน console

ข้อควรรู้:

- Firestore คิด Reads ตามจำนวน document ที่อ่าน ไม่ได้คิดตามขนาด byte เพียงอย่างเดียว
- การลดขนาด document ช่วยเรื่อง bandwidth, latency และเพดาน 1 MB แต่ไม่ใช่วิธีหลักในการลดจำนวน Document reads
- Dashboard จะเปลืองเมื่อเปิด listener กว้างหรือมีหลาย client ไม่ใช่เพราะการ render กราฟใน React

## 3. สิ่งที่ทำแล้ว — ลำดับความสำคัญ P0

แก้ใน `src/App.jsx` แล้ว:

- [x] กำหนด `PROGRESS_WRITE_INTERVAL_MS = 1000`
- [x] Android ไม่ subscribe collection `progress`
- [x] จำกัดการเขียน progress ของแต่ละลังไม่เกินประมาณ 1 ครั้ง/วินาที
- [x] เขียน progress ครั้งแรกทันที เพื่อให้ Desktop เห็นว่ามีงานกำลังทำ
- [x] เก็บค่าล่าสุดระหว่าง throttle และเขียนค่าล่าสุดเมื่อครบเวลา
- [x] เมื่อปิดลัง ให้ยกเลิก timer และลบ `progress/{boxId}` ทันที
- [x] ป้องกัน trailing write นำ progress เก่ากลับมาเขียนหลังปิดลัง
- [x] ปิดการเขียน `config/test` ทุกครั้งที่เปิด Production
- [x] อนุญาต connectivity test เฉพาะ `import.meta.env.DEV`
- [x] cleanup timer เมื่อ App unmount
- [x] ไม่เปลี่ยน listener ของ `boxes` และ `boxItems` ใน Phase 1 เพื่อไม่ให้กระทบลังที่รอสาขารับเข้า
- [x] `npm.cmd run build` ผ่าน
- [x] `npm.cmd test` ผ่าน 49 tests
- [x] `git diff --check` ผ่าน
- [x] เพิ่ม banner กลางสำหรับ `resource-exhausted`, `permission-denied`, `unauthenticated` และ `unavailable`
- [x] ความล้มเหลวของ `progress` แสดง warning แบบ non-blocking ไม่ขวางการเปิด/ปิดลัง
- [x] Desktop subscribe `progress` เฉพาะ Dashboard และหน้ารายการเบิกสินค้า
- [x] หน้าอัป Picklist รอ server snapshot ของ `progress` ก่อนปลดล็อก
- [x] subscribe `history` เฉพาะ Desktop คลังในหน้ารายการเบิกสินค้า
- [x] query `history` เฉพาะช่วง retention 30 วัน

สถานะ Git ณ วันที่เขียนเอกสาร:

- Phase 1 และ listener scope ถูก commit/push แยกเป็นรอบแล้ว
- ครั้งถัดไปต้องตรวจ `git log`, `git status` และ Firebase deployment เพื่อยืนยันว่าสภาพแวดล้อมที่กำลังตรวจมีโค้ดชุดนี้แล้ว
- Repository มีไฟล์ untracked ของผู้ใช้อยู่หลายไฟล์ ห้าม stage ทั้งหมดด้วย `git add .`
- ก่อน commit ต้องตรวจและ stage เฉพาะ hunk ที่เกี่ยวกับโควต้า

## 4. งานที่ต้องทำต่อ เรียงตามความสำคัญ

### P0 — ป้องกันระบบหยุดแบบไม่มีคำอธิบาย

- [x] สร้าง error handler กลางสำหรับ Firestore
- [x] ตรวจ error code `resource-exhausted`, `permission-denied`, `unavailable` และ `unauthenticated`
- [x] เมื่อเป็น `resource-exhausted` แสดง banner ภาษาไทยที่ทุกหน้ามองเห็น เช่น:

  ```text
  Firestore ใช้งานเกินโควต้ารายวัน ระบบบันทึกข้อมูลชั่วคราวไม่ได้
  กรุณาหยุดสแกนและติดต่อผู้ดูแลระบบ ห้ามสแกนซ้ำจนกว่าระบบกลับมาปกติ
  ```

- [x] แยกข้อความ auth/permission ออกจาก quota เพื่อไม่ให้วินิจฉัยผิด
- [x] ห้าม retry แบบ loop เมื่อเป็น `resource-exhausted`
- [x] เชื่อม error กลางกับ listeners และ write หลัก ได้แก่ เปิดลัง, ลัง/สินค้า, Outbound, รับเข้าสาขา และการนำเข้าข้อมูล
- [ ] ตรวจว่าการเขียนสำเร็จก่อนแสดงข้อความ “สำเร็จ” ในจุดที่ข้อมูลสูญหายได้

เหตุผล: งานนี้ไม่ได้ลด Reads โดยตรง แต่ป้องกันพนักงานทำงานต่อบนข้อมูลที่ยังไม่ถูกบันทึก

### P1 — ลด listener ที่อ่านข้อมูลทั้ง collection

ทำทีละส่วนและ deploy แยกรอบ เพื่อระบุผลจากกราฟได้

#### P1.1 จำกัด `progress` บน Desktop — ทำแล้ว

- [x] subscribe `progress` เฉพาะ Dashboard และหน้ารายการเบิกสินค้า
- [x] guard การอัป Picklist รอ server snapshot ก่อนอนุญาตให้อัปไฟล์
- [x] Android และ Desktop tab อื่นไม่ subscribe
- [x] unsubscribe และล้าง progress state ทันทีเมื่อออกจากหน้าที่ใช้

เป้าหมาย: Desktop ที่เปิดค้างหน้าอื่นต้องไม่รับ read ทุกครั้งที่พนักงานสแกน

#### P1.2 จำกัด `history` — ทำแล้ว

- [x] subscribe `history` เฉพาะ Desktop คลังเมื่อเปิดหน้ารายการเบิกสินค้า
- [x] ใช้ `where('clearedAt', '>=', cutoff)` และ `orderBy('clearedAt', 'desc')`
- [x] เก็บเฉพาะช่วง retention จริง 30 วัน
- [x] Query ใช้ field เดียว ไม่ต้องเพิ่ม composite index

#### P1.3 จำกัด `boxes`

- [ ] แยกความต้องการข้อมูลตาม role และหน้าจอ
- [ ] Android พนักงานแพ็คควรอ่านเฉพาะลังที่เกี่ยวกับพนักงาน/งานปัจจุบันเท่าที่ workflow อนุญาต
- [ ] Android สาขาควรอ่านลังของสาขาตัวเองและสถานะที่ยังต้องรับ/มีปัญหา
- [ ] Desktop คลังค่อยอ่านชุดกว้างเฉพาะหน้าที่ต้องใช้
- [ ] ใช้ Firestore query (`where`, `orderBy`, `limit`) แทนดึงทั้ง collection แล้วกรองใน React
- [ ] ตรวจและสร้าง composite indexes ตาม query ที่เลือก

ข้อห้าม: **ห้ามกรองด้วย “วันนี้” อย่างเดียว** เพราะลังอาจรอรับข้ามวัน

#### P1.4 จำกัด `boxItems`

- [ ] ไม่ subscribe `boxItems` ทั้ง collection ทุกเครื่อง
- [ ] โหลด items เฉพาะ Box ID ที่กำลังแสดง, กำลังแพ็ค, รอรับ, มีปัญหา หรือผู้ใช้เปิดดู
- [ ] หาก query ด้วย document ID หลายค่า ต้องแบ่งเป็นชุดตามข้อจำกัด query ปัจจุบันของ Firestore
- [ ] unsubscribe รายการที่ไม่อยู่ใน scope แล้ว
- [ ] พิจารณา one-shot `getDoc` เมื่อเปิดรายละเอียด แทน listener ถ้าไม่จำเป็นต้อง realtime

ลำดับนี้ต้องทำหลังออกแบบ `boxes` scope เพราะ Box ID ที่ต้องใช้จะมาจากผล query ของ `boxes`

### P2 — ลดการเขียนและการอ่านซ้ำ

- [ ] ตรวจ `setBoxes` ให้เขียนเฉพาะลังที่เปลี่ยนต่อไป ห้ามย้อนกลับไป batch เขียนลังทั้งหมด
- [ ] ตรวจ `setItemsByBox` ไม่ให้เขียน document เดิมเมื่อข้อมูลไม่เปลี่ยน
- [ ] debounce/throttle การเขียนอื่นที่เกิดจาก UI ถี่ ๆ โดยต้องไม่ลดความถูกต้องของงานสแกน
- [ ] เปลี่ยนข้อมูลที่ไม่ต้อง realtime เป็น one-shot read พร้อมปุ่ม refresh
- [ ] ตรวจหน้า Login ไม่ให้เรียก `config/auth` ซ้ำโดยไม่จำเป็น
- [ ] ตรวจ listener config แต่ละตัวว่า Android/Desktop/role ใดจำเป็นต้องใช้
- [ ] หลีกเลี่ยงการเปิดหลาย listener ซ้ำจาก component remount
- [ ] ตรวจ React Strict Mode ใน development แยกจากพฤติกรรม production

### P2 — Retention และ Archive

- [ ] กำหนดอายุข้อมูลของ `boxes`, `boxItems`, `progress`, `dismissals`, `receiveProblems` และ `history`
- [ ] archive เฉพาะลังที่จบ workflow แล้วจริง
- [ ] ลบ orphan `progress` ที่ไม่มีลัง open/packing รองรับ โดยทำเป็นงานดูแลที่ตรวจสอบย้อนกลับได้
- [ ] ลบ orphan `boxItems` ได้เฉพาะเมื่อยืนยันว่าลังต้นทางถูก archive/ลบอย่างถูกต้อง
- [ ] จำกัด `history` ให้ตรงนโยบาย 7 วัน หรือย้ายข้อมูลเก่าไป storage/export
- [ ] ทำ dry run และรายงานจำนวน document ก่อนลบจริงทุกครั้ง

ข้อควรระวัง: งาน cleanup เองคิด Deletes และอาจคิด Reads จึงควรรันเป็นรอบ ไม่สแกนทั้งฐานข้อมูลถี่ ๆ

### P3 — Monitoring และ Capacity

- [ ] บันทึก Reads/Writes/Deletes รายวันอย่างน้อย 3–7 วันหลัง deploy Phase 1
- [ ] บันทึกจำนวนเครื่อง Android และ Desktop ที่ออนไลน์ในช่วงเดียวกัน
- [ ] เปรียบเทียบช่วงเวลาที่ Reads พุ่งกับเวลาที่พนักงานแพ็ค
- [ ] ตั้งเป้า Reads ไม่เกิน 35,000/วัน เพื่อเหลือ headroom อย่างน้อยประมาณ 30%
- [ ] ตั้งเป้า Writes ไม่เกิน 14,000/วัน
- [ ] ตรวจ Query Insights/Usage ใน Google Cloud Console เพื่อหาจุดอ่านสูงสุด
- [ ] ตรวจความสามารถของ Cloud Monitoring/Alerting ที่ใช้ได้กับ billing plan ปัจจุบัน
- [ ] หากใช้งานจริงเติบโตจน Free tier ไม่มี headroom ให้ประเมิน Blaze plan พร้อม Budget Alert

หมายเหตุ: Budget Alert เป็นการแจ้งเตือนค่าใช้จ่าย ไม่ใช่ hard cap และไม่ควรถูกใช้แทนการควบคุม query

## 5. ข้อมูลลังที่รอสาขารับเข้า — ข้อห้ามสำคัญ

การแก้โควต้าต้องไม่ทำให้ลังที่อยู่ระหว่างทางสูญหายหรือมองไม่เห็น

ห้ามทำสิ่งต่อไปนี้:

- **ห้ามแก้ระบบลดโควต้าแล้วทำให้พนักงานแพ็คกิ้งเปิดลัง สแกนสินค้าลงลัง หรือปิดลังไม่ได้ พนักงานต้องสแกนต่อเนื่องได้ตามปกติ**
- ห้าม debounce/throttle การประมวลผลบาร์โค้ดบนเครื่องพนักงาน การลดความถี่ทำได้เฉพาะการ sync `progress` ไป Firestore โดยยอดบนหน้าจอและข้อมูลสินค้าทุกครั้งที่สแกนต้องอัปเดตทันที
- ห้ามนำการเขียน `progress` ที่ถูก throttle มาใช้เป็นเงื่อนไขตัดสินว่าสแกนสำเร็จหรือเป็นข้อมูลหลักตอนปิดลัง
- ห้ามปิดปุ่มเปิดลังหรือปิดลังเพียงเพราะ Dashboard/`progress` ใช้งานไม่ได้ หากข้อมูลหลักที่จำเป็นต่อการแพ็คยังพร้อมใช้งาน
- ห้ามล้าง collection `boxes`
- ห้ามล้าง collection `boxItems`
- ห้ามล้าง `config/receive`
- ห้าม reset ฐานข้อมูลเพื่อแก้ quota
- ห้ามกรองลังด้วยวันที่วันนี้เพียงเงื่อนไขเดียว
- ห้าม archive/delete ลังที่ยังเป็น `open`, `packing`, `closed`, `exported` หรือยังรอสาขายืนยัน
- ห้ามเปลี่ยน `branch` ของลังเก่าแบบเดา
- ห้ามใช้ `progress` เป็น source of truth ของลังที่ปิดแล้ว
- ห้ามให้ client หนึ่งเขียนทับลังทั้งหมดจาก snapshot ที่อาจเก่า

ข้อมูลหลักที่ต้องคงเดิม:

| Collection/Document | หน้าที่ |
|---|---|
| `boxes/{boxId}` | สถานะและ metadata ของลัง |
| `boxItems/{boxId}` | สินค้าและจำนวนจริงภายในลัง |
| `config/receive` | รายการลังที่รับแล้วตามโครงสร้างปัจจุบัน |
| `receiveProblems/{id}` | ปัญหาที่พบระหว่างรับสินค้า |
| `progress/{boxId}` | สถานะชั่วคราวระหว่างแพ็ค ไม่ใช่ข้อมูลลังที่ปิดแล้ว |

ก่อนแก้ query ของ `boxes`/`boxItems` ต้องเก็บตัวอย่าง Box ID ที่รอรับจริงไว้ทดสอบ และยืนยันว่า:

1. Android พนักงานแพ็คกิ้งเปิดลังใหม่ได้
2. พนักงานสแกนสินค้าต่อเนื่องได้ตามปกติ ยอดบนหน้าจอเพิ่มทันทีทุกครั้ง และไม่มีรายการสแกนหาย
3. ปิดลังได้ และข้อมูลสินค้าใน `boxItems/{boxId}` ครบตรงกับที่สแกน
4. Desktop Outbound ยังเห็นลัง
5. Android สาขาที่ถูกต้องค้นหา/สแกนลังได้
6. สาขาอื่นมองไม่เห็นลังนั้น
7. เปิดดูรายการสินค้าได้ครบ
8. ยืนยันรับและรีเช็คได้
9. หลัง reload หรือเปลี่ยนเครื่อง ข้อมูลยังอยู่

## 6. จุดในโค้ดที่ต้องตรวจครั้งถัดไป

ไฟล์หลัก: `src/App.jsx`

ให้ค้นหาด้วยคำต่อไปนี้แทนการยึดเลขบรรทัด เพราะเลขบรรทัดเปลี่ยนได้:

```text
PROGRESS_WRITE_INTERVAL_MS
progressWriteRef
persistScanProgress
handleScanProgress
unsubProgress
unsubBoxes
unsubItems
unsubHistory
collection(db, 'progress')
collection(db, 'boxes')
collection(db, 'boxItems')
collection(db, 'history')
```

จุดเรียกต้นทาง progress:

- `src/screens/PackScanC.jsx`
- ค้นหา `onScanProgress`

จุดตั้งค่า Firestore/Auth:

- `src/firebase.js`
- ตรวจ `ensureAuthReady`, anonymous auth และ Firestore initialization

คำสั่ง audit เบื้องต้น:

```powershell
rg -n "onSnapshot|getDoc|getDocs|setDoc|addDoc|updateDoc|deleteDoc|runTransaction|writeBatch" src
git diff -- src/App.jsx src/screens/PackScanC.jsx src/firebase.js
git status --short
```

## 7. ขั้นตอน deploy ที่ปลอดภัย

1. ตรวจ Firebase Usage ก่อน deploy และจด baseline
2. ตรวจ `git status` เพื่อแยกไฟล์ของผู้ใช้ออกจากงาน quota
3. ตรวจ diff เฉพาะ hunk ที่ต้องการ
4. รัน:

   ```powershell
   npm.cmd run build
   npm.cmd test
   git diff --check
   ```

5. ทดสอบ workflow อย่างน้อย:
   - พนักงานเปิดลัง
   - สแกนต่อเนื่องหลายชิ้นด้วยความเร็วใช้งานจริง โดยยอดบน Android ต้องเพิ่มทันทีทุกครั้ง
   - ปล่อยให้ `progress` sync แบบ throttle ได้ แต่ห้ามทำให้ input, เสียงสแกน หรือการบันทึกรายการบนเครื่องหน่วง
   - Desktop เห็น progress
   - ปิดลังแล้ว progress หาย
   - ตรวจ `boxItems/{boxId}` ว่าจำนวนที่ปิดลังตรงกับจำนวนที่สแกนทั้งหมด
   - Outbound เห็นลังปิด
   - สาขาสแกนลังที่รอรับ
   - รีเช็คและยืนยันรับ
6. Stage เฉพาะไฟล์/hunk ที่เกี่ยวข้อง ห้ามใช้ `git add .`
7. Commit และ push เมื่อผู้ใช้สั่ง
8. หลัง deploy ตรวจ Console ในวันทำงานจริงอย่างน้อย 3 วัน
9. หาก Reads ยังเกินเป้าหมาย ให้ทำ P1.1 → P1.2 → P1.3 → P1.4 ตามลำดับ

## 8. เกณฑ์ถือว่างานสำเร็จ

- Reads ต่ำกว่า 50,000/วันอย่างสม่ำเสมอ และมี headroom
- เป้าหมายที่แนะนำคือไม่เกิน 35,000 Reads/วัน
- ไม่มี `resource-exhausted` ระหว่างเวลาทำงาน
- พนักงานเห็นข้อความชัดเจนหาก Firestore ใช้งานไม่ได้
- พนักงานแพ็คกิ้งเปิดลัง สแกนต่อเนื่อง และปิดลังได้ตามปกติ โดยไม่มีรายการสแกนหายหรือหน้าจอหน่วงจากการลดโควต้า
- ไม่มีลังรอรับหายหรือถูกกรองผิดสาขา
- ไม่มี progress ค้างหลังปิดลัง
- Dashboard ยังแสดงข้อมูลที่จำเป็นโดยไม่ต้องให้ Android ทุกเครื่อง subscribe
- Build และ automated tests ผ่าน
- ผ่านการทดสอบจริงตั้งแต่เปิดลังจนสาขารับเข้า

## 9. สรุปลำดับทำงานครั้งถัดไป

1. บันทึก Reads/Writes หลังใช้งานจริงอย่างน้อย 3 วันทำงาน
2. ตรวจ success toast ของ write สำคัญว่ายืนยันหลัง Firestore สำเร็จจริง
3. ถ้า Reads ไม่เกิน 35,000/วัน ให้คง `boxes`/`boxItems` listener ไว้เพื่อลดความเสี่ยง
4. ถ้า Reads ยังสูง ให้ออกแบบ query `boxes` ตาม role/branch/status โดยรักษาลังข้ามวัน
5. หลังได้ scope ของ `boxes` แล้ว ค่อยโหลด `boxItems` เฉพาะลังที่อยู่ใน scope
6. วาง retention/archive อย่างปลอดภัย
7. พิจารณา Blaze เฉพาะเมื่อปรับ query แล้วยังไม่มี headroom เพียงพอ
