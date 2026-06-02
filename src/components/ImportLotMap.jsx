import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// ColA(0)=LOT  ColB(1)=SKU  ColF(5)=qty
// รวม qty ของแต่ละ (SKU, LOT) ทั้งหมด → เก็บเฉพาะ LOT ที่ยอดรวม > 0 (ของจริงเหลือ)
function rowsToMap(rows) {
  // Pass 1: รวม qty ต่อ (sku, lot)
  const totals = {}; // { [sku]: { [lot]: sumQty } }
  rows.slice(1).forEach(vals => {
    const lot = String(vals[0] ?? '').trim();
    const sku = String(vals[1] ?? '').trim();
    const qty = parseFloat(String(vals[5] ?? '').replace(/,/g, '')) || 0;
    if (!sku || !lot) return;
    if (!totals[sku]) totals[sku] = {};
    totals[sku][lot] = (totals[sku][lot] || 0) + qty;
  });

  // Pass 2: เก็บเฉพาะ LOT ที่ sum > 0 พร้อม qty คงเหลือเริ่มต้น
  const map = {};
  Object.entries(totals).forEach(([sku, lots]) => {
    Object.entries(lots).forEach(([lot, qty]) => {
      if (qty > 0) {
        if (!map[sku]) map[sku] = [];
        map[sku].push({ lot, qty });
      }
    });
  });
  return map;
}

// อ่าน cell โดยอ้างค่า raw (cell.v) ก่อน — ถ้าเป็น string อยู่แล้วใช้เลย (รักษา leading zero / format ของผู้ใช้)
// ถ้าเป็น number/date ค่อย fallback ไปอ่าน formatted text (cell.w)
function readCell(cell) {
  if (!cell) return '';
  if (typeof cell.v === 'string') return cell.v;          // text cell → preserve raw "001/25"
  if (cell.w != null) return cell.w;                       // number/date → formatted display
  return String(cell.v ?? '');
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const rows = [];
  // debug: dump raw cell object ของ SKU 800418 LOT cell ตัวแรกที่เจอ
  let dumped = false;
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      row.push(readCell(ws[XLSX.utils.encode_cell({ r: R, c: C })]));
    }
    if (!dumped && R > 0 && String(row[1] ?? '') === '800418') {
      const lotCell = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
      console.log(`◆ raw cell ของ SKU 800418 LOT (row ${R + 1}):`, lotCell);
      console.log(`  .t (type):`, lotCell?.t, '| .v:', JSON.stringify(lotCell?.v),
                  '| .w:', JSON.stringify(lotCell?.w), '| .z (format):', JSON.stringify(lotCell?.z));
      dumped = true;
    }
    rows.push(row);
  }
  return rowsToMap(rows);
}

export default function ImportLotMap({ matchCount, meta, onImport }) {
  const fileRef = useRef(null);
  const [uploadedAt, setUploadedAt] = useState(null);

  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const map = parseXLSX(ev.target.result);
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล LOT กรุณาตรวจสอบรูปแบบไฟล์\n(ColA=LOT, ColB=SKU)');
        return;
      }
      const d = new Date(file.lastModified);
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      setUploadedAt(fd);
      onImport(map, { fileDate: fd });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button className={`btn sm${displayUploadedAt ? ' primary' : ''}`} style={{ minWidth: 240 }} onClick={() => fileRef.current?.click()}>
        {displayUploadedAt ? '✅ อัปโหลดไฟล์ R01.119 (LOT) แล้ว' : '⇑ อัปโหลดไฟล์ R01.119 (LOT)'}
      </button>
      {displayUploadedAt && (
        <span className="chip ok" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
          ไฟล์วันที่ {displayUploadedAt}
        </span>
      )}
    </div>
  );
}
