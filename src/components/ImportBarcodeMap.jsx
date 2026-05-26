import { useRef } from 'react';
import * as XLSX from 'xlsx';

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
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

// ColA(0)=barcode  ColE(4)=sku  ColG(6)=unit
function rowsToMap(rows) {
  const map = {};
  rows.slice(1).forEach(vals => {
    const barcode = toStr(vals[0]);
    const sku     = toStr(vals[4]);
    const unit    = String(vals[6] ?? '').trim();
    if (barcode && sku) {
      const key = `${sku}__${unit}`;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(barcode)) map[key].push(barcode);
    }
  });
  return map;
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

export default function ImportBarcodeMap({ matchCount, onImport }) {
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isXLSX = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const map = isXLSX ? parseXLSX(ev.target.result) : parseCSV(ev.target.result);
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล Barcode กรุณาตรวจสอบรูปแบบไฟล์');
        return;
      }
      onImport(map);
    };
    if (isXLSX) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      {matchCount > 0 && (
        <span className="chip ok" style={{ fontFamily: 'Patrick Hand', fontSize: 13 }}>
          🔖 Barcode map: {matchCount} รายการ
        </span>
      )}
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button className="btn sm" onClick={() => fileRef.current?.click()}>
        ⇑ นำเข้าไฟล์ Barcode (.csv / .xlsx)
      </button>
    </div>
  );
}
