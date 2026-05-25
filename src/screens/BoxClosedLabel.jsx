import { useState } from 'react';
import SketchyBarcode from '../components/SketchyBarcode.jsx';
import Annotation from '../components/Annotation.jsx';

export default function BoxClosedLabel({ boxes, setBoxes, activeBoxId, setActiveBoxId, setTab, showToast, createNewBox, itemsByBox, triggerDownload, costMap = {} }) {
  const closedBoxes = boxes.filter(b => b.status === 'closed' || b.status === 'exported' || b.status === 'received');

  const [selectedId, setSelectedId] = useState(() => {
    if (activeBoxId && boxes.find(b => b.id === activeBoxId)) return activeBoxId;
    if (closedBoxes.length > 0) return closedBoxes[0].id;
    return null;
  });
  const [globalSearch, setGlobalSearch] = useState('');
  const [docNumber, setDocNumber] = useState('');

  const activeBox = boxes.find(b => b.id === selectedId) || null;
  const boxItems = selectedId ? (itemsByBox?.[selectedId] || []) : [];

  // global search across all closed boxes
  const searchResults = globalSearch.trim()
    ? closedBoxes.flatMap(b => {
        const items = itemsByBox?.[b.id] || [];
        return items
          .filter(l =>
            l.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
            l.sku.toLowerCase().includes(globalSearch.toLowerCase())
          )
          .map(l => ({ ...l, boxId: b.id, packer: b.packer }));
      })
    : [];
  const isSearching = globalSearch.trim().length > 0;

  function handleExportBarcode() {
    if (!activeBox) return;
    if (activeBox.status !== 'exported') {
      showToast('⚠ กรุณากรอกเลขที่เอกสารและอนุมัติเอกสารก่อน', 'error');
      return;
    }
    if (boxItems.length === 0) { showToast('⚠ ไม่มีรายการสินค้าในลังนี้'); return; }
    const lines = boxItems.map(l => {
      const cost = costMap[`${l.sku}__${l.unit}`] ?? 0;
      return `${l.barcode || ''}\t${l.qty ?? l.got ?? 0}\t${cost}`;
    });
    triggerDownload(lines.join('\n'), `${activeBox.id}.txt`, 'text/plain');
    showToast(`ส่งออก ${lines.length} รายการ ✓`);
  }

  function handlePrint() {
    if (!activeBox) return;
    if (activeBox.status !== 'exported') {
      showToast('⚠ กรุณากรอกเลขที่เอกสารและอนุมัติเอกสารก่อน', 'error');
      return;
    }
    window.print();
  }

  function handleSendPOS() {
    if (!activeBox) return;
    if (!docNumber.trim()) {
      showToast('⚠ กรุณากรอกเลขที่เอกสาร', 'error');
      return;
    }
    setBoxes(prev => prev.map(b =>
      b.id === activeBox.id ? { ...b, status: 'exported', pos: docNumber.trim() } : b
    ));
    setDocNumber('');
    showToast('อนุมัติแล้ว ✓', 'success');
  }

  function jumpToBox(boxId) {
    setDocNumber('');
    setSelectedId(boxId);
    setActiveBoxId(boxId);
    setGlobalSearch('');
  }

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 480 }}>
      <div className="frame-header">
        <div className="row">
          <span className="title">🎉 ปิดลังสำเร็จ</span>
          {activeBox && !isSearching && <span className="chip ok" style={{ marginLeft: 10 }}>✓ {activeBox.id}</span>}
          <div className="spacer" />
          <input
            className="input"
            placeholder="🔍 ค้นหาสินค้าข้ามทุกลัง…"
            style={{ width: 240 }}
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
          />
          {isSearching && (
            <button className="btn sm ghost" style={{ marginLeft: 6 }} onClick={() => setGlobalSearch('')}>× ล้าง</button>
          )}
          <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => setTab('list')}>× ปิดหน้าต่าง</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 460 }}>

        {/* LEFT: box list */}
        <div style={{
          borderRight: '1.5px solid var(--line)',
          padding: '14px 10px',
          display: 'flex', flexDirection: 'column', gap: 8,
          overflowY: 'auto', maxHeight: 520,
          background: 'var(--paper-dark)',
        }}>
          <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>
            ลังที่ปิดแล้ว ({closedBoxes.length})
          </div>
          {closedBoxes.length === 0 && (
            <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', textAlign: 'center', marginTop: 20 }}>
              ยังไม่มีลังที่ปิด
            </div>
          )}
          {closedBoxes.map(b => {
            const active = b.id === selectedId && !isSearching;
            return (
              <button
                key={b.id}
                onClick={() => { setSelectedId(b.id); setActiveBoxId(b.id); setGlobalSearch(''); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '10px 8px', gap: 4,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 10,
                  background: active ? 'var(--accent-soft)' : 'white',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 32 }}>📦</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 14, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink)' }}>
                  {b.id}
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: 'var(--mute)' }}>
                  {b.skuCount ?? 0} SKU · {b.totalQty ?? 0} ชิ้น
                </div>
                {b.packer && (
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: 'var(--mute)' }}>
                    {b.packer.name}
                  </div>
                )}
                {b.status === 'exported' && b.pos && b.pos !== '—'
                  ? <span className="chip ok" style={{ fontSize: 10 }}>อนุมัติแล้ว</span>
                  : <span className="chip" style={{ fontSize: 10 }}>รออนุมัติ</span>
                }
                {b.status === 'exported' && b.pos && b.pos !== '—' && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>{b.pos}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* RIGHT: search results OR label detail */}
        {isSearching ? (
          <div style={{ padding: 20, overflowY: 'auto' }}>
            <div className="hand" style={{ fontSize: 20, marginBottom: 12 }}>
              ผลการค้นหา "{globalSearch}" — {searchResults.length} รายการ
            </div>
            {searchResults.length === 0 ? (
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)' }}>
                ไม่พบสินค้าในลังที่ปิดแล้ว
              </div>
            ) : (
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
                <table className="tbl" style={{ fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th>ลัง</th>
                      <th>SKU / ชื่อสินค้า</th>
                      <th style={{ width: 70 }}>หน่วย</th>
                      <th style={{ width: 60, textAlign: 'center' }}>จำนวน</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((l, i) => (
                      <tr key={`${l.boxId}-${l.sku}-${i}`}>
                        <td>
                          <span style={{ fontFamily: 'Caveat', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{l.boxId}</span>
                          {l.packer && <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: 'var(--mute)' }}>{l.packer.name}</div>}
                        </td>
                        <td>
                          <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                          <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                        </td>
                        <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                        <td style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                          ×{l.qty ?? l.got ?? 0}
                        </td>
                        <td>
                          <button className="btn sm ghost" onClick={() => jumpToBox(l.boxId)}>ดูลัง →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeBox ? (
          <div style={{ padding: 20 }}>
            <div className="hand" style={{ fontSize: 20, marginBottom: 8 }}>ตัวอย่างสติกเกอร์ติดลัง (90×65 mm)</div>
            <div className="print-label" style={{
              background: 'white', border: '2px solid var(--line)', borderRadius: 8,
              padding: '14px 16px', fontFamily: 'JetBrains Mono',
              width: 340, height: 245, boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px dashed var(--line)', paddingBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700 }}>คลังกลาง · WH-01</div>
                  <div style={{ fontSize: 10, color: 'var(--mute)' }}>packed {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Caveat', fontSize: 16, fontWeight: 700 }}>{activeBox.id}</div>
                  {activeBox.status === 'exported' && activeBox.pos && activeBox.pos !== '—' && (
                    <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>เลขที่: {activeBox.pos}</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SketchyBarcode value={activeBox.id} width={280} height={56} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
                <div>SKU: <b>{activeBox.skuCount ?? 0}</b></div>
                <div>ชิ้น: <b>{activeBox.totalQty ?? 0}</b></div>
                {activeBox.packer && <div>โดย: <b>{activeBox.packer.name}</b></div>}
              </div>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 10 }}>
              <button
                className="btn primary"
                onClick={handlePrint}
                style={{ opacity: activeBox.status === 'exported' ? 1 : 0.45, cursor: activeBox.status === 'exported' ? 'pointer' : 'not-allowed' }}
              >🖨 พิมพ์ใบปิดลัง</button>
              <button
                className="btn"
                onClick={handleExportBarcode}
                style={{ opacity: activeBox.status === 'exported' ? 1 : 0.45, cursor: activeBox.status === 'exported' ? 'pointer' : 'not-allowed' }}
              >⇩ ส่งออกไฟล์ Text</button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="hand" style={{ fontSize: 20, marginBottom: 6 }}>รายชื่อสินค้าในลัง</div>
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto', background: 'white' }}>
                {boxItems.length > 0 ? (
                  <table className="tbl" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>ชื่อสินค้า</th>
                        <th style={{ width: 60 }}>หน่วย</th>
                        <th style={{ width: 55, textAlign: 'center' }}>จำนวน</th>
                        <th style={{ width: 70 }}>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boxItems.map(l => (
                        <tr key={l.sku}>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{l.name}</td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                          <td style={{ fontFamily: 'Caveat', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>×{l.qty ?? l.got ?? 0}</td>
                          <td className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{l.location || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', padding: 10 }}>ไม่มีข้อมูลรายการสินค้า</div>
                )}
              </div>
            </div>

            {activeBox.status !== 'exported' && (
              <div className="row" style={{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="เลขที่เอกสาร…"
                  style={{ flex: 1, minWidth: 160 }}
                  value={docNumber}
                  onChange={e => setDocNumber(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={handleSendPOS}
                  style={{ opacity: docNumber.trim() ? 1 : 0.45, cursor: docNumber.trim() ? 'pointer' : 'not-allowed' }}
                >
                  อนุมัติเอกสาร
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontFamily: 'Patrick Hand', fontSize: 16 }}>
            เลือกลังทางซ้ายเพื่อดูรายละเอียด
          </div>
        )}
      </div>
      <Annotation text="ค้นหาสินค้าข้ามทุกลัง → กด ดูลัง" style={{ top: 60, right: 280, maxWidth: 180 }} arrow="tr" />
    </div>
  );
}
