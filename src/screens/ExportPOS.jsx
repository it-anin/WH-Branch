import { useState } from 'react';
import Annotation from '../components/Annotation.jsx';

const FORMATS = ['CSV', 'JSON', 'XML', 'API ตรง'];

function buildPreview(fmt, boxList) {
  if (fmt === 'CSV') {
    const header = 'box_id,pos_number,sku_count,total_qty,packed_at';
    const rows = boxList.map(b => `${b.id},${b.pos},${b.skuCount},${b.totalQty},${b.updated}`);
    return ['# preview (CSV)', header, ...rows, '# *** รูปแบบ POS number ยังไม่กำหนด — ใช้ placeholder ***'].join('\n');
  }
  if (fmt === 'JSON') {
    return JSON.stringify(
      boxList.map(b => ({ box_id: b.id, pos_number: b.pos, sku_count: b.skuCount, total_qty: b.totalQty })),
      null, 2
    );
  }
  if (fmt === 'XML') {
    const rows = boxList.map(b => `  <box id="${b.id}" pos="${b.pos}" sku="${b.skuCount}" qty="${b.totalQty}" />`).join('\n');
    return `<export>\n${rows}\n</export>`;
  }
  if (fmt === 'API ตรง') {
    return `POST https://pos.example.com/api/v1/boxes\nAuthorization: Bearer <TOKEN>\nContent-Type: application/json\n\n${JSON.stringify({ boxes: boxList.map(b => ({ id: b.id, pos: b.pos })) }, null, 2)}`;
  }
  return '';
}

export default function ExportPOS({ boxes, setBoxes, showToast, triggerDownload }) {
  const exportableBoxes = boxes.filter(b => b.status === 'closed' || b.status === 'packing');
  const [format, setFormat] = useState('CSV');
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(boxes.filter(b => b.status === 'closed').map(b => b.id))
  );
  const [showPreview, setShowPreview] = useState(true);

  const selectedBoxes = exportableBoxes.filter(b => selectedIds.has(b.id));
  const allSelected = exportableBoxes.length > 0 && selectedIds.size === exportableBoxes.length;

  function toggleId(id, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleExport() {
    if (selectedBoxes.length === 0) { showToast('ยังไม่ได้เลือกลัง'); return; }
    const extMap = { CSV: 'csv', JSON: 'json', XML: 'xml', 'API ตรง': 'txt' };
    const mimeMap = { CSV: 'text/csv', JSON: 'application/json', XML: 'text/xml', 'API ตรง': 'text/plain' };
    const content = buildPreview(format, selectedBoxes);

    if (format !== 'API ตรง') {
      triggerDownload(content, `export-${Date.now()}.${extMap[format]}`, mimeMap[format]);
    }

    setBoxes(prev => prev.map(b =>
      selectedIds.has(b.id) ? { ...b, status: 'exported' } : b
    ));
    showToast(`Export ${format} สำเร็จ ✓`);
  }

  const totalSku = selectedBoxes.reduce((s, b) => s + b.skuCount, 0);
  const totalQty = selectedBoxes.reduce((s, b) => s + b.totalQty, 0);

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 480 }}>
      <div className="frame-header">
        <div className="row">
          <span className="title">⇨ Export → POS</span>
          <span className="mono" style={{ color: 'var(--mute)', marginLeft: 10 }}>
            {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · รอบบ่าย
          </span>
        </div>
        <div className="row">
          <span className="chip ok">ระบบ POS · เชื่อมต่อแล้ว</span>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="chip">เลือกช่วงเวลา: วันนี้</span>
          <span className="chip">สถานะ: ปิดลังแล้ว</span>
          <span className="chip warn">{selectedBoxes.length} ลัง เลือกอยู่</span>
          <div className="spacer" />
          <div className="seg">
            {FORMATS.map(f => (
              <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{f}</button>
            ))}
          </div>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(exportableBoxes.map(b => b.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th>Box ID</th><th>POS Number</th><th>SKU</th><th>ชิ้น</th>
              <th>สถานะส่ง</th><th>เวลาส่ง</th>
            </tr>
          </thead>
          <tbody>
            {exportableBoxes.map(b => (
              <tr key={b.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(b.id)}
                    onChange={(e) => toggleId(b.id, e.target.checked)}
                  />
                </td>
                <td className="num-col">{b.id}</td>
                <td className="num-col">{b.pos}</td>
                <td>{b.skuCount}</td>
                <td>{b.totalQty}</td>
                <td><span className={b.status === 'exported' ? 'chip ok' : 'chip warn'}>{b.status === 'exported' ? 'ส่งแล้ว' : 'รอส่ง'}</span></td>
                <td>{b.status === 'exported' ? b.updated : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <div style={{ padding: 10, background: 'var(--paper-dark)', borderRadius: 8, fontFamily: 'system-ui', fontSize: 14 }}>
            <b>สรุป:</b> {selectedBoxes.length} ลัง · {totalSku} SKU · {totalQty} ชิ้น
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowPreview(p => !p)}>
            {showPreview ? 'ซ่อนตัวอย่าง' : 'ตัวอย่างไฟล์'}
          </button>
          <button className="btn primary lg" onClick={handleExport}>⇩ Export &amp; ส่ง POS</button>
        </div>

        {showPreview && (
          <div style={{ marginTop: 16, padding: 14, border: '2px dashed var(--line)', borderRadius: 10, fontFamily: 'JetBrains Mono', fontSize: 12, background: 'white', whiteSpace: 'pre', overflow: 'auto' }}>
            {buildPreview(format, selectedBoxes.length > 0 ? selectedBoxes : exportableBoxes)}
          </div>
        )}
      </div>
      <Annotation text="รูปแบบเลขยังรอระบบ POS" style={{ top: 50, right: 60 }} arrow="br" />
    </div>
  );
}
