import { useState } from 'react';
import { createPortal } from 'react-dom';
import { branchLabel } from '../branches.js';

// ถังของลังที่ไม่มี box.branch (สาขารับไม่ได้) — lowercase ชนกับ code จริงไม่ได้ (extractBranch uppercase เสมอ)
const NO_BRANCH = '__none';
// ลังใบนี้อยู่ในตัวกรองสาขาที่เลือกไหม — ใช้ร่วมทั้งตารางวันนี้ + ประวัติ (logic เดียวกับ Outbound branchBoxes)
const matchBranch = (b, branchFilter) =>
  branchFilter === 'all' ? true : branchFilter === NO_BRANCH ? !b.branch : b.branch === branchFilter;

const statusLabel = {
  open:     { label: 'กำลังแพ็ค',       bg: '#ffd080', border: '#c88a10' },
  packing:  { label: 'กำลังแพ็ค',       bg: '#ffd080', border: '#c88a10' },
  closed:   { label: 'ปิดลังแล้ว',      bg: '#b8d4f0', border: '#4a80c0' },
  exported: { label: 'อนุมัติแล้ว',     bg: '#96e096', border: '#3a9a3a' },
  received: { label: 'สาขารับสินค้าแล้ว', bg: '#f5b8d4', border: '#c04080' },
};

// เวลาเปิด/ปิดลัง (KPI พนักงานแพ็คกิ้ง) — createdAt/closedAt เป็น epoch ms; ลังเก่าก่อนมี closedAt หรือลังที่ยังไม่ปิด → '—'
function formatTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—';
}

