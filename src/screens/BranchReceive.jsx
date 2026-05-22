import { useState, useRef, useEffect } from 'react';
import { matchBarcode } from '../data.js';

const BRANCH_STAFF = [
  { code: 'BR-01', name: 'ก้า' },
  { code: 'BR-02', name: 'กิ๊ฟ' },
  { code: 'BR-03', name: 'นิคกี้' },
  { code: 'BR-04', name: 'สุ่ย' },
];

const statusLabel = {
  open:     'เปิด',
  packing:  'กำลังแพ็ค',
  closed:   'ปิดลังแล้ว',
  exported: 'ส่ง POS แล้ว',
  received: 'รับสินค้าแล้ว',
};

function BoxCard({ box, isActive, isViewing, isPendingApproval, onClick }) {
  const isReceived = box.status === 'received';
  const borderColor = isReceived ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--line)';
  const bg = isReceived ? '#edf5e0' : isActive ? 'var(--paper-dark)' : 'white';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 16px',
        border: `2px solid ${isViewing ? 'var(--accent)' : borderColor}`,
        borderRadius: 14,
        background: bg,
        opacity: (!isActive && !isViewing && !isReceived) ? 0.7 : 1,
        cursor: 'pointer',
        boxShadow: isViewing
          ? '0 0 0 3px var(--accent-soft), 0 0 10px 2px var(--accent-soft)'
          : isReceived ? '3px 3px 0 #c6dea6' : 'none',
        transition: 'all 0.1s',
      }}
    >
      {isPendingApproval && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', top: 18, right: -22,
            width: 100, textAlign: 'center',
            transform: 'rotate(45deg)',
            fontFamily: 'Caveat', fontSize: 13, fontWeight: 700,
            color: 'var(--accent)',
            animation: 'blink 1s step-start infinite',
            letterSpacing: 1,
          }}>
            รออนุมัติ
          </div>
        </div>
      )}
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: isReceived ? '#6a9a3a' : 'var(--mute)', marginBottom: 2 }}>
        {isViewing ? '👁 กำลังดู' : isActive ? 'ลังที่กำลังตรวจ' : isReceived ? '✓ ตรวจสอบแล้ว' : statusLabel[box.status] || box.status}
      </div>
      <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{box.id}</div>
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginTop: 3 }}>POS: {box.pos}</div>
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
        Barcode: <span className="mono" style={{ fontSize: 11 }}>{box.id}</span>
      </div>
      {box.packer && (
        <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: isReceived ? '#6a9a3a' : 'var(--mute)', marginTop: 2 }}>
          แพ็คโดย: {box.packer.name}
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <span className={isReceived ? 'chip ok' : 'chip'}>{box.skuCount ?? 0} SKU</span>
        <span className={isReceived ? 'chip ok' : 'chip'}>{box.totalQty ?? 0} ชิ้น</span>
      </div>
    </div>
  );
}

