// Sample data for the wireframes. Replace with API calls for production.

export const sampleLine = [
  { sku: 'SKU-8801-A', barcode: '8851234567012', name: 'น้ำปลา ตราเด็กสมบูรณ์ 700ml', unit: 'ขวด', qty: 1 },
  { sku: 'SKU-8802-B', barcode: '8851234567029', name: 'ซอสปรุงรส แม็กกี้ 200ml', unit: 'ขวด', qty: 2 },
  { sku: 'SKU-4410-C', barcode: '8859900112233', name: 'ข้าวหอมมะลิ มาบุญครอง 1kg', unit: 'ถุง', qty: 1 },
  { sku: 'SKU-1201-Z', barcode: '8850567301221', name: 'บะหมี่กึ่งสำเร็จรูป ต้มยำกุ้ง', unit: 'ซอง', qty: 3 },
  { sku: 'SKU-6603-Q', barcode: '8852004040081', name: 'กาแฟ 3in1 เนสกาแฟ เรด', unit: 'ซอง', qty: 2 },
  { sku: 'SKU-0099-P', barcode: '8858881023099', name: 'ผงซักฟอก บรีส 900g', unit: 'ถุง', qty: 1 },
  { sku: 'SKU-7711-K', barcode: '8856660001547', name: 'นมข้นหวาน ตรามะลิ', unit: 'กระป๋อง', qty: 1 },
  { sku: 'SKU-3310-M', barcode: '8851010203040', name: 'ผ้าอ้อมเด็ก Mamypoko L', unit: 'ห่อ', qty: 1 },
  { sku: 'SKU-2202-R', barcode: '8854321007788', name: 'น้ำตาลทราย มิตรผล 1kg', unit: 'ถุง', qty: 1 },
  { sku: 'SKU-5504-T', barcode: '8855588800912', name: 'น้ำดื่ม สิงห์ 600ml x6', unit: 'แพ็ค', qty: 1 },
  { sku: 'SKU-9901-W', barcode: '8850099112233', name: 'ปลากระป๋องปุ้มปุ้ย ซอสมะเขือเทศ', unit: 'กระป๋อง', qty: 1 },
];

export const boxes = [
  { id: 'BX-2604-0012', pos: '8813 2604 0012 7', status: 'closed',   skuCount: 12, totalQty: 18, updated: '09:42' },
  { id: 'BX-2604-0013', pos: '8813 2604 0013 4', status: 'packing',  skuCount: 7,  totalQty: 11, updated: '10:15' },
  { id: 'BX-2604-0014', pos: '—',                 status: 'open',     skuCount: 0,  totalQty: 0,  updated: '—' },
  { id: 'BX-2604-0011', pos: '8813 2604 0011 1', status: 'closed',   skuCount: 14, totalQty: 22, updated: '08:57' },
  { id: 'BX-2604-0010', pos: '8813 2604 0010 8', status: 'exported', skuCount: 13, totalQty: 19, updated: 'เมื่อวาน' },
];

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