// onDelete: ส่งมาเฉพาะตารางลังวันนี้ (ลังจริงใน Firestore) — ประวัติย้อนหลังไม่ส่ง เพราะเป็น snapshot ลังที่ถูกลบไปแล้ว ลบซ้ำไม่ได้
function BoxTable({ boxes, onOpen, onPrint, onDelete }) {
  if (boxes.length === 0) return (
    <div style={{ padding: '20px 0', fontFamily: 'system-ui', color: 'var(--mute)', textAlign: 'center' }}>
      ไม่มีข้อมูลลัง
    </div>
  );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Box ID</th><th>สถานะ</th><th>พนักงาน</th><th>SKU</th><th>ชิ้น</th>
          <th>เลขที่เอกสาร</th><th>เปิดลัง</th><th>ปิดลัง</th><th>อัปเดต</th>
          {onDelete && <th style={{ width: 44 }}></th>}
        </tr>
      </thead>
      <tbody>
        {boxes.map((b) => (
          <tr key={b.id}>
            <td className="num-col">{b.id}</td>
            <td><span className="chip" style={{ background: statusLabel[b.status]?.bg, borderColor: statusLabel[b.status]?.border }}>● {statusLabel[b.status]?.label || b.status}</span></td>
            <td style={{ fontFamily: 'system-ui', fontSize: 14 }}>{b.packer?.name || '—'}</td>
            <td>{b.skuCount}</td>
            <td>{b.totalQty}</td>
            <td className="num-col">{b.pos}</td>
            <td className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{formatTime(b.createdAt)}</td>
            <td className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{formatTime(b.closedAt)}</td>
            <td style={{ color: 'var(--mute)' }}>{b.updated}</td>
            {onDelete && (
              <td>
                <button
                  className="btn sm ghost"
                  style={{ color: b.status === 'received' ? 'var(--mute)' : 'var(--red, #c0392b)', padding: '2px 7px' }}
                  disabled={b.status === 'received'}   // ลังที่สาขารับแล้วห้ามลบ (เสีย audit trail) — deleteBox() กันไว้อีกชั้น
                  title={b.status === 'received' ? 'ลบไม่ได้ — สาขารับสินค้าแล้ว' : 'ลบลังนี้ (ของจะกลับไปรายการเบิก)'}
                  onClick={() => onDelete(b.id)}
                >🗑</button>
              </td>
            )}
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
    // เฉพาะลังที่มีเลขที่เอกสาร (อนุมัติแล้ว) — box.pos = '—' คือยังไม่อนุมัติ
    const withDoc = entry.boxes.filter(b => b.pos && b.pos !== '—');
    const csv = generateCSV(withDoc);
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
        <span style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700 }}>
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

export default function BoxList({ boxes, activeBoxId, setTab, setActiveBoxId, showToast, createNewBox, generateCSV, triggerDownload, history, setHistory, clearBoxes, clearFirestore, deleteBox }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const deletingBox = confirmDeleteId ? boxes.find(b => b.id === confirmDeleteId) || null : null;

  // ตัวกรองสาขา — scope ทั้งหน้า (ตารางวันนี้ + ชิปสรุป + Export + ประวัติ)
  // ไม่ persist: กันมุมมองสาขาเดียวค้างข้ามวันแล้วพนักงานแจ้ง "ลังหาย" (เหตุผลเดียวกับ Outbound)
  const [branchFilter, setBranchFilter] = useState('all'); // all | box.branch | NO_BRANCH
  // นับจาก data จริง — code ที่ไม่รู้จัก (เช่นชื่อไฟล์เพี้ยน) ต้องโผล่ด้วย
  const branchCounts = boxes.reduce((m, b) => { const k = b.branch || NO_BRANCH; m[k] = (m[k] || 0) + 1; return m; }, {});
  const branchOpts = Object.keys(branchCounts).filter(k => k !== NO_BRANCH).sort();
  const untaggedN = branchCounts[NO_BRANCH] || 0;
  const branchBoxes = boxes.filter(b => matchBranch(b, branchFilter));

  // suffix ชื่อไฟล์ Export ตามสาขาที่กรอง: 'all' → ไม่เติม, สาขา → -SRC, ไม่ระบุ → -nobranch
  const exportSuffix = branchFilter === 'all' ? '' : branchFilter === NO_BRANCH ? '-nobranch' : `-${branchFilter}`;
  const exportLabel = branchFilter === 'all' ? '⇩ Export รายการลังทั้งหมด'
    : branchFilter === NO_BRANCH ? '⇩ Export ลังไม่ระบุสาขา'
    : `⇩ Export สาขา ${branchFilter}`;

  function handleExport() {
    const csv = generateCSV(branchBoxes);
    triggerDownload(csv, `export${exportSuffix}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  }

  // ลบลังทีละใบ — deleteBox (App.jsx) ลบ boxes/ + boxItems/ + progress/ ให้ครบในตัว
  // "คืนของไปรายการเบิก" เกิดอัตโนมัติ ไม่ต้องเขียนเพิ่ม: packedBaseOf (units.js) หักยอดจากลัง closed/exported/received
  // ที่ยังมีอยู่เท่านั้น → ลังหาย = ยอดที่เคยหักหายตาม → need กลับขึ้นเองทั้ง checklist พนักงาน + ติ๊กเขียว popup 📋 Picklist
  function confirmDelete() {
    if (!confirmDeleteId) return;
    deleteBox(confirmDeleteId);
    if (activeBoxId === confirmDeleteId) setActiveBoxId(null); // กันจอแพ็คเครื่องนี้ค้างชี้ลังที่ลบไปแล้ว
    showToast(`ลบลัง ${confirmDeleteId} แล้ว — ของกลับไปรายการเบิกแล้ว`, 'success');
    setConfirmDeleteId(null);
  }

  function handleDeleteHistory(index) {
    if (!window.confirm('ลบประวัติวันนี้ออกจากรายการ?')) return;
    setHistory(prev => prev.filter((_, i) => i !== index));
  }

  // ประวัติหลังกรองสาขา — เก็บ index เดิมไว้ (handleDeleteHistory ลบด้วย index ของ history เต็ม)
  // เลือกสาขาเจาะจง → ตัด entry ที่ไม่มีลังของสาขานั้นออก (เหลือเฉพาะวันที่เกี่ยวข้อง)
  const visibleHistory = history
    .map((entry, i) => ({ entry, i, boxes: entry.boxes.filter(b => matchBranch(b, branchFilter)) }))
    .filter(h => branchFilter === 'all' || h.boxes.length > 0);

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
        {/* แถวตัวกรองสาขา — scope กว้างสุด อยู่บนสุด (อธิบายว่าทำไมตัวเลขชิปสถานะข้างล่างขยับ)
            ทุกชิปมีจำนวน → บวกเองได้ว่าเท่ากับ "ทุกสาขา" = พิสูจน์ด้วยตาว่าไม่มีลังตกนอกถังไหน */}
        {boxes.length > 0 && (
          <div className="row" style={{ marginBottom: 10, gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mute)' }}>สาขา:</span>
            {[
              { k: 'all', label: 'ทุกสาขา', n: boxes.length },
              ...branchOpts.map(c => ({ k: c, label: branchLabel(c), n: branchCounts[c] })),
              // ถังลังไม่ระบุสาขา — โผล่ตลอดเมื่อมี (ลังพวกนี้สาขารับไม่ได้ ต้องเห็น)
              ...(untaggedN > 0 ? [{ k: NO_BRANCH, label: '⚠ ไม่ระบุสาขา', n: untaggedN, accentColor: 'var(--red)' }] : []),
            ].map(f => {
              const on = branchFilter === f.k;
              const color = f.accentColor || 'var(--accent)';
              return (
                <button
                  key={f.k}
                  onClick={() => setBranchFilter(f.k)}
                  style={{
                    padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                    border: `1.5px solid ${on ? color : 'var(--line)'}`,
                    background: on ? color : 'white',
                    color: on ? 'white' : (f.accentColor ? color : 'var(--ink)'),
                    fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: on ? 700 : 400,
                  }}
                >{f.label} ({f.n})</button>
              );
            })}
          </div>
        )}

        {/* summary + actions */}
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <span className="chip">ทั้งหมด · {branchBoxes.length}</span>
          <span className="chip" style={{ background: '#ffd080', borderColor: '#c88a10' }}>กำลังแพ็ค · {branchBoxes.filter(b => b.status === 'open' || b.status === 'packing').length}</span>
          <span className="chip" style={{ background: '#b8d4f0', borderColor: '#4a80c0' }}>ปิดลังแล้ว · {branchBoxes.filter(b => b.status === 'closed').length}</span>
          <span className="chip" style={{ background: '#96e096', borderColor: '#3a9a3a' }}>อนุมัติแล้ว · {branchBoxes.filter(b => b.status === 'exported').length}</span>
          <span className="chip" style={{ background: '#f5b8d4', borderColor: '#c04080' }}>สาขารับสินค้าแล้ว · {branchBoxes.filter(b => b.status === 'received').length}</span>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => showToast('รีเฟรชแล้ว')}>⟲ รีเฟรช</button>
          <button className="btn sm" onClick={handleExport}>{exportLabel}</button>
          <button
            className="btn sm"
            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
            onClick={clearBoxes}
          >
            ⊘ Clear · เริ่มวันถัดไป
          </button>
          <button
            className="btn sm ghost"
            style={{ color: 'var(--red, #c0392b)', borderColor: 'var(--red, #c0392b)' }}
            onClick={clearFirestore}
            title="ล้างข้อมูล Firestore ทั้งหมด (boxes, catalog, receive)"
          >
            🔥 ล้าง Firestore ทั้งหมด
          </button>
        </div>

        {/* today's box table — onDelete เฉพาะตารางนี้ (ลังจริง); ประวัติเป็น snapshot ลบไม่ได้ */}
        <BoxTable
          boxes={branchBoxes}
          onOpen={(id) => { setActiveBoxId(id); setTab('scan'); }}
          onPrint={(id) => { setActiveBoxId(id); setTab('closed'); }}
          onDelete={(id) => setConfirmDeleteId(id)}
        />

        {/* history section — กรองตามสาขาที่เลือก (นับวันจาก entry ที่เหลือหลังกรอง) */}
        {visibleHistory.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="row" style={{
              borderBottom: '2px dashed var(--line)', paddingBottom: 8, marginBottom: 14,
              gap: 10,
            }}>
              <span style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--mute)' }}>
                ประวัติย้อนหลัง ({visibleHistory.length} วัน · เก็บไว้ 1 เดือน)
              </span>
            </div>
            {visibleHistory.map(({ entry, i, boxes: entryBoxes }) => (
              <HistoryEntry
                key={i}
                entry={{ ...entry, boxes: entryBoxes }}
                generateCSV={generateCSV}
                triggerDownload={triggerDownload}
                onDelete={() => handleDeleteHistory(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ยืนยันลบลัง — เตือนตามสถานะจริงของลัง (คำเตือนต่างกันคนละความเสี่ยง) */}
      {confirmDeleteId && deletingBox && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            textAlign: 'center', minWidth: 300, maxWidth: 380,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ ยืนยันลบลัง {deletingBox.id}?</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>
              {deletingBox.skuCount ?? 0} SKU · {deletingBox.totalQty ?? 0} ชิ้น{deletingBox.packer ? ` · แพ็คโดย ${deletingBox.packer.name}` : ''}
            </div>

            {/* ลังยังเปิดอยู่ = อาจมีคนกำลังแพ็คบนเครื่อง Android ตอนนี้ — ของที่สแกนค้างในเครื่องเขาจะหายทั้งหมด */}
            {(deletingBox.status === 'open' || deletingBox.status === 'packing') && (
              <div style={{ fontSize: 13, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '8px 10px', margin: '10px 0', textAlign: 'left' }}>
                ⚠ ลังนี้ยัง <b>กำลังแพ็ค</b> — ถ้าพนักงานกำลังใช้ลังนี้อยู่ ของที่สแกนค้างในเครื่องเขาจะหาย ให้แน่ใจว่าไม่มีใครใช้ลังนี้แล้ว
              </div>
            )}
            {deletingBox.status === 'exported' && (
              <div style={{ fontSize: 13, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '8px 10px', margin: '10px 0', textAlign: 'left' }}>
                ⚠ ลังนี้ <b>อนุมัติเอกสารแล้ว</b> ({deletingBox.pos}) — สาขาอาจกำลังรอรับลังนี้อยู่
              </div>
            )}
            {deletingBox.textExported && (
              <div style={{ fontSize: 13, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '8px 10px', margin: '10px 0', textAlign: 'left' }}>
                ⚠ ลังนี้ส่งออกไฟล์ Text เข้า POS ไปแล้ว — ลบแล้วข้อมูลจะไม่ตรงกับ POS อีกต่อไป
              </div>
            )}

            <div style={{ fontSize: 13, color: '#1a7a3a', background: '#e8f5e9', borderRadius: 8, padding: '8px 10px', margin: '10px 0', textAlign: 'left' }}>
              ↩ สินค้าในลังนี้จะ <b>กลับไปอยู่ในรายการเบิก</b> ให้แพ็คใหม่ได้ทันที
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', margin: '8px 0 20px' }}>ข้อมูลลังและรายการสินค้าจะถูกลบอย่างถาวร ไม่สามารถกู้คืนได้</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={() => setConfirmDeleteId(null)}>ยกเลิก</button>
              <button className="btn danger sm" onClick={confirmDelete}>ลบลัง</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
