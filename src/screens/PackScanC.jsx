import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { generatePOS, matchBarcode } from '../data.js';
import { playScanSuccess } from '../sound.js';

const PAGE_SIZE = 30;
const isAndroid = new URLSearchParams(window.location.search).get('android') === '1';
const SWIPE_THRESHOLD = 70; // px ก่อนถือว่าเป็นการปัดจริง (กันสะกิดมือโดยไม่ตั้งใจ)
const HOLD_MS = 3000; // Android: ค้างหน้าสินค้าที่สแกนครบไว้ที่ตำแหน่งเดิมกี่ ms ก่อนเริ่ม slide-up หาย (ให้พนักงานเช็คก่อนสแกนตัวถัดไป)
const EXIT_MS = 420; // ระยะเวลา animation slide-up + จางหาย ก่อนการ์ดถูกเลื่อนไปท้าย list จริง

// หน่วยมาตรฐานสากลที่ตัวคูณคงที่ทุก SKU — ใช้ fallback เฉพาะตอน R05.106 ไม่มี factor ของหน่วยนั้น
// (เช่น picklist เรียก "โหล" แต่ R05.106 มีแค่ "กล่อง"=1 ไม่มีแถวโหล → ระบบไม่รู้ว่า 1 โหล = 12)
const STANDARD_UNIT_FACTOR = { 'โหล': 12, 'กุรุส': 144 };

// override ตัวคูณเฉพาะ SKU+หน่วย ที่ picklist ใช้แต่ R05.106 ไม่มี และตัวคูณเป็นค่าเฉพาะ SKU (ไม่ใช่หน่วยสากล)
// ❌ ห้าม parse เลขจากชื่อหน่วยอัตโนมัติ — มีเคสที่เลขเป็นคำอธิบายไม่ใช่ตัวคูณ (เช่น "แพค10"=1, "ซอง5ชิ้น"=1 ใน R05.106)
// ค่าเป็น "จำนวนหน่วยฐานต่อ 1 หน่วย picklist" (ยืนยันกับผู้ใช้ทีละตัว) — เพิ่มได้เมื่อเจอ SKU ใหม่
const UNIT_FACTOR_OVERRIDE = {
  '700081__4กล่อง': 4,    // base=กล่อง → 4 กล่อง
  '700352__10กล่อง': 100, // base=ชิ้น, 1 กล่อง=10 ชิ้น → 10 กล่อง = 100 ชิ้น
  '100283__แพค10': 10,    // base=กระปุก → 10 กระปุก
};

// ลำดับความสำคัญ: factorMap (R05.106) → override เฉพาะตัว → หน่วยสากล → 1
const lookupFactor = (factorMap, sku, unit) =>
  factorMap[`${sku}__${unit}`] ?? UNIT_FACTOR_OVERRIDE[`${sku}__${unit}`] ?? STANDARD_UNIT_FACTOR[unit] ?? 1;

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
          <span style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700 }}>📦 ลังที่ปิดแล้ว</span>
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
              <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', textAlign: 'center', marginTop: 20 }}>
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
                  <div style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--ink)' }}>{b.id}</div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 11, color: 'var(--mute)' }}>{b.skuCount ?? 0} SKU · {b.totalQty ?? 0} ชิ้น</div>
                  {b.status === 'exported' && <span className="chip ok" style={{ fontSize: 10 }}>ส่ง POS</span>}
                </button>
              );
            })}
          </div>

          {/* right: search results OR per-box items */}
          <div style={{ overflowY: 'auto', padding: 16 }}>
            {isSearching ? (
              globalResults.length === 0 ? (
                <div style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)', textAlign: 'center', marginTop: 40 }}>
                  ไม่พบสินค้า "{search}"
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
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
                            <td style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{l.boxId}</td>
                            <td>
                              <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                              <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                            </td>
                            <td style={{ fontFamily: 'system-ui' }}>{l.unit}</td>
                            <td style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)' }}>
                เลือกลังทางซ้ายเพื่อดูรายการสินค้า
              </div>
            ) : selectedItems.length === 0 ? (
              <div style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)', textAlign: 'center', marginTop: 40 }}>
                ไม่มีข้อมูลรายการสินค้าในลังนี้
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
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
                          <td style={{ color: 'var(--mute)', fontFamily: 'system-ui', fontSize: 18 }}>{i + 1}</td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td className="num-col" style={{ fontSize: 12 }}>{l.scannedBarcode || l.barcode || '—'}</td>
                          <td style={{ fontFamily: 'system-ui' }}>{l.unit}</td>
                          <td style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
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

