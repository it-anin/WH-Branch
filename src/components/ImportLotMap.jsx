import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// รองรับ 2 format — detect คอลัมน์จากชื่อ header (case-insensitive):
//   R01.119 เดิม:   cf_lotno(A) cf_itemid(B) cf_quantity(F) cf_unitname(G) — ไม่มี exp
//   LOT+EXP ใหม่:   CF_LOTNO(L) CF_ITEMID(J) CF_QUANTITY(O) CF_UNITNAME(N) CF_EXPIREDATE_TEXT(C) CF_TRANDATE(D)
// ไม่เจอ header ที่รู้จัก → fallback ตำแหน่งเดิมของ R01.119 (A=LOT, B=SKU, F=qty, G=unit)
function detectColumns(headerRow) {
  const idx = {};
  (headerRow || []).forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
  if (idx['cf_lotno'] != null && idx['cf_itemid'] != null) {
    return {
      lot: idx['cf_lotno'], sku: idx['cf_itemid'],
      qty: idx['cf_quantity'] ?? 5, unit: idx['cf_unitname'] ?? 6,
      exp: idx['cf_expiredate_text'] ?? null, td: idx['cf_trandate'] ?? null,
    };
  }
  return { lot: 0, sku: 1, qty: 5, unit: 6, exp: null, td: null };
}

// CF_TRANDATE "DD/MM/YYYY" → เลขเทียบลำดับได้ (YYYYMMDD) — ใช้เลือก exp จากแถวล่าสุดเมื่อ lot เดียวกันมีหลาย exp
function tdNum(s) {
  const m = String(s ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : 0;
}

// แปลง qty → หน่วยฐานด้วย factorMap ตั้งแต่ import (qty × factor(sku__unit)) → lotMap เก็บ qty เป็นหน่วยฐานเลย
// ⚠ ไม่เก็บ unit ต่อ lot (ทำ doc โต) — ส่วน exp เก็บเฉพาะ lot ที่มีค่า; ทั้งก้อนเกิน 1MB/doc แล้ว → App.jsx แบ่งเขียนหลาย doc (shard)
function rowsToMap(rows, factorMap = {}) {
  const cols = detectColumns(rows[0]);
  // Pass 1: รวม qty (หน่วยฐาน) ต่อ (sku, lot) + เก็บ exp จากแถวที่ TRANDATE ล่าสุด (~4% ของแถวมี exp ขัดกันในลอตเดียวกัน — ข้อมูลเก่า/แก้ทีหลัง)
  const totals = {}; // { [sku]: { [lot]: {qty, exp, td} } }
  rows.slice(1).forEach(vals => {
    const lot = String(vals[cols.lot] ?? '').trim();
    const sku = String(vals[cols.sku] ?? '').trim();
    const qty = parseFloat(String(vals[cols.qty] ?? '').replace(/,/g, '')) || 0;
    const unit = String(vals[cols.unit] ?? '').trim();
    if (!sku || !lot) return;
    const factor = factorMap[`${sku}__${unit}`] ?? 1; // ไม่มี factor (ยังไม่ import R05.106) → 1 = ใช้ qty ตามเดิม
    if (!totals[sku]) totals[sku] = {};
    const cur = totals[sku][lot] || (totals[sku][lot] = { qty: 0, exp: '', td: -1 });
    cur.qty += qty * factor;
    if (cols.exp != null) {
      const exp = String(vals[cols.exp] ?? '').trim();
      const td = cols.td != null ? tdNum(vals[cols.td]) : 0;
      if (exp && td >= cur.td) { cur.exp = exp; cur.td = td; }
    }
  });

  // Pass 2: เก็บเฉพาะ LOT ที่ sum > 0 (qty คงเหลือเป็นหน่วยฐาน) — exp ใส่เฉพาะเมื่อมีค่า (ประหยัดขนาด doc)
  const map = {};
  Object.entries(totals).forEach(([sku, lots]) => {
    Object.entries(lots).forEach(([lot, t]) => {
      if (t.qty > 0) {
        if (!map[sku]) map[sku] = [];
        map[sku].push({ lot, qty: t.qty, ...(t.exp ? { exp: t.exp } : {}) });
      }
    });
  });
  return map;
}

function parseWorkbook(input, type, factorMap) {
  const wb = XLSX.read(input, { type, cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  return rowsToMap(rows, factorMap);
}

// label + % ต่อขั้น — ไฟล์ LOT มี aggregation pass + Firestore write ก้อนใหญ่ ใช้เวลานาน ต้องโชว์สถานะ
const STAGE = {
  reading: { label: '📖 กำลังอ่านไฟล์...', pct: 15 },
  parsing: { label: '⚙ กำลังประมวลผล LOT...', pct: 45 },
  saving:  { label: '☁ กำลังบันทึกขึ้น Firestore...', pct: 75 },
  done:    { label: '✅ เสร็จสมบูรณ์', pct: 100 },
};

export default function ImportLotMap({ matchCount, meta, onImport, factorMap = {} }) {
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
        const map = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array', factorMap);
        if (Object.keys(map).length === 0) {
          setStage(null);
          alert('ไม่พบข้อมูล LOT กรุณาตรวจสอบรูปแบบไฟล์\n(header CF_LOTNO/CF_ITEMID หรือ ColA=LOT, ColB=SKU)');
          return;
        }
        const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
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
        {uploading ? '⏳ กำลังอัปโหลด...' : displayUploadedAt ? '✅ อัปโหลดไฟล์ LOT+EXP แล้ว' : '⇑ อัปโหลดไฟล์ LOT+EXP'}
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
