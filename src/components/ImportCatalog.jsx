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

function rowsToItems(rows) {
  return rows
    .slice(1)
    .map(vals => ({
      sku:      toStr(vals[1]),
      barcode:  toStr(vals[2]),
      name:     String(vals[3] ?? '').trim(),
      unit:     String(vals[4] ?? '').trim(),
      qty:      Math.max(1, parseInt(vals[5], 10) || 1),
      location: String(vals[6] ?? '').trim(),
    }))
    .filter(item => item.sku && item.name);
}

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

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  return rowsToItems(lines.map(splitCSVLine));
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return rowsToItems(rows);
}

function extractBranch(filename) {
  const m = filename.match(/picklist[_-]([A-Za-z0-9]+)/i);
  return m ? m[1].toUpperCase() : null;
}

export default function ImportCatalog({ catalog, onImport }) {
  const fileRef = useRef(null);
  const [branch, setBranch] = useState(null);
  const [fileDate, setFileDate] = useState(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isXLSX = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();

    reader.onload = (ev) => {
      const items = isXLSX
        ? parseXLSX(ev.target.result)
        : parseCSV(ev.target.result);

      if (items.length === 0) {
        alert('ไม่พบรายการสินค้าในไฟล์ กรุณาตรวจสอบรูปแบบ');
        return;
      }
      setBranch(extractBranch(file.name));
      const d = new Date(file.lastModified);
      setFileDate(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`);
      onImport(items);
    };

    if (isXLSX) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'utf-8');

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
      <button className={`btn sm${branch ? ' primary' : ''}`} onClick={() => fileRef.current?.click()}>
        {branch ? `✅ อัปโหลดไฟล์ Picklist_${branch} แล้ว` : '⇑ อัปโหลดไฟล์ Picklist'}
      </button>
      {branch && catalog.length > 0 && (
        <span className="chip ok" style={{ fontFamily: 'Patrick Hand', fontSize: 13 }}>
          ✅ รายการเบิก: {catalog.length} รายการ · ไฟล์วันที่ {fileDate}
        </span>
      )}
    </div>
  );
}