// Android: card สินค้าปัดได้ — ปัดซ้ายเกิน SWIPE_THRESHOLD → ถาม "ของหมดใช่ไหม" → ลบออกจาก checklist
// exiting = พ้นช่วงค้างหน้าตรวจสอบ (HOLD_MS) แล้ว กำลังเล่น animation slide-up หาย (EXIT_MS) ก่อนถูกเลื่อนไปท้าย list จริง
// settled = slide-up จบแล้ว อยู่ตำแหน่งท้าย list แบบจางถาวร (opacity .5)
function ItemCard({ c, done, partial, exiting, settled, onMarkOutOfStock }) {
  const [dragX, setDragX] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const dragRef = useRef({ x: 0, dragging: false });

  function onTouchStart(e) {
    if (!isAndroid || confirming || exiting) return;
    dragRef.current = { x: e.touches[0].clientX, dragging: true };
  }
  function onTouchMove(e) {
    if (!isAndroid || !dragRef.current.dragging) return;
    // ปัดซ้ายอย่างเดียว — clamp ไม่ให้ลากไปทางขวา
    setDragX(Math.min(0, e.touches[0].clientX - dragRef.current.x));
  }
  function onTouchEnd() {
    if (!isAndroid || !dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setDragX(x => {
      if (Math.abs(x) > SWIPE_THRESHOLD) {
        setConfirming(true);
        return Math.sign(x) * 120;
      }
      return 0;
    });
  }

  function confirmOutOfStock() {
    setConfirming(false);
    onMarkOutOfStock(c.sku);
  }
  function cancelOutOfStock() {
    setConfirming(false);
    setDragX(0);
  }

  const revealOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  // แยก 2 กรณี: ยังไม่ได้สแกน = ของหมดจริง (แดง), สแกนไปบ้างแล้ว = ของมีไม่พอ (ส้ม)
  const hasScanned = (c.gotBase ?? 0) > 0;

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      {isAndroid && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: hasScanned ? '#e67e22' : 'var(--red)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'system-ui', fontSize: 13, fontWeight: 700,
          opacity: revealOpacity,
        }}>
          {hasScanned ? '⚠ ของไม่พอ' : '🗑 ของหมด'}
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={exiting ? 'item-card-exit' : undefined}
        style={{
          display: 'flex', gap: isAndroid ? 8 : 12, padding: isAndroid ? 8 : 12,
          border: `2px solid ${done ? 'var(--green)' : partial ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: 10,
          background: done ? '#e8f0d8' : partial ? '#fae5b0' : 'white',
          alignItems: 'center',
          minWidth: 0, overflow: 'hidden',
          position: 'relative',
          // exiting ใช้ keyframe animation คุม transform/opacity เอง — ไม่ตั้ง inline ทับ กันชนกัน
          ...(exiting ? {} : {
            transform: isAndroid ? `translateX(${dragX}px)` : undefined,
            opacity: settled ? 0.5 : 1,
            transition: (dragRef.current.dragging ? '' : 'transform 0.2s') + ', opacity 0.8s ease',
          }),
        }}
      >
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
          <div style={{ fontFamily: 'system-ui', fontSize: isAndroid ? 13 : 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
          {/* ⚠ barcode ต้องแสดงเสมอทั้ง desktop และ Android — ห้ามลบ พนักงานใช้ยืนยันก่อนสแกน */}
          {c.barcode && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.barcode}</div>
          )}
          {c.lot && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>LOT: {c.lot}</div>
          )}
          {c.exp && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>EXP: {c.exp}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'system-ui', fontWeight: 400, fontSize: 15, flexShrink: 0 }}>
          <span style={{ color: '#000' }}>{c.gotBase ?? 0}</span>
          <span style={{ fontSize: 15, color: '#000' }}> / {c.need}</span>
          <div style={{ fontSize: 11, fontFamily: 'system-ui', color: 'var(--mute)' }}>{c.baseUnit || c.unit}</div>
        </div>
      </div>

      {confirming && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            textAlign: 'center', minWidth: 260, maxWidth: 320,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {hasScanned ? '⚠ ของมีไม่พอใช่ไหม?' : '⚠ ยืนยันว่าของหมด?'}
            </div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>{c.name}</div>
            <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>{c.sku}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={cancelOutOfStock}>ยกเลิก</button>
              {hasScanned ? (
                <button className="btn sm" style={{ background: '#e67e22', borderColor: '#e67e22', color: 'white' }} onClick={confirmOutOfStock}>ของไม่พอ สแกนตัวถัดไป</button>
              ) : (
                <button className="btn danger sm" onClick={confirmOutOfStock}>ของหมด ลบรายการ</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function PackScanC({ boxes, setBoxes, activeBoxId, setTab, showToast, createNewBox, setItemsByBox, itemsByBox, catalog, catalogLoaded = true, packer, onScanProgress, catalogMeta, lotMap = {}, barcodeMap = {}, factorMap = {} }) {
  // โมเดลหน่วยฐาน: need/gotBase คิดเป็น "หน่วยฐาน" (factor=1) ส่วน got = จำนวนครั้งที่สแกน (ไว้ export ตามหน่วยที่สแกนจริง)
  // factorOf(sku, unit) = จำนวนหน่วยฐานต่อ 1 หน่วยนั้น เช่น โหล=12 → สแกนบาร์โค้ดโหล 1 ครั้ง = +12 หน่วยฐาน
  const factorOf = (sku, unit) => lookupFactor(factorMap, sku, unit);
  // หน่วยที่สแกน → resolve จาก barcodeMap (รู้ว่าบาร์โค้ดตัวนี้เป็นหน่วยอะไรของ SKU) เพื่อบวก gotBase ด้วย factor ที่ถูกต้อง
  const skuBarcodeUnit = useMemo(() => {
    const m = {};
    for (const key of Object.keys(barcodeMap)) {
      const idx = key.indexOf('__');
      const sku = key.slice(0, idx), unit = key.slice(idx + 2);
      if (!m[sku]) m[sku] = {};
      (barcodeMap[key] || []).forEach(bc => { if (!(bc in m[sku])) m[sku][bc] = unit; });
    }
    return m;
  }, [barcodeMap]);
  const [items, setItems] = useState(() => {
    // factorOf/baseUnitOf inline — useState initializer รันก่อน helper ด้านบนถูกผูกใน scope (อ่าน factorMap prop ตรงๆ ได้)
    const fOf = (sku, unit) => lookupFactor(factorMap, sku, unit);
    const baseUnitOf = (sku, fallback) => {
      for (const key of Object.keys(factorMap)) {
        if (factorMap[key] !== 1) continue;
        const idx = key.indexOf('__');
        if (key.slice(0, idx) === sku) return key.slice(idx + 2);
      }
      return fallback;
    };
    // หักจำนวนที่พนักงานคนนี้แพ็คไปแล้ว (หน่วยฐาน) จากลังที่ปิด/ส่งออก/รับแล้ว — ลังใหม่เก็บ gotBase, ลังเก่า fallback qty×factor(หน่วย picklist)
    const packedBase = {};
    boxes.forEach(b => {
      if (b.packer?.code !== packer?.code) return;
      if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
      (itemsByBox[b.id] || []).forEach(it => {
        const key = `${it.sku}__${it.unit}`;
        const base = it.gotBase ?? ((it.qty ?? it.got ?? 0) * fOf(it.sku, it.unit));
        packedBase[key] = (packedBase[key] || 0) + base;
      });
    });
    return catalog
      .map(c => {
        const needBase = c.qty * fOf(c.sku, c.unit) - (packedBase[`${c.sku}__${c.unit}`] || 0);
        return {
          sku: c.sku, barcode: c.barcode, name: c.name, unit: c.unit,
          need: needBase, got: 0, gotBase: 0,
          baseUnit: baseUnitOf(c.sku, c.unit),
          location: c.location || '',
        };
      })
      .filter(it => it.need > 0);
  });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false); // Android: toggle ค้นหา
  const [showHistory, setShowHistory] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmOver, setConfirmOver] = useState(null); // { match, factor, scannedBarcode, scannedUnit } — สแกนเกินจำนวน รอยืนยัน
  const [pendingLot, setPendingLot] = useState(null); // { match, lots } — รอเลือก LOT
  const [manualLotMode, setManualLotMode] = useState(false); // true = แสดงฟอร์มใส่ LOT เอง แทนลิสต์
  const [manualLot, setManualLot] = useState('');
  const [manualExpD, setManualExpD] = useState('');
  const [manualExpM, setManualExpM] = useState('');
  const [manualExpY, setManualExpY] = useState('');
  const [dismissedSkus, setDismissedSkus] = useState(() => new Set()); // SKU ที่ปัดทำเครื่องหมาย "ของหมด" แล้ว — ซ่อนจาก checklist
  // Android: sku__unit ที่สแกนครบแล้วแต่ยังอยู่ในช่วงค้างหน้าตรวจสอบ (HOLD_MS) — กันไม่ให้ sort เลื่อนไปท้าย list ทันที
  const [holdingSkus, setHoldingSkus] = useState(() => new Set());
  // Android: sku__unit ที่พ้นช่วงค้างแล้ว กำลังเล่น animation slide-up หาย (EXIT_MS) — ยังอยู่ตำแหน่งเดิมเหมือน holding จนกว่าจะเลื่อนจริง
  const [exitingSkus, setExitingSkus] = useState(() => new Set());
  const holdTimeoutsRef = useRef({});
  const exitTimeoutsRef = useRef({});
  useEffect(() => () => {
    Object.values(holdTimeoutsRef.current).forEach(clearTimeout);
    Object.values(exitTimeoutsRef.current).forEach(clearTimeout);
  }, []);
  const barcodeRef = useRef(null);

  // Android: คืน focus กลับ barcode input หลัง render — ยกเว้นตอนที่ช่องค้นหาเปิดอยู่ หรือ popup เลือก/ใส่ LOT เปิดอยู่ (ต้องพิมพ์ในช่องนั้น)
  useEffect(() => {
    if (isAndroid && !showSearch && !pendingLot && barcodeRef.current) barcodeRef.current.focus();
  });

  const boxLabel = activeBoxId || 'BX-????';
  // ซ่อนรายการที่ปัดทำเครื่องหมาย "ของหมด" แล้ว ออกจาก checklist ที่แสดง (ของจริงยังอยู่ใน items เพื่อรักษายอดที่แพ็คไปแล้ว)
  const visibleItems = items.filter(it => !dismissedSkus.has(it.sku));
  const filtered = search.trim()
    ? visibleItems.filter(it =>
        it.name.toLowerCase().includes(search.toLowerCase()) ||
        it.sku.toLowerCase().includes(search.toLowerCase())
      )
    : visibleItems;
  // Android: ยกสินค้าที่ครบแล้ว (gotBase >= need) ไปท้าย — sort stable เก็บลำดับเดิมในแต่ละกลุ่ม
  // ระหว่างค้างหน้าตรวจสอบ (holdingSkus) หรือกำลังเล่น slide-up (exitingSkus) ยังไม่ถูกเลื่อน — อยู่ตำแหน่งเดิมจนกว่า animation จบ
  const sorted = isAndroid
    ? [...filtered].sort((a, b) => {
        const aKey = `${a.sku}__${a.unit}`, bKey = `${b.sku}__${b.unit}`;
        const aSettled = a.gotBase >= a.need && !holdingSkus.has(aKey) && !exitingSkus.has(aKey);
        const bSettled = b.gotBase >= b.need && !holdingSkus.has(bKey) && !exitingSkus.has(bKey);
        return (aSettled ? 1 : 0) - (bSettled ? 1 : 0);
      })
    : filtered;
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // คำนวณยอด LOT ที่ถูกใช้ไปแล้ว (key = sku__lot, หน่วยฐาน) จากทุกลังที่ปิด + ลังปัจจุบัน
  // คูณ factor ของหน่วยที่สแกนจริง — สแกนบาร์โค้ดโหล 1 ครั้งหักสต็อก LOT เท่า factor (เช่น 12) ไม่ใช่ 1
  function calcLotUsage() {
    const usage = {};
    boxes.forEach(b => {
      if (!(b.status === 'closed' || b.status === 'exported' || b.status === 'received')) return;
      (itemsByBox[b.id] || []).forEach(it => {
        if (it.lot) {
          const key = `${it.sku}__${it.lot}`;
          // คูณ factor เฉพาะลังใหม่ที่มี scannedUnit — ลังเก่า (it.unit = หน่วย picklist, ไม่มี scannedUnit) ใช้ factor=1 ตามพฤติกรรมเดิม กัน overcount
          const f = it.scannedUnit ? factorOf(it.sku, it.scannedUnit) : 1;
          usage[key] = (usage[key] || 0) + (it.qty ?? it.got ?? 0) * f;
        }
      });
    });
    items.forEach(it => {
      if (it.lot && it.got > 0) {
        const key = `${it.sku}__${it.lot}`;
        const f = it.scannedUnit ? factorOf(it.sku, it.scannedUnit) : 1;
        usage[key] = (usage[key] || 0) + it.got * f;
      }
    });
    return usage;
  }

  // คืน LOT ที่ยังเหลือสต็อก > 0 — qty ใน lotMap เป็นหน่วยฐานแล้ว (แปลงตั้งแต่ import ดู ImportLotMap), usage ก็หน่วยฐาน
  function getAvailableLots(sku) {
    const lots = lotMap[sku] || [];
    const usage = calcLotUsage();
    return lots
      .map(({ lot, qty }) => ({ lot, qty, remaining: qty - (usage[`${sku}__${lot}`] || 0) }))
      .filter(l => l.remaining > 0);
  }

  // ส่วน LOT + applyScan หลังจากผ่านการตรวจสอบ over แล้ว — ใช้ร่วมกันทั้ง processBarcode ปกติ และ handleConfirmOver
  async function proceedScan(match, factor, scannedBarcode, scannedUnit) {
    const allLots = lotMap[match.sku] || [];
    if (allLots.length === 0) {
      await applyScan(match, null, false, '', scannedBarcode, scannedUnit, factor);
      return;
    }
    const availableLots = getAvailableLots(match.sku);
    if (availableLots.length === 0) {
      showToast('⚠ LOT นี้สินค้าหมด', 'error');
      return;
    }
    if (isAndroid) {
      setPendingLot({ match, lots: availableLots, scannedBarcode, scannedUnit, factor });
      return;
    }
    const currentValid = match.lot && availableLots.some(l => l.lot === match.lot);
    const autoLot = currentValid ? match.lot : availableLots[0].lot;
    await applyScan(match, autoLot, !currentValid, '', scannedBarcode, scannedUnit, factor);
  }

  async function handleConfirmOver() {
    if (!confirmOver) return;
    const { match, factor, scannedBarcode, scannedUnit } = confirmOver;
    setConfirmOver(null);
    await proceedScan(match, factor, scannedBarcode, scannedUnit);
  }

  // Logic กลาง — ใช้ทั้ง HID keyboard (handleBarcode) และ Broadcast wh-scan (useEffect)
  async function processBarcode(val) {
    if (!val?.trim() || isClosing || pendingLot || confirmOver) return;
    const barcode = val.trim();
    const catMatch = catalog.find(it => matchBarcode(it, barcode));
    if (!catMatch) { showToast('⚠ ไม่พบในรายการเบิก', 'error'); return; }
    const match = items.find(it => it.sku === catMatch.sku && it.unit === catMatch.unit);
    if (!match || match.gotBase >= match.need) { showToast('⚠ ครบแล้ว', 'error'); return; }

    // catMatch.barcode อาจเป็น comma-separated หลายตัวต่อ SKU (ดู matchBarcode ใน data.js) — เก็บตัวที่สแกนจริงไว้ export
    const scannedBarcode = catMatch.barcode.split(',').map(b => b.trim()).includes(barcode)
      ? barcode
      : (catMatch.barcode.split(',')[0]?.trim() || '');

    // หน่วยของบาร์โค้ดที่สแกนจริง (อาจต่างจากหน่วย picklist เช่นสแกนกล่องแต่ picklist เป็นโหล) → ใช้บวก gotBase ด้วย factor ที่ถูกต้อง + คิดทุน/หน่วยตอน export
    const scannedUnit = skuBarcodeUnit[catMatch.sku]?.[barcode] || catMatch.unit;
    const factor = factorOf(catMatch.sku, scannedUnit);

    // สแกนแล้วจะเกินจำนวนที่เบิก → หยุดรอยืนยันก่อน
    if ((match.gotBase || 0) + factor > match.need) {
      setConfirmOver({ match, factor, scannedBarcode, scannedUnit });
      return;
    }

    await proceedScan(match, factor, scannedBarcode, scannedUnit);
  }

  // เพิ่ม/รวมจำนวนต่อ LOT จริงบน item (ต่าง LOT ไม่ overwrite กันแบบ it.lot) — ใช้ตอน export แยกแถวเมื่อ SKU เดียวกันในลังนี้สแกนคนละ LOT
  function addLotEntry(scannedLots, lot, exp, scannedBarcode, unit) {
    const next = scannedLots ? [...scannedLots] : [];
    const idx = next.findIndex(l => l.lot === lot);
    if (idx >= 0) {
      next[idx] = { ...next[idx], qty: next[idx].qty + 1, ...(exp ? { exp } : {}), ...(scannedBarcode ? { scannedBarcode } : {}), ...(unit ? { unit } : {}) };
    } else {
      next.push({ lot, qty: 1, exp: exp || '', scannedBarcode: scannedBarcode || '', unit: unit || '' });
    }
    return next;
  }

  // resetLot=true → เปลี่ยน lot ของ item เป็นค่าใหม่ (กรณี LOT เก่าหมด ต้องสลับ); exp = วันหมดอายุ (เฉพาะตอนใส่ LOT เอง — LOT จาก lotMap ไม่มีข้อมูล exp)
  // scannedBarcode = บาร์โค้ดตัวจริงที่สแกน เก็บไว้ export (ต่างจาก it.barcode ที่อาจเป็น comma-separated หลายตัวจาก catalog)
  async function applyScan(match, lot, resetLot = false, exp = '', scannedBarcode = '', scannedUnit = '', factor = 1) {
    playScanSuccess();
    // เพิ่งครบ (ก่อนสแกนนี้ยังไม่ครบ, หลังสแกนนี้ครบพอดี) → ค้างหน้าไว้ที่ตำแหน่งเดิม HOLD_MS ก่อน slide-up หาย (EXIT_MS) แล้วค่อยเลื่อนไปท้าย
    if (isAndroid && (match.gotBase || 0) < match.need && (match.gotBase || 0) + factor >= match.need) {
      const key = `${match.sku}__${match.unit}`;
      setHoldingSkus(prev => new Set(prev).add(key));
      clearTimeout(holdTimeoutsRef.current[key]);
      clearTimeout(exitTimeoutsRef.current[key]);
      holdTimeoutsRef.current[key] = setTimeout(() => {
        delete holdTimeoutsRef.current[key];
        setHoldingSkus(prev => { const next = new Set(prev); next.delete(key); return next; });
        setExitingSkus(prev => new Set(prev).add(key)); // เริ่มเล่น animation slide-up หาย
        exitTimeoutsRef.current[key] = setTimeout(() => {
          delete exitTimeoutsRef.current[key];
          setExitingSkus(prev => { const next = new Set(prev); next.delete(key); return next; }); // animation จบ → เลื่อนไปท้าย list จริง
        }, EXIT_MS);
      }, HOLD_MS);
    }
    const newItems = items.map(it =>
      it.sku === match.sku && it.unit === match.unit
        ? {
            ...it,
            got: it.got + 1,                      // จำนวนครั้งที่สแกน (ไว้ export ตามหน่วยที่สแกน)
            gotBase: (it.gotBase || 0) + factor,  // ความคืบหน้าหน่วยฐาน (เทียบกับ need)
            ...(lot && (resetLot || !it.lot) ? { lot } : {}),
            ...(exp && (resetLot || !it.exp) ? { exp } : {}),
            ...(scannedBarcode ? { scannedBarcode } : {}),
            ...(scannedUnit ? { scannedUnit } : {}),  // หน่วยที่สแกนจริง — ใช้คิดทุน/หน่วยตอน export (ลังไม่มี LOT)
            // scannedLots = breakdown ต่อ LOT จริง — ใช้ export แยกแถวตาม LOT (ดู handleExportBarcode ใน BoxClosedLabel.jsx)
            ...(lot ? { scannedLots: addLotEntry(it.scannedLots, lot, exp, scannedBarcode, scannedUnit) } : {}),
          }
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

  // ปิด popup เลือก/ใส่ LOT — ไม่เคลียร์ฟอร์ม "ใส่ LOT เอง" (คงค่า LOT/Exp เดิมไว้)
  // เพราะมักแพ็คจากลอตเดียวกันหลาย SKU ต่อเนื่อง ครั้งถัดไปกด "ใส่ LOT เอง" จะเห็นค่าล่าสุดเดิม ไม่ต้องพิมพ์ใหม่
  function closeLotPopup() {
    setPendingLot(null);
    setManualLotMode(false);
  }

  async function handleLotSelect(lot) {
    if (!pendingLot) return;
    const { match, scannedBarcode, scannedUnit, factor } = pendingLot;
    closeLotPopup();
    await applyScan(match, lot, true, '', scannedBarcode, scannedUnit, factor);
  }

  async function handleManualLotConfirm() {
    if (!pendingLot) return;
    const lot = manualLot.trim();
    if (!lot) { showToast('⚠ กรุณากรอก LOT', 'error'); return; }
    const anyExp = manualExpD || manualExpM || manualExpY;
    const allExp = manualExpD && manualExpM && manualExpY;
    if (anyExp && !allExp) { showToast('⚠ กรุณากรอกวันที่ Exp ให้ครบ', 'error'); return; }
    const exp = allExp ? `${String(manualExpD).padStart(2, '0')}/${String(manualExpM).padStart(2, '0')}/${manualExpY}` : '';
    const { match, scannedBarcode, scannedUnit, factor } = pendingLot;
    closeLotPopup();
    await applyScan(match, lot, true, exp, scannedBarcode, scannedUnit, factor);
  }

  // ปัด card ยืนยัน "ของหมด" — แช่ need ไว้ที่ got ปัจจุบัน (กันถูกดึงไปลังถัดไปซ้ำ) + ซ่อนออกจาก checklist
  // ของที่แพ็คไปแล้ว (got > 0) ยังนับใน packedItems ตอนปิดลังตามปกติ — ไม่เสียยอดที่สแกนไปแล้ว
  function handleMarkOutOfStock(sku) {
    const target = items.find(it => it.sku === sku);
    const hasScanned = (target?.gotBase ?? 0) > 0; // สแกนไปแล้วบางส่วน = ของไม่พอ, ยังไม่สแกน = ของหมด
    const newItems = items.map(it => it.sku === sku ? { ...it, need: it.gotBase } : it);
    setItems(newItems);
    setDismissedSkus(prev => new Set(prev).add(sku));
    if (activeBoxId && onScanProgress) onScanProgress(activeBoxId, newItems);
    if (hasScanned) showToast('สแกนตัวถัดไป', 'warn');
    else showToast('ลบออกจากรายการแล้ว', 'error');
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
    // ของที่ยังไม่ครบ (หน่วยฐาน) → ยกไปลังถัดไป เหลือ need = needBase − gotBase, reset ตัวนับสแกน/LOT ของลังใหม่
    setItems(prev =>
      prev
        .filter(it => it.gotBase < it.need)
        .map(it => ({ ...it, need: it.need - it.gotBase, got: 0, gotBase: 0, scannedLots: null }))
    );
    setPage(0);
    setSearch('');
    // เคลียร์ "ค้างหน้าตรวจสอบ" + "slide-up หาย" ทั้งหมด — ลังใหม่ need/got reset แล้ว ไม่มีรายการไหนค้างต่อข้ามลัง
    Object.values(holdTimeoutsRef.current).forEach(clearTimeout);
    Object.values(exitTimeoutsRef.current).forEach(clearTimeout);
    holdTimeoutsRef.current = {};
    exitTimeoutsRef.current = {};
    setHoldingSkus(new Set());
    setExitingSkus(new Set());
    await createNewBox();
    showToast(`ปิดลัง ${closingBoxId} แล้ว ✓`, 'success');
    setIsClosing(false);
  }

  function handleCloseBox() {
    const allDone = items.every(it => it.gotBase >= it.need);
    if (allDone) {
      doClose();
    } else {
      setConfirmClose(true);
    }
  }

  const doneCount = visibleItems.filter(it => it.gotBase >= it.need).length;
  // Android: เพิ่งเปิดแอป catalog ยังไม่มาจาก Firestore (gap ก่อน remount ด้วย key ใหม่ตอน catalog โหลดเสร็จ) — โชว์ skeleton แทนลิสต์ว่างเปล่า
  const showCatalogLoading = isAndroid && !catalogLoaded && visibleItems.length === 0;

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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{manualLotMode ? 'ใส่ LOT เอง' : 'เลือก LOT'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              SKU: <span className="mono">{pendingLot.match.sku}</span>
            </div>
            <div style={{ fontFamily: 'system-ui', fontSize: 14, marginBottom: 14, color: '#333' }}>
              {pendingLot.match.name}
            </div>
            {!manualLotMode ? (
              <>
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
                      <span style={{ fontSize: 13, opacity: 0.85, fontFamily: 'system-ui' }}>เหลือ {remaining}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="btn sm ghost"
                  style={{ marginTop: 12 }}
                  onClick={() => setManualLotMode(true)}
                >✎ ใส่ LOT เอง</button>
                <button
                  className="btn sm ghost"
                  style={{ marginTop: 8 }}
                  onClick={closeLotPopup}
                >ยกเลิก</button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                <div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: 'var(--mute)', marginBottom: 4 }}>LOT</div>
                  <input
                    className="input"
                    autoFocus
                    placeholder="พิมพ์ LOT"
                    value={manualLot}
                    onChange={e => setManualLot(e.target.value)}
                    style={{ fontFamily: 'JetBrains Mono' }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: 'var(--mute)', marginBottom: 4 }}>Exp (ค.ศ.)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="input"
                      placeholder="DD"
                      inputMode="numeric"
                      value={manualExpD}
                      onChange={e => setManualExpD(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                      style={{ width: 56, textAlign: 'center', padding: '10px 4px' }}
                    />
                    <input
                      className="input"
                      placeholder="MM"
                      inputMode="numeric"
                      value={manualExpM}
                      onChange={e => setManualExpM(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                      style={{ width: 56, textAlign: 'center', padding: '10px 4px' }}
                    />
                    <input
                      className="input"
                      placeholder="YYYY"
                      inputMode="numeric"
                      value={manualExpY}
                      onChange={e => setManualExpY(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                      style={{ width: 70, textAlign: 'center', padding: '10px 4px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn sm ghost" style={{ flex: 1 }} onClick={() => setManualLotMode(false)}>← กลับ</button>
                  <button className="btn primary" style={{ flex: 2 }} onClick={handleManualLotConfirm}>ยืนยัน</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      {confirmOver && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            textAlign: 'center', minWidth: 280, maxWidth: 340,
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontFamily: 'system-ui', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              สินค้าเกินจำนวนที่เบิก
            </div>
            <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#555', marginBottom: 4 }}>
              {confirmOver.match.name}
            </div>
            <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', marginBottom: 16 }}>
              ต้องการ {confirmOver.match.need} · มีแล้ว {confirmOver.match.gotBase || 0} · สแกนนี้ +{confirmOver.factor}
              {' '}= <b style={{ color: 'var(--accent)' }}>{(confirmOver.match.gotBase || 0) + confirmOver.factor}</b>
              {' '}(เกิน {(confirmOver.match.gotBase || 0) + confirmOver.factor - confirmOver.match.need} หน่วย)
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn sm ghost" onClick={() => setConfirmOver(null)}>ยกเลิก</button>
              <button className="btn primary sm" style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }}
                onClick={handleConfirmOver}>ยืนยัน สินค้าเกินที่เบิก</button>
            </div>
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
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ สินค้าไม่ครบ</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>ปิดลังเลยไหม?</div>
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
            <span style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'system-ui' }}>
              {showCatalogLoading ? 'กำลังโหลด…' : `เช็ค ${doneCount}/${visibleItems.length}`}
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
            <span className="mono" style={{ fontSize: 13 }}>เช็ค {doneCount} / {visibleItems.length} รายการ</span>
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
              <span style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)', minWidth: 60, textAlign: 'center' }}>
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
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleItems.length)} / {visibleItems.length} รายการ
              </span>
            </div>
          )
        )}

        {showCatalogLoading ? (
          <div className="skeleton-list">
            <div className="skeleton-spinner-row">
              <span className="skeleton-spinner" />
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)' }}>กำลังโหลดรายการสินค้า…</span>
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isAndroid ? '1fr' : '1fr 1fr', gap: isAndroid ? 6 : 12 }}>
            {pageItems.map((c) => {
              const key = `${c.sku}__${c.unit}`;
              const done = c.gotBase >= c.need;
              const partial = c.gotBase > 0 && c.gotBase < c.need;
              const exiting = isAndroid && done && exitingSkus.has(key);
              const settled = isAndroid && done && !holdingSkus.has(key) && !exitingSkus.has(key);
              return (
                <ItemCard key={c.sku} c={c} done={done} partial={partial} exiting={exiting} settled={settled} onMarkOutOfStock={handleMarkOutOfStock} />
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
