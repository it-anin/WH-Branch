import { useState, useRef } from 'react';
import Annotation from '../components/Annotation.jsx';
import { generatePOS, matchBarcode } from '../data.js';

export default function PackScanA({ boxes, setBoxes, activeBoxId, setTab, showToast, createNewBox, setItemsByBox, catalog, packer }) {
  const [items, setItems] = useState([]);
  const [lastScanned, setLastScanned] = useState(null);
  const barcodeRef = useRef(null);

  const totalQty = items.reduce((s, l) => s + l.qty, 0);
  const boxLabel = activeBoxId || 'BX-????';

  function handleBarcode(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val) return;
    e.target.value = '';

    if (!activeBoxId) { createNewBox(); showToast('เปิดลังใหม่อัตโนมัติ'); }

    const match = catalog.find(l => matchBarcode(l, val));
    if (!match) { showToast('ไม่พบสินค้าในรายการเบิก'); return; }

    setLastScanned(match);
    setItems(prev => {
      const existing = prev.find(it => it.sku === match.sku);
      if (existing) return prev.map(it => it.sku === match.sku ? { ...it, qty: it.qty + 1 } : it);
      return [{ ...match, qty: 1 }, ...prev];
    });
  }

  function handleCloseBox() {
    if (!activeBoxId) { showToast('ยังไม่ได้เลือกลัง'); return; }
    const pos = generatePOS(activeBoxId);
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    setBoxes(prev => prev.map(b =>
      b.id === activeBoxId
        ? { ...b, status: 'closed', packer: packer || b.packer || null, skuCount: items.length, totalQty, pos, updated: time }
        : b
    ));
    setItemsByBox(prev => ({ ...prev, [activeBoxId]: items }));
    setTab('closed');
  }

  function handleCancel() {
    if (!window.confirm('ยกเลิกลังนี้ ข้อมูลจะหายทั้งหมด ยืนยันไหม?')) return;
    setTab('list');
  }

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 580 }}>
      <div className="frame-header">
        <div className="row">
          <button className="btn sm ghost" onClick={() => setTab('list')}>← กลับ</button>
          <span className="title">แพ็คลัง · {boxLabel}</span>
          <span className="chip warn" style={{ marginLeft: 10 }}>● กำลังแพ็ค</span>
          {packer && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 8 }}>
              {packer.code} · {packer.name}
            </span>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={() => { createNewBox(); showToast('เปิดลังใหม่แล้ว'); }}>+ เปิดลังใหม่</button>
        </div>
        <div className="row">
          <span className="scan-indicator">สแกนเนอร์พร้อม</span>
          <button className="btn sm" onClick={() => showToast('พักแล้ว · ลังยังค้างอยู่')}>⏸ พัก</button>
        </div>
      </div>

      <div className="grid-3-pack" style={{ padding: 16, gap: 18 }}>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <div className="hand" style={{ fontSize: 20, marginBottom: 4 }}>👉 ยิงบาร์โค้ดที่ช่องนี้</div>
            <input
              ref={barcodeRef}
              className="input big"
              placeholder="สแกน / พิมพ์ barcode…"
              autoFocus
              onKeyDown={handleBarcode}
            />
            <div style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)', marginTop: 4 }}>
              ยิงซ้ำได้ → เพิ่มจำนวน · กด Enter เพื่อยืนยัน
            </div>
          </div>

          <div>
            <div className="row" style={{ marginBottom: 6 }}>
              <b className="hand" style={{ fontSize: 20 }}>สินค้าในลังนี้</b>
              <span className="chip" style={{ marginLeft: 8 }}>{items.length} SKU · {totalQty} ชิ้น</span>
              <div className="spacer" />
              <span className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>10–15 SKU / ลัง</span>
            </div>

            <div style={{ border: '2px solid var(--line)', borderRadius: 10, background: 'white', maxHeight: 360, overflow: 'auto' }}>
              <table className="tbl">
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>SKU / ชื่อ</th>
                    <th style={{ width: 110 }}>Barcode</th>
                    <th style={{ width: 70 }}>หน่วย</th>
                    <th style={{ width: 90 }}>จำนวน</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l, i) => (
                    <tr key={l.sku} style={l.sku === lastScanned?.sku ? { background: 'var(--accent-soft)' } : null}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="mono" style={{ fontSize: 12 }}>{l.sku}</div>
                        <div>{l.name}</div>
                      </td>
                      <td className="num-col">{l.barcode}</td>
                      <td>{l.unit}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button
                            className="btn sm ghost"
                            style={{ padding: '0 7px' }}
                            onClick={() => setItems(prev => prev.map(it => it.sku === l.sku ? { ...it, qty: Math.max(1, it.qty - 1) } : it))}
                          >−</button>
                          <b style={{ fontSize: 18, minWidth: 20, textAlign: 'center' }}>{l.qty}</b>
                          <button
                            className="btn sm ghost"
                            style={{ padding: '0 7px' }}
                            onClick={() => setItems(prev => prev.map(it => it.sku === l.sku ? { ...it, qty: it.qty + 1 } : it))}
                          >+</button>
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn sm ghost"
                          style={{ color: 'var(--red)', padding: '0 6px' }}
                          onClick={() => setItems(prev => prev.filter(it => it.sku !== l.sku))}
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <div className="frame" style={{ padding: 14, boxShadow: '3px 3px 0 var(--line)' }}>
            <div className="hand" style={{ fontSize: 20, marginBottom: 6 }}>สินค้าที่สแกนล่าสุด</div>
            <div className="placeholder-img" style={{ width: '100%', height: 120, marginBottom: 8 }}>[ product photo ]</div>
            {lastScanned ? (
              <>
                <div className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{lastScanned.sku} · {lastScanned.barcode}</div>
                <div style={{ fontSize: 18, marginTop: 4 }}><b>{lastScanned.name}</b></div>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="chip ok">✓ พบในระบบ</span>
                  <span className="chip">1 {lastScanned.unit}</span>
                </div>
              </>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>— ยังไม่ได้สแกน —</div>
                <div style={{ fontSize: 14, marginTop: 4, color: 'var(--mute)', fontFamily: 'system-ui' }}>ยิงบาร์โค้ดเพื่อเริ่ม</div>
              </>
            )}
          </div>

          <div style={{ padding: 14, border: '2px dashed var(--line)', borderRadius: 10 }}>
            <div className="hand" style={{ fontSize: 20, marginBottom: 6 }}>สรุปลัง</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>SKU ทั้งหมด</span><b>{items.length}</b></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>จำนวนชิ้น</span><b>{totalQty}</b></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>น้ำหนักรวม</span><b>~4.8 kg</b></div>
            <div style={{ height: 8, background: 'var(--paper-dark)', borderRadius: 4, marginTop: 10, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
              <div style={{ width: `${Math.min(100, (items.length / 15) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4, fontFamily: 'system-ui' }}>{items.length} / 15 SKU</div>
          </div>

          <button className="btn lg primary" style={{ width: '100%' }} onClick={handleCloseBox}>🔒 ปิดลัง + ออกเลข POS</button>
          <button className="btn ghost" style={{ width: '100%' }} onClick={handleCancel}>ยกเลิกลังนี้</button>
        </div>
      </div>

      <Annotation text="highlight แถวที่เพิ่งสแกน" style={{ top: 210, left: 420 }} arrow="bl" />
    </div>
  );
}
