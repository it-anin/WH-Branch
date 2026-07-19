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

// โซนจาก location — แหล่งเดียว ใช้ทั้ง computeCatalogByPacker (App.jsx) และ ZoneAssign
// (เดิม regex เดียวกันก๊อปอยู่ 2 ไฟล์ — บทเรียนเดียวกับ lookupFactor: สูตรเดียวห้ามมี 2 ก๊อป)
// NOLOC_ZONE = โซนพิเศษของรายการ "ไม่มี location" (Picklist เบิกด่วน) — tick ให้พนักงานใน ZoneAssign ได้
// ขึ้นต้น '__' + lowercase → ชนกับโซนจริง (A/B/COOL ที่ uppercase เสมอ) ไม่ได้
export const NOLOC_ZONE = '__noloc';
export const zoneOf = (location) => {
  const m = (location || '').match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : NOLOC_ZONE;
};

// Picklist เบิกด่วนต้องเข้าโซนพิเศษเสมอ แม้ Col G (location) ในไฟล์จะมีค่า
// - urgent=true: รายการที่ import หลังเพิ่มกฎนี้
// - item.branch: backward-compatible กับรายการด่วนเดิม ซึ่ง stamp branch ต่อรายการไว้แล้ว
// รายการ Picklist ปกติไม่มีสอง field นี้ จึงยังแยกโซนจาก location เหมือนเดิม
// ⚠ ห้ามใช้ zoneOfItem(it) === NOLOC_ZONE แทน isUrgentItem — zoneOfItem คืน NOLOC_ZONE ให้รายการ "ปกติ"
// ที่ location ว่างด้วย (ไม่ใช่แค่รายการด่วน) → ใช้กรองรายการด่วนเมื่อไหร่ รายการปกติจะโดนลบทิ้งไปด้วย
export const isUrgentItem = (item) => item?.urgent === true || Boolean(item?.branch);
export const zoneOfItem = (item) => isUrgentItem(item) ? NOLOC_ZONE : zoneOf(item?.location);

