import { useState } from 'react';
import * as XLSX from 'xlsx';
import SketchyBarcode from '../components/SketchyBarcode.jsx';

export default function BoxClosedLabel({ boxes, setBoxes, activeBoxId, setActiveBoxId, setTab, showToast, createNewBox, itemsByBox, triggerDownload, costMap = {} }) {
  const closedBoxes = boxes.filter(b => b.status === 'closed' || b.status === 'exported' || b.status === 'received');

  const [selectedId, setSelectedId] = useState(() => {
    // เลือก activeBoxId เฉพาะเมื่อเป็นลังที่ปิดแล้วจริง — หลังปิดลัง activeBoxId คือลังใหม่ที่ยัง open
    if (activeBoxId && closedBoxes.find(b => b.id === activeBoxId)) return activeBoxId;
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
    if (activeBox.status !== 'closed' && activeBox.status !== 'exported') {
      showToast('⚠ ไม่สามารถส่งออกได้', 'error');
      return;
    }
    if (activeBox.textExported) {
      showToast('⚠ ลังนี้ส่งออกไฟล์ Text แล้ว · กด Clear เริ่มวันถัดไปเพื่อส่งใหม่', 'error');
      return;
    }
    if (boxItems.length === 0) { showToast('⚠ ไม่มีรายการสินค้าในลังนี้'); return; }
    const lines = boxItems.map(l => {
      const cost = costMap[`${l.sku}__${l.unit}`] ?? 0;
      return `${l.barcode || ''}\t${l.qty ?? l.got ?? 0}\t${cost}`;
    });
    triggerDownload(lines.join('\n'), `${activeBox.id}.txt`, 'text/plain');
    // mark ว่าลังนี้ส่งออก Text แล้ว — disable ปุ่มจนกว่าจะกด Clear (clearBoxes ลบ box → flag หาย)
    setBoxes(prev => prev.map(b => b.id === activeBox.id ? { ...b, textExported: true } : b));
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
    if (!activeBox.textExported) {
      showToast('⚠ กรุณากดส่งออกไฟล์ Text ก่อน', 'error');
      return;
    }
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

  function handleExportItems() {
    if (closedBoxes.length === 0) { showToast('⚠ ไม่มีลังที่ปิดแล้ว', 'error'); return; }
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const headers = ['เลขที่ลังสินค้า', 'เลขที่เอกสาร', 'SKU', 'ชื่อสินค้า', 'Barcode', 'หน่วย', 'จำนวน', 'พนักงานแพ็คสินค้า', 'วันที่ส่งสินค้า'];
    const dataRows = closedBoxes.flatMap(b =>
      (itemsByBox?.[b.id] || []).map(l => [
        b.id,
        b.pos && b.pos !== '—' ? b.pos : '',
        l.sku,
        l.name,
        l.barcode || '',
        l.unit,
        l.qty ?? l.got ?? 0,
        b.packer?.name || '',
        dateStr,
      ])
    );
    if (dataRows.length === 0) { showToast('⚠ ไม่มีรายการสินค้าในลังทั้งหมด', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws['!cols'] = [14, 13, 11, 36, 16, 8, 8, 16, 13].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายการสินค้า');
    XLSX.writeFile(wb, `all_boxes_${dateStr.replace(/\//g, '-')}.xlsx`);
    showToast(`ส่งออก ${dataRows.length} รายการ ✓`, 'success');
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
          <button
            className="btn sm"
            style={{ marginLeft: 8, opacity: closedBoxes.length > 0 ? 1 : 0.45, cursor: closedBoxes.length > 0 ? 'pointer' : 'not-allowed', background: 'var(--accent)', color: 'white', border: '1.5px solid black' }}
            onClick={handleExportItems}
          >⇩ ส่งออกรายการลังทั้งหมด</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: 460 }}>

        {/* LEFT: box list — grid 3 คอลัมน์ เพื่อให้เห็นหลายลังพร้อมกัน ลด scroll */}
        <div style={{
          borderRight: '1.5px solid var(--line)',
          padding: '14px 10px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, alignContent: 'start',
          overflowY: 'auto', maxHeight: 560,
          background: 'var(--paper-dark)',
        }}>
          <div style={{ gridColumn: '1 / -1', fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>
            ลังที่ปิดแล้ว ({closedBoxes.length})
          </div>
          {closedBoxes.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', textAlign: 'center', marginTop: 20 }}>
              ยังไม่มีลังที่ปิด
            </div>
          )}
          {closedBoxes.map(b => {
            const active = b.id === selectedId && !isSearching;
            return (
              <button
                key={b.id}
                onClick={() => { setSelectedId(b.id); setGlobalSearch(''); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 4px', gap: 3,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 10,
                  background: active ? 'var(--accent-soft)' : 'white',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 22 }}>📦</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink)', textAlign: 'center', lineHeight: 1.1 }}>
                  {b.id}
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 10, color: 'var(--mute)', textAlign: 'center' }}>
                  {b.skuCount ?? 0} SKU · {b.totalQty ?? 0} ชิ้น
                </div>
                {b.packer && (
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 10, color: 'var(--mute)', textAlign: 'center' }}>
                    {b.packer.name}
                  </div>
                )}
                {b.status === 'exported' && b.pos && b.pos !== '—'
                  ? <span className="chip ok" style={{ fontSize: 9, padding: '1px 6px' }}>อนุมัติแล้ว</span>
                  : <span className="chip" style={{ fontSize: 9, padding: '1px 6px' }}>รออนุมัติ</span>
                }
                {b.status === 'exported' && b.pos && b.pos !== '—' && (
                  <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', marginTop: 1, textAlign: 'center', wordBreak: 'break-all' }}>{b.pos}</div>
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
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 450, overflowY: 'auto', background: 'white' }}>
                <table className="tbl" style={{ fontSize: 14 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
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
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

            {/* LEFT: รายชื่อสินค้าในลัง */}
            <div>
              <div className="hand" style={{ fontSize: 20, marginBottom: 6 }}>รายชื่อสินค้าในลัง</div>
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 450, overflowY: 'auto', background: 'white' }}>
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

            {/* RIGHT: สติกเกอร์ + ปุ่ม */}
            <div>
              <div className="hand" style={{ fontSize: 20, marginBottom: 8 }}>ตัวอย่างสติกเกอร์ติดลัง (90×65 mm)</div>
              <div className="print-label" style={{
                background: 'white', border: '2px solid var(--line)', borderRadius: 8,
                padding: '14px 16px', fontFamily: 'JetBrains Mono',
                width: 340, height: 245, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px dashed var(--line)', paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700 }}>คลังสินค้า · WH-01</div>
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

              {/* ปุ่ม: ส่งออกไฟล์ Text — disable ถาวรหลังกด จนกว่าจะ Clear */}
              <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
                {(() => {
                  const exportable = (activeBox.status === 'closed' || activeBox.status === 'exported');
                  const done = !!activeBox.textExported;
                  return (
                    <button
                      className="btn"
                      onClick={handleExportBarcode}
                      disabled={!exportable || done}
                      style={{
                        opacity: (exportable && !done) ? 1 : 0.45,
                        cursor: (exportable && !done) ? 'pointer' : 'not-allowed',
                      }}
                    >{done ? '✓ ส่งออกไฟล์ Text แล้ว' : '⇩ ส่งออกไฟล์ Text'}</button>
                  );
                })()}
              </div>

              {/* เลขที่เอกสาร + อนุมัติเอกสาร — กรอกได้ต่อเมื่อส่งออกไฟล์ Text แล้ว (แสดงเฉพาะยังไม่ exported) */}
              {activeBox.status !== 'exported' && (() => {
                const textDone = !!activeBox.textExported;
                const canApprove = textDone && docNumber.trim();
                return (
                  <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      placeholder={textDone ? 'เลขที่เอกสาร…' : 'กดส่งออกไฟล์ Text ก่อน'}
                      style={{ flex: 1, minWidth: 150, opacity: textDone ? 1 : 0.5, cursor: textDone ? 'text' : 'not-allowed' }}
                      value={docNumber}
                      onChange={e => setDocNumber(e.target.value)}
                      disabled={!textDone}
                    />
                    <button
                      className="btn primary"
                      onClick={handleSendPOS}
                      disabled={!canApprove}
                      style={{ opacity: canApprove ? 1 : 0.45, cursor: canApprove ? 'pointer' : 'not-allowed' }}
                    >อนุมัติเอกสาร</button>
                  </div>
                );
              })()}

              {/* พิมพ์ใบปิดลัง — ด้านล่างช่องเลขที่เอกสาร (active เฉพาะ exported) */}
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={handlePrint}
                  style={{ opacity: activeBox.status === 'exported' ? 1 : 0.45, cursor: activeBox.status === 'exported' ? 'pointer' : 'not-allowed' }}
                >🖨 พิมพ์ใบปิดลัง</button>
              </div>
            </div>

          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontFamily: 'Patrick Hand', fontSize: 16 }}>
            เลือกลังทางซ้ายเพื่อดูรายละเอียด
          </div>
        )}
      </div>
    </div>
  );
}
