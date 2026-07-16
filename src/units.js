// ตัวคูณหน่วยฐาน (factor) + index บาร์โค้ด + สูตร need ของหน่วยแพ็ค
// เช่น 1 กล่อง = 24 ม้วน → สแกนรับได้ทั้ง 1 กล่อง (factor 24) หรือ 24 ม้วน (factor 1) แล้วนับรวมเป็นหน่วยฐานเท่ากัน
//
// ✅ ไฟล์นี้เป็น "แหล่งเดียว" ของตัวคูณหน่วยฐานแล้ว — ทั้ง PackScanC (แพ็ค), BranchReceive (รับ) และ
//    __wh.audit (ตรวจสอบ) import จากที่นี่ทั้งหมด
//    เดิม PackScanC ประกาศ STANDARD_UNIT_FACTOR / UNIT_FACTOR_OVERRIDE / lookupFactor ซ้ำไว้เอง
//    แล้วต้องแก้ 2 ไฟล์ให้ตรงกันทุกครั้ง — ยุบมาที่นี่แล้ว **ห้าม copy กลับไปประกาศซ้ำที่ไหนอีก**
//    (ถ้า 2 ชุดเพี้ยนกันเมื่อไหร่ จำนวนที่ "ต้องการ" กับที่นับได้ตอน "สแกน" จะไม่ตรงกัน = พนักงานแพ็คผิด)

// หน่วยมาตรฐานสากลที่ตัวคูณคงที่ทุก SKU — fallback เฉพาะตอน R05.106 ไม่มี factor ของหน่วยนั้น
export const STANDARD_UNIT_FACTOR = { 'โหล': 12, 'กุรุส': 144 };

// override ตัวคูณเฉพาะ SKU+หน่วย ที่ picklist ใช้แต่ R05.106 ไม่มี และ derivedPackFactor อนุมานไม่ได้
// ค่าเป็น "จำนวนหน่วยฐานต่อ 1 หน่วย picklist" (ยืนยันกับผู้ใช้ทีละตัว) — ชนะกฎอนุมานเสมอ
export const UNIT_FACTOR_OVERRIDE = {
  '700081__4กล่อง': 4,    // base=กล่อง → 4 กล่อง        (กฎอนุมานได้ค่านี้เองแล้ว — คงไว้เป็น safety net)
  '700352__10กล่อง': 100, // base=ชิ้น, 1 กล่อง=10 ชิ้น → 10 กล่อง = 100 ชิ้น (กฎอนุมานได้ค่านี้เองแล้ว)
  '100283__แพค10': 10,    // base=กระปุก → 10 กระปุก      (ขึ้นต้นด้วยตัวอักษร → กฎไม่แตะ ต้อง hardcode)
};

// หน่วย picklist แบบ "N + หน่วย" (เช่น 3ลัง = ยกละ 3 ลัง) มักไม่มีแถวของตัวเองใน R05.106
// → เดิมตกไป fallback 1 เงียบ ๆ ทำให้ need/gotBase ผิดเป็นสิบเท่า
//   (เคสจริง: SKU 700129 "3ลัง" ควร = 30 ขวด แต่คิดเป็น 1 → สาขารับได้แค่ 11 จาก 330)
// กฎ: factor("N"+หน่วยX) = N × factor(หน่วยX) ของ SKU เดียวกัน
//   ทดสอบกับ R05.106 จริง: ทำนายตรง 239 / ผิด 0 และสร้าง UNIT_FACTOR_OVERRIDE ที่คนยืนยันไว้ได้ตรง 2 ใน 3
//
// ⚠ กฎต้องแคบแบบนี้เท่านั้น — ห้ามขยายเป็น "ดึงเลขจากชื่อหน่วย":
//   R05.106 มีเคสที่เลขเป็นคำอธิบายไม่ใช่ตัวคูณ ("แพค10"=1, "ซอง5ชิ้น"=1) ซึ่งรอดมาได้เพราะ
//   (1) ไม่ขึ้นต้นด้วยเลข และ (2) ต้องมีหน่วยท้ายที่ factor "รู้จริง" — ผ่อนข้อไหนก็พังทันที
function derivedPackFactor(factorMap, sku, unit) {
  const m = /^(\d+)(.+)$/.exec(unit);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!(n > 0)) return undefined; // "0ลัง" → อย่าคืน 0 (จะทำให้ need = 0 = หายจาก checklist)
  // หน่วยท้ายต้อง "รู้จริง" — ไม่ยอมรับ default 1 ไม่งั้นหน่วยมั่ว "3XYZ" จะได้ 3 ทั้งที่ไม่รู้ว่า XYZ เท่าไหร่
  // ไม่ recurse เข้าตัวเอง (ชั้นเดียวพอ — ไม่มี "2x3ลัง" ในข้อมูลจริง)
  const sufF = factorMap[`${sku}__${m[2]}`]
    ?? UNIT_FACTOR_OVERRIDE[`${sku}__${m[2]}`]
    ?? STANDARD_UNIT_FACTOR[m[2]];
  return sufF === undefined ? undefined : n * sufF;
}

