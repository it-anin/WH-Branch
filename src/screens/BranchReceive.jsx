import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { matchBarcode } from '../data.js';
import { ALL_BRANCH_STAFF } from '../branches.js';
import { playScanSuccess, playBoxScan, playScanFail } from '../sound.js';
import { lookupFactor, buildBarcodeIndex, fixItemName } from '../units.js';

// Desktop staff filter dropdown ใช้รายชื่อรวมทุกสาขา; Android ใช้ staff ของสาขาที่เลือก (controlled mode)
const BRANCH_STAFF = ALL_BRANCH_STAFF;
const SWIPE_THRESHOLD = 70; // px ก่อนถือว่าเป็นการปัดจริง (กันสะกิดมือโดยไม่ตั้งใจ) — ใช้ปัดลบรายการที่สแกนเกิน (Android)

const statusLabel = {
  open:     'เปิด',
  packing:  'กำลังแพ็ค',
  closed:   'รอคลังอนุมัติเอกสาร',
  exported: 'รอผู้ช่วยตรวจสอบสินค้า',
  received: 'รับสินค้าแล้ว',
};

// หน่วยที่แสดงฝั่งรับสินค้า — ใช้ "หน่วยฐาน" (baseUnit เช่น "ม้วน") เพราะการนับรับเข้าคิดเป็นหน่วยฐาน
// fallback: baseUnit → scannedUnit (หน่วยที่แพ็คสแกน เช่น "กล่อง") → unit (หน่วย picklist) — ลังเก่าไม่มี baseUnit ตกไปตามลำดับ
const unitOf = (l) => l?.baseUnit || l?.scannedUnit || l?.unit || '';

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

// Android: แถวสินค้าที่สแกนแล้ว ปัดซ้ายเกิน SWIPE_THRESHOLD → ถามยืนยัน → ลบรายการสแกน (เลิกนับ) กรณียิงเกิน/ผิด ให้สแกนใหม่
function ScannedItemRow({ l, count, over, done, onRemove }) {
  const [dragX, setDragX] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const dragRef = useRef({ x: 0, dragging: false });

  function onTouchStart(e) {
    if (confirming) return;
    dragRef.current = { x: e.touches[0].clientX, dragging: true };
  }
  function onTouchMove(e) {
    if (!dragRef.current.dragging) return;
    // ปัดซ้ายอย่างเดียว — clamp ไม่ให้ลากไปทางขวา
    setDragX(Math.min(0, e.touches[0].clientX - dragRef.current.x));
  }
  function onTouchEnd() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setDragX(x => {
      if (Math.abs(x) > SWIPE_THRESHOLD) {
        setConfirming(true);
        return -120;
      }
      return 0;
    });
  }

  function confirmRemove() {
    setConfirming(false);
    onRemove(l.sku);
  }
  function cancelRemove() {
    setConfirming(false);
    setDragX(0);
  }

  const revealOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 8,
        background: 'var(--red)', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui', fontSize: 13, fontWeight: 700,
        opacity: revealOpacity,
      }}>
        🗑 ลบรายการที่สแกน
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 8,
          background: over ? '#fff3cd' : done ? '#e8f0d8' : '#fde8e8',  // เกิน=เหลือง / ครบ=เขียว / ยังไม่ครบ=แดง
          position: 'relative',
          transform: `translateX(${dragX}px)`,
          transition: dragRef.current.dragging ? 'none' : 'transform 0.2s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
          <div style={{ fontFamily: 'system-ui', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
        </div>
        <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', flexShrink: 0 }}>{unitOf(l)}</div>
        <div style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: over ? '#e67e22' : done ? 'var(--green)' : '#c0392b', minWidth: 28, textAlign: 'center', flexShrink: 0 }}>
          {count}
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
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>⚠ ลบรายการที่สแกน?</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>{l.name}</div>
            <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{l.sku}</div>
            <div style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>เลิกนับ {count} ชิ้นที่สแกนไว้ — สแกนใหม่ได้</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn sm ghost" onClick={cancelRemove}>ยกเลิก</button>
              <button className="btn danger sm" onClick={confirmRemove}>ลบรายการ</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// การ์ดลังฝั่ง Desktop รับสินค้า — ดีไซน์ "Sketchy Paper" (ธีมกระดาษของแอป): กรอบ 2px + เงา offset (จาก .box-card)
