export function generatePOS(boxId) {
  return boxId.replace(/\D/g, '').padEnd(14, '0').slice(0, 14);
}

// item.barcode มักเป็น comma-separated หลายตัวต่อ SKU (ผลจาก applyBarcodeMap) — match ตัวใดตัวหนึ่งก็พอ
//
// `|| ''` เป็น guard กัน crash เท่านั้น ไม่เปลี่ยนพฤติกรรม: ถ้า barcode เป็น string อยู่แล้วจะได้ค่าเดิมเป๊ะ
// ทำไมต้องมี: ฟังก์ชันนี้ถูกเรียกใน .find() ที่วนทั้ง catalog (PackScanC) และทั้งลัง (BranchReceive)
// → ถ้ามี item สักตัวที่ไม่มี field barcode จะ throw แล้ว "การสแกนพังทั้งจอ" ไม่ใช่แค่ item นั้น
// และพังแบบไม่สม่ำเสมอ (.find หยุดเมื่อเจอ → แถวเสียอยู่ก่อน=พัง อยู่หลัง=รอด) → debug ยากมาก
// field หายได้จริงเพราะ firebase.js ตั้ง ignoreUndefinedProperties: true = undefined ถูกตัดทิ้งตอนเขียน
// (ปัจจุบันยังไม่มีเส้นทางไหนผลิต undefined — นี่คือประกันราคาศูนย์ ไม่ใช่การแก้บั๊กที่เกิดอยู่)
export function matchBarcode(item, val) {
  if (!val) return false;
  if (item.sku === val) return true;
  return (item.barcode || '').split(',').map(b => b.trim()).includes(val);
}

export const checklist = [
  { sku: 'SKU-8801-A', name: 'น้ำปลา ตราเด็กสมบูรณ์ 700ml', unit: 'ขวด', need: 1, got: 1 },
  { sku: 'SKU-8802-B', name: 'ซอสปรุงรส แม็กกี้ 200ml',       unit: 'ขวด', need: 2, got: 2 },
  { sku: 'SKU-4410-C', name: 'ข้าวหอมมะลิ มาบุญครอง 1kg',       unit: 'ถุง', need: 1, got: 1 },
  { sku: 'SKU-1201-Z', name: 'บะหมี่ต้มยำกุ้ง',                  unit: 'ซอง', need: 3, got: 2 },
  { sku: 'SKU-6603-Q', name: 'กาแฟ 3in1 เนสกาแฟ เรด',          unit: 'ซอง', need: 2, got: 0 },
  { sku: 'SKU-0099-P', name: 'ผงซักฟอก บรีส 900g',              unit: 'ถุง', need: 1, got: 0 },
  { sku: 'SKU-7711-K', name: 'นมข้นหวาน ตรามะลิ',               unit: 'กระป๋อง', need: 1, got: 0 },
];