// ลายเซ็นเนื้อหาของ catalog ที่พนักงานถือ — ใช้เป็น key remount PackScanC (แทน .length อย่างเดียว)
// ⚠ ทำไม: key เดิม `${code}-${length}` ชนกันเมื่ออัป Picklist เบิกด่วนชุดใหม่ (สาขาอื่น) ที่จำนวนรายการเท่าเดิม
//   → React เห็น key ไม่เปลี่ยน → PackScanC ไม่ remount → items (state) ค้างรายการเก่า → สแกนของใหม่เด้ง "ครบแล้ว"
// hash จาก sku+unit+qty+branch (djb2) → เปลี่ยนเมื่อ "เนื้อหา" เปลี่ยนจริง; พนักงานที่ list ไม่เปลี่ยน sig เท่าเดิม
//   → ไม่ remount → ของที่สแกนค้างในลังไม่หาย (การันตีเดียวกับ key เดิม แต่แม่นกว่า เพราะดูเนื้อหาไม่ใช่แค่จำนวน)
// computeCatalogByPacker filter ตามโซนแบบ deterministic (คงลำดับ) → sig เสถียรข้ามการ import เนื้อหาเดิมซ้ำ
export function catalogSig(items) {
  let h = 5381;
  for (const it of items || []) {
    const s = `${it.sku}|${it.unit}|${it.qty}|${it.branch || ''}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${(items || []).length}:${h >>> 0}`;
}

// สาขาของ "ลังใหม่" จากรายการที่พนักงานคนนั้นถือ — รองรับ Picklist เบิกด่วนคนละสาขากับงานปกติ
// item.branch มีเฉพาะรายการเบิกด่วน (stamp ตอน import); รายการปกติไม่มี → นับเป็น metaBranch (Picklist ปกติ)
// ทุกรายการสาขาเดียว → ใช้สาขานั้น · ปนหลายสาขา/ไม่มีรายการ → fallback metaBranch (= พฤติกรรมเดิมเป๊ะ)
// ⚠ ใช้ใน createNewBox (flow ล็อก) — box.branch เป็น write-once สาขาสแกนรับได้เฉพาะลังที่สาขาตรง
export function resolveBoxBranch(packCatalog, metaBranch) {
  const fallback = metaBranch || null;
  const branches = [...new Set((packCatalog || []).map(c => c.branch ?? fallback))];
  return branches.length === 1 ? branches[0] : fallback;
}

// ชื่อ Picklist บนจอแพ็คต้องมาจาก "รายการที่พนักงานคนนี้ได้รับจริง"
// ไม่ใช่ catalogMeta ของไฟล์ปกติทั้งระบบ เพราะพนักงานเบิกด่วนอาจแพ็คให้คนละสาขา
export function resolvePackPicklistDisplay(packCatalog, catalogMeta) {
  const items = packCatalog || [];
  if (items.length === 0) return null;

  const urgentOnly = items.every(isUrgentItem);
  const normalOnly = items.every(item => !isUrgentItem(item));

  if (urgentOnly) {
    const branches = [...new Set(items.map(item => item.branch).filter(Boolean))];
    const branch = branches.length === 1 ? branches[0] : null;
    const urgentMeta = catalogMeta?.urgent;
    const matchingMeta = urgentMeta && (!branch || urgentMeta.branch === branch) ? urgentMeta : null;
    return {
      branch,
      urgent: true,
      mixed: branches.length > 1,
      label: matchingMeta?.fileName
        || (branch ? `Picklist_${branch}_เบิกด่วน` : 'Picklist_เบิกด่วน'),
      fileDate: matchingMeta?.fileDate || null,
    };
  }

  if (normalOnly) {
    const branch = catalogMeta?.branch || null;
    return {
      branch,
      urgent: false,
      mixed: false,
      label: branch ? `Picklist_${branch}` : 'Picklist',
      fileDate: catalogMeta?.fileDate || null,
    };
  }

  // Assignment ที่ปนงานปกติกับเบิกด่วนต้องไม่แอบอ้างชื่อไฟล์ปกติไฟล์เดียว
  return {
    branch: null,
    urgent: false,
    mixed: true,
    label: 'หลาย Picklist',
    fileDate: null,
  };
}

// เติมชื่อสินค้าจาก nameMap (R05.106 ColF) เมื่อ item ไม่มีชื่อ หรือชื่อเป็นเลข SKU
// (แถวเก่าที่ lookupByScan เดิม fallback เป็น sku ตอนสแกนสินค้านอก Picklist) — heal ตอน render ไม่แตะข้อมูลใน Firestore
// nameMap ว่าง (เช่นบน Android ที่ไม่ subscribe) → คืน object เดิมทั้ง reference = no-op สมบูรณ์
export const fixItemName = (l, nameMap) =>
  (!l.name || l.name === l.sku) && nameMap[l.sku] ? { ...l, name: nameMap[l.sku] } : l;

// ── สูตรร่วม "แพ็คไปแล้วเท่าไหร่" — ใช้ทั้ง checklist ต่อพนักงาน (buildPackItems) และภาพรวมทั้ง Picklist
//    (catalogPackStatus / popup 📋 ดูรายการ Picklist) — สูตรเดียวห้าม copy แยกชุด (กฎเดียวกับ lookupFactor) ──

// รวมยอดหน่วยฐานต่อ sku__unit จากลังที่ปิดแล้ว (closed/exported/received) — matchBox คุมขอบเขต (ต่อคน/ทุกคน)
// ลังเก่าที่ไม่มี gotBase → fallback (qty ?? got ?? 0) × factor(หน่วยของ item ในลัง)
function packedBaseOf({ boxes, itemsByBox, fOf, matchBox }) {
  const packedBase = {};
  boxes.forEach(b => {
    if (!matchBox(b)) return;
    if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
    (itemsByBox[b.id] || []).forEach(it => {
      const key = `${it.sku}__${it.unit}`;
      const base = it.gotBase ?? ((it.qty ?? it.got ?? 0) * fOf(it.sku, it.unit));
      packedBase[key] = (packedBase[key] || 0) + base;
    });
  });
  return packedBase;
}

// เดินหักแบบ "สะสม" ตามลำดับแถว catalog — ไม่ใช่หักเต็มก้อนจากทุกแถว → คืน [{ needFull, use }] ต่อแถว
// (บั๊กเดิม: SKU เดียวกันหลายแถว เช่น 3+1 แพ็คไป 1 → ทุกแถวโดนหัก 1 → เห็น 2+0 = 2 ทั้งที่เหลือจริง 3
//  เกิดได้ทั้ง Picklist มีแถวซ้ำ และเบิกด่วน append SKU ที่ซ้ำกับงานปกติของคนเดียวกัน)
// SKU แถวเดียว (เคสส่วนใหญ่) → ผลเท่าสูตรเดิมเป๊ะ: use = min(packed, needFull) แล้ว need = needFull − use
// ⚠ ข้อจำกัดที่รู้: packedBase ไม่แยกสาขา — คนเดียวแพ็ค SKU เดียวกันให้ 2 สาขาวันเดียวกัน ยอดหักปนกัน
function walkNeeds(catalog, packedBase, fOf) {
  const remaining = { ...packedBase };
  return catalog.map(c => {
    const key = `${c.sku}__${c.unit}`;
    const needFull = c.qty * fOf(c.sku, c.unit);
    const use = Math.min(remaining[key] || 0, needFull);
    remaining[key] = (remaining[key] || 0) - use;
    return { needFull, use };
  });
}

// สร้าง checklist ของพนักงาน 1 คน — need เป็น "หน่วยฐาน" หักของที่คนนั้นแพ็คไปแล้วในลังที่ปิด/ส่งออก/รับแล้ว
//   need = qty(picklist) × factor(หน่วย picklist) − Σ gotBase ที่พนักงานคนนี้แพ็คไปแล้ว
// ⚠ นี่คือสูตรที่หน้าแพ็ค (PackScanC) ใช้จริง และ __wh.audit เรียกตัวเดียวกันนี้เพื่อยืนยันเลขบนจอพนักงาน
//   — ถ้าแยกเป็น 2 ชุดเมื่อไหร่ audit จะโกหกทันทีที่สูตรเพี้ยนจากกัน ห้าม copy ไปไว้ที่อื่น
// หมายเหตุ edge case ที่ตั้งใจคงไว้ (พฤติกรรมเดิมตั้งแต่ก่อนย้ายมาที่นี่):
//   - matchBox `b.packer?.code === packer?.code` → ถ้า packer = null จะเทียบ undefined === undefined = true
//     ⇒ นับลังที่ไม่มี packer เป็นของตัวเอง (เท่าเงื่อนไข `!==` + return เดิมเป๊ะ)
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
  const packedBase = packedBaseOf({ boxes, itemsByBox, fOf, matchBox: b => b.packer?.code === packer?.code });
  const walked = walkNeeds(catalog, packedBase, fOf);
  return catalog
    .map((c, i) => ({
      sku: c.sku, barcode: c.barcode, name: c.name, unit: c.unit,
      need: walked[i].needFull - walked[i].use, got: 0, gotBase: 0,
      baseUnit: baseUnitOf(c.sku, c.unit),
      location: c.location || '',
    }))
    .filter(it => it.need > 0); // แพ็คครบแล้ว → หายจาก checklist
}

// ภาพรวมทั้ง Picklist มองรวม "ทุกพนักงาน" — ใช้ใน popup 📋 ดูรายการ Picklist (tab รายการเบิกสินค้า)
// คืน array ยาวเท่า catalog ตามลำดับแถวเดิม: { needFull, packed, done }
// done = แถวนี้ถูกแพ็คลง "ลังที่ปิดแล้ว" ครบจำนวน — ลัง open/สแกนค้างไม่นับ, แพ็คบางส่วนไม่นับ (สูตรเดียวกับ checklist)
export function catalogPackStatus({ catalog, boxes, itemsByBox, factorMap }) {
  const fOf = (sku, unit) => lookupFactor(factorMap, sku, unit);
  const packedBase = packedBaseOf({ boxes, itemsByBox, fOf, matchBox: () => true });
  return walkNeeds(catalog, packedBase, fOf).map(w => ({
    needFull: w.needFull, packed: w.use, done: w.needFull > 0 && w.use >= w.needFull,
  }));
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
