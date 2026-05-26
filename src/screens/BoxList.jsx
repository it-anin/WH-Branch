import { useState } from 'react';
import Annotation from '../components/Annotation.jsx';

const statusLabel = {
  open:     { label: 'กำลังแพ็ค',       bg: '#ffd080', border: '#c88a10' },
  packing:  { label: 'กำลังแพ็ค',       bg: '#ffd080', border: '#c88a10' },
  closed:   { label: 'ปิดลังแล้ว',      bg: '#b8d4f0', border: '#4a80c0' },
  exported: { label: 'อนุมัติแล้ว',     bg: '#96e096', border: '#3a9a3a' },
  received: { label: 'รับที่สาขาแล้ว', bg: '#d4b8f5', border: '#7840c0' },
};

function BoxTable({ boxes, onOpen, onPrint }) {
  if (boxes.length === 0) return (
    <div style={{ padding: '20px 0', fontFamily: 'Patrick Hand', color: 'var(--mute)', textAlign: 'center' }}>
      ไม่มีข้อมูลลัง
    </div>
  );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Box ID</th><th>สถานะ</th><th>พนักงาน</th><th>SKU</th><th>ชิ้น</th>
          <th>เลขที่เอกสาร</th><th>อัปเดต</th>
        </tr>
      </thead>
      <tbody>
        {boxes.map((b) => (
          <tr key={b.id}>
            <td className="num-col">{b.id}</td>
            <td><span className="chip" style={{ background: statusLabel[b.status]?.bg, borderColor: statusLabel[b.status]?.border }}>● {statusLabel[b.status]?.label || b.status}</span></td>
            <td style={{ fontFamily: 'Patrick Hand', fontSize: 14 }}>{b.packer?.name || '—'}</td>
            <td>{b.skuCount}</td>
            <td>{b.totalQty}</td>
            <td className="num-col">{b.pos}</td>
            <td style={{ color: 'var(--mute)' }}>{b.updated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryEntry({ entry, generateCSV, triggerDownload, onDelete }) {
  const [open, setOpen] = useState(false);
  const total = entry.boxes.length;
  const exported = entry.boxes.filter(b => b.status === 'exported' || b.status === 'received').length;

  function handleExport() {
    const csv = generateCSV(entry.boxes);
    triggerDownload(csv, `history-${entry.dateKey}.csv`, 'text/csv');
  }

  return (
    <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div
        className="row"
        style={{
          padding: '10px 14px', background: 'var(--paper-dark)',
          cursor: 'pointer', userSelect: 'none', gap: 10,
        }}
        onClick={() => setOpen(p => !p)}
      >
        <span style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700 }}>
          {open ? '▾' : '▸'} {entry.label}
        </span>
        <span className="chip">{total} ลัง</span>
        <span className="chip ok">{exported} ส่ง/รับแล้ว</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>
          ล้างเมื่อ {new Date(entry.clearedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="spacer" />
        <button
          className="btn sm ghost"
          onClick={(e) => { e.stopPropagation(); handleExport(); }}
        >⇩ CSV</button>
        <button
          className="btn sm ghost"
          style={{ color: 'var(--red, #c0392b)' }}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="ลบออกจากประวัติ"
        >🗑 ลบ</button>
      </div>
      {open && (
        <div style={{ padding: '0 0 8px' }}>
          <BoxTable boxes={entry.boxes} />
        </div>
      )}
    </div>
  );
}

export default function BoxList({ boxes, setTab, setActiveBoxId, showToast, createNewBox, generateCSV, triggerDownload, history, setHistory, clearBoxes, clearFirestore }) {
  function handleExport() {
    const csv = generateCSV(boxes);
    triggerDownload(csv, `export-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  }

  function handleDeleteHistory(index) {
    if (!window.confirm('ลบประวัติวันนี้ออกจากรายการ?')) return;
    setHistory(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="frame" style={{ padding: 0, minHeight: 520, position: 'relative' }}>
      <div className="coffee-stain" style={{ top: 30, right: 60 }} />
      <div className="frame-header">
        <div className="row">
          <span className="title">📦 รายการลังวันนี้</span>
        </div>
        <div className="row">
          <input className="input" placeholder="ค้นหา BX / POS / SKU…" style={{ width: 220 }} />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* summary + actions */}
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <span className="chip">ทั้งหมด · {boxes.length}</span>
          <span className="chip" style={{ background: '#ffd080', borderColor: '#c88a10' }}>กำลังแพ็ค · {boxes.filter(b => b.status === 'open' || b.status === 'packing').length}</span>
          <span className="chip" style={{ background: '#b8d4f0', borderColor: '#4a80c0' }}>ปิดลังแล้ว · {boxes.filter(b => b.status === 'closed').length}</span>
          <span className="chip" style={{ background: '#96e096', borderColor: '#3a9a3a' }}>อนุมัติแล้ว · {boxes.filter(b => b.status === 'exported').length}</span>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => showToast('รีเฟรชแล้ว')}>⟲ รีเฟรช</button>
          <button className="btn sm" onClick={handleExport}>⇩ Export ทั้งวัน</button>
          <button
            className="btn sm"
            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
            onClick={clearBoxes}
          >
            ⊘ Clear · เริ่มวันถัดไป
          </button>
        </div>

        {/* today's box table */}
        <BoxTable
          boxes={boxes}
          onOpen={(id) => { setActiveBoxId(id); setTab('scan'); }}
          onPrint={(id) => { setActiveBoxId(id); setTab('closed'); }}
        />

        {/* history section */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="row" style={{
              borderBottom: '2px dashed var(--line)', paddingBottom: 8, marginBottom: 14,
              gap: 10,
            }}>
              <span style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, color: 'var(--mute)' }}>
                ประวัติย้อนหลัง ({history.length} วัน · เก็บไว้ 1 เดือน)
              </span>
              <div className="spacer" />
              <button
                className="btn sm ghost"
                style={{ color: 'var(--red, #c0392b)', borderColor: 'var(--red, #c0392b)' }}
                onClick={clearFirestore}
                title="ล้างข้อมูล Firestore ทั้งหมด (boxes, catalog, receive)"
              >
                🔥 ล้าง Firestore ทั้งหมด
              </button>
            </div>
            {history.map((entry, i) => (
              <HistoryEntry
                key={i}
                entry={entry}
                generateCSV={generateCSV}
                triggerDownload={triggerDownload}
                onDelete={() => handleDeleteHistory(i)}
              />
            ))}
          </div>
        )}
      </div>

      <Annotation text="คลิกลัง → ไปหน้าสแกน" style={{ top: 180, right: 20 }} arrow="br" />
    </div>
  );
}
