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
  closed:   'รอคลังอนุมัติเอกสาร',
  exported: 'รอผู้ช่วยตรวจสอบสินค้า',
  received: 'รับสินค้าแล้ว',
};

// ย่อรูปหลักฐาน → base64 JPEG (กว้างสุด ~800px) เพื่อเก็บลง Firestore (1 doc ≤ 1MB)
function compressImage(file, maxW = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function BoxCard({ box, isActive, isViewing, isPendingApproval, onApprove, onInspect, onClick }) {
  const isReceived = box.status === 'received';
  const hasProblem = box.problemReported && !box.problemResolved;
  const problemFixed = box.problemReported && box.problemResolved && !isReceived; // แก้แล้ว แต่ยังไม่อนุมัติเอกสาร
  // สีพื้น/ขอบ ตามสถานะลังเอง (ไม่ใช่ตอนคลิก) — accentState = pending/active
  const accentState = isActive || isPendingApproval;
  const borderColor = hasProblem ? 'var(--red)' : accentState ? 'var(--accent)' : isReceived ? 'var(--green)' : 'var(--line)';
  const bg = hasProblem ? '#fde8e8' : isReceived ? '#edf5e0' : accentState ? 'var(--accent-soft)' : 'white';
  // คลิก (viewing) = เข้มขึ้น + ยกขึ้น โดยไม่เปลี่ยนสีพื้น
  const shadow = (isViewing || accentState || hasProblem)
    ? '3px 3px 0 var(--line)'
    : isReceived ? '3px 3px 0 #c6dea6' : '1px 1px 0 var(--line)';
  const shift = (isViewing || accentState) ? 'translate(-1px, -1px)' : 'none';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 16px',
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
        background: bg,
        opacity: (!isViewing && !accentState && !isReceived && !hasProblem && !problemFixed) ? 0.65 : 1,
        filter: isViewing ? 'brightness(0.9)' : 'none',
        cursor: 'pointer',
        boxShadow: shadow,
        transform: shift,
        transition: 'all 0.1s',
      }}
    >
      {(() => {
        const label = isViewing ? ''
          : hasProblem ? '🔴 พบปัญหา · รอตรวจสอบ'
          : isPendingApproval ? ''
          : problemFixed ? '✓ แก้ไขปัญหาแล้ว · รออนุมัติ'
          : isReceived ? 'เภสัชอนุมัติเอกสารแล้ว ✓'
          : isActive ? 'ลังที่กำลังตรวจ'
          : statusLabel[box.status] || box.status;
        return label ? (
          <div style={{ fontFamily: 'Patrick Hand', fontSize: 11, color: hasProblem ? 'var(--red)' : isReceived ? '#6a9a3a' : 'var(--mute)', marginBottom: 2 }}>
            {label}
          </div>
        ) : null;
      })()}
      <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{box.id}</div>
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginTop: 3 }}>เลขที่เอกสาร: {box.pos}</div>
      <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
        เลขที่ลัง: <span className="mono" style={{ fontSize: 11 }}>{box.id}</span>
      </div>
      {box.packer && (
        <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: isReceived ? '#6a9a3a' : 'var(--mute)', marginTop: 2 }}>
          แพ็คโดย: {box.packer.name}
        </div>
      )}
      {box.receivedBy && (
        <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: isReceived ? '#6a9a3a' : 'var(--mute)', marginTop: 2 }}>
          ตรวจสอบโดย: {box.receivedBy.name}
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <span className={isReceived ? 'chip ok' : 'chip'}>{box.skuCount ?? 0} SKU</span>
        <span className={isReceived ? 'chip ok' : 'chip'}>{box.totalQty ?? 0} ชิ้น</span>
      </div>
      {hasProblem ? (
        <button
          className="btn"
          style={{ marginTop: 10, width: '100%', background: 'var(--red)', borderColor: 'var(--red)', color: 'white', fontWeight: 700 }}
          onClick={(e) => { e.stopPropagation(); onInspect(); }}
        >
          🔍 ตรวจสอบ
        </button>
      ) : isPendingApproval ? (
        <button
          className="btn primary"
          style={{ marginTop: 10, width: '100%' }}
          onClick={(e) => { e.stopPropagation(); onApprove(); }}
        >
          ✓ อนุมัติเอกสาร
        </button>
      ) : problemFixed ? (
        <button
          className="btn"
          style={{ marginTop: 10, width: '100%', background: 'var(--green)', borderColor: 'var(--green)', color: 'white', fontWeight: 700 }}
          onClick={(e) => { e.stopPropagation(); onApprove(); }}
        >
          ✓ แก้ไขแล้ว/อนุมัติเอกสาร
        </button>
      ) : null}
    </div>
  );
}

