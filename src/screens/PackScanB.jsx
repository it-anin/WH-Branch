import { useState, useRef } from 'react';
import Annotation from '../components/Annotation.jsx';
import { generatePOS, matchBarcode } from '../data.js';

export default function PackScanB({ boxes, setBoxes, activeBoxId, setTab, showToast, createNewBox, setItemsByBox, catalog, packer }) {
  const [items, setItems] = useState([]);
  const [lastScanned, setLastScanned] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

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

  function handleUndo() {
    if (!lastScanned) { showToast('ไม่มีรายการล่าสุด'); return; }
    setItems(prev => {
      const existing = prev.find(it => it.sku === lastScanned.sku);
      if (!existing) return prev;
      if (existing.qty > 1) return prev.map(it => it.sku === lastScanned.sku ? { ...it, qty: it.qty - 1 } : it);
      return prev.filter(it => it.sku !== lastScanned.sku);
    });
    setLastScanned(null);
  }

  function handleCloseBox() {
    if (!activeBoxId) { showToast('ยังไม่ได้เลือกลัง'); return; }
    const pos = generatePOS(activeBoxId);
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const totalQty = items.reduce((s, l) => s + l.qty, 0);
    setBoxes(prev => prev.map(b =>
      b.id === activeBoxId
        ? { ...b, status: 'closed', packer: packer || b.packer || null, skuCount: items.length, totalQty, pos, updated: time }
        : b
    ));
    setItemsByBox(prev => ({ ...prev, [activeBoxId]: items }));
    setTab('closed');
  }

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 580 }}>
      <div className="frame-header">
        <div className="row">
          <button className="btn sm ghost" onClick={() => setTab('list')}>←</button>
          <span className="title">{boxLabel}</span>
          <span className="mono" style={{ color: 'var(--mute)' }}>· โหมดยิงเร็ว</span>
          {packer && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 8 }}>
              {packer.code} · {packer.name}
            </span>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={() => { createNewBox(); showToast('เปิดลังใหม่แล้ว'); }}>+ เปิดลังใหม่</button>
        </div>
        <div className="row">
          <span className="mono" style={{ fontSize: 13 }}>{items.length} / 15 SKU</span>
          <button className="btn sm" onClick={() => listRef.current?.scrollIntoView({ behavior: 'smooth' })}>รายการ</button>
        </div>
      </div>

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <div>
          <div style={{
            border: '3px dashed var(--line)', borderRadius: 16,
            padding: 24, textAlign: 'center', background: 'white', position: 'relative',
          }}>
            <div className="hand" style={{ fontSize: 22, color: 'var(--mute)' }}>✦ โซนยิงบาร์โค้ด ✦</div>
            <div style={{ fontSize: 56, margin: '16px 0', fontFamily: 'system-ui', fontWeight: 700, letterSpacing: 3 }}>
              ||| <span style={{ color: 'var(--accent)' }}>ยิงเลย</span> |||
            </div>
            <input
              ref={inputRef}
              className="input big"
              placeholder="barcode…"
              style={{ fontSize: 28, textAlign: 'center' }}
              autoFocus
              onKeyDown={handleBarcode}
            />
            <div className="row" style={{ justifyContent: 'center', marginTop: 12, gap: 6 }}>
              <span className="scan-indicator">อุปกรณ์เชื่อมต่อแล้ว</span>
              <span className="chip">Enter = เพิ่ม</span>
              <span className="chip">F2 = เพิ่มจำนวน</span>
            </div>
          </div>

          <div style={{
            marginTop: 16, border: `2px solid ${lastScanned ? 'var(--green)' : 'var(--line)'}`, borderRadius: 12,
            padding: 14, background: lastScanned ? '#e8f0d8' : 'var(--paper-dark)',
            display: 'flex', gap: 14, alignItems: 'center',
          }}>
            <div style={{ fontSize: 42 }}>{lastScanned ? '✓' : '…'}</div>
            <div style={{ flex: 1 }}>
              {lastScanned ? (
                <>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{lastScanned.sku}</div>
                  <div style={{ fontSize: 20 }}><b>{lastScanned.name}</b></div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14 }}>เพิ่มแล้ว · {lastScanned.unit} · รวมในลัง: {items.find(it => it.sku === lastScanned.sku)?.qty ?? 1}</div>
                </>
              ) : (
                <div style={{ fontFamily: 'system-ui', fontSize: 16, color: 'var(--mute)' }}>ยังไม่ได้สแกน — ยิงบาร์โค้ดเพื่อเริ่ม</div>
              )}
            </div>
            <button className="btn ghost sm" onClick={handleUndo}>↩ เลิกทำ</button>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => { inputRef.current?.focus(); showToast('พิมพ์ SKU หรือชื่อสินค้า'); }}
            >+ เพิ่มด้วยมือ (SKU/ชื่อ)</button>
            <button className="btn primary" style={{ flex: 1 }} onClick={handleCloseBox}>🔒 ปิดลัง</button>
          </div>
        </div>

        <div ref={listRef}>
          <div className="hand" style={{ fontSize: 20, marginBottom: 8 }}>ในลังตอนนี้</div>
          <div style={{ maxHeight: 460, overflow: 'auto', paddingRight: 4 }}>
            {items.map((l, i) => (
              <div key={l.sku} style={{
                display: 'flex', gap: 10, padding: '8px 10px',
                borderBottom: '1.5px dashed var(--mute)',
                background: l.sku === lastScanned?.sku ? 'var(--accent-soft)' : 'transparent',
                borderRadius: 6,
              }}>
                <div style={{ width: 24, fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--mute)' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                </div>
                <div style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700 }}>×{l.qty}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Annotation text="feedback ทันทีหลังยิง" style={{ top: 340, left: 280 }} arrow="tl" />
    </div>
  );
}
