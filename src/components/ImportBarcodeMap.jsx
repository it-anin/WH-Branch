import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

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

function toStr(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') return String(Math.round(val));
  const s = String(val).trim();
  if (/^[\d.]+[eE][+-]?\d+$/.test(s)) return String(Math.round(Number(s)));
  return s;
}

// ColA(0)=barcode  ColE(4)=sku  ColG(6)=unit  ColH(7)=ตัวคูณหน่วยฐาน (CF_BASEMULTIPLE)
// คืน { map, factorMap } — map = {sku__unit: [barcode]}, factorMap = {sku__unit: factor} (จำนวนหน่วยฐานต่อ 1 หน่วยนี้ เช่น โหล=12)
function rowsToMap(rows) {
  const map = {};
  const factorMap = {};
  rows.slice(1).forEach(vals => {
    const barcode = toStr(vals[0]);
    const sku     = toStr(vals[4]);
    const unit    = String(vals[6] ?? '').trim();
    if (!sku) return;
    const key = `${sku}__${unit}`;
    // ตัวคูณผูกกับ sku__unit (ไม่ใช่ชื่อหน่วยล้วน — กล่อง/โหล มี factor ต่างกันตาม SKU) — first-wins
    const f = Number(vals[7]);
    if (Number.isFinite(f) && f > 0 && !(key in factorMap)) factorMap[key] = f;
    if (barcode) {
      if (!map[key]) map[key] = [];
      if (!map[key].includes(barcode)) map[key].push(barcode);
    }
  });
  return { map, factorMap };
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  return rowsToMap(lines.map(splitCSVLine));
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return rowsToMap(rows);
}

export default function ImportBarcodeMap({ matchCount, meta, onImport, locked = false, lockedHint = '' }) {
  const fileRef = useRef(null);
  const [label, setLabel] = useState(null);
  const [uploadedAt, setUploadedAt] = useState(null);

  const displayLabel = label ?? meta?.fileName;
  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (locked) { e.target.value = ''; return; } // กันไฟล์หลุดเข้ามาตอนยังไม่ถึงคิว (เช่น drag-drop / เรียกซ้ำ)
    // บังคับ .xlsx เท่านั้น — .csv ทำเลข 0 นำหน้าของ barcode/SKU หาย (accept เป็นแค่ filter ของ picker เลี่ยงด้วย "All files" ได้ → ต้อง guard ซ้ำ)
    if (!/\.xlsx$/i.test(file.name)) {
      alert('กรุณาอัปโหลดไฟล์ .xlsx เท่านั้น\n(ไฟล์ .csv ทำให้เลข 0 นำหน้าของบาร์โค้ด/SKU หาย)');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { map, factorMap } = parseXLSX(ev.target.result);
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล Barcode กรุณาตรวจสอบรูปแบบไฟล์');
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, '');
      setLabel(name);
      const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      setUploadedAt(fd);
      onImport(map, factorMap, { fileName: name, fileDate: fd });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      {/* บังคับ .xlsx เท่านั้น — ไฟล์ .csv (เช่น R05.106 ดิบ) ทำเลข 0 นำหน้าของ barcode/SKU หาย ต้อง save เป็น .xlsx ก่อนอัป */}
      <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
      <button
        className={`btn sm${displayUploadedAt ? ' primary' : ''}`}
        style={{ minWidth: 240 }}
        disabled={locked}
        onClick={() => fileRef.current?.click()}
      >
        {'2 · '}
        {displayUploadedAt
          ? `✅ อัปโหลดไฟล์ ${displayLabel || 'R05.106'} แล้ว`
          : '⇑ อัปโหลดไฟล์ R05.106'}
      </button>
      {locked ? (
        <span className="chip" style={{ fontFamily: 'system-ui', fontSize: 13 }}>🔒 {lockedHint}</span>
      ) : displayUploadedAt && (
        <span className="chip ok" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
          ไฟล์วันที่ {displayUploadedAt}
        </span>
      )}
    </div>
  );
}
