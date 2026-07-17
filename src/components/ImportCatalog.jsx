import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

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
  const [branch, setBranch] = useState(null);
  const [fileDate, setFileDate] = useState(null);

  const displayBranch = branch ?? meta?.branch;
  const displayFileDate = fileDate ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(file.name);

    reader.onload = (ev) => {
      const items = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array');

      if (items.length === 0) {
        alert('ไม่พบรายการสินค้าในไฟล์ กรุณาตรวจสอบรูปแบบ');
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
      // Picklist เบิกด่วน (ชื่อไฟล์มีคำว่า "เบิกด่วน" เช่น Picklist_KKL_เบิกด่วน — รหัสสาขาต้องอยู่ "ก่อน" คำว่าเบิกด่วน)
      // → โหมด "เพิ่มต่อท้าย" ไม่ทับ Picklist ปกติ: จอพนักงานคนอื่นไม่ remount ของที่สแกนค้างรอด
      // → stamp branch ลงทุกรายการ (เบิกด่วนคนละสาขากับงานปกติได้ — createNewBox อ่าน item.branch)
      // → มองเห็นเฉพาะพนักงานที่ tick โซน 📌เบิกด่วน (รายการไม่มี location → NOLOC_ZONE)
      if (/เบิกด่วน/.test(file.name)) {
        const ok = window.confirm(
          `📌 Picklist เบิกด่วน — ${items.length} รายการ (สาขา ${b || 'ไม่ระบุ'})\n\n` +
          `จะถูก "เพิ่มต่อท้าย" รายการเบิกเดิม ไม่ทับของเดิม\n` +
          `เห็นเฉพาะพนักงานที่ถูก tick โซน 📌เบิกด่วน ในหน้ากำหนดโซน\n\n` +
          `⚠ พนักงานคนนั้นจอจะรีเซ็ต — ให้ปิดลังที่ค้างอยู่ก่อน\n\n` +
          `ยืนยันเพิ่มรายการเบิกด่วน?`
        );
        if (!ok) return;
        // ไม่ setBranch/setFileDate — badge ปุ่มยังโชว์ Picklist ปกติของวัน (เบิกด่วนไม่ใช่เจ้าของ _meta)
        // urgent=true ทำให้การกำหนดโซนไม่อ่าน Col G แม้ไฟล์ด่วนจะมี location
        onImport(items.map(it => ({ ...it, branch: b, urgent: true })), null, { append: true, branch: b });
        return;
      }
      setBranch(b);
      const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      setFileDate(fd);
      onImport(items, { branch: b, fileDate: fd });
    };

    if (isCsv) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);

    e.target.value = '';
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
      <button className={`btn sm${displayFileDate ? ' primary' : ''}`} style={{ minWidth: 240 }} onClick={() => fileRef.current?.click()}>
        {'1 · '}
        {displayFileDate
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
    </div>
  );
}