export default function BranchReceive({ boxes, setBoxes, itemsByBox, showToast, receiveBoxIds, setReceiveBoxIds }) {
  const [branchStaff, setBranchStaff] = useState(null);
  const [phase, setPhase]             = useState('scan');
  const [query, setQuery]             = useState('');
  const [notFound, setNotFound]       = useState(false);
  const [scanCounts, setScanCounts]   = useState({});
  const [itemScan, setItemScan]       = useState('');
  const [lastScannedSku, setLastScannedSku] = useState(null);
  const [scanError, setScanError]     = useState('');
  const [viewingId, setViewingId]     = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); // 'ok' | 'fail'
  const [supervisorCode, setSupervisorCode] = useState('');
  const inputRef    = useRef(null);
  const itemScanRef = useRef(null);

  const activeBoxId    = receiveBoxIds.length > 0 ? receiveBoxIds[receiveBoxIds.length - 1] : null;
  const foundBox       = activeBoxId ? boxes.find(b => b.id === activeBoxId) || null : null;
  const isReceived     = foundBox?.status === 'received';
  const isViewingOther = viewingId !== null && phase !== 'result' && (phase === 'scan' || viewingId !== activeBoxId);
  const viewingBox     = isViewingOther ? boxes.find(b => b.id === viewingId) : null;
  const viewingItems   = isViewingOther ? (itemsByBox[viewingId] || []) : [];

  const scannedBoxes = receiveBoxIds
    .map(id => boxes.find(b => b.id === id))
    .filter(Boolean)
    .reverse();

  useEffect(() => {
    if (phase === 'scan') setTimeout(() => inputRef.current?.focus(), 50);
    if (phase === 'verify') setTimeout(() => itemScanRef.current?.focus(), 50);
  }, [phase]);

  function handleScan(e) {
    if (e.key !== 'Enter') return;
    const q = query.trim().toLowerCase();
    if (!q) return;

    const box = boxes.find(b =>
      b.id.toLowerCase().includes(q) ||
      b.pos.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, ''))
    );

    if (box) {
      setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id]);
      setNotFound(false);
      setScanCounts({});
      setItemScan('');
      setLastScannedSku(null);
      setScanError('');
      setQuery('');
      setPhase('verify');
    } else {
      setNotFound(true);
    }
  }

  function handleSkip() {
    showToast('ข้ามลังแล้ว · สแกนลังใหม่');
    setScanCounts({});
    setQuery('');
    setNotFound(false);
    setPhase('scan');
  }

  function handleConfirm() {
    if (!foundBox) return;
    setVerifyResult(allChecked ? 'ok' : 'fail');
    setViewingId(null);
    setPhase('result');
  }

  function handleApprove() {
    if (!foundBox) return;
    setBoxes(prev => prev.map(b =>
      b.id === foundBox.id
        ? { ...b, status: 'received', updated: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }
        : b
    ));
    setScanCounts({});
    setItemScan('');
    setLastScannedSku(null);
    setScanError('');
    setQuery('');
    setViewingId(null);
    setVerifyResult(null);
    setSupervisorCode('');
    setPhase('scan');
    showToast(`อนุมัติรับ ${foundBox.id} แล้ว ✓ · พร้อมสแกนลังถัดไป`, 'success');
  }

  function handleRecheck() {
    setScanCounts({});
    setItemScan('');
    setLastScannedSku(null);
    setScanError('');
    setSupervisorCode('');
    setVerifyResult(null);
    setPhase('verify');
    showToast('รีเช็คสินค้า · สแกนสินค้าใหม่อีกครั้ง');
  }

  function handleScanNext() {
    setScanCounts({});
    setQuery('');
    setNotFound(false);
    setViewingId(null);
    setVerifyResult(null);
    setSupervisorCode('');
    setPhase('scan');
  }

  function handleItemScan(e) {
    if (e.key !== 'Enter') return;
    const val = itemScan.trim();
    if (!val) return;
    setItemScan('');

    const match = boxItems.find(l => matchBarcode(l, val));
    if (!match) {
      setScanError(`ไม่พบ "${val}" ในลังนี้`);
      setLastScannedSku(null);
      return;
    }

    const needed = match.qty ?? match.got ?? 0;
    const current = scanCounts[match.sku] || 0;
    if (current >= needed) {
      setScanError(`${match.name} — ครบ ${needed} ชิ้นแล้ว`);
      setLastScannedSku(match.sku);
      return;
    }

    setScanError('');
    setLastScannedSku(match.sku);
    setScanCounts(prev => ({ ...prev, [match.sku]: current + 1 }));
  }