// + chip สถานะเอียงเล็กน้อย — แสดง status อย่างเดียว (ปุ่ม action ย้ายไปแผงขวา)
function BoxCard({ box, isActive, isViewing, isPendingApproval, onClick }) {
  const isReceived = box.status === 'received';
  const hasProblem = box.problemReported && !box.problemResolved;
  const isIncomplete = hasProblem && box.problemType === 'incomplete'; // ไม่ครบ → รีเช็ค (ส้ม), อื่น → ตรวจสอบ (แดง)
  const problemFixed = box.problemReported && box.problemResolved && !isReceived; // แก้แล้ว แต่ยังไม่อนุมัติเอกสาร
  const accentState = isActive || isPendingApproval;

  // สถานะ → ข้อความ + สีของ chip — ย้ายปุ่ม action ไปแผงขวาแล้ว จึงต้องให้ pending มี label ชัด
  const stt = hasProblem
    ? (isIncomplete
        ? { text: '🔁 สินค้าไม่ครบ · รอรีเช็ค', color: '#e67e22' }
        : { text: '🔴 พบปัญหา · รอตรวจสอบ',   color: 'var(--red)' })
    : isPendingApproval ? { text: '📥 รออนุมัติเอกสาร',          color: 'var(--accent)' }
    : problemFixed       ? { text: '✓ แก้ไขปัญหาแล้ว · รออนุมัติ', color: '#5a8a2a' }
    : isReceived         ? { text: '✅ เภสัชอนุมัติแล้ว',          color: 'var(--green)' }
    : isActive           ? { text: 'ลังที่กำลังตรวจ',              color: 'var(--accent)' }
    :                      { text: statusLabel[box.status] || box.status, color: 'var(--mute)' };

  // การ์ดทั้งใบเป็นปุ่ม "กดค้าง" — press mechanic + เงา offset 4px 4px 0 อยู่ใน .box-card (styles.css) ตรงดีไซน์ Sketchy อยู่แล้ว
  // ห้ามใส่ boxShadow inline — จะ override เงาตอน hover/จมของ .is-selected
  const pressed = isViewing || accentState;

  return (
    <div
      onClick={onClick}
      className={`box-card${pressed ? ' is-selected' : ''}`}
      style={{
        position: 'relative',
        padding: '13px 15px',
        border: '2px solid var(--line)',
        borderRadius: 12,
        background: '#fffdf8',
        opacity: (!isViewing && !accentState && !isReceived && !hasProblem && !problemFixed) ? 0.65 : 1,
        filter: isViewing ? 'brightness(0.96)' : 'none',
      }}
    >
      {/* chip สถานะเอียงเล็กน้อย — สีตามสถานะ พื้นขาว กรอบ 2px (ดีไซน์ Sketchy Paper); ข้อความหลัง " · " ตัดขึ้นบรรทัดใหม่ */}
      <div style={{ marginBottom: 8 }}>
        <span style={{
          display: 'inline-block', fontFamily: 'system-ui', fontSize: 11, fontWeight: 800,
          padding: '3px 10px', border: `2px solid ${stt.color}`, borderRadius: 12,
          color: stt.color, background: 'white', transform: 'rotate(-1.5deg)',
          lineHeight: 1.35, textAlign: 'left',
        }}>
          {stt.text.split(' · ').map((part, i) => (
            <span key={i}>{i > 0 && <br />}{part}</span>
          ))}
        </span>
      </div>
      <div style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{box.id}</div>
      <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 3 }}>เลขที่เอกสาร: {box.pos}</div>
      <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
        เลขที่ลัง: <span className="mono" style={{ fontSize: 11 }}>{box.id}</span>
      </div>
      {box.packer && (
        <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
          แพ็คโดย: {box.packer.name}
        </div>
      )}
      {(box.receivedBy || box.problemBy) && (
        <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
          ตรวจสอบโดย: {(box.receivedBy || box.problemBy).name}
        </div>
      )}
    </div>
  );
}

