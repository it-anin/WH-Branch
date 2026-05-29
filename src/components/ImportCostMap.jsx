import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// ColA(0)=SKU  ColD(3)=unit  ColJ(9)=cost
function rowsToMap(rows) {
  const map = {};
  rows.slice(1).forEach(vals => {
    const sku  = String(vals[0] ?? '').trim();
    const unit = String(vals[3] ?? '').trim();
    const cost = parseFloat(String(vals[9] ?? '').replace(/,/g, ''));
    if (sku && unit && !isNaN(cost)) map[`${sku}__${unit}`] = cost;
  });
  return map;
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
  return rowsToMap(text.trim().split(/\r?\n/).map(splitCSVLine));
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return rowsToMap(rows);
}

export default function ImportCostMap({ matchCount, meta, onImport }) {
  const fileRef = useRef(null);
  const [uploadedAt, setUploadedAt] = useState(null);

  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isXLSX = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const map = isXLSX ? parseXLSX(ev.target.result) : parseCSV(ev.target.result);
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล Cost กรุณาตรวจสอบรูปแบบไฟล์\n(ColA=SKU, ColB=ราคาทุน)');
        return;
      }
      const d = new Date(file.lastModified);
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      setUploadedAt(fd);
      onImport(map, { fileDate: fd });
    };
    if (isXLSX) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button className={`btn sm${displayUploadedAt ? ' primary' : ''}`} style={{ minWidth: 240 }} onClick={() => fileRef.current?.click()}>
        {displayUploadedAt ? '✅ อัปโหลดไฟล์ Price แล้ว' : '⇑ อัปโหลดไฟล์ Price'}
      </button>
      {displayUploadedAt && (
        <span className="chip ok" style={{ fontFamily: 'Patrick Hand', fontSize: 13 }}>
          ไฟล์วันที่ {displayUploadedAt}
        </span>
      )}
    </div>
  );
}
