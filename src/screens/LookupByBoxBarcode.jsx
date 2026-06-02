import { useState } from 'react';

const statusLabel = {
  open:     'เปิด',
  packing:  'กำลังแพ็ค',
  closed:   'ปิดลังแล้ว',
  exported: 'ส่ง POS แล้ว',
  received: 'รับแล้ว',
};

const statusCls = {
  open:     'chip',
  packing:  'chip warn',
  closed:   'chip ok',
  exported: 'chip ok',
  received: 'chip ok',
};

export default function LookupByBoxBarcode({ boxes, setTab, setActiveBoxId, showToast, itemsByBox }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);

  function doSearch(val) {
    const q = val.trim().toLowerCase();
    if (!q) { setResult(null); return; }
    const found = boxes.find(b =>
      b.id.toLowerCase().includes(q) || (b.pos && b.pos.toLowerCase().includes(q))
    );
    setResult(found || 'not_found');
  }

  function handleEdit() {
    if (!result || result === 'not_found') return;
    setActiveBoxId(result.id);
    setTab('scan');
    showToast('เปิดลังเพื่อแก้ไข');
  }

  const foundBox = result && result !== 'not_found' ? result : null;
  const boxItems = foundBox ? (itemsByBox?.[foundBox.id] || []) : [];

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 480 }}>
      <div className="frame-header">
        <div className="row">
          <span className="title">🔍 สแกนลังเพื่อดูรายการ</span>
        </div>
        <div className="row">
          <span className="scan-indicator">พร้อมรับการยิง</span>
        </div>
      </div>

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="hand" style={{ fontSize: 22, marginBottom: 10 }}>ยิงบาร์โค้ดปิดลัง</div>
          <div style={{ border: '3px dashed var(--line)', borderRadius: 14, padding: 24, background: 'white' }}>
            <div style={{ fontFamily: 'system-ui', fontSize: 60, fontWeight: 700, color: 'var(--accent)' }}>|||</div>
            <input
              className="input big"
              placeholder="BX-…"
              style={{ textAlign: 'center' }}
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query); }}
            />
          </div>
          <div style={{ fontFamily: 'system-ui', color: 'var(--mute)', marginTop: 8, fontSize: 14 }}>
            หรือ พิมพ์ Box ID / POS number
          </div>
        </div>

        <div>
          {foundBox ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <b style={{ fontFamily: 'system-ui', fontSize: 22 }}>{foundBox.id}</b>
                <span className={statusCls[foundBox.status] || 'chip'} style={{ marginLeft: 10 }}>
                  {statusLabel[foundBox.status] || foundBox.status}
                </span>
                {foundBox.packer && (
                  <span className="mono" style={{ color: 'var(--mute)', marginLeft: 10, fontSize: 11 }}>
                    โดย {foundBox.packer.name}
                  </span>
                )}
                <span className="mono" style={{ color: 'var(--mute)', marginLeft: 10, fontSize: 11 }}>POS: {foundBox.pos}</span>
              </div>
              {boxItems.length > 0 ? (
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, background: 'white', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 14 }}>
                    <thead><tr><th>SKU</th><th>ชื่อ</th><th>หน่วย</th><th style={{ width: 60 }}>จำนวน</th></tr></thead>
                    <tbody>
                      {boxItems.map((l) => (
                        <tr key={l.sku}>
                          <td className="num-col">{l.sku}</td>
                          <td style={{ fontFamily: 'system-ui' }}>{l.name}</td>
                          <td style={{ fontFamily: 'system-ui' }}>{l.unit}</td>
                          <td style={{ fontFamily: 'system-ui', fontSize: 18, textAlign: 'center' }}>×{l.qty ?? l.got ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontFamily: 'system-ui', color: 'var(--mute)', fontSize: 14, padding: '16px 0' }}>
                  ไม่มีข้อมูลรายการสินค้าในลังนี้
                </div>
              )}
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn" onClick={() => window.print()}>พิมพ์ใบรายการ</button>
                <button className="btn" onClick={handleEdit}>เปิดลังใหม่ (แก้ไข)</button>
                <button className="btn ghost" onClick={() => showToast('ส่งข้อมูลให้คนขับแล้ว ✓')}>ส่งต่อให้คนขับ</button>
              </div>
            </>
          ) : result === 'not_found' ? (
            <div style={{ fontFamily: 'system-ui', color: 'var(--red)', padding: 20, fontSize: 18 }}>
              ไม่พบลัง "{query}"
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200, fontFamily: 'system-ui', fontSize: 16, color: 'var(--mute)' }}>
              ยิงบาร์โค้ดลังหรือพิมพ์ Box ID เพื่อค้นหา
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