export default function BranchReceive({ boxes, setBoxes, itemsByBox, showToast, receiveBoxIds, setReceiveBoxIds, pendingApprovalBoxId, setPendingApprovalBoxId, branchStaff: branchStaffProp, setBranchStaff: setBranchStaffProp, isAndroid = false, branch = null, barcodeMap = {}, factorMap = {}, nameMap = {} }) {
  const [internalBranchStaff, setInternalBranchStaff] = useState(null);
  const isControlled = branchStaffProp !== undefined;
  const branchStaff = isControlled ? branchStaffProp : internalBranchStaff;
  const setBranchStaff = isControlled ? setBranchStaffProp : setInternalBranchStaff;
  const [phase, setPhase]             = useState('scan');
  const [scannedBoxId, setScannedBoxId] = useState(null); // ลังที่ "เครื่องนี้" กำลังตรวจ — local ต่อเครื่อง (ไม่แชร์ข้ามเครื่อง)
  const [query, setQuery]             = useState('');
  const [notFound, setNotFound]       = useState(false);
  const [scanCounts, setScanCounts]   = useState({});
  const [itemScan, setItemScan]       = useState('');
  const [lastScannedSku, setLastScannedSku] = useState(null);
  const [scanError, setScanError]     = useState('');
  const [viewingId, setViewingId]     = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); // 'ok' | 'fail'
  const [confirmIncomplete, setConfirmIncomplete] = useState(false); // dialog ยืนยันตอนกดรับทั้งที่สแกนไม่ครบ
  const [supervisorCode, setSupervisorCode] = useState('');
  const [reportOpen, setReportOpen]   = useState(false);
  const [reportImage, setReportImage] = useState(null);
  // recheckMode = เภสัชสแกนซ้ำลังที่มีปัญหา 'incomplete' — แสดงเฉพาะ SKU ที่ไม่ครบ
  const [recheckMode, setRecheckMode] = useState(false);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [problemNote, setProblemNote] = useState('');
  const inputRef    = useRef(null);
  const itemScanRef = useRef(null);
  const staffMenuRef = useRef(null);

  // ลังที่เครื่องนี้กำลังตรวจ = local state (ตั้งตอน startReceive) — ไม่ดึงจาก receiveBoxIds ที่ sync ข้ามเครื่องผ่าน Firestore
  // (เดิมใช้ receiveBoxIds[last] → 2 เครื่องสแกนคนละลัง จอเด้งเห็นลังเดียวกัน = ตัวที่ sync ล่าสุดชนะ เสี่ยงยืนยันผิดลัง)
  const foundBox       = scannedBoxId ? boxes.find(b => b.id === scannedBoxId) || null : null;
  const isReceived     = foundBox?.status === 'received';
  const isViewingOther = viewingId !== null && phase !== 'result';
  const viewingBox     = viewingId ? boxes.find(b => b.id === viewingId) : null;
  const viewingItems   = (viewingId ? (itemsByBox[viewingId] || []) : []).map(l => fixItemName(l, nameMap));

  // ลังที่พนักงานหน้าร้านสแกนรับแล้ว (รออนุมัติ) หรือเคยเข้ารับใน session นี้ — pending ขึ้นก่อน
  // Desktop: ปุ่มเลือกพนักงาน = filter เฉพาะลังที่พนักงานคนนั้นสแกน (receivedBy)
  const staffFilter = !isControlled && branchStaff ? branchStaff.code : null;
  const matchStaff = (b) => !staffFilter || b.receivedBy?.code === staffFilter || b.problemBy?.code === staffFilter;
  // กรองตามสาขา (Android): เห็นเฉพาะลังของสาขาตัวเอง — ลังไม่มี branch (legacy/untagged) เห็นได้ทุกสาขา
  const matchBranch = (b) => !branch || b.branch === branch;
  // priority: problem (0) > receivePending (1) > exported รอสาขาสแกน (2) > อื่น (3)
  const sortRank = (b) =>
    b.problemReported && !b.problemResolved ? 0
    : b.receivePending ? 1
    : (b.status === 'exported' && !receiveBoxIds.includes(b.id)) ? 2
    : 3;
  const approvalBoxes = boxes
    // เห็นลังที่คลังส่งออกแล้ว (status=exported) ด้วย — ไม่ต้องรอ Android สแกน
    .filter(b =>
      b.receivePending
      || b.problemReported
      || receiveBoxIds.includes(b.id)
      || b.status === 'exported'
      || b.status === 'received'
    )
    .filter(matchStaff)
    .filter(matchBranch)
    .sort((a, b) => sortRank(a) - sortRank(b));
  const pendingCount = boxes.filter(b => b.receivePending && matchStaff(b) && matchBranch(b)).length;
  const problemCount = boxes.filter(b => b.problemReported && !b.problemResolved && matchStaff(b) && matchBranch(b)).length;

  // ค้นหา SKU/ชื่อ ว่าอยู่ลังไหน — ค้นข้ามทุกลังที่ปิด/ส่งออก/รับแล้ว (ไม่ผูกกับตัวกรองพนักงาน)
  const searchQ = itemSearch.trim().toLowerCase();
  const searchResults = searchQ
    ? boxes
        .filter(b => b.status === 'closed' || b.status === 'exported' || b.status === 'received' || b.receivePending)
        .filter(matchBranch)
        .flatMap(box =>
          (itemsByBox[box.id] || [])
            .map(l => fixItemName(l, nameMap))
            .filter(l => (l.sku || '').toLowerCase().includes(searchQ) || (l.name || '').toLowerCase().includes(searchQ))
            .map(l => ({ boxId: box.id, status: box.status, sku: l.sku, name: l.name, unit: l.unit, scannedUnit: l.scannedUnit, baseUnit: l.baseUnit, qty: l.gotBase ?? l.qty ?? l.got ?? 0 }))
        )
    : [];

  useEffect(() => {
    if (phase === 'scan') setTimeout(() => inputRef.current?.focus(), 50);
    if (phase === 'verify') setTimeout(() => itemScanRef.current?.focus(), 50);
  }, [phase]);

  // sync problemNote เมื่อ viewingId เปลี่ยน หรือลังที่ดูอยู่อัพเดทจาก Firestore (เช่น เภสัช Android เพิ่ง confirm)
  useEffect(() => {
    setProblemNote(viewingBox?.problemNote || '');
  }, [viewingId, viewingBox?.problemNote]);

  useEffect(() => {
    if (!staffMenuOpen) return;
    const handler = (e) => {
      if (staffMenuRef.current && !staffMenuRef.current.contains(e.target)) setStaffMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [staffMenuOpen]);

  function startReceive(box) {
    playBoxScan();
    setReceiveBoxIds(prev => [...prev.filter(id => id !== box.id), box.id]);
    // ล็อกลังนี้ให้พนักงานคนนี้ + ปลดล็อกลังเก่าที่ตัวเองถืออยู่ (ถือได้ทีละลัง)
    setBoxes(prev => prev.map(b => {
      if (b.id === box.id) return { ...b, receivingBy: branchStaff || null };
      if (b.receivingBy?.code && b.receivingBy.code === branchStaff?.code) return { ...b, receivingBy: null };
      return b;
    }));
    setNotFound(false);
    setScanCounts({});
    setItemScan('');
    setLastScannedSku(null);
    setScanError('');
    setQuery('');
    setViewingId(null);
    setScannedBoxId(box.id);   // ผูกลังที่ตรวจกับเครื่องนี้ (ไม่พึ่ง receiveBoxIds ที่แชร์)
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

    if (!box) { playScanFail(); setNotFound(true); return; }

    // กันสแกนลังซ้ำที่จัดการไปแล้ว — บล็อก ไม่เข้า verify
    setNotFound(false);
    setQuery('');
    // Android ไม่แสดงเลขลัง (จอเล็ก) — Desktop แสดงเลขลังเพื่อแยกง่าย
    const boxLabel = isAndroid ? '' : `ลัง ${box.id} `;
    // กันสแกนลังของสาขาอื่น (ลังไม่มี branch = legacy → ปล่อยผ่าน)
    if (branch && box.branch !== branch) {
      playScanFail();
      showToast(`⚠ ${boxLabel}เป็นของสาขา ${box.branch || 'ไม่ระบุ'} ไม่ใช่ ${branch}`, 'error');
      return;
    }
    if (box.status === 'received') {
      playScanFail();
      showToast(`⚠ ${boxLabel}รับเข้าสาขาแล้ว`, 'error');
      return;
    }
    // recheck ต้องเช็คก่อน receivePending — ป้องกันกรณีที่ลังมีทั้ง receivePending=true และ problemReported=true
    // พร้อมกัน (edge case / Firestore race) ซึ่งจะทำให้โดนบล็อกก่อนถึง recheck exception
    if (box.problemReported && !box.problemResolved) {
      // พนักงานสาขาคนไหนก็ recheck ลังที่สแกนพลาด (incomplete) ได้ — สแกนใหม่ให้ตรง (เดิมจำกัดเฉพาะเภสัช);
      // ลัง damaged (มีรูป/ปัญหาจริง) ยังตกไปบล็อกด้านล่าง → รอเภสัช/คลังจัดการ
      if (box.problemType === 'incomplete') {
        setRecheckMode(true);
        startReceive(box);
        showToast(`🔁 รีเช็คลัง ${box.id}`, 'success');
        return;
      }
      playScanFail();
      showToast(`⚠ ${boxLabel}แจ้งปัญหาแล้ว · รอเภสัชตรวจสอบ`, 'error');
      return;
    }
    if (box.receivePending) {
      playScanFail();
      showToast(`⚠ ${boxLabel}สแกนรับแล้ว · รออนุมัติเอกสาร`, 'error');
      return;
    }
    // ล็อกลัง: ถ้าพนักงานคนอื่นกำลังตรวจอยู่ → บล็อก (ปลดล็อกเมื่อคนนั้นยืนยันรับ/แจ้งปัญหา/ไปลังถัดไป)
    if (box.receivingBy && box.receivingBy.code !== branchStaff?.code) {
      playScanFail();
      showToast(`⚠ พนักงาน ${box.receivingBy.name} กำลังตรวจลังนี้อยู่`, 'error');
      return;
    }

    startReceive(box);
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
      problemType: 'damaged',
      problemImage: reportImage?.url || null,
      problemBy: branchStaff || null,
      problemScanCounts: { ...scanCounts },
      problemNote: '',
      problemAt: new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      receivingBy: null, // ปลดล็อก
      updated: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    } : b));
    showToast('แจ้งปัญหาแล้ว·ส่งให้เภสัชตรวจสอบ', 'error');
    setScanCounts({}); setQuery(''); setNotFound(false);
    setItemScan(''); setLastScannedSku(null); setScanError('');
    setVerifyResult(null); setViewingId(null);
    setScannedBoxId(null); setPhase('scan'); setReportOpen(false); setReportImage(null);
  }

  function saveProblemNote() {
    if (!viewingId) return;
    // บันทึกรายละเอียด + ส่งต่อให้ Outbound แก้ไข (problemReviewed = gate ให้ badge ขึ้นที่ Outbound)
    setBoxes(prev => prev.map(b => b.id === viewingId ? { ...b, problemNote, problemReviewed: true } : b));
    showToast('บันทึกแล้ว ✓ · ส่งให้ Outbound แก้ไขสินค้า', 'success');
  }

  // กดยืนยันรับ — ถ้าสแกนไม่ครบทุกรายการ เด้ง dialog ยืนยันก่อน (กันกดพลาดทั้งที่ยังสแกนไม่เสร็จ); ครบแล้ว → ยืนยันเลย
  function requestConfirm() {
    if (!allChecked) { setConfirmIncomplete(true); return; }
    handleConfirm();
  }

  function handleConfirm() {
    setConfirmIncomplete(false);
    if (!foundBox) return;
    // recheck: เช็คเฉพาะ verifyItems (SKU ที่ขาดรอบแรก) แต่เภสัชนับใหม่จาก 0 เทียบ qty เต็ม, normal: เช็คทุก SKU
    const hasOver = verifyItems.some(l => (scanCounts[l.sku] || 0) > getNeeded(l));
    const result = !allChecked ? 'fail' : hasOver ? 'over' : 'ok';
    setVerifyResult(result);
    setViewingId(null);
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    if (recheckMode && result === 'ok') {
      // เภสัช recheck สำเร็จ → ปลดปัญหา + รออนุมัติเอกสาร
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        problemResolved: true,
        problemResolvedBy: branchStaff || null,
        problemResolvedAt: new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        receivePending: true,
        receivedBy: branchStaff || null,
        receivingBy: null,
        updated: time,
      } : b));
    } else if (result === 'ok') {
      // ครบ (รอบแรก) → ส่งให้เภสัชอนุมัติเอกสาร
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        receivePending: true,
        receivedBy: branchStaff || null,
        receivingBy: null,
        updated: time,
      } : b));
    } else if (recheckMode && branchStaff?.role === 'pharmacist') {
      // เภสัช recheck แล้วยังขาด/เกิน → ยืนยันสินค้าขาด → auto-แจ้งคลัง + auto-generate note
      const mergedCounts = { ...foundBox.problemScanCounts, ...scanCounts };
      const shortList = boxItems
        .map(l => {
          const need = getNeeded(l);
          const got = mergedCounts[l.sku] || 0;
          const diff = need - got;
          return diff !== 0 ? { sku: l.sku, name: l.name, diff } : null;
        })
        .filter(Boolean);
      // หัวข้อ note + toast ต้องสะท้อนว่าขาด/เกิน/ทั้งคู่ (เดิม hardcode "ขาด" → กรณีเกินแจ้งผิด)
      const hasShort  = shortList.some(x => x.diff > 0); // diff = need - got → บวก = ขาด
      const hasExcess = shortList.some(x => x.diff < 0); // ลบ = เกิน
      const kindLabel = hasShort && hasExcess ? 'ขาด/เกิน' : hasExcess ? 'เกิน' : 'ขาด';
      const autoNote = `🧪 เภสัชยืนยันสินค้า${kindLabel}:\n` + shortList
        .map(x => x.diff > 0 ? `• ${x.sku} ${x.name} ขาด ${x.diff} ชิ้น` : `• ${x.sku} ${x.name} เกิน ${-x.diff} ชิ้น`)
        .join('\n');
      const nowStr = new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        problemReported: true,
        problemResolved: false,
        problemReviewed: true,                  // ⭐ auto-แจ้งคลัง — Outbound badge ขึ้นทันที
        problemType: 'incomplete',
        problemImage: b.problemImage || null,
        problemBy: b.problemBy || branchStaff || null,
        problemScanCounts: mergedCounts,
        problemNote: autoNote,
        problemAt: b.problemAt || nowStr,
        problemConfirmedBy: branchStaff || null,
        problemConfirmedAt: nowStr,
        receivingBy: null,
        updated: time,
      } : b));
      showToast(`⚠ เภสัชยืนยันสินค้า${kindLabel} · แจ้งคลังสินค้าแล้ว`, 'error');
    } else if (recheckMode) {
      // พนักงานทั่วไป recheck แล้วยังขาด/เกิน (= ของขาด/เกินจริง ไม่ใช่สแกนพลาด) → คงเป็น problem รอเภสัช
      // ไม่ auto-confirm/แจ้งคลังแทนเภสัช (ต่างจาก branch เภสัชด้านบน) — เก็บ count รอบล่าสุดไว้ให้เภสัชดู
      const mergedCounts = { ...foundBox.problemScanCounts, ...scanCounts };
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        problemReported: true,
        problemResolved: false,
        problemType: 'incomplete',
        problemScanCounts: mergedCounts,
        receivingBy: null,
        updated: time,
      } : b));
      showToast('รีเช็คแล้วยังไม่ตรง · รอเภสัชตรวจสอบ', 'error');
    } else {
      // พนักงานทั่วไป (ยืนยันครั้งแรก ไม่ใช่ recheck): ไม่ครบ/เกิน → ส่งให้รีเช็ค (รอเภสัช)
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? {
        ...b,
        problemReported: true,
        problemResolved: false,
        problemType: 'incomplete',
        problemImage: null,
        problemBy: branchStaff || null,
        problemScanCounts: { ...scanCounts },
        problemNote: '',
        problemAt: new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        receivingBy: null,
        updated: time,
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
      setRecheckMode(false);
      setScannedBoxId(null);
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
    setRecheckMode(false);
    setPhase('verify');
    showToast('รีเช็คสินค้า · สแกนสินค้าใหม่อีกครั้ง');
  }

  function handleScanNext() {
    // ปลดล็อกลังที่กำลังถืออยู่ (ออกจากลังนี้ไปลังถัดไป)
    if (foundBox?.receivingBy?.code && foundBox.receivingBy.code === branchStaff?.code) {
      setBoxes(prev => prev.map(b => b.id === foundBox.id ? { ...b, receivingBy: null } : b));
    }
    setScanCounts({});
    setQuery('');
    setNotFound(false);
    setViewingId(null);
    setVerifyResult(null);
    setSupervisorCode('');
    setRecheckMode(false);
    setScannedBoxId(null);
    setPhase('scan');
  }

  function handleItemScan(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val) return;
    setItemScan('');

    // resolve บาร์โค้ด → SKU/หน่วย (รองรับสแกนได้ทุกหน่วยของ SKU — เช่น กล่อง หรือ ม้วน ก็รับได้)
    const hit = barcodeIndex[val];
    const match = boxItems.find(l => l.sku === val || (hit && l.sku === hit.sku) || matchBarcode(l, val));
    if (!match) {
      playScanFail();
      setScanError(`ไม่มี SKU นี้ในลัง`);
      setLastScannedSku(null);
      showToast('⚠ ไม่มี SKU นี้ในลัง', 'error');
      return;
    }

    // recheck mode: บล็อกเฉพาะ SKU ที่รอบแรกถูกต้องพอดี (count = needed หน่วยฐาน) — ให้ตรวจซ้ำได้ทั้งที่ขาดและเกิน
    if (recheckMode && foundBox?.problemScanCounts) {
      const prevCount = foundBox.problemScanCounts[match.sku] || 0;
      if (prevCount === getNeeded(match)) {
        setScanError(`SKU นี้ถูกต้องแล้วในรอบแรก — ตรวจซ้ำเฉพาะที่ขาด/เกิน`);
        setLastScannedSku(null);
        return;
      }
    }

    // นับเป็นหน่วยฐาน: สแกน 1 กล่อง (factor 24) → +24, สแกน 1 ม้วน (factor 1) → +1 — รับได้ทุก multiple
    const scannedUnit = hit?.unit || match.baseUnit || match.scannedUnit || match.unit;
    const factor = factorOf(match.sku, scannedUnit);
    const current = scanCounts[match.sku] || 0;
    playScanSuccess();
    setScanError('');
    setLastScannedSku(match.sku);
    setScanCounts(prev => ({ ...prev, [match.sku]: current + factor }));
  }

  // Android: ปัดลบรายการที่สแกนแล้ว (กรณียิงเกิน/ผิด) — เลิกนับ SKU นี้ทั้งหมด ให้สแกนใหม่
  function handleRemoveScan(sku) {
    setScanCounts(prev => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });
    if (lastScannedSku === sku) setLastScannedSku(null);
    showToast('ลบออกจากรายการแล้ว', 'error');
  }