export default function BranchReceive({ boxes, setBoxes, itemsByBox, showToast, receiveBoxIds, setReceiveBoxIds, pendingApprovalBoxId, setPendingApprovalBoxId, branchStaff: branchStaffProp, setBranchStaff: setBranchStaffProp, isAndroid = false }) {
  const [internalBranchStaff, setInternalBranchStaff] = useState(null);
  const isControlled = branchStaffProp !== undefined;
  const branchStaff = isControlled ? branchStaffProp : internalBranchStaff;
  const setBranchStaff = isControlled ? setBranchStaffProp : setInternalBranchStaff;
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
  const [reportOpen, setReportOpen]   = useState(false);
  const [reportImage, setReportImage] = useState(null);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [problemNote, setProblemNote] = useState('');
  const inputRef    = useRef(null);
  const itemScanRef = useRef(null);
  const staffMenuRef = useRef(null);

  const activeBoxId    = receiveBoxIds.length > 0 ? receiveBoxIds[receiveBoxIds.length - 1] : null;
  const foundBox       = activeBoxId ? boxes.find(b => b.id === activeBoxId) || null : null;
  const isReceived     = foundBox?.status === 'received';
  const isViewingOther = viewingId !== null && phase !== 'result';
  const viewingBox     = viewingId ? boxes.find(b => b.id === viewingId) : null;
  const viewingItems   = viewingId ? (itemsByBox[viewingId] || []) : [];

  // ลังที่พนักงานหน้าร้านสแกนรับแล้ว (รออนุมัติ) หรือเคยเข้ารับใน session นี้ — pending ขึ้นก่อน
  // Desktop: ปุ่มเลือกพนักงาน = filter เฉพาะลังที่พนักงานคนนั้นสแกน (receivedBy)
  const staffFilter = !isControlled && branchStaff ? branchStaff.code : null;
  const matchStaff = (b) => !staffFilter || b.receivedBy?.code === staffFilter || b.problemBy?.code === staffFilter;
  // pending + ลังที่มีปัญหา ขึ้นก่อน (problem สำคัญสุด)
  const sortRank = (b) => b.problemReported && !b.problemResolved ? 0 : b.receivePending ? 1 : 2;
  const approvalBoxes = boxes
    .filter(b => b.receivePending || b.problemReported || receiveBoxIds.includes(b.id))
    .filter(matchStaff)
    .sort((a, b) => sortRank(a) - sortRank(b));
  const pendingCount = boxes.filter(b => b.receivePending && matchStaff(b)).length;
  const problemCount = boxes.filter(b => b.problemReported && !b.problemResolved && matchStaff(b)).length;

  // ค้นหา SKU/ชื่อ ว่าอยู่ลังไหน — ค้นข้ามทุกลังที่ปิด/ส่งออก/รับแล้ว (ไม่ผูกกับตัวกรองพนักงาน)
  const searchQ = itemSearch.trim().toLowerCase();
  const searchResults = searchQ
    ? boxes
        .filter(b => b.status === 'closed' || b.status === 'exported' || b.status === 'received' || b.receivePending)
        .flatMap(box =>
          (itemsByBox[box.id] || [])
            .filter(l => (l.sku || '').toLowerCase().includes(searchQ) || (l.name || '').toLowerCase().includes(searchQ))
            .map(l => ({ boxId: box.id, status: box.status, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty ?? l.got ?? 0 }))
        )
    : [];

  useEffect(() => {
    if (phase === 'scan') setTimeout(() => inputRef.current?.focus(), 50);
    if (phase === 'verify') setTimeout(() => itemScanRef.current?.focus(), 50);
  }, [phase]);

  useEffect(() => {
    const vb = viewingId ? boxes.find(b => b.id === viewingId) : null;
    setProblemNote(vb?.problemNote || '');
  }, [viewingId]);

  useEffect(() => {
    if (!staffMenuOpen) return;
    const handler = (e) => {
      if (staffMenuRef.current && !staffMenuRef.current.contains(e.target)) setStaffMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [staffMenuOpen]);

  function startReceive(box) {
    setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id]);
    setNotFound(false);
    setScanCounts({});
    setItemScan('');
    setLastScannedSku(null);
    setScanError('');
    setQuery('');
    setViewingId(null);
    setPhase('verify');
  }

  function handleScan(e) {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;

    const box = boxes.find(b =>
      b.id.toLowerCase().includes(q) ||
      b.pos.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, ''))
    );

    if (box) {
      startReceive(box);
    } else {
      setNotFound(true);
    }
  }

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    setReportImage({ url: dataUrl || URL.createObjectURL(file), name: file.name });
  }

  // Android: ยืนยันแจ้งปัญหา → persist ลง box (sync ให้หัวหน้าตรวจที่ Desktop)
  function handleReportProblem() {
    if (!foundBox) return;
    setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
      ...b,
      problemReported: true,
      problemResolved: false,
      problemImage: reportImage?.url || null,
      problemBy: branchStaff || null,
      problemScanCounts: { ...scanCounts },
      problemNote: '',
      problemAt: new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      updated: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    } : b));
    showToast('แจ้งปัญหาแล้ว · ส่งให้หัวหน้าตรวจสอบ', 'error');
    setScanCounts({}); setQuery(''); setNotFound(false);
    setItemScan(''); setLastScannedSku(null); setScanError('');
    setVerifyResult(null); setViewingId(null);
    setPhase('scan'); setReportOpen(false); setReportImage(null);
  }

  function saveProblemNote() {
    if (!viewingId) return;
    // บันทึกรายละเอียด + ส่งต่อให้ Outbound แก้ไข (problemReviewed = gate ให้ badge ขึ้นที่ Outbound)
    setBoxes(prev => prev.map(b => b.id === viewingId ? { ...b, problemNote, problemReviewed: true } : b));
    showToast('บันทึกแล้ว ✓ · ส่งให้ Outbound แก้ไขสินค้า', 'success');
  }

  function handleConfirm() {
    if (!foundBox) return;
    const hasOver = boxItems.some(l => (scanCounts[l.sku] || 0) > (l.qty ?? l.got ?? 0));
    const result = !allChecked ? 'fail' : hasOver ? 'over' : 'ok';
    setVerifyResult(result);
    setViewingId(null);
    // ผลถูกต้อง → ส่งให้หัวหน้าอนุมัติเอกสารที่ Desktop (persist บน box เพื่อ sync ข้ามเครื่อง)
    if (result === 'ok') {
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        receivePending: true,
        receivedBy: branchStaff || null,
        updated: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      } : b));
    }
    setPendingApprovalBoxId(foundBox.id);
    setPhase('result');
  }

  function handleApprove(targetBoxId) {
    if (!targetBoxId) return;
    setBoxes(prev => prev.map(b =>
      b.id === targetBoxId
        ? { ...b, status: 'received', receivePending: false, updated: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }
        : b
    ));
    setPendingApprovalBoxId(null);
    if (targetBoxId === foundBox?.id) {
      setScanCounts({});
      setItemScan('');
      setLastScannedSku(null);
      setScanError('');
      setQuery('');
      setViewingId(null);
      setVerifyResult(null);
      setSupervisorCode('');
      setPhase('scan');
    }
    showToast(`อนุมัติเอกสาร ${targetBoxId} แล้ว ✓ · รับเข้าสาขาเรียบร้อย`, 'success');
  }

  function handleRecheck() {
    setPendingApprovalBoxId(null);
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
    const val = e.target.value.trim();
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

    setScanError('');
    setLastScannedSku(match.sku);
    setScanCounts(prev => ({ ...prev, [match.sku]: current + 1 }));
  }

