import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import SketchyBarcode from '../components/SketchyBarcode.jsx';
import { fixItemName, lookupFactor } from '../units.js';
import { branchLabel } from '../branches.js';
import { adjustPackedItem, buildLotRows, toBuddhistExpiry } from '../warehouseHelpers.js';

// reverse-lookup barcode → unit สำหรับ SKU นั้น (ใช้ใน edit mode เพื่ออัปเดต unit อัตโนมัติเมื่อสแกน barcode)
function lookupUnitByBarcode(barcodeMap, sku, barcode) {
  for (const [key, barcodes] of Object.entries(barcodeMap)) {
    const [keySku, keyUnit] = key.split('__');
    if (keySku === sku && Array.isArray(barcodes) && barcodes.includes(barcode)) {
      return keyUnit || null;
    }
  }
  return null;
}

// general scan lookup — รับ barcode หรือ SKU → คืน {sku, unit} หรือ null (ค้นใน barcodeMap ทุก entry)
// nameMap (R05.106 ColF) = แหล่งชื่อสำรองเมื่อ SKU ไม่อยู่ใน Picklist ปัจจุบัน — เดิม fallback เป็นเลข sku
// ทำให้ชื่อที่ "บันทึกลงลัง" กลายเป็นเลข ติดไปถึง Excel และจอสาขา ไม่ใช่แค่ที่แสดงผล
function lookupByScan(barcodeMap, catalog, val, nameMap = {}) {
  const v = val.trim();
  if (!v) return null;
  // 1) ตรงกับ SKU ใน catalog ตรงๆ
  const byCatalogSku = catalog.find(c => c.sku === v);
  if (byCatalogSku) return { sku: byCatalogSku.sku, unit: byCatalogSku.unit, name: byCatalogSku.name, location: byCatalogSku.location || '' };
  // 2) ค้น barcode ใน barcodeMap → ได้ sku__unit → lookup ชื่อจาก catalog → nameMap → เลข sku (ทางสุดท้าย)
  for (const [key, barcodes] of Object.entries(barcodeMap)) {
    if (Array.isArray(barcodes) && barcodes.includes(v)) {
      const [sku, unit] = key.split('__');
      const cat = catalog.find(c => c.sku === sku && c.unit === unit) || catalog.find(c => c.sku === sku);
      return { sku, unit: unit || cat?.unit || '', name: cat?.name || nameMap[sku] || sku, location: cat?.location || '' };
    }
  }
  return null;
}

// สถานะลังฝั่งรับสินค้า (สาขา) — แสดงเป็น badge ใน card
function receiveBadge(b) {
  if (b.status === 'received')
    // สีชมพูชุดเดียวกับ chip "สาขารับสินค้าแล้ว" ใน BoxList (ดูตาราง Status Badge Colors ใน CLAUDE.md) — ให้ตรงกันทุกหน้า
    return { label: 'สาขา: รับสินค้าแล้ว', bg: '#f5b8d4', border: '#c04080', color: '#c04080' };
  if (b.problemReported && !b.problemResolved)
    return b.problemType === 'incomplete'
      ? { label: 'สาขา: รอรีเช็ค', bg: '#fff3cd', border: '#e67e22', color: '#b86000' }
      : { label: 'สาขา: รอตรวจสอบ', bg: '#fde8e8', border: 'var(--red)', color: '#c0392b' };
  if (b.problemReported && b.problemResolved)
    return { label: 'คลังแก้ไขแล้ว · รอสาขาอนุมัติ', bg: '#e8f0d8', border: 'var(--green)', color: '#5a8a2a' };
  if (b.receivePending)
    return { label: 'สาขา: รอเภสัชอนุมัติ', bg: 'var(--accent-soft)', border: 'var(--accent)', color: 'var(--accent)' };
  if (b.receivingBy)
    return { label: 'สาขา: กำลังตรวจ', bg: '#fff3cd', border: '#e0a800', color: '#9a7a00' };
  return { label: 'สาขา: ยังไม่รับ', bg: '#f0ede8', border: 'var(--line)', color: 'var(--mute)' };
}

// ชื่อสาขา (branchLabel/BRANCH_NAMES) ย้ายไป branches.js แล้ว — ใช้ร่วมกับ BoxList (single source)
// ถังของลังที่ไม่มี box.branch ในตัวกรองสาขา
// ⚠ ลังพวกนี้ "สาขารับไม่ได้เลย" — BranchReceive กรอง b.branch === branch ตรงๆ (ตั้งใจ ตั้งแต่ commit 2a23385
//   กันลังสาขาหนึ่งไปโผล่อีกสาขา) → null ไม่ match สาขาไหนทั้งนั้น และ box.branch แก้ย้อนหลังไม่ได้
//   (set ครั้งเดียวใน createNewBox) → หน้า Outbound คือที่เดียวที่ลังพวกนี้โผล่ ห้ามให้ตัวกรองกลบ
// lowercase ชนกับ code จริงไม่ได้ เพราะ extractBranch() uppercase เสมอ
const NO_BRANCH = '__none';
// ราคาทุน × markup เฉพาะบางสาขา (key = box.branch = suffix ของ Picklist_XXX, uppercase) — ใช้เฉพาะคอลัมน์ทุนในไฟล์ Text
// สาขาที่ไม่มี key → markup 1 (ค่าทุนเดิมไม่เปลี่ยน); เพิ่มสาขาใหม่แก้ที่นี่จุดเดียว
const COST_MARKUP = { WRD: 1.013, ONN: 1.013 };

// เนื้อหาสติกเกอร์ติดลัง (ดีไซน์ "ป้ายพัสดุ FROM/TO" + เลขที่เอกสารตัวใหญ่) — 90×65mm
// ใช้ร่วมทั้ง preview บนจอ (.print-label) และตัวพิมพ์จริง (.print-only-label portal) → เนื้อหาตรงกันเป๊ะ ไม่ drift
// วันที่ = วันที่กดพิมพ์ (new Date) ตามที่ตกลง — ระบบไม่ได้เก็บ approvedAt เพื่อไม่แตะ flow อนุมัติที่ล็อกไว้
function StickerLabel({ box }) {
  // เลขที่เอกสาร: blank จนกว่าจะกรอก + กดอนุมัติเอกสาร (ตอนนั้น box.pos ถูก set พร้อม status='exported')
  const doc = box.pos && box.pos !== '—' ? box.pos : '';
  const printDate = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const tag = { fontSize: 8, fontWeight: 800, background: '#000', color: '#fff', padding: '1px 6px', borderRadius: 3 };
  const kLabel = { fontSize: 9, fontWeight: 700, color: '#555', letterSpacing: '.3px' };
  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      padding: '5mm', background: 'white', color: '#000',
      fontFamily: 'system-ui, Tahoma, sans-serif',
      display: 'flex', flexDirection: 'column', gap: '2.5mm',
    }}>
      {/* แถวเลขที่เอกสาร (ตัวใหญ่สุด) + วันที่อนุมัติ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={kLabel}>เลขที่เอกสาร</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 800, lineHeight: 1, minHeight: 16, whiteSpace: 'nowrap' }}>{doc}</div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto', paddingLeft: 8 }}>
          <div style={kLabel}>วันที่อนุมัติ</div>
          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{printDate}</div>
        </div>
      </div>

      {/* กล่อง จาก (คลังสินค้า) / ถึง (สาขา — กรอบหนากว่า) */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, border: '1.5px solid #000', borderRadius: 5, padding: '5px 7px', minWidth: 0 }}>
          <span style={tag}>จาก · FROM</span>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>คลังสินค้า</div>
          {box.packer && <div style={{ fontSize: 10, color: '#333' }}>แพ็คโดย {box.packer.name}</div>}
        </div>
        <div style={{ flex: 1, border: '2.5px solid #000', borderRadius: 5, padding: '5px 7px', minWidth: 0 }}>
          <span style={tag}>ถึง · TO</span>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{branchLabel(box.branch)}</div>
          {box.branch && <div style={{ fontSize: 10, color: '#333' }}>({box.branch})</div>}
        </div>
      </div>

      {/* barcode เต็มความกว้าง (displayValue โชว์ box.id ใต้บาร์อยู่แล้ว) + หมายเหตุ (box.note) — โชว์ตลอดแม้ไม่มีข้อความ */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <SketchyBarcode value={box.id} width={300} height={46} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, marginTop: 2, wordBreak: 'break-word' }}>
          หมายเหตุ: {box.note || ''}
        </div>
      </div>
    </div>
  );
}