const boxItems         = (foundBox ? (itemsByBox[foundBox.id] || []) : []).map(l => fixItemName(l, nameMap));
  // resolve บาร์โค้ด→หน่วย + factor (แปลงหน่วยตอนรับเข้า เช่น 1 กล่อง = 24 ม้วน)
  const barcodeIndex     = useMemo(() => buildBarcodeIndex(barcodeMap), [barcodeMap]);
  const factorOf         = (sku, unit) => lookupFactor(factorMap, sku, unit);
  // needed = "หน่วยฐาน" (gotBase จากตอนแพ็ค เช่น 24 ม้วน) — พนักงานสาขาสแกน multiple ไหนก็ได้ ระบบนับรวมเป็นหน่วยฐาน
  // recheck: เภสัชนับใหม่จาก 0 ต้องครบเต็มจำนวนฐานเสมอ; ลังเก่าไม่มี gotBase → fallback qty (นับดิบตามเดิม)
  const getNeeded        = (item) => item.gotBase ?? item.qty ?? item.got ?? 0;
  const fullyChecked     = (item) => (scanCounts[item.sku] || 0) >= getNeeded(item);
  // recheck: ตรวจเฉพาะ SKU ที่รอบแรกสแกนไม่ตรงจำนวน (ขาดหรือเกิน — count ≠ needed หน่วยฐาน) — normal: ทุก SKU ในลัง
  const verifyItems      = (recheckMode && foundBox?.problemScanCounts)
    ? boxItems.filter(l => (foundBox.problemScanCounts[l.sku] || 0) !== getNeeded(l))
    : boxItems;
  const allChecked       = verifyItems.length > 0 && verifyItems.every(fullyChecked);
  const doneCount        = verifyItems.filter(fullyChecked).length;
  const scannedSkuCount  = verifyItems.filter(l => (scanCounts[l.sku] || 0) >= 1).length;

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
            <span className="title" style={{ whiteSpace: 'nowrap' }}>📥 รายการของเข้า</span>
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
              placeholder="🔍 ค้นหา SKU"
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
                    <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', padding: '2px 12px' }}>
                      กรองลังตามผู้ตรวจรับ
                    </div>
                    <button
                      onClick={() => { setBranchStaff(null); setStaffMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
                        background: !branchStaff ? 'var(--accent)' : 'transparent',
                        color: !branchStaff ? 'white' : 'var(--ink)',
                        fontFamily: 'system-ui', fontSize: 15, textAlign: 'left',
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
                            fontFamily: 'system-ui', fontSize: 15, textAlign: 'left',
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
        : { padding: 20, display: 'grid', gridTemplateColumns: '580px 1fr', gap: 20 }
      }>

        {/* LEFT: box cards — desktop only, grid 3 คอลัมน์ */}
        {!isAndroid && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignContent: 'start', overflowY: 'auto', maxHeight: 520, paddingRight: 12, paddingBottom: 6 }}>
            {approvalBoxes.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                padding: '18px 16px',
                border: '2px dashed var(--line)', borderRadius: 14,
                background: 'var(--paper-dark)', textAlign: 'center',
                color: 'var(--mute)', fontFamily: 'system-ui', fontSize: 14,
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
                <b style={{ fontFamily: 'system-ui', fontSize: 22 }}>🔍 ผลค้นหา "{itemSearch}"</b>
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
                  <div style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700 }}>ไม่พบสินค้า</div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14, marginTop: 4 }}>
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
                          <td><span style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{r.boxId}</span></td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{r.sku}</div>
                            <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{r.name}</div>
                          </td>
                          <td style={{ fontFamily: 'system-ui' }}>{unitOf(r)}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'system-ui', fontSize: 20, fontWeight: 700 }}>×{r.qty}</td>
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
                <b style={{ fontFamily: 'system-ui', fontSize: 22, color: viewingBox.problemType === 'incomplete' ? '#e67e22' : 'var(--red)' }}>
                  {viewingBox.problemType === 'incomplete' ? `🔁 รีเช็คสินค้า · ${viewingBox.id}` : `🔴 ตรวจสอบปัญหา · ${viewingBox.id}`}
                </b>
                {viewingBox.problemBy && (
                  <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)' }}>
                    แจ้งโดย: {viewingBox.problemBy.name}{viewingBox.problemAt ? ` · ${viewingBox.problemAt}` : ''}
                  </span>
                )}
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => setViewingId(null)}>× ปิด</button>
              </div>

              {viewingBox.problemType === 'incomplete' && (
                <div style={{ marginBottom: 12, padding: '10px 14px', border: '1.5px dashed var(--red)', borderRadius: 10, background: '#fde8e8', fontFamily: 'system-ui', fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>
                  เภสัชสแกนสินค้าที่เครื่อง PDA (สแกนลังก่อน)
                </div>
              )}

              {/* รายการสินค้าที่ต้องรีเช็ค — แสดง SKU ที่ขาด (got < needed) และเกิน (got > needed) */}
              {(() => {
                const psc = viewingBox.problemScanCounts || {};
                const problemItems = viewingItems.filter(l => {
                  const needed = getNeeded(l);
                  return (psc[l.sku] || 0) !== needed;
                });
                // compact: override .tbl th (17px/8px) + .tbl td padding (8px 10px) ที่ inline fontSize บน <table> แตะไม่ได้
                const thS = { fontSize: 12, padding: '5px 8px' };
                const tdS = { padding: '5px 8px' };
                return (
                  <>
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                        รายการสินค้าที่ต้องรีเช็ค
                        <span style={{ fontFamily: 'system-ui', fontSize: 14, fontWeight: 400, color: 'var(--mute)', marginLeft: 8 }}>
                          {problemItems.length} SKU
                        </span>
                      </div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
                        สินค้าที่สแกนไม่ตรงจำนวน (ขาด หรือ เกิน) — เภสัชต้องรีเช็คตามรายการนี้
                      </div>
                    </div>
                    <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 300, overflowY: 'auto', marginTop: 8, marginBottom: 14 }}>
                      <table className="tbl" style={{ fontSize: 13 }}>
                        <thead style={{ position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={thS}>SKU / ชื่อ</th>
                            <th style={{ ...thS, width: 54 }}>หน่วย</th>
                            <th style={{ ...thS, width: 62, textAlign: 'center' }}>ของเข้า</th>
                            <th style={{ ...thS, width: 62, textAlign: 'center' }}>นับได้</th>
                            <th style={{ ...thS, width: 66, textAlign: 'center' }}>เกิน/ขาด</th>
                          </tr>
                        </thead>
                        <tbody>
                          {problemItems.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--mute)', fontFamily: 'system-ui', padding: 12 }}>ไม่พบความผิดปกติ</td></tr>
                          ) : problemItems.map(l => {
                            const needed = getNeeded(l);
                            const got = psc[l.sku] || 0;
                            const diff = got - needed; // บวก = เกิน, ลบ = ขาด
                            const isOver = diff > 0;
                            return (
                              <tr key={l.sku} style={{ background: isOver ? '#fff9e6' : '#fff8f0' }}>
                                <td style={tdS}>
                                  <div className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{l.sku}</div>
                                  <div style={{ fontFamily: 'system-ui', fontSize: 13 }}>{l.name}</div>
                                </td>
                                <td style={{ ...tdS, fontFamily: 'system-ui' }}>{unitOf(l)}</td>
                                <td style={{ ...tdS, textAlign: 'center', fontFamily: 'system-ui', fontSize: 14, fontWeight: 700 }}>{needed}</td>
                                <td style={{ ...tdS, textAlign: 'center', fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)' }}>{got}</td>
                                <td style={{ ...tdS, textAlign: 'center', fontFamily: 'system-ui', fontSize: 15, fontWeight: 700, color: isOver ? '#b86000' : '#e67e22' }}>
                                  {isOver ? `+${diff}` : `−${Math.abs(diff)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}

              {/* รูปหลักฐานสินค้าชำรุด */}
              {viewingBox.problemImage && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)', marginBottom: 6 }}>📷 รูปหลักฐาน</div>
                  <img src={viewingBox.problemImage} alt="หลักฐาน" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1.5px solid var(--line)', objectFit: 'contain', display: 'block' }} />
                </div>
              )}

              {/* รายละเอียดปัญหาที่พบ (หัวหน้าบันทึก) */}
              <div style={{ marginBottom: 6, fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)' }}>รายละเอียดปัญหาที่พบ (หัวหน้าบันทึกเพิ่ม)</div>
              <textarea
                className="input"
                placeholder="เช่น สินค้าขาด 2 ชิ้น / กล่องบุบ / ..."
                value={problemNote}
                onChange={e => setProblemNote(e.target.value)}
                style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
              />
              <div className="row" style={{ marginTop: 10, gap: 10, justifyContent: 'flex-end' }}>
                {(() => {
                  const notified = !!viewingBox?.problemReviewed;
                  return (
                    <button
                      className="btn"
                      onClick={notified ? undefined : saveProblemNote}
                      disabled={notified}
                      style={{
                        borderColor: notified ? 'var(--line)' : 'var(--accent)',
                        color: notified ? 'var(--mute)' : 'var(--accent)',
                        background: notified ? 'var(--paper-dark)' : 'white',
                        cursor: notified ? 'not-allowed' : 'pointer',
                        opacity: notified ? 0.7 : 1,
                      }}
                    >{notified ? '✓ แจ้งคลังสินค้าแล้ว' : '📦 แจ้งคลังสินค้า'}</button>
                  );
                })()}
              </div>
            </div>
          ) : isViewingOther ? (
            <div>
              <div className="row" style={{ marginBottom: 12, gap: 10 }}>
                <b style={{ fontFamily: 'system-ui', fontSize: 22 }}>👁 {viewingBox?.id || viewingId}</b>
                {viewingBox?.packer && (
                  <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)' }}>
                    แพ็คโดย: {viewingBox.packer.name}
                  </span>
                )}
                {viewingBox?.status === 'received' && <span className="chip ok">✓ ตรวจสอบแล้ว</span>}
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => setViewingId(null)}>× ปิด</button>
              </div>
              {viewingItems.length === 0 ? (
                <div style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)', textAlign: 'center', padding: 30 }}>
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
                          <td style={{ fontFamily: 'system-ui', fontSize: 18, color: 'var(--mute)' }}>{i + 1}</td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td style={{ fontFamily: 'system-ui' }}>{unitOf(l)}</td>
                          <td style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                            ×{getNeeded(l)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* ปุ่ม action ย้ายจากการ์ดมาที่นี่ — อนุมัติเอกสาร (pending) / แก้ไขแล้ว-อนุมัติ (problemFixed); auto-width + ชิดขวา */}
              {(viewingBox?.receivePending || (viewingBox?.problemReported && viewingBox?.problemResolved && viewingBox?.status !== 'received')) && (
                <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  {viewingBox?.receivePending ? (
                    <button
                      className="btn primary"
                      onClick={() => handleApprove(viewingId)}
                    >✓ อนุมัติเอกสาร</button>
                  ) : (
                    <button
                      className="btn"
                      style={{ background: 'var(--green)', borderColor: 'var(--green)', color: 'white', fontWeight: 700 }}
                      onClick={() => handleApprove(viewingId)}
                    >✓ แก้ไขแล้ว/อนุมัติเอกสาร</button>
                  )}
                </div>
              )}
            </div>
          ) : phase === 'result' ? (
            <div>
              <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontFamily: 'system-ui', fontSize: 22 }}>{foundBox?.id}</b>
                <span className="chip ok">✓ ตรวจสอบแล้ว</span>
                {verifyResult === 'ok'
                  ? <span className="chip ok" style={{ background: 'var(--green)', borderColor: 'var(--green)', color: 'white' }}>สินค้าถูกต้อง</span>
                  : verifyResult === 'over'
                  ? <span className="chip warn" style={{ background: '#e67e22', borderColor: '#b86000', color: 'white' }}>สินค้าเกินจำนวน</span>
                  : <span className="chip" style={{ background: '#c0392b', borderColor: '#922b21', color: 'white' }}>สินค้าไม่ถูกต้อง</span>
                }
              </div>

              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
                <table className="tbl" style={{ fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: isAndroid ? 28 : 36 }}>✓</th>
                      <th>SKU / ชื่อ</th>
                      <th style={{ width: isAndroid ? 44 : 70 }}>หน่วย</th>
                      {!recheckMode && <th style={{ width: isAndroid ? 42 : 60, textAlign: 'center' }}>ของเข้า</th>}
                      <th style={{ width: isAndroid ? 50 : 70, textAlign: 'center' }}>นับได้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxItems.map((l) => {
                      const needed = getNeeded(l);
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
                              width: isAndroid ? 18 : 22, height: isAndroid ? 18 : 22, borderRadius: '50%', margin: '0 auto',
                              background: dotBg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: 13, fontWeight: 700,
                            }}>
                              {dotIcon}
                            </div>
                          </td>
                          <td>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{l.sku}</div>
                            <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                          </td>
                          <td style={{ fontFamily: 'system-ui', fontSize: isAndroid ? 12 : undefined }}>{unitOf(l)}</td>
                          {!recheckMode && (
                            <td style={{ textAlign: 'center', fontFamily: 'system-ui', fontSize: isAndroid ? 14 : 18, fontWeight: 700, color: 'var(--mute)' }}>
                              {needed}
                            </td>
                          )}
                          <td style={{ textAlign: 'center', fontFamily: 'system-ui', fontSize: isAndroid ? 16 : 22, fontWeight: 700, color: countColor }}>
                            {count}{over && <span style={{ fontSize: isAndroid ? 10 : 13, marginLeft: 2 }}>+{count - needed}</span>}
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
                  <div style={{ fontFamily: 'system-ui', fontSize: 17, fontWeight: 700, color: 'var(--accent)' }}>
                    ✓ {recheckMode ? 'รีเช็คแล้ว · รอเภสัชอนุมัติเอกสาร' : 'ส่งให้เภสัชอนุมัติเอกสารแล้ว'}
                  </div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)', marginTop: 4 }}>
                    กดปุ่ม [+ ลังถัดไป] เพื่อสแกนลังต่อ
                  </div>
                </div>
              ) : (
                <div style={{ border: '2px solid #e67e22', borderRadius: 12, padding: '14px 16px', background: '#fff3cd', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'system-ui', fontSize: 17, fontWeight: 700, color: '#b86000' }}>
                    ✓ {recheckMode ? 'รีเช็คสินค้าแล้ว' : 'ส่งให้เภสัชรีเช็คสินค้า'}
                  </div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#b86000', marginTop: 4 }}>
                    {verifyResult === 'over' ? 'สินค้าเกินจำนวน' : 'สินค้าไม่ครบ'}
                  </div>
                  <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#b86000', marginTop: 4 }}>
                    กดปุ่ม [+ ลังถัดไป] เพื่อสแกนลังต่อ
                  </div>
                </div>
              )}
            </div>
          ) : phase === 'scan' ? (
            isAndroid ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)' }}>ยิงบาร์โค้ดที่ติดลัง หรือพิมพ์ BX-…</div>
                <input
                  ref={inputRef}
                  inputMode="none"
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
                    background: '#fde8e8', fontFamily: 'system-ui', fontSize: 14, color: 'var(--red)',
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
              <div style={{ fontFamily: 'system-ui', fontSize: 24, fontWeight: 700 }}>
                {approvalBoxes.length > 0 ? 'เลือกลังทางซ้ายเพื่อดูรายละเอียด' : 'ยังไม่มีลังรออนุมัติ'}
              </div>
              <div style={{ fontFamily: 'system-ui', fontSize: 14, maxWidth: 320 }}>
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
                  background: 'var(--paper-dark)', fontFamily: 'system-ui',
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
                      <b style={{ fontFamily: 'system-ui', fontSize: isAndroid ? 14 : 22 }}>ตรวจสอบสินค้าในลัง</b>
                      {foundBox?.id && (
                        <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', marginLeft: 8, fontWeight: 700 }}>
                          {foundBox.id}
                        </span>
                      )}
                      {foundBox?.packer && (
                        <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', marginLeft: 10 }}>
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
                          inputMode="none"
                          className="input big"
                          placeholder="ยิงบาร์โค้ดสินค้า"
                          value={itemScan}
                          onChange={(e) => { setItemScan(e.target.value); setScanError(''); }}
                          onKeyDown={handleItemScan}
                          style={{ flex: 1 }}
                        />
                      </div>
                      {scanError && (
                        <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--red)', marginTop: 4 }}>{scanError}</div>
                      )}
                      {lastScannedSku && !scanError && (
                        <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--green)', marginTop: 4 }}>
                          ✓ {boxItems.find(l => l.sku === lastScannedSku)?.name} — ติ๊กแล้ว
                        </div>
                      )}
                    </div>
                  )}

                  {/* recheck mode: แสดงรายการสินค้าที่ต้องรีเช็ค (ขาด/เกิน) ให้เภสัชเห็นก่อนสแกน */}
                  {recheckMode && isAndroid && verifyItems.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: '#e67e22', marginBottom: 6 }}>
                        🧪 สินค้าที่ต้องรีเช็ค ({doneCount}/{verifyItems.length} SKU)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
                        {verifyItems.map(l => {
                          const needed = getNeeded(l);
                          const myCount = scanCounts[l.sku] || 0;
                          const done = myCount >= needed;
                          return (
                            <div key={l.sku} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 10px', borderRadius: 8,
                              border: `1.5px solid ${done ? 'var(--ok)' : '#e67e22'}`,
                              background: done ? '#e8f0d8' : '#fff8f0',
                            }}>
                              <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>
                                {done ? '✓' : '○'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: 600, color: done ? 'var(--ok)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{l.sku}</div>
                              </div>
                              <div style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, textAlign: 'right', flexShrink: 0, color: done ? 'var(--ok)' : '#e67e22' }}>
                                {myCount}/{needed} {unitOf(l)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const scannedItems = [...boxItems]
                      .filter(l => (scanCounts[l.sku] || 0) > 0)
                      .sort((a, b) => (a.sku === lastScannedSku ? -1 : b.sku === lastScannedSku ? 1 : 0));
                    return (
                      <>
                        {scannedItems.length === 0 ? (
                          <div style={{ padding: '20px 14px', border: '1.5px dashed var(--line)', borderRadius: 10, background: 'var(--paper-dark)', textAlign: 'center', fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)' }}>
                            ยิงบาร์โค้ดสินค้าเพื่อเริ่มตรวจสอบ
                          </div>
                        ) : isAndroid ? (
                          <>
                            <div style={{ fontFamily: 'system-ui', fontSize: 11, color: 'var(--mute)', marginBottom: 6 }}>
                              ← ปัดซ้ายรายการที่สแกนเกิน/ผิด เพื่อลบแล้วสแกนใหม่
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                              {scannedItems.map((l) => {
                                const needed = getNeeded(l);
                                const count = scanCounts[l.sku] || 0;
                                return (
                                  <ScannedItemRow key={l.sku} l={l} count={count} over={count > needed} done={count >= needed} onRemove={handleRemoveScan} />
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'white', maxHeight: 300, overflowY: 'auto' }}>
                            <table className="tbl" style={{ fontSize: 14 }}>
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
                                      <div style={{ fontFamily: 'system-ui', fontSize: 15 }}>{l.name}</div>
                                    </td>
                                    <td style={{ fontFamily: 'system-ui' }}>{unitOf(l)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{scanCounts[l.sku]}</span>
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
                      fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: 'var(--green)',
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
                          <div style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--red)', marginBottom: 10 }}>
                            ⚠ แนบรูปหลักฐาน (ถ้ามี)
                          </div>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', cursor: 'pointer',
                            border: '1.5px dashed var(--red)', borderRadius: 10,
                            fontFamily: 'system-ui', fontSize: 14, color: 'var(--red)',
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
                              <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
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
                        <button className="btn primary lg" onClick={requestConfirm}>✓ ยืนยันรับสินค้า</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {confirmIncomplete && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: '24px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', textAlign: 'center', minWidth: 280, maxWidth: 360 }}>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8, color: 'var(--red)' }}>⚠ สแกนสินค้าไม่ครบ</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.5 }}>
              ยังสแกนสินค้าในลังไม่ครบทุกรายการ{(() => { const n = verifyItems.filter(l => !fullyChecked(l)).length; return n > 0 ? ` (เหลืออีก ${n} รายการ)` : ''; })()}<br />
              ต้องการยืนยันรับสินค้าหรือไม่?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn ghost" onClick={() => setConfirmIncomplete(false)}>ยกเลิก</button>
              <button className="btn primary" onClick={handleConfirm}>ยืนยัน</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
