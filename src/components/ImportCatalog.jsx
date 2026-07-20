import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { isUrgentItem } from '../units.js';

const TEMPLATE_CSV = [
  'ColA,ColB,ColC,ColD,ColE,ColF,ColG',
  ',(sku),(barcode),(ชื่อสินค้า),(หน่วย),(จำนวน),(location)',
  ',SKU-8801-A,8851234567012,น้ำปลา ตราเด็กสมบูรณ์ 700ml,ขวด,1,A-01-02',
  ',SKU-8802-B,8851234567029,ซอสปรุงรส แม็กกี้ 200ml,ขวด,2,B-03-01',
  ',SKU-4410-C,8859900112233,ข้าวหอมมะลิ มาบุญครอง 1kg,ถุง,1,A-02-05',
].join('\n');

function toStr(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') return String(Math.round(val));
  const s = String(val).trim();
  if (/^[\d.]+[eE][+-]?\d+$/.test(s)) return String(Math.round(Number(s)));
  return s;
}

function parseBarcodes(val) {
  const raw = toStr(val);
  if (!raw) return [];
  return raw
    .split(/[\r\n,;|/]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

function rowsToItems(rows) {
  return rows
    .slice(1)
    .map(vals => {
      const barcodes = parseBarcodes(vals[2]);
      return {
        no:       toStr(vals[0]),            // ColA — ลำดับที่จากไฟล์ (โชว์ใน popup 📋 ดูรายการ Picklist)
        sku:      toStr(vals[1]),
        barcode:  barcodes.join(','),
        // ColC ดิบ — item.barcode จะโดน applyBarcodeMap merge เป็น comma-list ภายหลัง popup ต้องใช้ค่าจากไฟล์
        rawBarcode: barcodes.join(','),
        name:     String(vals[3] ?? '').trim(),
        unit:     String(vals[4] ?? '').trim(),
        qty:      Math.max(1, parseInt(vals[5], 10) || 1),
        location: String(vals[6] ?? '').trim(),
        abc:      String(vals[7] ?? '').trim(), // ColH — ABC class
      };
    })
    .filter(item => item.sku && item.name);
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else if (inQuote) inQuote = false;
      else if (cur === '') inQuote = true;
      else cur += ch; // " กลางฟิลด์ที่ไม่มี quote (เช่น นิ้ว 18G x 1") → literal
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  return rowsToItems(lines.map(splitCSVLine));
}

function parseWorkbook(input, type) {
  const wb = XLSX.read(input, { type, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  return rowsToItems(rows);
}

function extractBranch(filename) {
  const m = filename.match(/picklist[_-]([A-Za-z0-9]+)/i);
  return m ? m[1].toUpperCase() : null;
}

export default function ImportCatalog({ catalog, meta, onImport }) {
  const fileRef = useRef(null);
  const urgentRef = useRef(null);
  const [branch, setBranch] = useState(null);
  const [fileDate, setFileDate] = useState(null);
  const [importing, setImporting] = useState(false);

  const displayBranch = branch ?? meta?.branch;
  const displayFileDate = fileDate ?? meta?.fileDate;
  const urgentCount = catalog.filter(isUrgentItem).length;

  // อ่าน + parse ไฟล์ — ใช้ร่วมทั้งปุ่ม Picklist ปกติ และปุ่มเบิกด่วน
  function readItems(e, cb) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const items = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array');
      if (items.length === 0) {
        alert('ไม่พบรายการสินค้าในไฟล์ กรุณาตรวจสอบรูปแบบ');
        return;
      }
      cb(items, file);
    };
    if (isCsv) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
  }

  // ── ปุ่ม 1: Picklist ปกติ (replace ทั้ง catalog) ──
  function handleFile(e) {
    readItems(e, async (items, file) => {
      // ปุ่มนี้ replace ทั้ง catalog — ไฟล์เบิกด่วนหลุดเข้ามา = ล้าง Picklist ทั้งวันทิ้ง เหลือแต่รายการด่วน
      if (/เบิกด่วน/.test(file.name)) {
        alert(
          `⛔ ไฟล์นี้เป็น Picklist เบิกด่วน\n\n` +
          `"${file.name}"\n\n` +
          `ปุ่มนี้จะแทนที่รายการเบิกทั้งวัน — กรุณาใช้ปุ่ม "📌 อัปโหลดไฟล์ Picklist เบิกด่วน" แทน`
        );
        return;
      }
      const b = extractBranch(file.name);
      // ชื่อไฟล์ไม่มีรหัสสาขา → ลังที่เปิดหลังจากนี้จะได้ branch: null (createNewBox อ่านจาก catalogMeta.branch)
      // ซึ่ง "สาขาสแกนรับไม่ได้เลย" (BranchReceive กรอง b.branch === branch ตรงๆ ตั้งแต่ 2a23385)
      // และ box.branch แก้ย้อนหลังไม่ได้ ต้องปิดลังทิ้งเปิดใหม่ → เตือนก่อนสาย ตอนที่ยังกดยกเลิกได้
      // ใช้ window.confirm ได้ — ไฟล์นี้ desktop-only (tab list = role warehouse) ไม่เจอปัญหา stacking context แบบ Android
      if (!b) {
        const ok = window.confirm(
          `⚠ ชื่อไฟล์ไม่มีรหัสสาขา\n\n` +
          `"${file.name}" ไม่เข้าแพทเทิร์น Picklist_XXX (เช่น Picklist_SRC)\n\n` +
          `ลังที่เปิดหลังจากนี้จะไม่ระบุสาขา และสาขาจะสแกนรับสินค้าไม่ได้เลย\n` +
          `แก้ย้อนหลังไม่ได้ ต้องเปิดลังใหม่\n\n` +
          `ยืนยันจะอัปโหลดต่อหรือไม่?`
        );
        if (!ok) return;
      }
      const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      const fileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
      if (catalog.length > 0) {
        const ok = window.confirm(
          `เริ่ม Picklist รอบใหม่ — ${items.length} รายการ\n\n` +
          `รายการปัจจุบัน ${catalog.length} รายการจะถูกแทนที่\n` +
          `ยอดจากลังรอบเดิมจะไม่ถูกนำมาหักกับไฟล์ใหม่นี้\n` +
          `ลังเดิมที่ส่งออกหรือรอสาขารับยังคงอยู่ตามปกติ\n\n` +
          `ยืนยันอัปโหลด Picklist รอบใหม่?`
        );
        if (!ok) return;
      }
      setImporting(true);
      let accepted;
      try {
        accepted = await onImport(items, { branch: b, fileDate: fd, fileName });
      } finally {
        setImporting(false);
      }
      if (accepted === false) return;
      setBranch(b);
      setFileDate(fd);
    });
  }

  // ── ปุ่มเบิกด่วน: แทนที่รายการด่วนเดิม "ทั้งหมดทุกสาขา" ไม่แตะ Picklist ปกติ (ดู onImport ใน App.jsx) ──
  // → stamp branch ลงทุกรายการ (เบิกด่วนคนละสาขากับงานปกติได้ — createNewBox อ่าน item.branch ผ่าน resolveBoxBranch)
  // → urgent=true → zoneOfItem จัดเข้า NOLOC_ZONE เสมอโดยไม่อ่าน Col G → เห็นเฉพาะคนที่ tick โซน 📌เบิกด่วน
  function handleUrgentFile(e) {
    readItems(e, async (items, file) => {
      const b = extractBranch(file.name);
      // ไม่มีรหัสสาขา = หนักกว่าฝั่ง Picklist ปกติ: item.branch เป็น null → resolveBoxBranch fallback
      // ไปสาขาของ Picklist ปกติ → ลังเบิกด่วนได้สาขาผิดแบบเงียบ ๆ (สาขาปลายทางจริงรับไม่ได้)
      if (!b) {
        const ok = window.confirm(
          `⚠ ชื่อไฟล์ไม่มีรหัสสาขา\n\n` +
          `"${file.name}" ไม่เข้าแพทเทิร์น Picklist_XXX_เบิกด่วน (เช่น Picklist_KKL_เบิกด่วน)\n` +
          `รหัสสาขาต้องอยู่ "ก่อน" คำว่าเบิกด่วน\n\n` +
          `ลังเบิกด่วนจะได้สาขาของ Picklist ปกติแทน — สาขาปลายทางจริงจะรับไม่ได้\n` +
          `แก้ย้อนหลังไม่ได้ ต้องเปิดลังใหม่\n\n` +
          `ยืนยันจะอัปโหลดต่อหรือไม่?`
        );
        if (!ok) return;
      }
      const ok = window.confirm(
        `📌 Picklist เบิกด่วน — ${items.length} รายการ (สาขา ${b || 'ไม่ระบุ'})\n\n` +
        (urgentCount > 0
          ? `จะ "แทนที่" รายการเบิกด่วนเดิมทั้งหมด (${urgentCount} รายการ) ทุกสาขา\n`
          : `จะเพิ่มเป็นรายการเบิกด่วนชุดใหม่\n`) +
        `รายการ Picklist ปกติไม่ถูกแตะ\n` +
        `ยอดจากรายการเบิกด่วนรอบเดิมจะไม่ถูกนำมาหักกับรอบใหม่นี้\n` +
        `เห็นเฉพาะพนักงานที่ถูก tick โซน 📌เบิกด่วน ในหน้ากำหนดโซน\n\n` +
        `⚠ พนักงานคนนั้นจอจะรีเซ็ต — ให้ปิดลังที่ค้างอยู่ก่อน\n\n` +
        `ยืนยันอัปโหลดรายการเบิกด่วน?`
      );
      if (!ok) return;
      const d = new Date();
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      const fileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
      // ไม่ setBranch/setFileDate — badge ปุ่ม 1 ยังโชว์ Picklist ปกติของวัน (เบิกด่วนไม่ใช่เจ้าของ _meta)
      setImporting(true);
      let accepted;
      try {
        accepted = await onImport(items.map(it => ({ ...it, branch: b, urgent: true })), null, {
          urgent: true,
          branch: b,
          fileDate: fd,
          fileName,
        });
      } finally {
        setImporting(false);
      }
      if (accepted === false) return;
    });
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template-รายการเบิกสินค้า.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button className={`btn sm${displayFileDate ? ' primary' : ''}`} style={{ minWidth: 240 }} disabled={importing} onClick={() => fileRef.current?.click()}>
        {'1 · '}
        {importing
          ? 'กำลังบันทึก Picklist…'
          : displayFileDate
          ? displayBranch ? `✅ อัปโหลดไฟล์ Picklist_${displayBranch} แล้ว` : '⚠ อัปโหลดไฟล์ Picklist แล้ว (ไม่มีรหัสสาขา)'
          : '⇑ อัปโหลดไฟล์ Picklist'}
      </button>
      {/* อัปแล้วแต่ไม่มีรหัสสาขา = ลังที่เปิดจากนี้สาขารับไม่ได้ → เตือนค้างไว้ ไม่ใช่แค่ตอนกดอัป
          badge sync ผ่าน Firestore _meta → ทุกเครื่องเห็น ไม่ใช่แค่คนที่อัป */}
      {displayFileDate && catalog.length > 0 && (
        displayBranch ? (
          <span className="chip ok" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
            ✅ รายการเบิก: {catalog.length} รายการ · ไฟล์วันที่ {displayFileDate}
          </span>
        ) : (
          <span className="chip err" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
            ⚠ รายการเบิก: {catalog.length} รายการ · ไฟล์วันที่ {displayFileDate} · <b>ไม่มีรหัสสาขา — สาขาจะรับลังไม่ได้</b>
          </span>
        )
      )}

      {/* ปุ่มเบิกด่วน — อยู่นอกลำดับบังคับ 1-4 (ไม่มีเลขนำหน้า, ไม่ล็อก) เพราะเป็นงานแทรกกลางวัน
          chip นับด้วย isUrgentItem → อัปไฟล์เดิมซ้ำแล้วเลขต้องไม่โต = เห็นได้ทันทีว่าแทนที่ ไม่ได้บวกทับ */}
      <input ref={urgentRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleUrgentFile} />
      <button className={`btn sm${urgentCount > 0 ? ' primary' : ''}`} style={{ minWidth: 240 }} disabled={importing} onClick={() => urgentRef.current?.click()}>
        📌 อัปโหลดไฟล์ Picklist เบิกด่วน
      </button>
      {urgentCount > 0 && (
        <span className="chip warn" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
          📌 เบิกด่วน: {urgentCount} รายการ
        </span>
      )}
    </div>
  );
}