const boxItems         = foundBox ? (itemsByBox[foundBox.id] || []) : [];
  const fullyChecked     = (item) => (scanCounts[item.sku] || 0) >= (item.qty ?? item.got ?? 0);
  const allChecked       = boxItems.length > 0 && boxItems.every(fullyChecked);
  const doneCount        = boxItems.filter(fullyChecked).length;
  const scannedSkuCount  = boxItems.filter(l => (scanCounts[l.sku] || 0) >= 1).length;

  return (
    <div className="frame" style={{ padding: 0, position: 'relative', minHeight: isAndroid ? 0 : 560 }}>
      {/* ── header ── */}
      <div className="frame-header">
        {isAndroid ? (
          <>
            <div className="row">
              <span className="title">📥 รับสินค้าเข้าสาขา</span>
            </div>
            {(phase === 'verify' || phase === 'result') && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn sm primary" style={{ flex: 1 }} onClick={handleScanNext}>+ ลังถัดไป</button>
              </div>
            )}
          </>
        ) : (
          <div className="row">
            <span className="title" style={{ whiteSpace: 'nowrap' }}>📥 รับสินค้าเข้าสาขา</span>
            {pendingCount > 0 && (
              <span className="chip" style={{ marginLeft: 8, background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 700 }}>{pendingCount} รออนุมัติ</span>
            )}
            {problemCount > 0 && (
              <span className="chip" style={{ marginLeft: 8, background: '#fde8e8', borderColor: 'var(--red)', color: 'var(--red)', whiteSpace: 'nowrap', fontWeight: 700 }}>🔴 {problemCount} แจ้งปัญหา</span>
            )}
            <div className="spacer" />
            {(phase === 'verify' || phase === 'result') && (
              <button className="btn primary" style={{ marginLeft: 8 }} onClick={handleScanNext}>+ รับลังถัดไป</button>
            )}
            <input
              className="input"
              placeholder="🔍 ค้นหา SKU / ชื่อ ว่าอยู่ลังไหน…"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              style={{ marginLeft: 12, width: 240 }}
            />
            <span className="mono" style={{ marginLeft: 12, color: 'var(--ink)', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 700 }}>
              รอบเบิก {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {!isControlled && (
              <div ref={staffMenuRef} style={{ position: 'relative', marginLeft: 12 }}>
                <button
                  className="btn"
                  onClick={() => setStaffMenuOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                    borderColor: branchStaff ? 'var(--accent)' : 'var(--line)',
                    color: branchStaff ? 'var(--accent)' : 'var(--mute)',
                    fontWeight: branchStaff ? 700 : 400,
                  }}
                >
                  <span>🔽</span>
                  <span>{branchStaff ? `กรอง: ${branchStaff.name}` : 'ทุกพนักงาน'}</span>
                  <span style={{ fontSize: 11 }}>▾</span>
                </button>
                {staffMenuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
                    background: 'white', border: '2px solid var(--line)', borderRadius: 12,
                    boxShadow: '3px 3px 0 var(--line)', padding: 6, minWidth: 190,
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', padding: '2px 12px' }}>
                      กรองลังตามผู้ตรวจรับ
                    </div>
                    <button
                      onClick={() => { setBranchStaff(null); setStaffMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
                        background: !branchStaff ? 'var(--accent)' : 'transparent',
                        color: !branchStaff ? 'white' : 'var(--ink)',
                        fontFamily: 'Patrick Hand', fontSize: 15, textAlign: 'left',
                      }}
                    >
                      <span style={{ fontWeight: !branchStaff ? 700 : 400 }}>ทุกพนักงาน</span>
                      {!branchStaff && <span style={{ marginLeft: 'auto' }}>✓</span>}
                    </button>
                    {BRANCH_STAFF.map(s => {
                      const active = branchStaff?.code === s.code;
                      return (
                        <button
                          key={s.code}
                          onClick={() => { setBranchStaff(active ? null : s); setStaffMenuOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
                            background: active ? 'var(--accent)' : 'transparent',
                            color: active ? 'white' : 'var(--ink)',
                            fontFamily: 'Patrick Hand', fontSize: 15, textAlign: 'left',
                          }}
                        >
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, opacity: 0.7 }}>{s.code}</span>
                          <span style={{ fontWeight: active ? 700 : 400 }}>{s.name}</span>
                          {active && <span style={{ marginLeft: 'auto' }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── body: 2-col ── */}
      <div style={isAndroid
        ? { padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }
        : { padding: 20, display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20 }
      }>

        {/* LEFT: box cards — desktop only, grid 2 คอลัมน์ */}
        {!isAndroid && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, alignContent: 'start', overflowY: 'auto', maxHeight: 520 }}>
            {approvalBoxes.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                padding: '18px 16px',
                border: '2px dashed var(--line)', borderRadius: 14,
                background: 'var(--paper-dark)', textAlign: 'center',
                color: 'var(--mute)', fontFamily: 'Patrick Hand', fontSize: 14,
              }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                {staffFilter ? (
                  <>
                    <div>ไม่มีลังที่ {branchStaff?.name} ตรวจรับ</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>ลองเลือก "ทุกพนักงาน" เพื่อดูทั้งหมด</div>
                  </>
                ) : (
                  <>
                    <div>ยังไม่มีลังรออนุมัติ</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>ลังจะปรากฏเมื่อพนักงานหน้าร้านสแกนรับเสร็จ</div>
                  </>
                )}
              </div>
            ) : (
              approvalBoxes.map((box) => (
                <BoxCard
                  key={box.id}
                  box={box}
                  isActive={false}
                  isViewing={box.id === viewingId}
                  isPendingApproval={!!box.receivePending}
                  onApprove={() => handleApprove(box.id)}
                  onInspect={() => setViewingId(box.id)}
                  onClick={() => setViewingId(prev => prev === box.id ? null : box.id)}
                />
              ))
            )}
          </div>
        )}

        {/* RIGHT / main content */}
        <div>
          {!isAndroid && searchQ ? (
            <div>
              <div className="row" style={{ marginBottom: 12, gap: 10 }}>
                <b style={{ fontFamily: 'Caveat', fontSize: 22 }}>🔍 ผลค้นหา "{itemSearch}"</b>
                <span className="chip info">{searchResults.length} รายการ</span>
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => setItemSearch('')}>× ล้างค้นหา</button>
              </div>
              {searchResults.length === 0 ? (
                <div style={{
                  padding: '50px 20px', border: '2px dashed var(--line)', borderRadius: 14,
                  background: 'var(--paper-dark)', textAlign: 'center', color: 'var(--mute)',
                }}>
                  <div style={{ fontSize: 42, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700 }}>ไม่พบสินค้า</div>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, marginTop: 4 }}>
                    ไม่พบ "{itemSearch}" ในลังรอบเบิกนี้
                  </div>
                </div>
              ) : (
                <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 460, overflowY: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 14 }}>
                    <thead style={{ position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ width: 130 }}>อยู่ลังที่</th>
                        <th>SKU / ชื่อ</th>
                        <th style={{ width: 70 }}>หน่วย</th>
                        <th style={{ width: 60, textAlign: 'center' }}>จำนวน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((r, i) => (
                        <tr key={`${r.boxId}-${r.sku}-${i}`} style={{ cursor: 'pointer' }} onClick={() => { setViewingId(r.boxId); setItemSearch(''); }}>
                          <td><span style={{ fontFamily: 'Caveat', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{r.boxId}</span></td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{r.sku}</div>
                            <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{r.name}</div>
                          </td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{r.unit}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 20, fontWeight: 700 }}>×{r.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (!isAndroid && viewingBox?.problemReported && !viewingBox?.problemResolved) ? (
            <div>
              <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: 'Caveat', fontSize: 22, color: 'var(--red)' }}>🔴 ตรวจสอบปัญหา · {viewingBox.id}</b>
                {viewingBox.problemBy && (
                  <span style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)' }}>
                    แจ้งโดย: {viewingBox.problemBy.name}{viewingBox.problemAt ? ` · ${viewingBox.problemAt}` : ''}
                  </span>
                )}
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => setViewingId(null)}>× ปิด</button>
              </div>

              {/* รายการสินค้า — ตัวแดง = ขาด (จาก problemScanCounts) */}
              {(() => {
                const psc = viewingBox.problemScanCounts || {};
                return (
                  <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
                    <table className="tbl" style={{ fontSize: 14 }}>
                      <thead style={{ position: 'sticky', top: 0 }}>
                        <tr>
                          <th>SKU / ชื่อ</th>
                          <th style={{ width: 60 }}>หน่วย</th>
                          <th style={{ width: 56, textAlign: 'center' }}>ต้องมี</th>
                          <th style={{ width: 64, textAlign: 'center' }}>สแกนได้</th>
                          <th style={{ width: 56, textAlign: 'center' }}>ขาด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingItems.map(l => {
                          const need = l.qty ?? l.got ?? 0;
                          const got = psc[l.sku] || 0;
                          const short = need - got;
                          const isShort = short > 0;
                          return (
                            <tr key={l.sku} style={{ background: isShort ? '#fde8e8' : 'white' }}>
                              <td>
                                <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: isShort ? 'var(--red)' : 'var(--ink)', fontWeight: isShort ? 700 : 400 }}>{l.name}</div>
                              </td>
                              <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 18, fontWeight: 700 }}>{need}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 18, fontWeight: 700, color: isShort ? 'var(--red)' : 'var(--green)' }}>{got}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{isShort ? short : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* รูปหลักฐานสินค้าชำรุด */}
              {viewingBox.problemImage && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)', marginBottom: 6 }}>📷 รูปหลักฐาน</div>
                  <img src={viewingBox.problemImage} alt="หลักฐาน" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1.5px solid var(--line)', objectFit: 'contain', display: 'block' }} />
                </div>
              )}

              {/* รายละเอียดปัญหาที่พบ (หัวหน้าบันทึก) */}
              <div style={{ marginBottom: 6, fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>รายละเอียดปัญหาที่พบ (หัวหน้าบันทึกเพิ่ม)</div>
              <textarea
                className="input"
                placeholder="เช่น สินค้าขาด 2 ชิ้น / กล่องบุบ / ..."
                value={problemNote}
                onChange={e => setProblemNote(e.target.value)}
                style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
              />
              <div className="row" style={{ marginTop: 10, gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={saveProblemNote} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>💾 บันทึกรายละเอียด</button>
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', border: '1.5px dashed var(--line)', borderRadius: 10, background: 'var(--paper-dark)', fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)' }}>
                กด <b>"บันทึกรายละเอียด"</b> ก่อน → ลังจะไปขึ้น badge "แจ้งปัญหา" ที่หน้า <b>Outbound</b> เพื่อแก้ไขจำนวนสินค้าจริง
              </div>
            </div>
          ) : isViewingOther ? (
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
                  : verifyResult === 'over'
                  ? <span className="chip warn" style={{ background: '#e67e22', borderColor: '#b86000', color: 'white' }}>สินค้าเกินจำนวน</span>
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
                      <th style={{ width: 60, textAlign: 'center' }}>ต้องมี</th>
                      <th style={{ width: 70, textAlign: 'center' }}>สแกนแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxItems.map((l) => {
                      const needed = l.qty ?? l.got ?? 0;
                      const count  = scanCounts[l.sku] || 0;
                      const over   = count > needed;
                      const done   = count >= needed;
                      const rowBg  = over ? '#fff3cd' : done ? '#e8f0d8' : '#fde8e8';
                      const dotBg  = over ? '#e67e22' : done ? 'var(--green)' : '#c0392b';
                      const dotIcon = over ? '!' : done ? '✓' : '✗';
                      const countColor = over ? '#e67e22' : done ? 'var(--green)' : '#c0392b';
                      return (
                        <tr key={l.sku} style={{ background: rowBg }}>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', margin: '0 auto',
                              background: dotBg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: 13, fontWeight: 700,
                            }}>
                              {dotIcon}
                            </div>
                          </td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 18, fontWeight: 700, color: 'var(--mute)' }}>
                            {needed}
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: countColor }}>
                            {count}{over && <span style={{ fontSize: 13, marginLeft: 2 }}>+{count - needed}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {verifyResult === 'ok' ? (
                <div style={{
                  border: '2px solid var(--accent)', borderRadius: 12, padding: '14px 16px',
                  background: 'var(--accent-soft)', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                    ✓ ส่งให้หัวหน้าอนุมัติเอกสารแล้ว
                  </div>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)', marginTop: 4 }}>
                    รออนุมัติเอกสารที่หน้าจอหัวหน้างาน · กด "+ รับลังถัดไป" เพื่อสแกนลังต่อไป
                  </div>
                </div>
              ) : (
                <div style={{ border: `1.5px solid ${verifyResult === 'over' ? '#e67e22' : '#c0392b'}`, borderRadius: 10, padding: '14px 16px', background: verifyResult === 'over' ? '#fff3cd' : '#fde8e8' }}>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: verifyResult === 'over' ? '#b86000' : '#c0392b', marginBottom: 10 }}>
                    {verifyResult === 'over' ? '⚠ พบสินค้าเกินจำนวน — ต้องใช้รหัสหัวหน้างานเพื่อรีเช็ค' : '⚠ พบสินค้าไม่ครบ — ต้องใช้รหัสหัวหน้างานเพื่อรีเช็ค'}
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
            isAndroid ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>ยิงบาร์โค้ดที่ติดลัง หรือพิมพ์ BX-…</div>
                <input
                  ref={inputRef}
                  className="input big"
                  placeholder="BX-… หรือ POS number"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
                  onKeyDown={handleScan}
                />
                {notFound && (
                  <div style={{
                    padding: '10px 14px',
                    border: '2px solid var(--red)', borderRadius: 10,
                    background: '#fde8e8', fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--red)',
                  }}>
                    ⚠ ไม่พบลัง "{query}" — ลองสแกนใหม่
                  </div>
                )}
              </div>
            ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, minHeight: 360, textAlign: 'center', color: 'var(--mute)',
              border: '2px dashed var(--line)', borderRadius: 16, background: 'var(--paper-dark)',
            }}>
              <div style={{ fontSize: 46 }}>📋</div>
              <div style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700 }}>
                {approvalBoxes.length > 0 ? 'เลือกลังทางซ้ายเพื่อดูรายละเอียด' : 'ยังไม่มีลังรออนุมัติ'}
              </div>
              <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, maxWidth: 320 }}>
                {approvalBoxes.length > 0
                  ? 'คลิก card ลังเพื่อดูรายการสินค้า แล้วกด "อนุมัติเอกสาร" เพื่อยืนยันรับเข้าสาขา'
                  : 'เมื่อพนักงานหน้าร้านสแกนรับสินค้าเสร็จที่แอป ลังจะมาขึ้นที่นี่ให้อนุมัติเอกสาร'}
              </div>
            </div>
            )
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
                  <button className="btn ghost" style={{ marginTop: 14 }} onClick={handleScanNext}>+ สแกนลังถัดไป</button>
                </div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <div>
                      <b style={{ fontFamily: 'Caveat', fontSize: isAndroid ? 16 : 22 }}>ตรวจสอบสินค้าในลัง</b>
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
                          placeholder="ยิงบาร์โค้ดสินค้า"
                          value={itemScan}
                          onChange={(e) => { setItemScan(e.target.value); setScanError(''); }}
                          onKeyDown={handleItemScan}
                          style={{ flex: 1 }}
                        />
                      </div>
                      {lastScannedSku && !scanError && (
                        <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--green)', marginTop: 4 }}>
                          ✓ {boxItems.find(l => l.sku === lastScannedSku)?.name} — ติ๊กแล้ว
                        </div>
                      )}
                    </div>
                  )}

                  {(() => {
                    const totalPieces = Object.values(scanCounts).reduce((s, c) => s + c, 0);
                    const scannedItems = [...boxItems]
                      .filter(l => (scanCounts[l.sku] || 0) > 0)
                      .sort((a, b) => (a.sku === lastScannedSku ? -1 : b.sku === lastScannedSku ? 1 : 0));
                    return (
                      <>
                        <div style={{ marginBottom: 12, padding: '10px 14px', border: '1.5px solid var(--line)', borderRadius: 10, background: 'white' }}>
                          <div className="row">
                            <span style={{ fontFamily: 'Patrick Hand', fontSize: 14 }}>สแกนแล้ว</span>
                            <div className="spacer" />
                            <span style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{totalPieces} ชิ้น</span>
                          </div>
                        </div>
                        {scannedItems.length === 0 ? (
                          <div style={{ padding: '20px 14px', border: '1.5px dashed var(--line)', borderRadius: 10, background: 'var(--paper-dark)', textAlign: 'center', fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>
                            ยิงบาร์โค้ดสินค้าเพื่อเริ่มตรวจสอบ
                          </div>
                        ) : (
                          <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: isAndroid ? 360 : 300, overflowY: 'auto' }}>
                            <table className="tbl" style={{ fontSize: isAndroid ? 13 : 14 }}>
                              <thead style={{ position: 'sticky', top: 0 }}>
                                <tr>
                                  <th>SKU / ชื่อ</th>
                                  <th style={{ width: 70 }}>หน่วย</th>
                                  <th style={{ width: 80, textAlign: 'center' }}>สแกนแล้ว</th>
                                </tr>
                              </thead>
                              <tbody>
                                {scannedItems.map((l) => (
                                  <tr key={l.sku} style={{ background: '#e8f0d8' }}>
                                    <td>
                                      <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                                      <div style={{ fontFamily: 'Patrick Hand', fontSize: 15 }}>{l.name}</div>
                                    </td>
                                    <td style={{ fontFamily: 'Patrick Hand' }}>{l.unit}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{scanCounts[l.sku]}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}

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
                    <>
                      {reportOpen && (
                        <div style={{
                          marginTop: 14,
                          border: '1.5px solid var(--red)', borderRadius: 12,
                          padding: '14px 16px', background: '#fde8e8',
                        }}>
                          <div style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--red)', marginBottom: 10 }}>
                            ⚠ แนบรูปหลักฐาน (ถ้ามี)
                          </div>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', cursor: 'pointer',
                            border: '1.5px dashed var(--red)', borderRadius: 10,
                            fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--red)',
                            background: 'white',
                          }}>
                            📷 {reportImage ? 'เปลี่ยนรูป' : 'เลือกรูปภาพ'}
                            <input
                              type="file" accept="image/*" capture="environment"
                              style={{ display: 'none' }}
                              onChange={handleImageChange}
                            />
                          </label>
                          {reportImage && (
                            <div style={{ marginTop: 10 }}>
                              <img
                                src={reportImage.url}
                                alt="รูปหลักฐาน"
                                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1.5px solid var(--line)', objectFit: 'contain', display: 'block' }}
                              />
                              <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
                                {reportImage.name}
                              </div>
                            </div>
                          )}
                          <div className="row" style={{ marginTop: 12, gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn sm ghost" onClick={() => { setReportOpen(false); setReportImage(null); }}>ยกเลิก</button>
                            <button className="btn lg" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleReportProblem}>
                              ยืนยันแจ้งปัญหา
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn lg" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setReportOpen(p => !p)}>⚠ แจ้งปัญหา</button>
                        <button className="btn primary lg" onClick={handleConfirm}>✓ ยืนยันรับสินค้า</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