const boxItems         = foundBox ? (itemsByBox[foundBox.id] || []) : [];
  const fullyChecked     = (item) => (scanCounts[item.sku] || 0) >= (item.qty ?? item.got ?? 0);
  const allChecked       = boxItems.length > 0 && boxItems.every(fullyChecked);
  const doneCount        = boxItems.filter(fullyChecked).length;

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: 560 }}>
      {/* ── header ── */}
      <div className="frame-header">
        <div className="row">
          <span className="title">📥 รับสินค้าเข้าสาขา</span>
          {scannedBoxes.length > 0 && (
            <span className="chip" style={{ marginLeft: 10 }}>{scannedBoxes.length} ลัง</span>
          )}
          <span className="mono" style={{ color: 'var(--mute)', marginLeft: 12 }}>
            {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · สาขา
          </span>
          <div className="spacer" />
          {phase === 'verify' && !isReceived && (
            <button className="btn ghost" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleSkip}>
              ↩ ข้ามลัง · สแกนลังใหม่
            </button>
          )}
          {(phase === 'verify' || phase === 'result') && (
            <button className="btn primary" style={{ marginLeft: 8 }} onClick={handleScanNext}>+ สแกนลังถัดไป</button>
          )}
        </div>
        <div className="row">
          <span className="scan-indicator">
            {phase === 'scan' ? 'รอสแกนบาร์โค้ดลัง' : phase === 'result' ? (verifyResult === 'ok' ? '✓ ผลตรวจสอบ' : '⚠ ผลตรวจสอบ') : isReceived ? 'รับสินค้าแล้ว' : 'ตรวจสอบสินค้าในลัง'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)' }}>พนักงานสาขา:</span>
          {BRANCH_STAFF.map(s => {
            const active = branchStaff?.code === s.code;
            return (
              <button
                key={s.code}
                onClick={() => setBranchStaff(active ? null : s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 999,
                  background: active ? 'var(--accent)' : 'white',
                  color: active ? 'white' : 'var(--ink)',
                  fontFamily: 'Patrick Hand', fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: active ? '2px 2px 0 var(--line)' : '1px 1px 0 var(--line)',
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, opacity: 0.75 }}>{s.code}</span>
                <span style={{ fontWeight: active ? 700 : 400 }}>{s.name}</span>
              </button>
            );
          })}
          {branchStaff && (
            <span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>
              · กำลังรับโดย <b>{branchStaff.name}</b>
            </span>
          )}
        </div>
      </div>

      {/* ── body: 2-col ── */}
      {!branchStaff ? (
        <div style={{
          margin: 20,
          border: '2px dashed var(--line)', borderRadius: 14,
          padding: '60px 20px', textAlign: 'center',
          background: 'var(--paper-dark)',
        }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>👤</div>
          <div style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>เลือกพนักงานก่อน</div>
          <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)' }}>
            กรุณาเลือกชื่อพนักงานสาขาด้านบน เพื่อเริ่มรับสินค้า
          </div>
        </div>
      ) : (
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>

        {/* LEFT: stacked box cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 520 }}>
          {scannedBoxes.length === 0 ? (
            <div style={{
              padding: '18px 16px',
              border: '2px dashed var(--line)', borderRadius: 14,
              background: 'var(--paper-dark)', textAlign: 'center',
              color: 'var(--mute)', fontFamily: 'Patrick Hand', fontSize: 14,
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
              <div>ยังไม่ได้สแกนลัง</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>สแกนบาร์โค้ดลังเพื่อเริ่มต้น</div>
            </div>
          ) : (
            scannedBoxes.map((box, i) => (
              <BoxCard
                key={box.id}
                box={box}
                isActive={i === 0 && !isViewingOther}
                isViewing={box.id === viewingId}
                isPendingApproval={i === 0 && phase === 'result'}
                onClick={() => setViewingId(prev => prev === box.id ? null : box.id)}
              />
            ))
          )}

          {/* progress bar for active box */}
          {phase === 'verify' && !isReceived && boxItems.length > 0 && (
            <div style={{ padding: 14, border: '1.5px solid var(--line)', borderRadius: 10, background: 'white' }}>
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, marginBottom: 8 }}>ความคืบหน้า</div>
              <div style={{ height: 10, background: 'var(--paper-dark)', borderRadius: 5, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                <div style={{
                  width: `${(doneCount / boxItems.length) * 100}%`,
                  height: '100%', background: 'var(--green)', transition: 'width 0.2s',
                }} />
              </div>
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>
                {doneCount} / {boxItems.length} SKU ครบ
              </div>
            </div>
          )}

          {phase === 'verify' && !isReceived && (
            <div style={{
              padding: 12, border: '1.5px dashed var(--line)', borderRadius: 10,
              fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', background: 'var(--paper-dark)',
            }}>
              <b>ถ้าสินค้าขาดหรือไม่ครบ</b><br />
              กดปุ่ม "↩ ข้ามลัง" เพื่อแจ้งปัญหาและสแกนลังถัดไป
            </div>
          )}
        </div>

        {/* RIGHT: scan zone OR checklist */}
        <div>
          {isViewingOther ? (
            <div>
              <div className="row" style={{ marginBottom: 12, gap: 10 }}>
                <b style={{ fontFamily: 'Caveat', fontSize: 22 }}>👁 {viewingBox?.id || viewingId}</b>
                {viewingBox?.packer && (
                  <span style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)' }}>
                    แพ็คโดย: {viewingBox.packer.name}
                  </span>
                )}
                {viewingBox?.status === 'received' && <span className="chip ok">✓ ตรวจสอบแล้ว</span>}
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => setViewingId(null)}>× ปิด</button>
              </div>
              {viewingItems.length === 0 ? (
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', textAlign: 'center', padding: 30 }}>
                  ไม่มีข้อมูลรายการสินค้าในลังนี้
                </div>
              ) : (
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 400, overflowY: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 14 }}>
                    <thead style={{ position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ width: 32 }}>#</th>
                        <th>SKU / ชื่อ</th>
                        <th style={{ width: 70 }}>หน่วย</th>
                        <th style={{ width: 60, textAlign: 'center' }}>จำนวน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingItems.map((l, i) => (
                        <tr key={l.sku}>
                          <td style={{ fontFamily: 'Caveat', fontSize: 18, color: 'var(--mute)' }}>{i + 1}</td>
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
              )}
            </div>
          ) : phase === 'result' ? (
            <div>
              <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: 'Caveat', fontSize: 22 }}>{foundBox?.id}</b>
                <span className="chip ok">✓ ตรวจสอบแล้ว</span>
                {verifyResult === 'ok'
                  ? <span className="chip ok" style={{ background: 'var(--green)', borderColor: 'var(--green)', color: 'white' }}>สินค้าถูกต้อง</span>
                  : <span className="chip" style={{ background: '#c0392b', borderColor: '#922b21', color: 'white' }}>สินค้าไม่ถูกต้อง</span>
                }
              </div>

              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
                <table className="tbl" style={{ fontSize: 14 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 36 }}>✓</th>
                      <th>SKU / ชื่อ</th>
                      <th style={{ width: 70 }}>หน่วย</th>
                      <th style={{ width: 90, textAlign: 'center' }}>สแกนแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxItems.map((l) => {
                      const needed = l.qty ?? l.got ?? 0;
                      const count  = scanCounts[l.sku] || 0;
                      const done   = count >= needed;
                      return (
                        <tr key={l.sku} style={{ background: done ? '#e8f0d8' : '#fde8e8' }}>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', margin: '0 auto',
                              background: done ? 'var(--green)' : '#c0392b',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: 13, fontWeight: 700,
                            }}>
                              {done ? '✓' : '✗'}
                            </div>
                          </td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: done ? 'var(--green)' : '#c0392b' }}>
                            {count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {verifyResult === 'ok' ? (
                <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn primary lg" onClick={handleApprove}>✓ อนุมัติ</button>
                </div>
              ) : (
                <div style={{ border: '1.5px solid #c0392b', borderRadius: 10, padding: '14px 16px', background: '#fde8e8' }}>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: '#c0392b', marginBottom: 10 }}>
                    ⚠ พบสินค้าไม่ครบ — ต้องใช้รหัสหัวหน้างานเพื่อรีเช็ค
                  </div>
                  <div className="row" style={{ gap: 10 }}>
                    <input
                      className="input"
                      placeholder="รหัสหัวหน้างาน…"
                      style={{ flex: 1 }}
                      value={supervisorCode}
                      onChange={e => setSupervisorCode(e.target.value)}
                    />
                    <button
                      className="btn"
                      style={{
                        borderColor: supervisorCode.trim() ? 'var(--accent)' : 'var(--line)',
                        color: supervisorCode.trim() ? 'var(--accent)' : 'var(--mute)',
                        opacity: supervisorCode.trim() ? 1 : 0.5,
                        cursor: supervisorCode.trim() ? 'pointer' : 'not-allowed',
                      }}
                      onClick={() => {
                        if (!supervisorCode.trim()) { showToast('⚠ กรุณาใส่รหัสหัวหน้างาน', 'error'); return; }
                        handleRecheck();
                      }}
                    >
                      🔄 รีเช็คสินค้า
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : phase === 'scan' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 20 }}>
              <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700 }}>สแกนบาร์โค้ดลัง</div>
              <div style={{
                width: '100%',
                border: '3px dashed var(--line)', borderRadius: 20,
                padding: '32px 28px', textAlign: 'center', background: 'white',
              }}>
                <div style={{ fontFamily: 'Caveat', fontSize: 72, fontWeight: 700, color: 'var(--accent)', letterSpacing: 6, lineHeight: 1 }}>|||</div>
                <div className="hand" style={{ fontSize: 18, color: 'var(--mute)', margin: '10px 0' }}>ยิงบาร์โค้ดที่ติดลัง</div>
                <input
                  ref={inputRef}
                  className="input big"
                  placeholder="BX-… หรือ POS number"
                  style={{ textAlign: 'center', fontSize: 20, width: '100%' }}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
                  onKeyDown={handleScan}
                />
                <div style={{ fontFamily: 'Patrick Hand', color: 'var(--mute)', marginTop: 10, fontSize: 14 }}>
                  กด Enter หรือยิงบาร์โค้ดเพื่อค้นหาลัง
                </div>
              </div>
              {notFound && (
                <div style={{
                  padding: '12px 20px', width: '100%',
                  border: '2px solid var(--red)', borderRadius: 12,
                  background: '#fde8e8', fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--red)',
                }}>
                  ⚠ ไม่พบลัง "{query}" — ลองสแกนใหม่อีกครั้ง
                </div>
              )}
            </div>
          ) : (
            <>
              {boxItems.length === 0 ? (
                <div style={{
                  padding: 30, border: '2px dashed var(--line)', borderRadius: 12,
                  background: 'var(--paper-dark)', fontFamily: 'Patrick Hand',
                  fontSize: 16, color: 'var(--mute)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
                  <div>ลังนี้ยังไม่มีข้อมูลรายการสินค้า</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>อาจยังไม่ผ่านการสแกนจากฝ่ายแพ็คกิ้ง</div>
                  <button className="btn ghost" style={{ marginTop: 14 }} onClick={handleSkip}>↩ ข้ามลัง · สแกนลังใหม่</button>
                </div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <div>
                      <b style={{ fontFamily: 'Caveat', fontSize: 22 }}>ตรวจสอบสินค้าในลัง</b>
                      {foundBox?.packer && (
                        <span style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', marginLeft: 10 }}>
                          แพ็คโดย: <b style={{ color: '#555' }}>{foundBox.packer.name} · {foundBox.packer.code}</b>
                        </span>
                      )}
                    </div>
                    <div className="spacer" />
                  </div>

                  {!isReceived && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="row" style={{ gap: 10 }}>
                        <input
                          ref={itemScanRef}
                          className="input big"
                          placeholder="ยิงบาร์โค้ดสินค้า → ติ๊กอัตโนมัติ"
                          value={itemScan}
                          onChange={(e) => { setItemScan(e.target.value); setScanError(''); }}
                          onKeyDown={handleItemScan}
                          style={{ flex: 1 }}
                        />
                        <span className="scan-indicator" style={{ whiteSpace: 'nowrap' }}>พร้อมรับการยิง</span>
                      </div>
                      {scanError && (
                        <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--red)', marginTop: 4 }}>⚠ {scanError}</div>
                      )}
                      {lastScannedSku && !scanError && (
                        <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--green)', marginTop: 4 }}>
                          ✓ {boxItems.find(l => l.sku === lastScannedSku)?.name} — ติ๊กแล้ว
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 300, overflowY: 'auto' }}>
                    <table className="tbl" style={{ fontSize: 14 }}>
                      <thead style={{ position: 'sticky', top: 0 }}>
                        <tr>
                          <th>SKU / ชื่อ</th>
                          <th>Barcode</th>
                          <th style={{ width: 70 }}>หน่วย</th>
                          <th style={{ width: 90, textAlign: 'center' }}>สแกนแล้ว</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxItems.map((l) => {
                          const needed      = l.qty ?? l.got ?? 0;
                          const count       = scanCounts[l.sku] || 0;
                          const done        = count >= needed;
                          const partial     = count > 0 && count < needed;
                          const justScanned = l.sku === lastScannedSku;
                          return (
                            <tr
                              key={l.sku}
                              style={{
                                background: justScanned ? 'var(--accent-soft)' : done ? '#e8f0d8' : 'white',
                                transition: 'background 0.12s',
                              }}
                            >
                              <td>
                                <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                              </td>
                              <td className="num-col" style={{ fontSize: 12, color: 'var(--mute)' }}>{l.barcode || '—'}</td>
                              <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  fontFamily: 'Caveat', fontSize: 22, fontWeight: 700,
                                  color: 'var(--ink)',
                                }}>{count}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {isReceived ? (
                    <div style={{
                      marginTop: 14, padding: '12px 18px',
                      border: '2px solid var(--green)', borderRadius: 10,
                      background: '#e8f0d8', textAlign: 'center',
                      fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: 'var(--green)',
                    }}>
                      ✓ รับสินค้าเรียบร้อยแล้ว — {foundBox?.id}
                    </div>
                  ) : (
                    <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleSkip}>↩ ข้ามลัง</button>
                      <button className="btn primary lg" onClick={handleConfirm}>✓ ยืนยันรับสินค้า</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
