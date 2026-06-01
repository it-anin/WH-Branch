import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// ColA(0)=LOT  ColB(1)=SKU  ColF(5)=qty  → key by SKU, value=array ของ LOT, skip ถ้า ColF ≤ 0
function rowsToMap(rows) {
  const map = {};
  rows.slice(1).forEach(vals => {
    const lot = String(vals[0] ?? '').trim();
    const sku = String(vals[1] ?? '').trim();
    const qty = parseFloat(String(vals[5] ?? '').replace(/,/g, ''));
    if (sku === '400263') console.log('400263 LOT row:', JSON.stringify(vals));
    if (!sku || !lot) return;
    if (!isNaN(qty) && qty <= 0) return; // ติดลบ/ศูนย์ → ข้าม
    if (!map[sku]) map[sku] = [];
    if (!map[sku].includes(lot)) map[sku].push(lot);
  });
  return map;
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: false → ใช้ formatted text แทนเลขดิบ (เช่น date serial → "01/01/2026")
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
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
        {displayUploadedAt ? '✅ อัปโหลดไฟล์ LOT แล้ว' : '⇑ อัปโหลดไฟล์ LOT'}
      </button>
      {displayUploadedAt && (
        <span className="chip ok" style={{ fontFamily: 'Patrick Hand', fontSize: 13 }}>
          ไฟล์วันที่ {displayUploadedAt}
        </span>
      )}
    </div>
  );
}
