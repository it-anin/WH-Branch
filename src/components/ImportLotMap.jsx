import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { parseR14102Rows } from '../r14QrHelpers.js';

function parseWorkbook(input, type, factorMap) {
  const wb = XLSX.read(input, { type, cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // ใช้ค่าที่ Excel แสดง (raw:false) เพื่อรักษาเลขศูนย์นำหน้าของ SKU/LOT ในไฟล์ XLSX
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return parseR14102Rows(rows, factorMap);
}

// label + % ต่อขั้น — ไฟล์ LOT มี aggregation pass + Firestore write ก้อนใหญ่ ใช้เวลานาน ต้องโชว์สถานะ
const STAGE = {
  reading: { label: '📖 กำลังอ่านไฟล์...', pct: 15 },
  parsing: { label: '⚙ กำลังประมวลผล LOT...', pct: 45 },
  saving:  { label: '☁ กำลังบันทึกขึ้น Firestore...', pct: 75 },
  done:    { label: '✅ เสร็จสมบูรณ์', pct: 100 },
};

export default function ImportLotMap({ matchCount, meta, onImport, factorMap = {}, locked = false, lockedHint = '' }) {
  const fileRef = useRef(null);
  const [uploadedAt, setUploadedAt] = useState(null);
  const [stage, setStage] = useState(null); // null = ไม่ได้กำลังอัปโหลด

  const displayUploadedAt = uploadedAt ?? meta?.fileDate;

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    // กันไฟล์หลุดเข้ามาตอนยังไม่ถึงคิว — สำคัญกว่าไฟล์อื่น: ถ้า factorMap (R05.106) ยังไม่มา
    // parseWorkbook จะได้ factor=1 ทุกแถว → qty ทั้งก้อนผิดหน่วยแบบเงียบๆ ไม่มี error
    if (locked) { e.target.value = ''; return; }
    setStage('reading');
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(file.name);
    reader.onload = (ev) => {
      setStage('parsing');
      // setTimeout ปล่อยให้ browser repaint แถบ progress ก่อนเริ่ม parse+aggregate (sync blocking)
      setTimeout(() => {
        let snapshot;
        try {
          snapshot = parseWorkbook(ev.target.result, isCsv ? 'string' : 'array', factorMap);
        } catch (err) {
          setStage(null);
          alert(`อ่านไฟล์ R14.102 ไม่สำเร็จ\n${err?.message || 'กรุณาตรวจสอบ header และรูปแบบไฟล์'}`);
          return;
        }
        if (Object.keys(snapshot?.lotMap || {}).length === 0) {
          setStage(null);
          alert('ไม่พบข้อมูล LOT ที่มียอดคงเหลือ กรุณาตรวจสอบรูปแบบและข้อมูลในไฟล์');
          return;
        }
        const d = new Date(); // วันที่อัปโหลดจริง (ไม่ใช่ file.lastModified ที่เป็นวันแก้ไขไฟล์)
        const fd = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        const metaToSave = {
          fileDate: fd,
          fileName: file.name,
          importedAt: Date.now(),
          sourceReport: snapshot.isR14102 ? 'R14.102' : 'R01.119',
          ...(snapshot.isR14102 ? { warehouse: 'Warehouse' } : {}),
          ...(snapshot.counts ? { counts: snapshot.counts } : {}),
          ...(snapshot.warnings ? { warnings: snapshot.warnings } : {}),
        };

        setStage('saving');
        setTimeout(() => {
          Promise.resolve(onImport(snapshot, metaToSave))
            .then(() => {
              setStage('done');
              setUploadedAt(fd);
              setTimeout(() => setStage(null), 600);
            })
            .catch(() => setStage(null));
        }, 0);
      }, 0);
    };
    reader.onerror = () => {
      setStage(null);
      alert('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่แล้วลองอีกครั้ง');
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
        disabled={uploading || locked}
        onClick={() => fileRef.current?.click()}
      >
        {'4 · '}
        {uploading ? '⏳ กำลังอัปโหลด...' : displayUploadedAt ? '✅ อัปโหลด R14.102 (LOT+EXP) แล้ว' : '⇑ อัปโหลด R14.102 (LOT+EXP)'}
      </button>
      {locked ? (
        <span className="chip" style={{ fontFamily: 'system-ui', fontSize: 13 }}>🔒 {lockedHint}</span>
      ) : uploading ? (
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
