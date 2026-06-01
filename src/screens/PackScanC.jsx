import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { generatePOS, matchBarcode } from '../data.js';

const PAGE_SIZE = 30;
const isAndroid = new URLSearchParams(window.location.search).get('android') === '1';

function BoxHistoryModal({ boxes, itemsByBox, packer, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  const myBoxes = boxes.filter(b =>
    (b.status === 'closed' || b.status === 'exported' || b.status === 'received') &&
    (!packer || !b.packer || b.packer.code === packer.code)
  );

  const isSearching = search.trim().length > 0;

  // global search across all boxes
  const globalResults = isSearching
    ? myBoxes.flatMap(b => {
        const items = itemsByBox?.[b.id] || [];
        return items
          .filter(l =>
            l.name.toLowerCase().includes(search.toLowerCase()) ||
            l.sku.toLowerCase().includes(search.toLowerCase())
          )
          .map(l => ({ ...l, boxId: b.id }));
      })
    : [];

  // per-box items (when not searching)
  const selectedItems = selectedId ? (itemsByBox?.[selectedId] || []) : [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--paper)', borderRadius: 16, border: '2px solid var(--line)',
        width: '80%', maxWidth: 820, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '6px 6px 0 var(--line)',
      }} onClick={e => e.stopPropagation()}>

        {/* modal header */}
        <div className="row" style={{ padding: '12px 18px', borderBottom: '1.5px solid var(--line)' }}>
          <span style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700 }}>📦 ลังที่ปิดแล้ว</span>
          {packer && <span className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 8 }}>{packer.name}</span>}
          <span className="chip" style={{ marginLeft: 8 }}>{myBoxes.length} ลัง</span>
          <div className="spacer" />
          <input
            className="input"
            placeholder="🔍 ค้นหาสินค้าข้ามทุกลัง / SKU"
            style={{ width: 240, marginRight: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {isSearching && (
            <button className="btn sm ghost" style={{ marginRight: 8 }} onClick={() => setSearch('')}>× ล้าง</button>
          )}
          <button className="btn sm ghost" onClick={onClose}>× ปิด</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', flex: 1, overflow: 'hidden' }}>

          {/* left: box icons */}
          <div style={{
            borderRight: '1.5px solid var(--line)', padding: '12px 8px',
            display: 'flex', flexDirection: 'column', gap: 8,
            overflowY: 'auto', background: 'var(--paper-dark)',
          }}>
            {myBoxes.length === 0 && (
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', textAlign: 'center', marginTop: 20 }}>
                ยังไม่มีลังที่ปิด
              </div>
            )}
            {myBoxes.map(b => {
              const active = b.id === selectedId && !isSearching;
              return (
                <button key={b.id} onClick={() => { setSelectedId(b.id); setSearch(''); }} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '10px 6px', gap: 3,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 10,
                  background: active ? 'var(--accent-soft)' : 'white',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}>
                  <div style={{ fontSize: 28 }}>📦</div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink)' }}>{b.id}</div>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: 'var(--mute)' }}>{b.skuCount ?? 0} SKU · {b.totalQty ?? 0} ชิ้น</div>
                  {b.status === 'exported' && <span className="chip ok" style={{ fontSize: 10 }}>ส่ง POS</span>}
                </button>
              );
            })}
          </div>

          {/* right: search results OR per-box items */}
          <div style={{ overflowY: 'auto', padding: 16 }}>
            {isSearching ? (
              globalResults.length === 0 ? (
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', textAlign: 'center', marginTop: 40 }}>
                  ไม่พบสินค้า "{search}"
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
                    ผลการค้นหา "{search}" — {globalResults.length} รายการ
                  </div>
                  <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
                    <table className="tbl" style={{ fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 110 }}>ลัง</th>
                          <th>SKU / ชื่อ</th>
                          <th style={{ width: 70 }}>หน่วย</th>
                          <th style={{ width: 60, textAlign: 'center' }}>จำนวน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {globalResults.map((l, i) => (
                          <tr key={`${l.boxId}-${l.sku}-${i}`} style={{ cursor: 'pointer' }}
                            onClick={() => { setSelectedId(l.boxId); setSearch(''); }}>
                            <td style={{ fontFamily: 'Caveat', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{l.boxId}</td>
                            <td>
                              <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                              <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                            </td>
                            <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                            <td style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                              ×{l.qty ?? l.got ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : !selectedId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)' }}>
                เลือกลังทางซ้ายเพื่อดูรายการสินค้า
              </div>
            ) : selectedItems.length === 0 ? (
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', textAlign: 'center', marginTop: 40 }}>
                ไม่มีข้อมูลรายการสินค้าในลังนี้
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
                  สินค้าในลัง {selectedId}
                </div>
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
                  <table className="tbl" style={{ fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>#</th>
                        <th>SKU / ชื่อ</th>
                        <th style={{ width: 130 }}>Barcode</th>
                        <th style={{ width: 70 }}>หน่วย</th>
                        <th style={{ width: 70, textAlign: 'center' }}>จำนวน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((l, i) => (
                        <tr key={l.sku}>
                          <td style={{ color: 'var(--mute)', fontFamily: 'Caveat', fontSize: 18 }}>{i + 1}</td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td className="num-col" style={{ fontSize: 12 }}>{l.barcode}</td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                          <td style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                            ×{l.qty ?? l.got ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PackScanC({ boxes, setBoxes, activeBoxId, setTab, showToast, createNewBox, setItemsByBox, itemsByBox, catalog, packer, onScanProgress, catalogMeta, lotMap = {} }) {
  const [items, setItems] = useState(() => {
    // หักจำนวนที่พนักงานคนนี้แพ็คไปแล้ว (จากลังที่ปิด/ส่งออก/รับแล้ว) เพื่อให้สินค้าที่ลงลังครบไม่โผล่ซ้ำหลัง remount/reload
    const packed = {};
    boxes.forEach(b => {
      if (b.packer?.code !== packer?.code) return;
      if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
      (itemsByBox[b.id] || []).forEach(it => {
        const key = `${it.sku}__${it.unit}`;
        packed[key] = (packed[key] || 0) + (it.qty ?? it.got ?? 0);
      });
    });
    return catalog
      .map(c => ({
        sku: c.sku, barcode: c.barcode, name: c.name, unit: c.unit,
        need: c.qty - (packed[`${c.sku}__${c.unit}`] || 0),
        got: 0, location: c.location || '',
      }))
      .filter(it => it.need > 0);
  });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false); // Android: toggle ค้นหา
  const [showHistory, setShowHistory] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingLot, setPendingLot] = useState(null); // { match, lots } — รอเลือก LOT
  const barcodeRef = useRef(null);

  // Android: คืน focus กลับ barcode input หลัง render — ยกเว้นตอนที่ช่องค้นหาเปิดอยู่
  useEffect(() => {
    if (isAndroid && !showSearch && barcodeRef.current) barcodeRef.current.focus();
  });

  const boxLabel = activeBoxId || 'BX-????';
  const filtered = search.trim()
    ? items.filter(it =>
        it.name.toLowerCase().includes(search.toLowerCase()) ||
        it.sku.toLowerCase().includes(search.toLowerCase())
      )
    : items;
  // Android: ยกสินค้าที่ครบแล้ว (got >= need) ไปท้าย — sort stable เก็บลำดับเดิมในแต่ละกลุ่ม
  const sorted = isAndroid
    ? [...filtered].sort((a, b) => (a.got >= a.need ? 1 : 0) - (b.got >= b.need ? 1 : 0))
    : filtered;
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // คำนวณยอด LOT ที่ถูกใช้ไปแล้ว (key = sku__lot) จากทุกลังที่ปิด + ลังปัจจุบัน
  function calcLotUsage() {
    const usage = {};
    boxes.forEach(b => {
      if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
      (itemsByBox[b.id] || []).forEach(it => {
        if (it.lot) {
          const key = `${it.sku}__${it.lot}`;
          usage[key] = (usage[key] || 0) + (it.qty ?? it.got ?? 0);
        }
      });
    });
    items.forEach(it => {
      if (it.lot && it.got > 0) {
        const key = `${it.sku}__${it.lot}`;
        usage[key] = (usage[key] || 0) + it.got;
      }
    });
    return usage;
  }

  // คืน LOT ที่ยังเหลือสต็อก > 0 (พร้อมจำนวนคงเหลือ)
  function getAvailableLots(sku) {
    const lots = lotMap[sku] || [];
    const usage = calcLotUsage();
    return lots
      .map(({ lot, qty }) => ({ lot, qty, remaining: qty - (usage[`${sku}__${lot}`] || 0) }))
      .filter(l => l.remaining > 0);
  }

  // Logic กลาง — ใช้ทั้ง HID keyboard (handleBarcode) และ Broadcast wh-scan (useEffect)
  async function processBarcode(val) {
    if (!val?.trim() || isClosing || pendingLot) return;
    const barcode = val.trim();
    const catMatch = catalog.find(it => matchBarcode(it, barcode));
    if (!catMatch) { showToast('⚠ ไม่พบในรายการเบิก', 'error'); return; }
    const match = items.find(it => it.sku === catMatch.sku && it.unit === catMatch.unit);
    if (!match || match.got >= match.need) { showToast('⚠ ครบแล้ว', 'error'); return; }

    const allLots = lotMap[match.sku] || [];

    // SKU ไม่มีใน lotMap → สแกนปกติไม่มี LOT
    if (allLots.length === 0) {
      await applyScan(match, null);
      return;
    }

    const availableLots = getAvailableLots(match.sku);

    // ทุก LOT หมด → block scan
    if (availableLots.length === 0) {
      showToast('⚠ LOT หมดทั้งหมด สต็อกไม่พอ', 'error');
      return;
    }

    // LOT ที่เลือกไว้ยังมีสต็อกเหลือไหม
    const currentValid = match.lot && availableLots.some(l => l.lot === match.lot);

    // Android: ถ้ายังไม่ได้เลือก หรือเลือกไว้แต่หมด และมี LOT ให้เลือกมากกว่า 1 → popup
    if (isAndroid && !currentValid && availableLots.length > 1) {
      setPendingLot({ match, lots: availableLots });
      return;
    }

    // ถ้า LOT ปัจจุบันยังใช้ได้ ใช้ต่อ; ไม่งั้นใช้ LOT แรกที่เหลือ
    const autoLot = currentValid ? match.lot : availableLots[0].lot;
    await applyScan(match, autoLot, !currentValid);
  }

  // resetLot=true → เปลี่ยน lot ของ item เป็นค่าใหม่ (กรณี LOT เก่าหมด ต้องสลับ)
  async function applyScan(match, lot, resetLot = false) {
    const newItems = items.map(it =>
      it.sku === match.sku && it.unit === match.unit
        ? { ...it, got: it.got + 1, ...(lot && (resetLot || !it.lot) ? { lot } : {}) }
        : it
    );
    setItems(newItems);
    let boxId = activeBoxId;
    if (!activeBoxId) {
      boxId = await createNewBox();
      showToast('เปิดลังใหม่อัตโนมัติ', 'success');
    }
    if (onScanProgress && boxId) onScanProgress(boxId, newItems);
  }

  async function handleLotSelect(lot) {
    if (!pendingLot) return;
    const { match } = pendingLot;
    setPendingLot(null);
    await applyScan(match, lot, true);
  }

  // ref pattern — ให้ wh-scan listener เสมอเห็น processBarcode ล่าสุด (ไม่ stale)
  const processBarcodeRef = useRef(processBarcode);
  processBarcodeRef.current = processBarcode;

  // Android Broadcast mode: รับ wh-scan event ตรงๆ ไม่ผ่าน input injection
  useEffect(() => {
    if (!isAndroid) return;
    function onWhScan(e) { processBarcodeRef.current?.(e.detail); }
    window.addEventListener('wh-scan', onWhScan);
    return () => window.removeEventListener('wh-scan', onWhScan);
  }, []);

  // HID keyboard mode: รับ Enter keydown จาก barcode input
  function handleBarcode(e) {
    if (e.key !== 'Enter') return;
    if (isClosing) { e.target.value = ''; return; }
    const val = e.target.value.trim();
    if (!val) return;
    e.target.value = '';
    processBarcode(val);
  }

  async function doClose() {
    setIsClosing(true);
    setConfirmClose(false);
    const closingBoxId = activeBoxId;
    const pos = generatePOS(closingBoxId || 'BX-0000-0000');
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const packedItems = items.filter(it => it.got > 0).map(it => ({ ...it, qty: it.got }));
    setBoxes(prev => prev.map(b =>
      b.id === closingBoxId
        ? { ...b, status: 'closed', packer: packer || b.packer || null, skuCount: packedItems.length, totalQty: packedItems.reduce((s, it) => s + it.qty, 0), pos, updated: time }
        : b
    ));
    setItemsByBox(prev => ({ ...prev, [closingBoxId]: packedItems }));
    if (onScanProgress) onScanProgress(closingBoxId, []);
    setItems(prev =>
      prev
        .filter(it => it.got < it.need)
        .map(it => ({ ...it, need: it.need - it.got, got: 0 }))
    );
    setPage(0);
    setSearch('');
    await createNewBox();
    showToast(`ปิดลัง ${closingBoxId} แล้ว ✓`, 'success');
    setIsClosing(false);
  }

  function handleCloseBox() {
    const allDone = items.every(it => it.got >= it.need);
    if (allDone) {
      doClose();
    } else {
      setConfirmClose(true);
    }
  }

  const doneCount = items.filter(it => it.got >= it.need).length;

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: isAndroid ? 0 : 580, ...(isAndroid ? { boxShadow: 'none', border: 'none', borderRadius: 0 } : {}) }}>
      {pendingLot && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '20px 22px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 360, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>เลือก LOT</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              SKU: <span className="mono">{pendingLot.match.sku}</span>
            </div>
            <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, marginBottom: 14, color: '#333' }}>
              {pendingLot.match.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {pendingLot.lots.map(({ lot, remaining }) => (
                <button
                  key={lot}
                  className="btn primary"
                  style={{
                    fontSize: 18, padding: '14px 18px', fontFamily: 'JetBrains Mono',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                  onClick={() => handleLotSelect(lot)}
                >
                  <span>{lot}</span>
                  <span style={{ fontSize: 13, opacity: 0.85, fontFamily: 'Patrick Hand' }}>เหลือ {remaining}</span>
                </button>
              ))}
            </div>
            <button
              className="btn sm ghost"
              style={{ marginTop: 12 }}
              onClick={() => setPendingLot(null)}
            >ยกเลิก</button>
          </div>
        </div>,
        document.body
      )}
      {confirmClose && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            textAlign: 'center', minWidth: 260,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ ยังขาดสินค้า</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>ต้องการปิดลังเลยไหม?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={() => setConfirmClose(false)}>ยกเลิก</button>
              <button className="btn primary sm" onClick={doClose}>ปิดลัง</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showHistory && (
        <BoxHistoryModal
          boxes={boxes}
          itemsByBox={itemsByBox}
          packer={packer}
          onClose={() => setShowHistory(false)}
        />
      )}
      <div className="frame-header">
        <div className="row">
          {!isAndroid && <button className="btn sm ghost" onClick={() => setTab('list')}>←</button>}
          <span className="title" style={isAndroid ? { fontSize: 16 } : {}}>
            {isAndroid ? boxLabel : `Packing List · ${boxLabel}`}
          </span>
          {packer && !isAndroid && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 8 }}>
              {packer.code} · {packer.name}
            </span>
          )}
          <div className="spacer" />
          {/* Android: เช็ค X/Y ชิดขวา แทนปุ่มลังที่ปิด */}
          {isAndroid ? (
            <span style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'Patrick Hand' }}>
              เช็ค {doneCount}/{items.length}
              {catalogMeta && (
                <span style={{ marginLeft: 6 }}>
                  · 📋 {catalogMeta.branch ? `Picklist_${catalogMeta.branch}` : 'Picklist'}{catalogMeta.fileDate ? ` ${catalogMeta.fileDate}` : ''}
                </span>
              )}
            </span>
          ) : (
            <button className="btn primary" onClick={() => setShowHistory(true)}>📦 ลังที่ปิดแล้ว</button>
          )}
          {!isAndroid && (
            <button className="btn primary" onClick={async () => { await createNewBox(); showToast('เปิดลังใหม่แล้ว ✓', 'success'); }}>
              + เปิดลังใหม่
            </button>
          )}
        </div>
        {!isAndroid && (
          <div className="row">
            <span className="mono" style={{ fontSize: 13 }}>เช็ค {doneCount} / {items.length} รายการ</span>
          </div>
        )}
      </div>

      <div style={{ padding: isAndroid ? 10 : 18 }}>
        {/* ── Android: 2 rows — barcode+ปิดลัง / search ── */}
        {isAndroid ? (
          <>
            <div className="row" style={{ marginBottom: 6, gap: 8 }}>
              <input
                ref={barcodeRef}
                data-android-barcode="true"
                inputMode="none"
                className="input"
                placeholder="ยิงบาร์โค้ด"
                style={{ flex: 1, fontSize: 16, padding: '10px 12px' }}
                onKeyDown={handleBarcode}
              />
              {/* ปุ่ม toggle ค้นหา — แยกออกจากช่องสแกน ป้องกัน focus ผิด */}
              <button
                className={`btn sm ${showSearch ? 'primary' : 'ghost'}`}
                style={{ flexShrink: 0, fontSize: 18, padding: '10px 12px' }}
                onClick={() => {
                  setShowSearch(v => !v);
                  if (showSearch) { setSearch(''); setPage(0); }
                }}
              >🔍</button>
              <button className="btn primary" style={{ fontSize: 15, padding: '10px 16px', whiteSpace: 'nowrap' }} onClick={handleCloseBox}>ปิดลัง</button>
            </div>
            {/* search input แสดงเฉพาะเมื่อกด 🔍 — ป้องกัน focus โดยบังเอิญขณะสแกน */}
            {showSearch && (
              <input
                className="input"
                placeholder="ค้นหาสินค้า / SKU"
                style={{ width: '100%', marginBottom: 8, fontSize: 14, padding: '7px 12px' }}
                value={search}
                autoFocus
                onChange={e => { setSearch(e.target.value); setPage(0); }}
              />
            )}
          </>
        ) : (
          /* ── Desktop: 1 row ── */
          <div className="row" style={{ marginBottom: 12, gap: 12 }}>
            <input
              className="input big"
              placeholder="ยิงบาร์โค้ด → ติ๊กอัตโนมัติ"
              style={{ flex: 2 }}
              autoFocus
              onKeyDown={handleBarcode}
            />
            <input
              className="input"
              placeholder="🔍 ค้นหาสินค้า / SKU"
              style={{ flex: 1 }}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
            <div>
              <button className="btn primary lg" onClick={handleCloseBox}>ปิดลัง</button>
            </div>
          </div>
        )}

        {/* pagination controls */}
        {totalPages > 1 && (
          isAndroid ? (
            <div className="row" style={{ marginBottom: 8, gap: 6, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>←</button>
              <span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)', minWidth: 60, textAlign: 'center' }}>
                หน้า {page + 1}/{totalPages}
              </span>
              <button className="btn sm ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>→</button>
            </div>
          ) : (
            <div className="row" style={{ marginBottom: 12, gap: 8 }}>
              <button className="btn sm ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← ก่อนหน้า</button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`btn sm ${page === i ? 'primary' : 'ghost'}`}
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button className="btn sm ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>ถัดไป →</button>
              <span className="mono" style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 4 }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, items.length)} / {items.length} รายการ
              </span>
            </div>
          )
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isAndroid ? '1fr' : '1fr 1fr', gap: isAndroid ? 6 : 12 }}>
          {pageItems.map((c) => {
            const done = c.got >= c.need;
            const partial = c.got > 0 && c.got < c.need;
            return (
              <div key={c.sku} style={{
                display: 'flex', gap: isAndroid ? 8 : 12, padding: isAndroid ? 8 : 12,
                border: `2px solid ${done ? 'var(--green)' : partial ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 10,
                background: done ? '#e8f0d8' : partial ? '#fae5b0' : 'white',
                alignItems: 'center',
                minWidth: 0, overflow: 'hidden',
              }}>
                <div style={{
                  width: isAndroid ? 24 : 32, height: isAndroid ? 24 : 32, borderRadius: '50%',
                  border: '2px solid var(--line)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--green)' : 'white',
                  color: 'white', fontSize: isAndroid ? 14 : 20, fontWeight: 700,
                }}>
                  {done ? '✓' : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 4 }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sku}</div>
                    {c.location && (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink)', background: 'var(--paper-dark)', borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>{c.location}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: isAndroid ? 13 : 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  {/* ⚠ barcode ต้องแสดงเสมอทั้ง desktop และ Android — ห้ามลบ พนักงานใช้ยืนยันก่อนสแกน */}
                  {c.barcode && (
                    <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.barcode}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'Caveat', fontWeight: 700, fontSize: isAndroid ? 18 : 22, flexShrink: 0 }}>
                  <span style={{ color: done ? 'var(--green)' : partial ? 'var(--accent)' : 'var(--mute)' }}>{c.got}</span>
                  <span style={{ fontSize: isAndroid ? 13 : 16, color: 'var(--mute)' }}> / {c.need}</span>
                  <div style={{ fontSize: 11, fontFamily: 'Patrick Hand', color: 'var(--mute)' }}>{c.unit}</div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
