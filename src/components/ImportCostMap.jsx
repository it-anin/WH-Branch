import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// R05.105 — ColB(1)=SKU  ColE(4)=unit  ColF(5)=filter (เอาเฉพาะแถวที่ = 4 → ราคาทุน)  ColH(7)=cost
function rowsToMap(rows) {
  const map = {};
  rows.slice(1).forEach(vals => {
    const filterCode = String(vals[5] ?? '').trim();
    if (filterCode !== '4') return; // เฉพาะแถวราคาทุน (ColF = 4) — แถวอื่นเป็นราคาประเภทอื่น ไม่เอา
    const sku  = String(vals[1] ?? '').trim();
    const unit = String(vals[4] ?? '').trim();
    const cost = parseFloat(String(vals[7] ?? '').replace(/,/g, ''));
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

export default function ImportCostMap({ matchCount, meta, onImport, locked = false, lockedHint = '' }) {
  const fileRef = useRef(null);
  const [uploadedAt, setUploadedAt] = useState(null);

  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (locked) { e.target.value = ''; return; } // กันไฟล์หลุดเข้ามาตอนยังไม่ถึงคิว
    const isXLSX = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const map = isXLSX ? parseXLSX(ev.target.result) : parseCSV(ev.target.result);
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล Cost กรุณาตรวจสอบรูปแบบไฟล์\n(ColB=SKU, ColE=หน่วย, ColF=4, ColH=ราคาทุน)');
        return;
      }
      const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
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
      <button
        className={`btn sm${displayUploadedAt ? ' primary' : ''}`}
        style={{ minWidth: 240 }}
        disabled={locked}
        onClick={() => fileRef.current?.click()}
      >
        {'3 · '}
        {displayUploadedAt ? '✅ อัปโหลดไฟล์ R05.105 แล้ว' : '⇑ อัปโหลดไฟล์ R05.105'}
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
