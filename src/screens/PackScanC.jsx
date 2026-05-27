import { useState, useRef, useEffect } from 'react';
import Annotation from '../components/Annotation.jsx';
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

export default function PackScanC({ boxes, setBoxes, activeBoxId, setTab, showToast, createNewBox, setItemsByBox, itemsByBox, catalog, packer, onScanProgress }) {
  const [items, setItems] = useState(() =>
    catalog.map(c => ({ sku: c.sku, barcode: c.barcode, name: c.name, unit: c.unit, need: c.qty, got: 0, location: c.location || '' }))
  );
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const barcodeRef = useRef(null);

  // Android: คืน focus กลับ barcode input หลัง render ทุกครั้ง (ป้องกัน scanner ยิงผิด field)
  useEffect(() => {
    if (isAndroid && barcodeRef.current) barcodeRef.current.focus();
  });

  const boxLabel = activeBoxId || 'BX-????';
  const filtered = search.trim()
    ? items.filter(it =>
        it.name.toLowerCase().includes(search.toLowerCase()) ||
        it.sku.toLowerCase().includes(search.toLowerCase())
      )
    : items;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Logic กลาง — ใช้ทั้ง HID keyboard (handleBarcode) และ Broadcast wh-scan (useEffect)
  async function processBarcode(val) {
    if (!val?.trim() || isClosing) return;
    const barcode = val.trim();
    const catMatch = catalog.find(it => matchBarcode(it, barcode));
    if (!catMatch) { showToast('⚠ ไม่พบในรายการเบิก', 'error'); return; }
    const match = items.find(it => it.sku === catMatch.sku && it.unit === catMatch.unit);
    if (!match || match.got >= match.need) { showToast('⚠ ครบแล้ว', 'error'); return; }
    const newItems = items.map(it => it.sku === match.sku ? { ...it, got: it.got + 1 } : it);
    setItems(newItems);
    let boxId = activeBoxId;
    if (!activeBoxId) {
      boxId = await createNewBox();
      showToast('เปิดลังใหม่อัตโนมัติ', 'success');
    }
    if (onScanProgress && boxId) onScanProgress(boxId, newItems);
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
    showToast(`ปิดลัง ${closingBoxId} แล้ว · เปิดลังใหม่อัตโนมัติ ✓`, 'success');
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
            </span>
          ) : (
            <button className="btn primary" onClick={() => setShowHistory(true)}>📦 ลังที่ปิดแล้ว</button>
          )}
          <button className={`btn primary ${isAndroid ? 'sm' : ''}`} onClick={async () => { await createNewBox(); showToast('เปิดลังใหม่แล้ว ✓', 'success'); }}>
            + {isAndroid ? 'ใหม่' : 'เปิดลังใหม่'}
          </button>
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
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {confirmClose && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                    background: 'white', border: '1.5px solid var(--line)', borderRadius: 10,
                    padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    whiteSpace: 'nowrap', zIndex: 10,
                  }}>
                    <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, marginBottom: 8 }}>⚠ ยังขาดสินค้า ปิดลังเลยไหม?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn primary sm" onClick={doClose}>ปิดลัง</button>
                      <button className="btn sm ghost" onClick={() => setConfirmClose(false)}>ยกเลิก</button>
                    </div>
                  </div>
                )}
                <button className="btn primary" style={{ fontSize: 15, padding: '10px 16px', whiteSpace: 'nowrap' }} onClick={handleCloseBox}>ปิดลัง</button>
              </div>
            </div>
            <input
              className="input"
              placeholder="🔍 ค้นหาสินค้า / SKU"
              style={{ width: '100%', marginBottom: 10, fontSize: 14, padding: '7px 12px' }}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
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
            <div style={{ position: 'relative' }}>
              {confirmClose && (
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                  background: 'white', border: '1.5px solid var(--line)', borderRadius: 10,
                  padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  whiteSpace: 'nowrap', zIndex: 10,
                }}>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, marginBottom: 10 }}>⚠ ยังขาดสินค้า ปิดลังเลยไหม?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn primary sm" onClick={doClose}>ปิดลัง</button>
                    <button className="btn sm ghost" onClick={() => setConfirmClose(false)}>ยกเลิก</button>
                  </div>
                </div>
              )}
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
      <Annotation text="เขียวแปลว่าครบ · เหลือง = ยังขาด" style={{ top: 140, right: 40 }} arrow="br" />
    </div>
  );
}
