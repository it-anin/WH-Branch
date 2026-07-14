// ตัวคูณหน่วยฐาน (factor) + index บาร์โค้ด — ใช้ฝั่งรับสินค้า (BranchReceive) เพื่อแปลงหน่วยให้ตรงกับฝั่งแพ็ค
// เช่น 1 กล่อง = 24 ม้วน → สแกนรับได้ทั้ง 1 กล่อง (factor 24) หรือ 24 ม้วน (factor 1) แล้วนับรวมเป็นหน่วยฐานเท่ากัน
//
// ⚠ ค่า STANDARD_UNIT_FACTOR / UNIT_FACTOR_OVERRIDE ต้อง "ตรงกับ" ที่ประกาศไว้ใน PackScanC.jsx (แหล่งต้นทางฝั่งแพ็ค)
//   ถ้าเพิ่ม/แก้ override ตัวใหม่ ต้องแก้ทั้ง 2 ไฟล์ให้ตรงกัน (ไม่ได้ share เพราะ PackScanC อยู่ใน flow lock)

// หน่วยมาตรฐานสากลที่ตัวคูณคงที่ทุก SKU — fallback เฉพาะตอน R05.106 ไม่มี factor ของหน่วยนั้น
export const STANDARD_UNIT_FACTOR = { 'โหล': 12, 'กุรุส': 144 };

// override ตัวคูณเฉพาะ SKU+หน่วย ที่ picklist ใช้แต่ R05.106 ไม่มี และตัวคูณเป็นค่าเฉพาะ SKU (ไม่ใช่หน่วยสากล)
// ❌ ห้าม parse เลขจากชื่อหน่วยอัตโนมัติ — มีเคสที่เลขเป็นคำอธิบายไม่ใช่ตัวคูณ (เช่น "แพค10"=1)
export const UNIT_FACTOR_OVERRIDE = {
  '700081__4กล่อง': 4,
  '700352__10กล่อง': 100,
  '100283__แพค10': 10,
};

// ลำดับความสำคัญ: factorMap (R05.106 ColH) → override เฉพาะตัว → หน่วยสากล → 1
export const lookupFactor = (factorMap, sku, unit) =>
  factorMap[`${sku}__${unit}`] ?? UNIT_FACTOR_OVERRIDE[`${sku}__${unit}`] ?? STANDARD_UNIT_FACTOR[unit] ?? 1;

// หาชื่อ "หน่วยฐาน" ของ SKU = หน่วยที่ factor === 1 ใน R05.106 (ทุก SKU มีเสมอ — ดู CLAUDE.md ไฟล์ 2)
// ไม่เจอ (SKU ไม่อยู่ใน factorMap เลย) → fallback (logic เดียวกับ baseUnitOf inline ใน PackScanC)
export function baseUnitOf(factorMap, sku, fallback = '') {
  for (const key of Object.keys(factorMap || {})) {
    if (factorMap[key] !== 1) continue;
    const idx = key.indexOf('__');
    if (key.slice(0, idx) === sku) return key.slice(idx + 2);
  }
  return fallback;
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
