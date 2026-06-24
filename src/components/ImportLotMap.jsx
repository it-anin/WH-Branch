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

// label + % ต่อขั้น — ไฟล์ LOT มี aggregation pass + Firestore write ก้อนใหญ่ ใช้เวลานาน ต้องโชว์สถานะ
const STAGE = {
  reading: { label: '📖 กำลังอ่านไฟล์...', pct: 15 },
  parsing: { label: '⚙ กำลังประมวลผล LOT...', pct: 45 },
  saving:  { label: '☁ กำลังบันทึกขึ้น Firestore...', pct: 75 },
  done:    { label: '✅ เสร็จสมบูรณ์', pct: 100 },
};

export default function ImportLotMap({ matchCount, meta, onImport }) {
  const fileRef = useRef(null);
  const [uploadedAt, setUploadedAt] = useState(null);
  const [stage, setStage] = useState(null); // null = ไม่ได้กำลังอัปโหลด

  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStage('reading');
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(file.name);
    reader.onload = (ev) => {
      setStage('parsing');
      // setTimeout ปล่อยให้ browser repaint แถบ progress ก่อนเริ่ม parse+aggregate (sync blocking)
      setTimeout(() => {
        const map = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array');
        if (Object.keys(map).length === 0) {
          setStage(null);
          alert('ไม่พบข้อมูล LOT กรุณาตรวจสอบรูปแบบไฟล์\n(ColA=LOT, ColB=SKU)');
          return;
        }
        const d = new Date(file.lastModified);
        const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

        setStage('saving');
        setTimeout(() => {
          Promise.resolve(onImport(map, { fileDate: fd }))
            .then(() => {
              setStage('done');
              setUploadedAt(fd);
              setTimeout(() => setStage(null), 600);
            })
            .catch(() => setStage(null));
        }, 0);
      }, 0);
    };
    if (isCsv) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  const uploading = stage !== null;

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <button
        className={`btn sm${displayUploadedAt ? ' primary' : ''}`}
        style={{ minWidth: 240 }}
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? '⏳ กำลังอัปโหลด...' : displayUploadedAt ? '✅ อัปโหลดไฟล์ R01.119 (LOT) แล้ว' : '⇑ อัปโหลดไฟล์ R01.119 (LOT)'}
      </button>
      {uploading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 220 }}>
          <div style={{
            height: 8, borderRadius: 999, background: 'var(--paper-dark)',
            border: '1.5px solid var(--line)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${STAGE[stage].pct}%`,
              background: 'var(--accent)', borderRadius: 999,
              transition: 'width .25s ease',
            }} />
          </div>
          <span style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)' }}>
            {STAGE[stage].label}
          </span>
        </div>
      ) : displayUploadedAt && (
        <span className="chip ok" style={{ fontFamily: 'system-ui', fontSize: 13 }}>
          ไฟล์วันที่ {displayUploadedAt}
        </span>
      )}
    </div>
  );
}