// ลำดับความสำคัญ: factorMap (R05.106 ColH) → override เฉพาะตัว → กฎอนุมาน "Nหน่วย" → หน่วยสากล → 1
// กฎอนุมานอยู่ "หลัง" override เสมอ — ค่าที่คนยืนยันเองต้องชนะ
export const lookupFactor = (factorMap, sku, unit) =>
  factorMap[`${sku}__${unit}`]
  ?? UNIT_FACTOR_OVERRIDE[`${sku}__${unit}`]
  ?? derivedPackFactor(factorMap, sku, unit)
  ?? STANDARD_UNIT_FACTOR[unit]
  ?? 1;

// เติมชื่อสินค้าจาก nameMap (R05.106 ColF) เมื่อ item ไม่มีชื่อ หรือชื่อเป็นเลข SKU
// (แถวเก่าที่ lookupByScan เดิม fallback เป็น sku ตอนสแกนสินค้านอก Picklist) — heal ตอน render ไม่แตะข้อมูลใน Firestore
// nameMap ว่าง (เช่นบน Android ที่ไม่ subscribe) → คืน object เดิมทั้ง reference = no-op สมบูรณ์
export const fixItemName = (l, nameMap) =>
  (!l.name || l.name === l.sku) && nameMap[l.sku] ? { ...l, name: nameMap[l.sku] } : l;

// สร้าง checklist ของพนักงาน 1 คน — need เป็น "หน่วยฐาน" หักของที่คนนั้นแพ็คไปแล้วในลังที่ปิด/ส่งออก/รับแล้ว
//   need = qty(picklist) × factor(หน่วย picklist) − Σ gotBase ที่พนักงานคนนี้แพ็คไปแล้ว
// ⚠ นี่คือสูตรที่หน้าแพ็ค (PackScanC) ใช้จริง และ __wh.audit เรียกตัวเดียวกันนี้เพื่อยืนยันเลขบนจอพนักงาน
//   — ถ้าแยกเป็น 2 ชุดเมื่อไหร่ audit จะโกหกทันทีที่สูตรเพี้ยนจากกัน ห้าม copy ไปไว้ที่อื่น
// หมายเหตุ edge case ที่ตั้งใจคงไว้ (พฤติกรรมเดิมตั้งแต่ก่อนย้ายมาที่นี่):
//   - `b.packer?.code !== packer?.code` → ถ้า packer = null จะเทียบ undefined !== undefined = false
//     ⇒ นับลังที่ไม่มี packer เป็นของตัวเอง
//   - ลังเก่าที่ไม่มี gotBase → fallback (qty ?? got ?? 0) × factor(หน่วยของ item ในลัง)
export function buildPackItems({ catalog, boxes, itemsByBox, packer, factorMap }) {
  const fOf = (sku, unit) => lookupFactor(factorMap, sku, unit);
  const baseUnitOf = (sku, fallback) => {
    for (const key of Object.keys(factorMap)) {
      if (factorMap[key] !== 1) continue;
      const idx = key.indexOf('__');
      if (key.slice(0, idx) === sku) return key.slice(idx + 2);
    }
    return fallback;
  };
  const packedBase = {};
  boxes.forEach(b => {
    if (b.packer?.code !== packer?.code) return;
    if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
    (itemsByBox[b.id] || []).forEach(it => {
      const key = `${it.sku}__${it.unit}`;
      const base = it.gotBase ?? ((it.qty ?? it.got ?? 0) * fOf(it.sku, it.unit));
      packedBase[key] = (packedBase[key] || 0) + base;
    });
  });
  return catalog
    .map(c => {
      const needBase = c.qty * fOf(c.sku, c.unit) - (packedBase[`${c.sku}__${c.unit}`] || 0);
      return {
        sku: c.sku, barcode: c.barcode, name: c.name, unit: c.unit,
        need: needBase, got: 0, gotBase: 0,
        baseUnit: baseUnitOf(c.sku, c.unit),
        location: c.location || '',
      };
    })
    .filter(it => it.need > 0); // แพ็คครบแล้ว → หายจาก checklist
}

// index บาร์โค้ด → { sku, unit } จาก barcodeMap ({ sku__unit: [barcodes] })
// ใช้ resolve ว่าบาร์โค้ดที่พนักงานสาขาสแกนเป็นหน่วยอะไรของ SKU ไหน (เพื่อรู้ factor ตอนรับเข้า)
export function buildBarcodeIndex(barcodeMap) {
  const idx = {};
  for (const key of Object.keys(barcodeMap || {})) {
    const p = key.indexOf('__');
    if (p < 0) continue;
    const sku = key.slice(0, p), unit = key.slice(p + 2);
    (barcodeMap[key] || []).forEach(bc => { if (!(bc in idx)) idx[bc] = { sku, unit }; });
  }
  return idx;
}