export default function BoxClosedLabel({ boxes, setBoxes, activeBoxId, setActiveBoxId, setTab, showToast, createNewBox, itemsByBox, setItemsByBox, triggerDownload, deleteBox, costMap = {}, lotMap = {}, barcodeMap = {}, nameMap = {}, factorMap = {}, catalog = [] }) {
  const closedBoxes = boxes.filter(b => b.status === 'closed' || b.status === 'exported' || b.status === 'received');

  const [selectedId, setSelectedId] = useState(() => {
    // เลือก activeBoxId เฉพาะเมื่อเป็นลังที่ปิดแล้วจริง — หลังปิดลัง activeBoxId คือลังใหม่ที่ยัง open
    if (activeBoxId && closedBoxes.find(b => b.id === activeBoxId)) return activeBoxId;
    if (closedBoxes.length > 0) return closedBoxes[0].id;
    return null;
  });
  const [globalSearch, setGlobalSearch] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [outboundFilter, setOutboundFilter] = useState('all'); // all | pending | approved
  const [packerFilter, setPackerFilter] = useState('all');     // all | packer.code
  // all | box.branch | NO_BRANCH — ไม่ persist (เหมือน filter อีก 2 ตัว): ถ้าจำค่าไว้ พนักงานเปิดจอ
  // เช้าวันถัดไปจะเจอมุมมองสาขาเดียวค้างจากเมื่อวาน แล้วแจ้งว่า "ลังหาย"
  const [branchFilter, setBranchFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // boxId รอยืนยันลบ (ยกเลิกรายการเบิก) — null = ไม่แสดง dialog
  const [editMode, setEditMode]     = useState(false);          // แก้ไขตารางรายชื่อสินค้าในลัง
  const [editItems, setEditItems]   = useState([]);             // สำเนา boxItems สำหรับแก้ไข (ออกจาก editMode = ทิ้ง)
  const [problemEditing, setProblemEditing] = useState(false);  // ลังมีปัญหา: กด "แก้ไขรายการสินค้า" → เด้งไปตารางเต็ม (edit mode) ก่อน ยังไม่ resolve
  const [addScan, setAddScan]       = useState('');             // barcode input สำหรับเพิ่มสินค้าใหม่ใน edit mode
  const [addScanErr, setAddScanErr] = useState('');
  const [boxNote, setBoxNote]       = useState('');             // หมายเหตุต่อลัง — sync กับ box.note ใน Firestore

  // อนุมัติแล้ว = exported/received, รออนุมัติ = closed (ยังไม่ส่ง POS)
  const isApproved = (b) => b.status === 'exported' || b.status === 'received';
  // รายชื่อพนักงานแพ็คที่มีลังจริง (unique by code)
  // ⚠ derive จาก closedBoxes ไม่ใช่ branchBoxes โดยตั้งใจ — ไม่งั้นชิปพนักงานหาย ๆ โผล่ ๆ ตามสาขาที่กรอง
  //   อ่านเหมือน "ลังของพนักงานคนนี้หายไป" ซึ่งเป็นสิ่งที่ตัวกรองนี้พยายามเลี่ยงที่สุด
  const packers = [...new Map(closedBoxes.filter(b => b.packer?.code).map(b => [b.packer.code, b.packer])).values()]
    .sort((a, b) => a.code.localeCompare(b.code));

  // ── ตัวกรองสาขา (ชั้นแรกสุด: closedBoxes → branchBoxes → packerBoxes → visibleBoxes) ──
  // นับจาก data จริง ไม่ใช่ BRANCH_NAMES — code ที่ไม่รู้จัก (เช่น SRC2 จากชื่อไฟล์เพี้ยน) ต้องโผล่ด้วย
  const branchCounts = closedBoxes.reduce((m, b) => {
    const k = b.branch || NO_BRANCH;
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  const branchOpts = Object.keys(branchCounts).filter(k => k !== NO_BRANCH).sort();
  const untaggedN = branchCounts[NO_BRANCH] || 0;
  // เข้มงวด: ลัง untagged ไม่ leak เข้ามุมมองสาขาใด ๆ — ให้ตรงกับ matchBranch ฝั่ง receive (2a23385)
  const branchBoxes = closedBoxes.filter(b =>
    branchFilter === 'all' ? true
    : branchFilter === NO_BRANCH ? !b.branch
    : b.branch === branchFilter
  );

  // กรองตามพนักงานต่อ → ใช้คำนวณ count ของ filter สถานะ (จึง scope ตามสาขาที่เลือกไปด้วย)
  const packerBoxes = branchBoxes.filter(b => packerFilter === 'all' || b.packer?.code === packerFilter);
  const pendingN = packerBoxes.filter(b => !isApproved(b)).length;
  const approvedN = packerBoxes.filter(isApproved).length;
  // ลังที่เภสัชแจ้งปัญหา (problemReviewed=true จาก pharmacist recheck-fail หรือหัวหน้ากด "แจ้งคลังสินค้า")
  const hasProblem = (b) => b.problemReviewed && !b.problemResolved;
  const problemN = packerBoxes.filter(hasProblem).length;
  const visibleBoxes = packerBoxes
    .filter(b =>
      outboundFilter === 'approved' ? isApproved(b)
      : outboundFilter === 'pending' ? !isApproved(b)
      : outboundFilter === 'problem' ? hasProblem(b)
      : true
    )
    .sort((a, b) => a.id.localeCompare(b.id)); // เรียงเลขที่ลังน้อย→มาก

  const activeBox = boxes.find(b => b.id === selectedId) || null;
  // heal ชื่อที่เป็นเลข SKU (แถวเก่าจาก lookupByScan เดิม) ด้วย nameMap ตั้งแต่จุด derive — ตาราง/edit/Excel ได้ชื่อครบโดยไม่ต้องแตะข้อมูล
  const boxItems = (selectedId ? (itemsByBox?.[selectedId] || []) : []).map(l => fixItemName(l, nameMap));

  const resetFilters = () => { setBranchFilter('all'); setPackerFilter('all'); setOutboundFilter('all'); };

  // global search across all closed boxes
  const searchResults = globalSearch.trim()
    ? closedBoxes.flatMap(b => {
        const items = (itemsByBox?.[b.id] || []).map(l => fixItemName(l, nameMap));
        return items
          .filter(l =>
            l.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
            l.sku.toLowerCase().includes(globalSearch.toLowerCase())
          )
          .map(l => ({ ...l, boxId: b.id, packer: b.packer }));
      })
    : [];
  const isSearching = globalSearch.trim().length > 0;

  // ลังที่เลือกอยู่ถูกตัวกรองซ่อนจากรายการซ้าย แต่แผงขวายังโชว์อยู่ พร้อมปุ่มอนุมัติที่กดได้
  // → เสี่ยงอนุมัติผิดลัง เตือนให้ชัดตรงจุดที่จะกด (ผู้ใช้เลือก: เตือนแดง แต่ยังกดได้ ไม่ปิดปุ่ม)
  // เกิดได้เพราะ activeBox หาจาก `boxes` ที่ยังไม่กรอง (ดูบรรทัด const activeBox)
  // ⚠ ห้าม auto-deselect (แผงที่กำลังทำงานอยู่ว่างเปล่า = "ลังหาย" ของจริง) และห้าม auto-select ตัวแรก
  //   (selection ขยับเองตอนคนกำลังจะกดอนุมัติ = อันตรายกว่าเดิม) — เตือนแล้วให้คนตัดสินใจเอง
  // quirk นี้มีอยู่เดิมกับ packerFilter/outboundFilter อยู่แล้ว แถบนี้เลยแก้ให้ทั้งหมดไปพร้อมกัน
  // ⚠ ต้องอยู่หลัง isSearching/visibleBoxes/activeBox เสมอ — const อยู่ใน TDZ ถ้าย้ายขึ้นไปจะ ReferenceError ตอนรัน
  const selectedHidden = !!activeBox && !isSearching && !visibleBoxes.some(b => b.id === activeBox.id);
  // gridColumn '1 / -1' จำเป็น — arm ปกติของแผงขวาเป็น grid '1fr 380px' ถ้าไม่ใส่แถบจะไปแทรกในคอลัมน์ 1fr
  const hiddenBanner = selectedHidden ? (
    <div style={{
      gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      marginBottom: 12, padding: '8px 12px', borderRadius: 8,
      background: '#fde8e8', border: '1.5px solid var(--red)',
      fontFamily: 'JetBrains Mono', fontSize: 12, color: '#c0392b', fontWeight: 700,
    }}>
      ⚠ ลัง {activeBox.id} ({branchLabel(activeBox.branch)}) ไม่อยู่ในตัวกรองที่เลือกอยู่ — ตรวจสอบก่อนอนุมัติ
      <button className="btn sm ghost" onClick={resetFilters}>แสดงทุกลัง</button>
    </div>
  ) : null;

  function handleExportBarcode() {
    if (!activeBox) return;
    if (activeBox.status !== 'closed' && activeBox.status !== 'exported') {
      showToast('⚠ ไม่สามารถส่งออกได้', 'error');
      return;
    }
    if (activeBox.textExported) {
      showToast('⚠ ลังนี้ส่งออกไฟล์ Text แล้ว · กด Clear เริ่มวันถัดไปเพื่อส่งใหม่', 'error');
      return;
    }
    if (boxItems.length === 0) { showToast('⚠ ไม่มีรายการสินค้าในลังนี้'); return; }
    // บางสาขา (WRD/ONN) ส่งออกทุน × markup — สาขาอื่น markup=1 ค่าเดิม byte-identical
    const markup = COST_MARKUP[String(activeBox.branch || '').toUpperCase()] || 1;
    const lines = boxItems.flatMap(l =>
      // โครงสร้าง POS: barcode TAB qty TAB cost + 6 TAB + lot TAB exp — exp แปลง ค.ศ.→พ.ศ. ตอนนี้
      // ทุน = costMap[sku__หน่วยที่สแกนจริง] (เช่นสแกนกล่อง → ทุนต่อกล่อง) ไม่ใช่หน่วย picklist
      buildLotRows(l, lotMap).map(r => {
        const rawCost = costMap[`${l.sku}__${r.unit || l.unit}`] ?? 0;
        const cost = markup === 1 ? rawCost : Math.round(rawCost * markup * 100) / 100; // ปัด 2 ตำแหน่ง (เงิน)
        return `${r.barcode}\t${r.qty}\t${cost}\t\t\t\t\t\t${r.lot}\t${toBuddhistExpiry(r.exp)}`;
      })
    );
    triggerDownload(lines.join('\n'), `${activeBox.id}.txt`, 'text/plain');
    // mark ว่าลังนี้ส่งออก Text แล้ว — disable ปุ่มจนกว่าจะกด Clear (clearBoxes ลบ box → flag หาย)
    setBoxes(prev => prev.map(b => b.id === activeBox.id ? { ...b, textExported: true } : b));
    showToast(`ส่งออก ${lines.length} รายการ ✓`);
  }

  function handlePrint() {
    if (!activeBox) return;
    if (activeBox.status !== 'exported') {
      showToast('⚠ กรุณากรอกเลขที่เอกสารและอนุมัติเอกสารก่อน', 'error');
      return;
    }
    window.print();
  }

  function handleSendPOS() {
    if (!activeBox) return;
    if (!activeBox.textExported) {
      showToast('⚠ กรุณาอัปโหลดไฟล์ Text ก่อน', 'error');
      return;
    }
    if (!docNumber.trim()) {
      showToast('⚠ กรุณากรอกเลขที่เอกสาร', 'error');
      return;
    }
    setBoxes(prev => prev.map(b =>
      b.id === activeBox.id ? { ...b, status: 'exported', pos: docNumber.trim() } : b
    ));
    setDocNumber('');
    showToast('อนุมัติแล้ว ✓', 'success');
  }

  // แก้ไขจำนวนสินค้าในลังที่มีปัญหา (+/-)
  function adjustQty(rowIndex, delta) {
    if (!activeBox) return;
    const items = itemsByBox?.[activeBox.id] || [];
    const next = adjustPackedItem(items, rowIndex, delta, factorMap);
    setItemsByBox(prev => ({ ...prev, [activeBox.id]: next }));
  }

  // แก้ไข/อนุมัติ → ปิดสถานะปัญหา + อัปเดต skuCount/totalQty (แจ้งกลับหน้ารับสินค้า)
  function resolveProblem() {
    if (!activeBox) return;
    const items = itemsByBox?.[activeBox.id] || [];
    const totalQty = items.reduce((s, l) => s + (l.qty ?? l.got ?? 0), 0);
    const skuCount = items.filter(l => (l.qty ?? l.got ?? 0) > 0).length;
    setBoxes(prev => prev.map(b => b.id === activeBox.id ? { ...b, problemResolved: true, skuCount, totalQty } : b));
    showToast(`แก้ไข ${activeBox.id} เรียบร้อย ✓ · แจ้งกลับหน้ารับสินค้า`, 'success');
  }

  function handleExportItems() {
    if (closedBoxes.length === 0) { showToast('⚠ ไม่มีลังที่ปิดแล้ว', 'error'); return; }
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const headers = ['เลขที่ลังสินค้า', 'เลขที่เอกสาร', 'SKU', 'ชื่อสินค้า', 'Barcode', 'หน่วย', 'จำนวน', 'พนักงานแพ็คสินค้า', 'วันที่ส่งสินค้า'];
    const dataRows = closedBoxes.flatMap(b =>
      // แตกแถวตาม (LOT + หน่วย) ด้วย buildLotRows — SKU เดียวสแกนปนหน่วย (แพ็ค + ลัง) แยกคนละแถว บาร์โค้ด/จำนวน/หน่วยของตัวเอง
      (itemsByBox?.[b.id] || []).map(l => fixItemName(l, nameMap)).flatMap(l =>
        buildLotRows(l, lotMap).map(r => [
          b.id,
          b.pos && b.pos !== '—' ? b.pos : '',
          l.sku,
          l.name,
          r.barcode || '',
          r.unit || l.unit,
          r.qty,
          b.packer?.name || '',
          dateStr,
        ])
      )
    );
    if (dataRows.length === 0) { showToast('⚠ ไม่มีรายการสินค้าในลังทั้งหมด', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws['!cols'] = [14, 13, 11, 36, 16, 8, 8, 16, 13].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายการสินค้า');
    XLSX.writeFile(wb, `all_boxes_${dateStr.replace(/\//g, '-')}.xlsx`);
    showToast(`ส่งออก ${dataRows.length} รายการ ✓`, 'success');
  }

  function jumpToBox(boxId) {
    setDocNumber('');
    setSelectedId(boxId);
    setActiveBoxId(boxId);
    setGlobalSearch('');
  }

  // ลบลัง — กรณียกเลิกรายการเบิก เฉพาะลังที่ยังไม่ถึงสาขา (closed/exported); ห้ามลบลังที่ received (เสีย audit trail การรับสินค้า)
  const deletingBox = confirmDeleteId ? boxes.find(b => b.id === confirmDeleteId) || null : null;
  function requestDelete(boxId) {
    setConfirmDeleteId(boxId);
  }
  function confirmDelete() {
    if (!confirmDeleteId) return;
    deleteBox(confirmDeleteId);
    if (selectedId === confirmDeleteId) setSelectedId(null);
    if (activeBoxId === confirmDeleteId) setActiveBoxId(null);
    showToast(`ลบลัง ${confirmDeleteId} แล้ว`, 'success');
    setConfirmDeleteId(null);
  }

  // reset state เมื่อเปลี่ยนลัง
  useEffect(() => {
    setEditMode(false); setEditItems([]); setAddScan(''); setAddScanErr(''); setProblemEditing(false);
    setBoxNote(boxes.find(b => b.id === selectedId)?.note || '');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // บันทึก Note ต่อลัง → box.note (sync Firestore) → โชว์บนสติกเกอร์ (StickerLabel อ่าน box.note)
  function saveBoxNote() {
    if (!selectedId) return;
    const trimmed = boxNote.trim();
    const current = boxes.find(b => b.id === selectedId)?.note || '';
    if (trimmed === current) return;
    setBoxes(prev => prev.map(b => b.id === selectedId ? { ...b, note: trimmed } : b));
  }

  function startEdit() {
    setEditItems(boxItems.map(it => ({ ...it })));
    setAddScan(''); setAddScanErr('');
    setEditMode(true);
  }

  function handleAddByScan(e) {
    if (e.key !== 'Enter') return;
    const val = addScan.trim();
    if (!val) return;
    const found = lookupByScan(barcodeMap, catalog, val, nameMap);
    if (!found) {
      setAddScanErr(`⚠ ไม่พบ "${val}" ใน Catalog / R05.106`);
      return;
    }
    setAddScanErr('');
    setAddScan('');
    const existIdx = editItems.findIndex(it => it.sku === found.sku && (it.unit || '') === (found.unit || ''));
    if (existIdx >= 0) {
      // SKU+unit มีอยู่แล้ว → เพิ่ม qty +1
      setEditItems(prev => prev.map((x, i) =>
        i === existIdx ? { ...x, qty: (x.qty ?? x.got ?? 0) + 1, got: (x.got ?? 0) + 1 } : x
      ));
      showToast(`${found.name} +1 ชิ้น`, 'success');
    } else {
      // SKU ใหม่ → เพิ่มแถว
      setEditItems(prev => [...prev, {
        sku: found.sku, name: found.name, unit: found.unit,
        barcode: val, scannedBarcode: val,
        scannedUnit: found.unit, // หน่วยของบาร์โค้ดที่ยิง — handleSaveEdit ใช้คิด gotBase (ไม่มี = ถูกคิดเป็น factor 1)
        qty: 1, got: 1, lot: '', exp: '', location: found.location,
        scannedLots: null,
      }]);
      showToast(`เพิ่ม ${found.name} ✓`, 'success');
    }
  }

  // แถวที่ "สแกนปนหน่วย" — scannedLots มี unit มากกว่า 1 แบบ (เช่น picklist โหล: สแกน 1 โหล + 12 ชิ้น)
  // qty ของแถวแบบนี้ = จำนวนครั้งที่สแกนรวมทุกหน่วย (13) ไม่ใช่จำนวนของหน่วยเดียว → qty × factor ใช้ไม่ได้
  const distinctScanUnits = (it) => new Set((it.scannedLots || []).map(e => e.unit).filter(Boolean)).size;

  // ⚠ qty ของแถว = "จำนวนครั้งที่สแกน" (doClose เก็บ qty: it.got) → ต้องคูณด้วย factor ของ **หน่วยบาร์โค้ดที่ยิงจริง**
  // (scannedUnit) ไม่ใช่ it.unit ซึ่งเป็น "หน่วย Picklist" — คนละเรื่องกัน และมักไม่มีบาร์โค้ดด้วยซ้ำ
  // เช่น picklist "3ลัง" แต่พนักงานยิงบาร์โค้ด "ลัง" 60 ครั้ง → 60 × factor(ลัง)=10 = 600 ✅
  //                                          ถ้าใช้ it.unit → 60 × factor(3ลัง)=30 = 1800 ❌ ผิด 3 เท่า
  // ลังเก่าที่ไม่มี scannedUnit → factor 1 (ตรงกับ convention ที่ PackScanC ใช้: `it.scannedUnit ? factorOf(...) : 1`)
  const countedBase = (it) => (it.qty ?? it.got ?? 0) * (it.scannedUnit ? lookupFactor(factorMap, it.sku, it.scannedUnit) : 1);

  function handleSaveEdit() {
    if (!selectedId) return;
    // clear scannedLots — view mode ใช้ buildLotRows() ซึ่งจะอ่าน qty จาก scannedLots[].qty ก่อน (ไม่ใช่ l.qty)
    // การล้าง scannedLots ทำให้ view mode ใช้ fallback path (l.qty / l.lot / l.exp) ที่ผู้ใช้เพิ่งแก้ไขไว้
    //
    // ⚠ ต้องคำนวณ gotBase ใหม่ด้วย — ฝั่งสาขาอ่าน getNeeded = gotBase ?? qty ?? got (เอา gotBase ก่อนเสมอ)
    // ไม่อัปเดต = แก้จำนวนที่นี่แล้วสาขายังเห็นเลขเดิม (บั๊กเดิม แก้ลังมีปัญหาไปก็ไม่ถึงสาขา)
    // คำนวณจาก countedBase (qty × factor ของ "หน่วยบาร์โค้ดที่ยิงจริง") → แถวที่ไม่ได้แก้จะได้ค่าเดิมเป๊ะ
    // ⚠ ระบบ "เดาแทนคนไม่ได้" ว่าในลังมีของเท่าไหร่ — ถ้าจำนวนที่สแกนไว้ผิด ต้องมีคนนับของจริงแล้วแก้ qty
    //   (ยิงบาร์โค้ดหน่วยที่นับในช่อง Barcode ของแถว แล้วพิมพ์จำนวน) การกดแก้ไข→อนุมัติเฉย ๆ ไม่เปลี่ยนอะไร
    const mixed = editItems.filter(it => (it.qty ?? it.got ?? 0) > 0 && distinctScanUnits(it) > 1);
    const newItems = editItems
      .filter(it => (it.qty ?? it.got ?? 0) > 0)
      .map(it => ({
        ...it,
        // ปนหน่วย → คงค่าเดิม (qty รวมหลายหน่วย คำนวณใหม่จะได้ค่าผิด) แล้วเตือนให้คนตรวจเอง
        gotBase: distinctScanUnits(it) > 1 ? it.gotBase : countedBase(it),
        scannedLots: null,
      }));
    if (mixed.length > 0) {
      showToast(`⚠ ${mixed.length} รายการสแกนปนหน่วย — ไม่ได้คำนวณหน่วยฐานใหม่ ตรวจสอบเอง`, 'warn');
    }
    const newTotalQty = newItems.reduce((s, it) => s + (it.qty ?? it.got ?? 0), 0);
    const newSkuCount = newItems.length;
    setItemsByBox(prev => ({ ...prev, [selectedId]: newItems }));
    setBoxes(prev => prev.map(b =>
      b.id === selectedId ? { ...b, totalQty: newTotalQty, skuCount: newSkuCount } : b
    ));
    setEditMode(false);
    setEditItems([]);
    showToast('บันทึกการแก้ไขแล้ว ✓', 'success');
  }

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 480 }}>
      <div className="frame-header">
        <div className="row">
          <span className="title">เลขที่ลัง</span>
          {activeBox && !isSearching && <span className="chip ok" style={{ marginLeft: 10 }}>✓ {activeBox.id}</span>}
          <div className="spacer" />
          <input
            className="input"
            placeholder="🔍 ค้นหาสินค้าทุกลัง"
            style={{ width: 240 }}
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
          />
          {isSearching && (
            <button className="btn sm ghost" style={{ marginLeft: 6 }} onClick={() => setGlobalSearch('')}>× ล้าง</button>
          )}
          <button
            className="btn sm"
            style={{ marginLeft: 8, opacity: closedBoxes.length > 0 ? 1 : 0.45, cursor: closedBoxes.length > 0 ? 'pointer' : 'not-allowed', background: 'var(--accent)', color: 'white', border: '1.5px solid black' }}
            onClick={handleExportItems}
          >⇩ ส่งออกรายการลังทั้งหมด</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', minHeight: 460 }}>

        {/* LEFT: box list — grid 3 คอลัมน์ การ์ดใหญ่ขึ้น */}
        <div style={{
          borderRight: '1.5px solid var(--line)',
          padding: '14px 10px',
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignContent: 'start',
          overflowY: 'auto', maxHeight: 600,
          background: 'var(--paper-dark)',
        }}>
          {/* แถวสาขา — อยู่บนสุดเพราะเป็น scope กว้างสุด และอธิบายว่าทำไมตัวเลขแถวสถานะข้างล่างขยับ
              ⚠ ทุกชิปต้องมีจำนวน (ต่างจากชิปพนักงานที่ไม่มี) — ให้พนักงานบวกเลขเองได้ว่าเท่ากับ "ทุกสาขา"
                 = พิสูจน์ด้วยตาว่าไม่มีลังตกอยู่นอกถังไหน โดยไม่ต้องคลิกดูทีละอัน */}
          {closedBoxes.length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mute)' }}>สาขา:</span>
              {[
                { k: 'all', label: 'ทุกสาขา', n: closedBoxes.length },
                ...branchOpts.map(c => ({ k: c, label: branchLabel(c), n: branchCounts[c] })),
                // ถังลังไม่ระบุสาขา — โผล่ตลอดเมื่อมี ไม่ว่าจะเลือกตัวกรองไหนอยู่ (ลังพวกนี้สาขารับไม่ได้ ต้องเห็น)
                ...(untaggedN > 0 ? [{ k: NO_BRANCH, label: '⚠ ไม่ระบุสาขา', n: untaggedN, accentColor: 'var(--red)' }] : []),
              ].map(f => {
                const on = branchFilter === f.k;
                const color = f.accentColor || 'var(--accent)';
                return (
                  <button
                    key={f.k}
                    onClick={() => setBranchFilter(f.k)}
                    style={{
                      padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${on ? color : 'var(--line)'}`,
                      background: on ? color : 'white',
                      color: on ? 'white' : (f.accentColor ? color : 'var(--ink)'),
                      fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: on ? 700 : 400,
                    }}
                  >{f.label} ({f.n})</button>
                );
              })}
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            {[
              { k: 'all', label: 'ทั้งหมด', n: packerBoxes.length },
              { k: 'pending', label: 'รออนุมัติ', n: pendingN },
              { k: 'approved', label: 'อนุมัติแล้ว', n: approvedN },
              { k: 'problem', label: '🔴 แจ้งปัญหา', n: problemN, accentColor: 'var(--red)' },
            ].map(f => {
              const on = outboundFilter === f.k;
              const color = f.accentColor || 'var(--accent)';
              return (
                <button
                  key={f.k}
                  onClick={() => setOutboundFilter(f.k)}
                  style={{
                    padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1.5px solid ${on ? color : 'var(--line)'}`,
                    background: on ? color : 'white',
                    color: on ? 'white' : (f.accentColor && f.n > 0 ? color : 'var(--ink)'),
                    fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: on ? 700 : 400,
                  }}
                >{f.label} ({f.n})</button>
              );
            })}
          </div>
          {packers.length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mute)' }}>แพ็คโดย:</span>
              {[{ code: 'all', name: 'ทุกคน' }, ...packers].map(p => {
                const on = packerFilter === p.code;
                return (
                  <button
                    key={p.code}
                    onClick={() => setPackerFilter(p.code)}
                    style={{
                      padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                      background: on ? 'var(--accent)' : 'white',
                      color: on ? 'white' : 'var(--ink)',
                      fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: on ? 700 : 400,
                    }}
                  >{p.name}</button>
                );
              })}
            </div>
          )}
          {visibleBoxes.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--mute)', textAlign: 'center', marginTop: 20 }}>
              {/* "ไม่มีลังในกลุ่มนี้" เฉยๆ คือสิ่งที่ทำให้คนคิดว่าลังหาย — บอกจำนวนที่ถูกซ่อน + ให้กดกลับได้ในคลิกเดียว */}
              {closedBoxes.length === 0 ? 'ยังไม่มีลังที่ปิด' : (
                <>
                  ไม่มีลังในกลุ่มนี้ ({closedBoxes.length} ลังถูกซ่อนโดยตัวกรอง)
                  <div style={{ marginTop: 8 }}>
                    <button className="btn sm ghost" onClick={resetFilters}>× ล้างตัวกรอง</button>
                  </div>
                </>
              )}
            </div>
          )}
          {visibleBoxes.map(b => {
            const active = b.id === selectedId && !isSearching;
            const hasProblem = b.problemReviewed && !b.problemResolved;
            return (
              <button
                key={b.id}
                onClick={() => { setSelectedId(b.id); setGlobalSearch(''); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '12px 8px', gap: 5, minWidth: 0,
                  border: `2px solid ${hasProblem ? 'var(--red)' : active ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 12,
                  background: hasProblem ? '#fde8e8' : active ? 'var(--accent-soft)' : 'white',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 30 }}>📦</div>
                <div style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink)', textAlign: 'center', lineHeight: 1.1 }}>
                  {b.id}
                </div>
                {b.pos && b.pos !== '—' && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textAlign: 'center', wordBreak: 'break-all' }}>{b.pos}</div>
                )}
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--mute)', textAlign: 'center' }}>
                  {b.skuCount ?? 0} SKU · {b.totalQty ?? 0} ชิ้น
                </div>
                {b.packer && (
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--mute)', textAlign: 'center' }}>
                    {b.packer.name}
                  </div>
                )}
                {/* เฉพาะลังที่ไม่มีสาขา — ไม่ใส่ชิปสาขาให้ลังปกติ (การ์ดแน่นอยู่แล้วใน grid 3 คอลัมน์ 440px
                    และข้อมูลซ้ำกับแถวชิป+สติกเกอร์) ลังพวกนี้สาขาสแกนรับไม่ได้เลย → ต้องสะดุดตาในมุมมอง "ทุกสาขา" */}
                {!b.branch && (
                  <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fde8e8', borderColor: 'var(--red)', color: '#c0392b', fontWeight: 700 }}>
                    ⚠ ไม่ระบุสาขา
                  </span>
                )}
                {hasProblem ? (
                  <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: 'var(--red)', borderColor: 'var(--red)', color: 'white', fontWeight: 700 }}>คลัง: แจ้งปัญหา</span>
                ) : isApproved(b)
                  ? <span className="chip ok" style={{ fontSize: 10, padding: '2px 8px' }}>คลัง: อนุมัติแล้ว</span>
                  : <span className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>คลัง: รออนุมัติ</span>
                }
                {(() => {
                  const rb = receiveBadge(b);
                  return (
                    <span className="chip" style={{ fontSize: 9, padding: '1px 6px', background: rb.bg, borderColor: rb.border, color: rb.color, fontWeight: 700, marginTop: 1, whiteSpace: 'normal', textAlign: 'center', maxWidth: '100%', lineHeight: 1.2 }}>{rb.label}</span>
                  );
                })()}
              </button>
            );
          })}
        </div>

        {/* RIGHT: search results OR label detail */}
        {isSearching ? (
          <div style={{ padding: 20, overflowY: 'auto' }}>
            <div className="hand" style={{ fontSize: 20, marginBottom: 12 }}>
              ผลการค้นหา "{globalSearch}" — {searchResults.length} รายการ
            </div>
            {searchResults.length === 0 ? (
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15, color: 'var(--mute)' }}>
                ไม่พบสินค้าในลังที่ปิดแล้ว
              </div>
            ) : (
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 450, overflowY: 'auto', background: 'white' }}>
                <table className="tbl" style={{ fontSize: 14 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>ลัง</th>
                      <th>SKU / ชื่อสินค้า</th>
                      <th style={{ width: 70 }}>หน่วย</th>
                      <th style={{ width: 60, textAlign: 'center' }}>จำนวน</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((l, i) => (
                      <tr key={`${l.boxId}-${l.sku}-${i}`}>
                        <td>
                          <span style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{l.boxId}</span>
                          {l.packer && <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mute)' }}>{l.packer.name}</div>}
                        </td>
                        <td>
                          <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15 }}>{l.name}</div>
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono' }}>{l.scannedUnit || l.unit}</td>
                        <td style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                          ×{l.qty ?? l.got ?? 0}
                        </td>
                        <td>
                          <button className="btn sm ghost" onClick={() => jumpToBox(l.boxId)}>ดูลัง →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeBox && activeBox.problemReviewed && !activeBox.problemResolved && !problemEditing ? (
          <div style={{ padding: 20 }}>
            {hiddenBanner}
            <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <b className="hand" style={{ fontSize: 22, color: 'var(--red)' }}>🔴 แก้ไขสินค้าที่มีปัญหา · {activeBox.id}</b>
              {activeBox.problemBy && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--mute)' }}>
                  แจ้งโดย: {activeBox.problemBy.name}{activeBox.problemAt ? ` · ${activeBox.problemAt}` : ''}
                </span>
              )}
              <div className="spacer" />
              {(activeBox.status === 'closed' || activeBox.status === 'exported') && (
                <button
                  className="btn sm"
                  style={{ background: 'var(--red)', color: 'white', borderColor: 'var(--red)' }}
                  onClick={() => requestDelete(activeBox.id)}
                >🗑 ลบลังนี้</button>
              )}
            </div>

            {activeBox.problemNote && (
              <div style={{ marginBottom: 12, padding: '10px 14px', border: '1.5px solid var(--red)', borderRadius: 10, background: '#fde8e8', fontFamily: 'JetBrains Mono', fontSize: 14, color: '#c0392b' }}>
                📝 {activeBox.problemNote}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: activeBox.problemImage ? '1fr 280px' : '1fr', gap: 20, alignItems: 'start' }}>
              <div>
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 430, overflowY: 'auto' }}>
                  {boxItems.length > 0 ? (
                    <table className="tbl" style={{ fontSize: 14 }}>
                      <thead style={{ position: 'sticky', top: 0 }}>
                        <tr>
                          <th>SKU / ชื่อ</th>
                          <th style={{ width: 60 }}>หน่วย</th>
                          <th style={{ width: 150, textAlign: 'center' }}>จำนวน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxItems.map((l, rowIndex) => (
                          <tr key={`${l.sku}__${l.unit || ''}__${rowIndex}`}>
                            <td>
                              <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15 }}>{l.name}</div>
                            </td>
                            <td style={{ fontFamily: 'JetBrains Mono' }}>{l.scannedUnit || l.unit}</td>
                            <td>
                              <div className="row" style={{ gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                                <button className="btn sm" style={{ minWidth: 32, borderColor: 'var(--red)', color: 'var(--red)', fontWeight: 700 }} onClick={() => adjustQty(rowIndex, -1)}>−</button>
                                <span style={{ fontFamily: 'system-ui', fontSize: 24, fontWeight: 700, minWidth: 30, textAlign: 'center' }}>{l.qty ?? l.got ?? 0}</span>
                                <button className="btn sm" style={{ minWidth: 32, borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }} onClick={() => adjustQty(rowIndex, +1)}>+</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--mute)', padding: 10 }}>ไม่มีข้อมูลรายการสินค้า</div>
                  )}
                </div>

                {/* แยก แก้ไข ↔ อนุมัติ: "แก้ไขรายการสินค้า" เด้งไปตารางเต็ม (edit mode) ก่อน ยังไม่ resolve → กลับมากด "อนุมัติ" ทีหลัง */}
                <div className="row" style={{ marginTop: 14, gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    className="btn sm"
                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white', fontWeight: 700 }}
                    onClick={() => { setProblemEditing(true); startEdit(); }}
                  >✎ แก้ไขรายการสินค้า</button>
                  <button
                    className="btn sm"
                    style={{ background: 'var(--green)', borderColor: 'var(--green)', color: 'white', fontWeight: 700 }}
                    onClick={resolveProblem}
                  >✓ อนุมัติ</button>
                </div>
              </div>

              {activeBox.problemImage && (
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: 'var(--mute)', marginBottom: 6 }}>📷 รูปหลักฐาน</div>
                  <img src={activeBox.problemImage} alt="หลักฐาน" style={{ width: '100%', borderRadius: 10, border: '1.5px solid var(--line)', objectFit: 'contain', display: 'block' }} />
                </div>
              )}
            </div>
          </div>
        ) : activeBox ? (
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
            {hiddenBanner}

            {/* LEFT: รายชื่อสินค้าในลัง — minWidth:0 ให้ track 1fr หดได้ (ไม่งั้นชื่อ nowrap ดันคอลัมน์สติกเกอร์หลุดขอบ) */}
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <div className="hand" style={{ fontSize: 20 }}>รายชื่อสินค้าในลัง</div>
                <div className="row" style={{ gap: 8 }}>
                  {editMode ? (
                    <>
                      <button className="btn sm" onClick={() => { setEditMode(false); setEditItems([]); setProblemEditing(false); }}>✕ ยกเลิก</button>
                      <button className="btn sm primary" onClick={() => { handleSaveEdit(); setProblemEditing(false); }}>{problemEditing ? '✓ บันทึกการแก้ไข' : '✓ อนุมัติ'}</button>
                    </>
                  ) : (
                    <>
                      {(activeBox.status === 'closed' || activeBox.status === 'exported') && (
                        <button className="btn sm" onClick={startEdit}>✎ แก้ไข</button>
                      )}
                      {(activeBox.status === 'closed' || activeBox.status === 'exported') && (
                        <button
                          className="btn sm"
                          style={{ background: 'var(--red)', color: 'white', borderColor: 'var(--red)' }}
                          onClick={() => requestDelete(activeBox.id)}
                        >🗑 ลบลังนี้</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {editMode ? (
                /* ── Edit mode: กรอกแก้ไข qty / LOT / Exp ต่อ item ── */
                <>
                <div style={{ marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input mono"
                      placeholder="🔍 สแกน Barcode / SKU เพื่อเพิ่มสินค้าใหม่ — กด Enter"
                      style={{ flex: 1, fontSize: 13 }}
                      value={addScan}
                      onChange={e => { setAddScan(e.target.value); setAddScanErr(''); }}
                      onKeyDown={handleAddByScan}
                    />
                  </div>
                  {addScanErr && <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{addScanErr}</div>}
                </div>
                <div style={{ border: '2px solid var(--accent)', borderRadius: 8, overflow: 'auto', maxHeight: 340, background: 'white' }}>
                  <table className="tbl" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>SKU / ชื่อสินค้า</th>
                        <th style={{ width: 130 }}>Barcode (สแกนได้)</th>
                        <th style={{ width: 70 }}>หน่วย</th>
                        <th style={{ width: 72, textAlign: 'center' }}>จำนวน</th>
                        <th style={{ width: 110 }}>LOT</th>
                        <th style={{ width: 100 }}>Exp (ค.ศ.)</th>
                        <th style={{ width: 32 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((it, idx) => (
                        <tr key={`edit-${it.sku}-${idx}`} style={{ background: idx % 2 === 0 ? 'white' : '#fafaf8' }}>
                          <td>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{it.sku}</div>
                            <div style={{ fontFamily: 'system-ui', fontSize: 13 }}>{it.name}</div>
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              className="input mono"
                              style={{ width: '100%', padding: '3px 6px', fontSize: 11 }}
                              value={it.scannedBarcode || it.barcode || ''}
                              placeholder="สแกน / พิมพ์ barcode"
                              onChange={e => setEditItems(prev => prev.map((x, i) =>
                                i === idx ? { ...x, scannedBarcode: e.target.value } : x
                              ))}
                              onKeyDown={e => {
                                if (e.key !== 'Enter') return;
                                const bc = e.target.value.trim();
                                if (!bc) return;
                                const unit = lookupUnitByBarcode(barcodeMap, it.sku, bc);
                                // ต้องอัปเดต scannedUnit ด้วย — handleSaveEdit คิด gotBase จาก "หน่วยบาร์โค้ดที่ยิงจริง"
                                // ถ้าเซ็ตแค่ unit จะเหลือ scannedUnit ค้างจากตอนแพ็ค → จำนวนที่สาขาเห็นผิด
                                setEditItems(prev => prev.map((x, i) =>
                                  i === idx ? { ...x, scannedBarcode: bc, ...(unit ? { unit, scannedUnit: unit } : {}) } : x
                                ));
                                if (unit) showToast(`หน่วย → ${unit}`, 'success');
                                else showToast('ไม่พบ barcode ใน R05.106 — barcode บันทึกไว้แต่หน่วยไม่เปลี่ยน');
                              }}
                            />
                          </td>
                          <td style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                            {/* หน่วยที่ยิงจริง (scannedUnit) ไม่ใช่หน่วย Picklist (it.unit) — 3ลัง ไม่มีบาร์โค้ด พนักงานยิง ลัง
                                ให้ตรงกับ barcode/จำนวนในแถว + ตาราง view + ไฟล์ Text/Excel + หน้ารับสินค้า (ทั้งหมดใช้ scannedUnit) */}
                            {it.scannedUnit || it.unit}
                          </td>
                          <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                            <input
                              type="number"
                              min={0}
                              className="input"
                              style={{ width: 60, textAlign: 'center', padding: '3px 6px', fontSize: 15, fontWeight: 700 }}
                              value={it.qty ?? it.got ?? 0}
                              onChange={e => {
                                const v = Math.max(0, parseInt(e.target.value) || 0);
                                setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: v, got: v } : x));
                              }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              className="input"
                              style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}
                              value={it.lot || ''}
                              placeholder="LOT"
                              onChange={e => setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, lot: e.target.value } : x))}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              className="input"
                              style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}
                              value={it.exp || ''}
                              placeholder="DD/MM/YYYY"
                              onChange={e => setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, exp: e.target.value } : x))}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <button
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 16, padding: '2px 4px' }}
                              title="ลบแถวนี้"
                              onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                /* ── View mode: ตารางปกติ read-only ── */
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 8, overflow: 'auto', maxHeight: 320, background: 'white' }}>
                  {boxItems.length > 0 ? (() => {
                    const tableRows = boxItems.flatMap(l =>
                      buildLotRows(l, lotMap).map(r => ({ ...r, sku: l.sku, name: l.name, unit: r.unit || l.unit, location: l.location }))
                    );
                    const hasExp = tableRows.some(r => r.exp);
                    return (
                      <table className="tbl" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th style={{ maxWidth: 200 }}>ชื่อสินค้า</th>
                            <th style={{ width: 110 }}>Barcode</th>
                            <th style={{ width: 56 }}>หน่วย</th>
                            <th style={{ width: 55, textAlign: 'center' }}>จำนวน</th>
                            <th style={{ width: 90 }}>LOT</th>
                            {hasExp && <th style={{ width: 88 }}>Exp</th>}
                            <th style={{ width: 70 }}>Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((r, i) => (
                            <tr key={`${r.sku}-${r.lot}-${i}`}>
                              <td className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{r.sku}</td>
                              <td style={{ fontFamily: 'JetBrains Mono', maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.name}</td>
                              <td className="mono" style={{ fontSize: 11 }}>{r.barcode || '—'}</td>
                              <td style={{ fontFamily: 'JetBrains Mono' }}>{r.unit}</td>
                              <td style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>×{r.qty}</td>
                              <td className="mono" style={{ fontSize: 11 }}>{r.lot || '—'}</td>
                              {hasExp && <td className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{r.exp || '—'}</td>}
                              <td className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{r.location || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })() : (
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--mute)', padding: 10 }}>ไม่มีข้อมูลรายการสินค้า</div>
                  )}
                </div>
              )}

            </div>

            {/* RIGHT: สติกเกอร์ + ปุ่ม */}
            <div>
              <div className="hand" style={{ fontSize: 20, marginBottom: 8 }}>ตัวอย่างสติกเกอร์ติดลัง (90×65 mm)</div>
              <div className="print-label" style={{
                border: '2px solid var(--line)', borderRadius: 8,
                width: 340, height: 245, boxSizing: 'border-box', overflow: 'hidden',
              }}>
                <StickerLabel box={activeBox} />
              </div>

              {/* แก้ไข Note บนสติกเกอร์ — ผูก box.note (แก้พิมพ์ผิด/เปลี่ยนข้อความได้ตลอด) → สติกเกอร์อัปเดตหลัง blur */}
              <div style={{ marginTop: 10, width: 340 }}>
                <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', marginBottom: 4 }}>
                  <span style={{ fontSize: 11 }}></span>
                </div>
                <textarea
                  className="input"
                  placeholder="📝 เพิ่มหมายเหตุ.."
                  style={{ width: '100%', minHeight: 50, resize: 'vertical', fontSize: 13 }}
                  value={boxNote}
                  onChange={e => setBoxNote(e.target.value)}
                  onBlur={saveBoxNote}
                />
              </div>

              {/* ปุ่ม: ส่งออกไฟล์ Text — disable ถาวรหลังกด จนกว่าจะ Clear */}
              <div className="row" style={{ marginTop: 5, gap: 10, flexWrap: 'wrap' }}>
                {(() => {
                  const exportable = (activeBox.status === 'closed' || activeBox.status === 'exported');
                  const done = !!activeBox.textExported;
                  return (
                    <button
                      className="btn"
                      onClick={handleExportBarcode}
                      disabled={!exportable || done}
                      style={{
                        opacity: (exportable && !done) ? 1 : 0.45,
                        cursor: (exportable && !done) ? 'pointer' : 'not-allowed',
                      }}
                    >{done ? '✓ ส่งออกไฟล์ Text แล้ว' : '⇩ ส่งออกไฟล์ Text'}</button>
                  );
                })()}
              </div>

              {/* เลขที่เอกสาร + อนุมัติเอกสาร — กรอกได้ต่อเมื่อส่งออกไฟล์ Text แล้ว (แสดงเฉพาะยังไม่ exported) */}
              {activeBox.status !== 'exported' && (() => {
                const textDone = !!activeBox.textExported;
                const canApprove = textDone && docNumber.trim();
                return (
                  <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      placeholder={textDone ? 'เลขที่เอกสาร…' : 'อัปโหลดไฟล์ Text ก่อน'}
                      style={{ flex: 1, minWidth: 150, opacity: textDone ? 1 : 0.5, cursor: textDone ? 'text' : 'not-allowed' }}
                      value={docNumber}
                      onChange={e => setDocNumber(e.target.value)}
                      disabled={!textDone}
                    />
                    <button
                      className="btn primary"
                      onClick={handleSendPOS}
                      style={{ opacity: canApprove ? 1 : 0.45, cursor: canApprove ? 'pointer' : 'not-allowed' }}
                    >อนุมัติเอกสาร</button>
                  </div>
                );
              })()}

              {/* พิมพ์ใบปิดลัง — ด้านล่างช่องเลขที่เอกสาร (active เฉพาะ exported) */}
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={handlePrint}
                  style={{ opacity: activeBox.status === 'exported' ? 1 : 0.45, cursor: activeBox.status === 'exported' ? 'pointer' : 'not-allowed' }}
                >🖨 พิมพ์ใบปิดลัง</button>
              </div>
            </div>

          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontFamily: 'JetBrains Mono', fontSize: 16 }}>
            เลือกลังทางซ้ายเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      {/* render เฉพาะตอนพิมพ์ (.print-only-label display:none ปกติ, display:flex ใน @media print) —
          แยกออกจาก #root ทั้งหมดผ่าน portal เพื่อให้ #root ถูกซ่อนด้วย display:none ตอนพิมพ์ได้
          โดยไม่กระทบ element นี้ → เหลือ element เดียวใน printable flow → ออกแผ่นเดียวพอดี 90×65mm */}
      {activeBox && createPortal(
        <div className="print-only-label" style={{
          width: '90mm', height: '65mm',
          position: 'fixed', top: 0, left: 0,
          boxSizing: 'border-box', overflow: 'hidden',
        }}>
          <StickerLabel box={activeBox} />
        </div>,
        document.body
      )}

      {confirmDeleteId && deletingBox && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            textAlign: 'center', minWidth: 280, maxWidth: 340,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ ยืนยันลบลัง {deletingBox.id}?</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>
              {deletingBox.skuCount ?? 0} SKU · {deletingBox.totalQty ?? 0} ชิ้น{deletingBox.packer ? ` · แพ็คโดย ${deletingBox.packer.name}` : ''}
            </div>
            {deletingBox.textExported && (
              <div style={{ fontSize: 13, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '8px 10px', margin: '10px 0' }}>
                ⚠ ลังนี้ส่งออกไฟล์ Text เข้า POS ไปแล้ว — ลบแล้วข้อมูลจะไม่ตรงกับ POS อีกต่อไป
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--mute)', margin: '8px 0 20px' }}>ข้อมูลลังและรายการสินค้าจะถูกลบอย่างถาวร ไม่สามารถกู้คืนได้</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={() => setConfirmDeleteId(null)}>ยกเลิก</button>
              <button className="btn danger sm" onClick={confirmDelete}>ลบลัง</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
