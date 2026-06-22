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

function parseWorkbook(input, type) {
  const wb = XLSX.read(input, { type, cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
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
    const isCsv = /\.csv$/i.test(file.name);
    reader.onload = (ev) => {
      const map = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array');
      if (Object.keys(map).length === 0) {
        alert('ไม่พบข้อมูล LOT กรุณาตรวจสอบรูปแบบไฟล์\n(ColA=LOT, ColB=SKU)');
        return;
      }
      const d = new Date(file.lastModified);
      const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      setUploadedAt(fd);
      onImport(map, { fileDate: fd });
    };
    if (isCsv) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
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
