import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, runTransaction, query, where, documentId } from 'firebase/firestore';
import { db } from './firebase.js';

import BoxList from './screens/BoxList.jsx';
import PackScanC from './screens/PackScanC.jsx';
import BoxClosedLabel from './screens/BoxClosedLabel.jsx';
import LookupByBoxBarcode from './screens/LookupByBoxBarcode.jsx';
import BranchReceive from './screens/BranchReceive.jsx';
import PackerDashboard from './screens/PackerDashboard.jsx';
import AndroidApp from './screens/AndroidApp.jsx';
import Login from './screens/Login.jsx';
import { resolveProfile } from './branches.js';
import Toast from './components/Toast.jsx';
import ImportCatalog from './components/ImportCatalog.jsx';
import ImportBarcodeMap from './components/ImportBarcodeMap.jsx';
import ImportCostMap from './components/ImportCostMap.jsx';
import ImportLotMap from './components/ImportLotMap.jsx';
import ZoneAssign from './components/ZoneAssign.jsx';

const TABS = [
  { k: 'flow',   label: 'Dashboard' },
  { k: 'list',   label: 'รายการเบิกสินค้า' },
  { k: 'scan',   label: 'แพ็คกิ้ง' },
  { k: 'closed', label: 'คลังสินค้าส่งออก' },
  { k: 'receive', label: '📥 รับสินค้า (สาขา)' },
];

// tab ที่แต่ละ role เห็นบน Desktop (A1 login) — warehouse = งานคลัง, branch = รับสินค้าเท่านั้น (ปรับที่นี่จุดเดียว)
const ROLE_TABS = {
  warehouse: ['flow', 'list', 'scan', 'closed'],
  branch: ['receive'],
};

const ACCENT = '#e8692b';
const ACCENT_SOFT = '#f5c9a8';

// lotMap (พร้อม exp) ทั้งก้อน ~1.3MB เกินลิมิต Firestore 1MB/doc → แบ่งเขียนหลาย doc: config/lotMap (chunk 0 + _meta) + config/lotMap_1..N
// MAX_CHUNKS = เพดานที่ listener/cleanup รู้จัก (10 × ~700KB = ข้อมูล LOT ได้ ~7MB — เหลือเฟือ)
const LOTMAP_MAX_CHUNKS = 10;
const LOTMAP_CHUNK_BUDGET = 700_000; // ~700KB ต่อ doc (JSON length โดยประมาณ)

// nameMap (ชื่อสินค้าต่อ SKU จาก R05.106 ColF) — วัดจริง ~542KB (7.9k SKU) เกินครึ่งลิมิต 1MB/doc → shard ตั้งแต่แรกตาม Known Pitfall
// วันนี้ 1 doc พอ แต่โครงพร้อมโต: config/nameMap (chunk 0) + nameMap_1..N
const NAMEMAP_MAX_CHUNKS = 5;
const NAMEMAP_CHUNK_BUDGET = 700_000;

const isAndroidMode = new URLSearchParams(window.location.search).get('android') === '1';

export default function App() {
  const [tab, setTab] = useState(() => localStorage.getItem('wh_tab') || 'flow');
  // โปรไฟล์ login รายที่ทำงาน (A1) — resolve จาก localStorage; null = ยังไม่ login → แสดงหน้า Login
  const [profile, setProfile] = useState(() => resolveProfile(localStorage.getItem('wh_profile')));
  const logout = useCallback(() => { localStorage.removeItem('wh_profile'); setProfile(null); }, []);
  const [boxes, _setBoxes] = useState([]);
  const [activeBoxId, setActiveBoxId] = useState(null);
  const [packer, setPacker] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false); // true หลังได้ Firestore snapshot ของ catalog ครั้งแรก — แยก "กำลังโหลด" จาก "catalog ว่างจริงๆ"
  const [itemsByBox, _setItemsByBox] = useState({});
  const [history, setHistory] = useState(() => {
    // Migration: ถ้ามี localStorage เก่าหลงเหลือ ใช้เป็น initial — Firestore listener จะ overwrite ทันที
    try { return JSON.parse(localStorage.getItem('wh_history')) || []; }
    catch { return []; }
  });
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef([]);
  const [receiveBoxIds, _setReceiveBoxIds] = useState([]);
  const [pendingApprovalBoxId, setPendingApprovalBoxId] = useState(null);
  const [scanProgress, setScanProgress] = useState({});

  const boxesRef = useRef([]);
  const itemsByBoxRef = useRef({});
  const receiveBoxIdsRef = useRef([]);

  useEffect(() => { localStorage.setItem('wh_tab', tab); }, [tab]);
  // Desktop: ถ้า tab ปัจจุบันไม่อยู่ในสิทธิ์ของ role ที่ login (เช่นสาขาค้างที่ tab คลังจาก wh_tab เดิม) → เด้งไป tab แรกที่เห็นได้
  useEffect(() => {
    if (!profile) return;
    const allowed = ROLE_TABS[profile.role] || [];
    if (allowed.length > 0 && !allowed.includes(tab)) setTab(allowed[0]);
  }, [profile, tab]);
  // history เก็บใน Firestore (config/history collection) — ไม่ต้อง persist localStorage แล้ว

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ACCENT);
    document.documentElement.style.setProperty('--accent-soft', ACCENT_SOFT);
    document.documentElement.style.setProperty('--note-display', 'none');
  }, []);

  useEffect(() => {
    return () => toastTimers.current.forEach(clearTimeout);
  }, []);

  // Android hardware scanner bridge — รับ wh-scan event จาก WebView → inject เข้า input ที่ focused
  useEffect(() => {
    function onAndroidScan(e) {
      const barcode = e.detail;
      if (!barcode) return;

      // PackScanC รับ wh-scan ตรงๆ ผ่าน useEffect ของตัวเอง — ไม่ต้อง inject
      if (document.querySelector('[data-android-barcode="true"]')) return;

      // BranchReceive และหน้าอื่น: inject เข้า input ที่ focused หรือ input แรกที่มองเห็น
      let input = document.activeElement;
      if (!input || input.tagName !== 'INPUT' || input.type === 'file' || input.disabled) {
        const all = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'));
        input = all.find(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly;
        });
      }
      if (!input) return;

      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, barcode);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
    }
    window.addEventListener('wh-scan', onAndroidScan);
    return () => window.removeEventListener('wh-scan', onAndroidScan);
  }, []);

  // Firestore connectivity test
  useEffect(() => {
    setDoc(doc(db, 'config', 'test'), { ts: Date.now() })
      .then(() => console.log('✅ Firestore connected'))
      .catch(err => console.error('❌ Firestore failed:', err.code, err.message));
  }, []);

  // Firestore real-time listeners
  useEffect(() => {
    const onErr = (label) => (err) => {
      console.error(`Firestore [${label}]:`, err.code, err.message);
    };
    const unsubBoxes = onSnapshot(collection(db, 'boxes'), snap => {
      const data = snap.docs.map(d => d.data())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      boxesRef.current = data;
      _setBoxes(data);
    }, onErr('boxes'));
    const unsubItems = onSnapshot(collection(db, 'boxItems'), snap => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data().items || []; });
      itemsByBoxRef.current = data;
      _setItemsByBox(data);
    }, onErr('boxItems'));
    const unsubReceive = onSnapshot(doc(db, 'config', 'receive'), snap => {
      const ids = snap.exists() ? (snap.data().ids || []) : [];
      receiveBoxIdsRef.current = ids;
      _setReceiveBoxIds(ids);
    }, onErr('receive'));
    const unsubCatalog = onSnapshot(doc(db, 'config', 'catalog'), snap => {
      if (snap.exists()) {
        setCatalog(snap.data().items || []);
        setCatalogMeta(snap.data()._meta || null);
      } else {
        setCatalogMeta(null);
      }
      setCatalogLoaded(true);
    }, onErr('catalog'));
    const unsubCatalogByPacker = onSnapshot(doc(db, 'config', 'catalogByPacker'), snap => {
      if (snap.exists()) setCatalogByPacker(snap.data().assignments || {});
    }, onErr('catalogByPacker'));
    const unsubBarcodeMap = onSnapshot(doc(db, 'config', 'barcodeMap'), snap => {
      if (snap.exists()) {
        const entries = snap.data().entries || [];
        const map = Object.fromEntries(entries.map(e => [e.key, e.barcodes]));
        setBarcodeMap(map);
        setBarcodeMapMeta(snap.data()._meta || null);
      } else {
        setBarcodeMapMeta(null);
      }
    }, onErr('barcodeMap'));
    const unsubProgress = onSnapshot(collection(db, 'progress'), snap => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data().items || []; });
      setScanProgress(data);
    }, onErr('progress'));
    const unsubCostMap = onSnapshot(doc(db, 'config', 'costMap'), snap => {
      if (snap.exists()) {
        const entries = snap.data().entries || [];
        setCostMap(Object.fromEntries(entries.map(e => [e.key, e.cost])));
        setCostMapMeta(snap.data()._meta || null);
      } else {
        setCostMapMeta(null);
      }
    }, onErr('costMap'));
    const unsubFactorMap = onSnapshot(doc(db, 'config', 'factorMap'), snap => {
      if (snap.exists()) {
        const entries = snap.data().entries || [];
        setFactorMap(Object.fromEntries(entries.map(e => [e.key, e.factor])));
      }
    }, onErr('factorMap'));
    // lotMap แบ่งเก็บหลาย doc (shard) — query ทุก doc ที่ id ขึ้นต้น 'lotMap' (รวม doc เดี่ยวเดิม = backward-compat) แล้วรวม entries
    const lotMapQuery = query(collection(db, 'config'),
      where(documentId(), '>=', 'lotMap'), where(documentId(), '<=', 'lotMap\uf8ff'));
    const unsubLotMap = onSnapshot(lotMapQuery, snap => {
      if (snap.empty) { setLotMapMeta(null); return; }
      const entries = [];
      let meta = null;
      snap.docs.forEach(d => {
        entries.push(...(d.data().entries || []));
        if (d.id === 'lotMap') meta = d.data()._meta || null; // _meta อยู่ chunk 0 เท่านั้น
      });
      // รูปแบบใหม่: lots = [{lot, qty, exp?}], รูปแบบเก่า (backward-compat): lots = [string] หรือ lot=string
      setLotMap(Object.fromEntries(entries.map(e => {
        const raw = e.lots || (e.lot ? [e.lot] : []);
        const normalized = raw.map(l => typeof l === 'string' ? { lot: l, qty: Infinity } : l);
        return [e.key, normalized];
      })));
      setLotMapMeta(meta);
    }, onErr('lotMap'));
    // nameMap (ชื่อสินค้าต่อ SKU จาก R05.106) — sharded เหมือน lotMap: query ทุก doc ที่ id ขึ้นต้น 'nameMap' แล้วรวม entries
    // upper bound ประกอบด้วย String.fromCharCode(0xf8ff) — ห้ามพิมพ์ escape ตรงๆ (Known Pitfall: กลายเป็น literal char ล่องหน)
    const nameMapQuery = query(collection(db, 'config'),
      where(documentId(), '>=', 'nameMap'), where(documentId(), '<=', 'nameMap' + String.fromCharCode(0xf8ff)));
    const unsubNameMap = onSnapshot(nameMapQuery, snap => {
      const entries = [];
      snap.docs.forEach(d => { entries.push(...(d.data().entries || [])); });
      setNameMap(Object.fromEntries(entries.map(e => [e.key, e.name])));
    }, onErr('nameMap'));
    const unsubZone = onSnapshot(doc(db, 'config', 'zoneAssignments'), snap => {
      if (snap.exists()) setZoneAssignments(snap.data().assignments || {});
    }, onErr('zoneAssignments'));
    const unsubHistory = onSnapshot(collection(db, 'history'), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => new Date(b.clearedAt) - new Date(a.clearedAt));
      setHistory(data);
    }, onErr('history'));
    return () => { unsubBoxes(); unsubItems(); unsubReceive(); unsubCatalog(); unsubBarcodeMap(); unsubCatalogByPacker(); unsubProgress(); unsubCostMap(); unsubFactorMap(); unsubLotMap(); unsubNameMap(); unsubZone(); unsubHistory(); };
  }, []);

  function setBoxes(updater) {
    const prev = boxesRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    boxesRef.current = next;
    _setBoxes(next);
    const batch = writeBatch(db);
    next.forEach(box => batch.set(doc(db, 'boxes', box.id), box));
    prev.filter(b => !next.find(n => n.id === b.id))
        .forEach(b => batch.delete(doc(db, 'boxes', b.id)));
    batch.commit();
  }

  function setItemsByBox(updater) {
    const prev = itemsByBoxRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    itemsByBoxRef.current = next;
    _setItemsByBox(next);
    Object.entries(next).forEach(([boxId, items]) => {
      if (prev[boxId] !== items) setDoc(doc(db, 'boxItems', boxId), { items });
    });
  }

  function handleScanProgress(boxId, items) {
    if (!boxId) return;
    if (items.length === 0) {
      deleteDoc(doc(db, 'progress', boxId));
    } else {
      const progress = items.filter(it => it.got > 0).map(it => ({ sku: it.sku, got: it.got }));
      if (progress.length > 0) setDoc(doc(db, 'progress', boxId), { items: progress });
    }
  }

  function setReceiveBoxIds(updater) {
    const prev = receiveBoxIdsRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    receiveBoxIdsRef.current = next;
    _setReceiveBoxIds(next);
    setDoc(doc(db, 'config', 'receive'), { ids: next });
  }

  const showToast = useCallback((message, type = 'default') => {
    const id = Date.now() + Math.random();   // กันชนกันเมื่อ toast โผล่ใน ms เดียวกัน
    setToasts(prev => [...prev, { id, message, type }]);
    // เฟส 1: ค้าง 2s แล้ว mark leaving → เล่นขาออก (toastOut)
    const t1 = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    }, 2000);
    // เฟส 2: ลบจริงหลัง exit animation จบ (ตรงกับ TOAST_EXIT_MS 340ms ใน styles.css)
    const t2 = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2340);
    toastTimers.current.push(t1, t2);
  }, []);

  function generateBoxId(currentBoxes) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayPrefix = `BX-${dd}${mm}-`;
    const serials = currentBoxes
      .filter(b => b.id.startsWith(todayPrefix))
      .map(b => parseInt(b.id.slice(-4), 10))
      .filter(n => !isNaN(n));
    const next = serials.length > 0 ? Math.max(...serials) + 1 : 1;
    return `${todayPrefix}${String(next).padStart(4, '0')}`;
  }

  async function createNewBox() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayKey = `${dd}${mm}`;
    const todayPrefix = `BX-${todayKey}-`;
    const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const counterRef = doc(db, 'config', 'boxCounter');
    let newId;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.exists() ? snap.data() : {};
      const next = (data[todayKey] || 0) + 1;
      tx.set(counterRef, { ...data, [todayKey]: next });
      newId = `${todayPrefix}${String(next).padStart(4, '0')}`;
    });
    const newBox = { id: newId, pos: '—', status: 'open', packer: packer || null, branch: catalogMeta?.branch || null, skuCount: 0, totalQty: 0, updated: time, createdAt: Date.now() };
    setBoxes(prev => [newBox, ...prev]);
    setActiveBoxId(newId);
    return newId;
  }

  function clearBoxes() {
    if (boxes.length === 0) { showToast('ไม่มีข้อมูลลังในวันนี้'); return; }
    if (!window.confirm(`ล้างข้อมูลลังทั้งหมด ${boxes.length} ลัง?\nข้อมูลจะถูกเก็บในประวัติย้อนหลัง 7 วัน`)) return;
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const label = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const docId = String(now.getTime());
    const entry = { dateKey, label, clearedAt: now.toISOString(), boxes: [...boxes] };
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);

    const batch = writeBatch(db);
    // history: เขียน entry ใหม่ + ลบ entries เก่ากว่า 7 วัน (ทุกเครื่อง sync ผ่าน Firestore listener)
    batch.set(doc(db, 'history', docId), entry);
    history.filter(h => h.id && new Date(h.clearedAt) <= cutoff).forEach(h => {
      batch.delete(doc(db, 'history', h.id));
    });
    // ล้าง boxes / items / progress / receive (เดิม)
    boxesRef.current.forEach(b => batch.delete(doc(db, 'boxes', b.id)));
    Object.keys(itemsByBoxRef.current).forEach(id => batch.delete(doc(db, 'boxItems', id)));
    Object.keys(scanProgress).forEach(id => batch.delete(doc(db, 'progress', id)));
    batch.delete(doc(db, 'config', 'receive'));
    batch.commit();

    // Optimistic local update — Firestore listener จะ overwrite ใน sync ครั้งถัดไป
    setHistory(prev => [{ ...entry, id: docId }, ...prev.filter(h => new Date(h.clearedAt) > cutoff)]);
    boxesRef.current = [];
    itemsByBoxRef.current = {};
    receiveBoxIdsRef.current = [];
    _setBoxes([]);
    _setItemsByBox({});
    _setReceiveBoxIds([]);
    showToast('ล้างข้อมูลแล้ว · เก็บประวัติไว้ 7 วัน');
  }

  // ลบลังเดียว (Outbound) — กรณียกเลิกรายการเบิก; ห้ามลบลังที่สาขารับแล้ว (เสีย audit trail การรับสินค้า)
  // bypass setBoxes/setItemsByBox wrapper เพราะ setItemsByBox ไม่ deleteDoc ให้ตอน key หายไปจาก object (ต่างจาก setBoxes ที่ diff ให้)
  function deleteBox(boxId) {
    const box = boxesRef.current.find(b => b.id === boxId);
    if (!box || box.status === 'received') return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'boxes', boxId));
    batch.delete(doc(db, 'boxItems', boxId));
    batch.delete(doc(db, 'progress', boxId)); // กันไว้เผื่อหลงเหลือ — ปกติ doClose() ลบไปแล้ว
    batch.commit();

    boxesRef.current = boxesRef.current.filter(b => b.id !== boxId);
    _setBoxes(boxesRef.current);

    const nextItems = { ...itemsByBoxRef.current };
    delete nextItems[boxId];
    itemsByBoxRef.current = nextItems;
    _setItemsByBox(nextItems);

    if (receiveBoxIdsRef.current.includes(boxId)) {
      receiveBoxIdsRef.current = receiveBoxIdsRef.current.filter(id => id !== boxId);
      _setReceiveBoxIds(receiveBoxIdsRef.current);
      setDoc(doc(db, 'config', 'receive'), { ids: receiveBoxIdsRef.current });
    }
  }

  async function clearFirestore() {
    if (!window.confirm(
      'ล้างข้อมูล Firestore ทั้งหมด?\n\n' +
      '— boxes, boxItems, progress, history\n' +
      '— catalog, barcodeMap, costMap, lotMap, receive\n\n' +
      '⚠ ไม่สามารถกู้คืนได้'
    )) return;
    try {
      const batch = writeBatch(db);
      boxesRef.current.forEach(b => batch.delete(doc(db, 'boxes', b.id)));
      Object.keys(itemsByBoxRef.current).forEach(id => batch.delete(doc(db, 'boxItems', id)));
      Object.keys(scanProgress).forEach(id => batch.delete(doc(db, 'progress', id)));
      history.filter(h => h.id).forEach(h => batch.delete(doc(db, 'history', h.id)));
      batch.delete(doc(db, 'config', 'catalog'));
      batch.delete(doc(db, 'config', 'barcodeMap'));
      batch.delete(doc(db, 'config', 'catalogByPacker'));
      batch.delete(doc(db, 'config', 'receive'));
      batch.delete(doc(db, 'config', 'costMap'));
      batch.delete(doc(db, 'config', 'factorMap'));
      batch.delete(doc(db, 'config', 'lotMap'));
      for (let i = 1; i < LOTMAP_MAX_CHUNKS; i++) batch.delete(doc(db, 'config', `lotMap_${i}`)); // ลบ shard ทุกตัว (no-op ถ้าไม่มี)
      batch.delete(doc(db, 'config', 'nameMap'));
      for (let i = 1; i < NAMEMAP_MAX_CHUNKS; i++) batch.delete(doc(db, 'config', `nameMap_${i}`));
      await batch.commit();
      boxesRef.current = [];
      itemsByBoxRef.current = {};
      receiveBoxIdsRef.current = [];
      _setBoxes([]);
      _setItemsByBox({});
      _setReceiveBoxIds([]);
      setCatalog([]);
      setCatalogByPacker({});
      setBarcodeMap({});
      setFactorMap({});
      setNameMap({});
      setCostMap({});
      setLotMap({});
      setHistory([]);
      setCatalogMeta(null);
      setBarcodeMapMeta(null);
      setCostMapMeta(null);
      setLotMapMeta(null);
      showToast('ล้าง Firestore ทั้งหมดแล้ว ✓');
    } catch (err) {
      console.error('clearFirestore failed:', err);
      showToast('⚠ ลบข้อมูลล้มเหลว: ' + err.code);
    }
  }

  function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function generateCSV(targetBoxes) {
    const header = ['box_id', 'pos_number', 'packer', 'sku_count', 'total_qty', 'status', 'updated'].join(',');
    const rows = targetBoxes.map(b =>
      [b.id, b.pos, b.packer?.name || '', b.skuCount, b.totalQty, b.status, b.updated].map(csvCell).join(',')
    );
    return [header, ...rows].join('\n');
  }

  function triggerDownload(content, filename, mimeType) {
    const isCsv = mimeType?.startsWith('text/csv');
    const blob = new Blob(isCsv ? ['\ufeff', content] : [content], {
      type: isCsv ? 'text/csv;charset=utf-8' : mimeType,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const showAll = false;

  const PACKERS = [
    { code: 'EMP-01', name: 'มุก' },
    { code: 'EMP-02', name: 'แล็ค' },
    { code: 'EMP-03', name: 'พี' },
    { code: 'EMP-04', name: 'ตั๋ง' },
  ];

  const [catalogByPacker, setCatalogByPacker] = useState({});
  const [barcodeMap, setBarcodeMap] = useState({});
  const [factorMap, setFactorMap] = useState({}); // {sku__unit: ตัวคูณหน่วยฐาน} จาก R05.106 ColH — ใช้แปลงหน่วย picklist↔หน่วยที่สแกน
  const [nameMap, setNameMap] = useState({}); // {sku: ชื่อสินค้า} จาก R05.106 ColF — แหล่งชื่อสำรอง (สแกนเพิ่มนอก Picklist / heal ชื่อ=เลข SKU)
  const [costMap, setCostMap] = useState({});
  const [lotMap, setLotMap] = useState({});
  const [catalogMeta, setCatalogMeta] = useState(null);
  const [barcodeMapMeta, setBarcodeMapMeta] = useState(null);
  const [costMapMeta, setCostMapMeta] = useState(null);
  const [lotMapMeta, setLotMapMeta] = useState(null);
  const [zoneAssignments, setZoneAssignments] = useState({});
  const [showZoneAssign, setShowZoneAssign] = useState(false);

  // debug helper — พิมพ์ใน console: __wh.sku('708422') | __wh.info()
  useEffect(() => {
    window.__wh = {
      sku: (s) => {
        const inCatalog = catalog.filter(c => c.sku === s).map(c => ({ sku: c.sku, unit: c.unit, qty: c.qty, barcode: c.barcode }));
        const inMap     = Object.keys(barcodeMap).filter(k => k.startsWith(s + '__')).map(k => ({ key: k, barcodes: barcodeMap[k] }));
        console.table(inCatalog.length ? inCatalog : [{ note: 'ไม่พบใน catalog' }]);
        console.table(inMap.length     ? inMap     : [{ note: 'ไม่พบใน barcodeMap' }]);
      },
      info: () => {
        console.log(`catalog: ${catalog.length} items | barcodeMap keys: ${Object.keys(barcodeMap).length}`);
        if (catalog.length > 0) console.table(catalog.slice(0, 5).map(c => ({ sku: c.sku, unit: c.unit, qty: c.qty, barcode: c.barcode })));
      },
      mapKeys: (s) => {
        const keys = Object.keys(barcodeMap).filter(k => k.startsWith(s));
        console.log(keys.map(k => JSON.stringify(k))); // แสดง invisible chars ด้วย
      },
      noBarcodes: () => {
        const r = catalog.filter(c => !c.barcode).map(c => ({ sku: c.sku, name: c.name, unit: c.unit }));
        console.log(`items ไม่มี barcode: ${r.length} / ${catalog.length}`);
        console.table(r.length ? r : [{ note: 'ทุก item มี barcode' }]);
      },
      find: (s) => {
        const r = catalog.filter(c => c.sku.toLowerCase().includes(s.toLowerCase())).map(c => ({ sku: c.sku, unit: c.unit, qty: c.qty, barcode: c.barcode, src: 'catalog' }));
        const allPacker = Object.entries(catalogByPacker).flatMap(([code, items]) =>
          items.filter(c => c.sku.toLowerCase().includes(s.toLowerCase())).map(c => ({ sku: c.sku, unit: c.unit, qty: c.qty, barcode: c.barcode, src: `packer:${code}` }))
        );
        const combined = [...r, ...allPacker];
        console.table(combined.length ? combined : [{ note: `ไม่พบ SKU ที่มี "${s}" ในทั้ง catalog และ catalogByPacker` }]);
      },
      lot: (s) => {
        const entry = lotMap[s];
        console.log('lotMap[' + s + ']:', entry);
        console.log('lotMap total SKUs:', Object.keys(lotMap).length);
        if (entry) console.table(entry);
        else {
          const found = Object.keys(lotMap).filter(k => k.includes(s));
          console.log('SKU ที่ใกล้เคียง:', found.length ? found : '(ไม่มี)');
        }
      },
    };
  }, [catalog, barcodeMap, catalogByPacker, lotMap]);

  function applyBarcodeMap(items, map) {
    const skuBarcodes = {};
    Object.entries(map).forEach(([key, barcodes]) => {
      const sku = key.split('__')[0];
      if (!skuBarcodes[sku]) skuBarcodes[sku] = [];
      for (const barcode of barcodes || []) {
        if (barcode && !skuBarcodes[sku].includes(barcode)) skuBarcodes[sku].push(barcode);
      }
    });

    const mergeBarcodes = (...groups) => {
      const merged = [];
      groups.flat().forEach(barcode => {
        const value = String(barcode ?? '').trim();
        if (value && !merged.includes(value)) merged.push(value);
      });
      return merged;
    };

    return items.map(item => {
      const key = `${item.sku}__${item.unit}`;
      const barcodes = mergeBarcodes(item.barcode ? item.barcode.split(',') : [], map[key] || [], skuBarcodes[item.sku] || []);
      if (barcodes.length > 0) return { ...item, barcode: barcodes.join(',') };
      return item;
    });
  }

  function handleBarcodeMapImport(map, importedFactorMap, importedNameMap, meta) {
    setBarcodeMap(map);
    const mapEntries = Object.entries(map).map(([key, barcodes]) => ({ key, barcodes }));
    setDoc(doc(db, 'config', 'barcodeMap'), { entries: mapEntries, ...(meta ? { _meta: meta } : {}) })
      .catch(err => console.error('barcodeMap write failed:', err.code));
    // ตัวคูณหน่วยฐาน (ColH) มากับไฟล์เดียวกัน — sync เป็น config/factorMap (array format กัน index limit เหมือน costMap)
    if (importedFactorMap && Object.keys(importedFactorMap).length > 0) {
      setFactorMap(importedFactorMap);
      const factorEntries = Object.entries(importedFactorMap).map(([key, factor]) => ({ key, factor }));
      setDoc(doc(db, 'config', 'factorMap'), { entries: factorEntries })
        .catch(err => console.error('factorMap write failed:', err.code));
    }
    // ชื่อสินค้า (ColF) มากับไฟล์เดียวกัน — sync แบบ sharded (วัดจริง ~542KB → shard ตั้งแต่แรก; chunk logic แยกจาก lotMap ไม่แตะ path เดิม)
    if (importedNameMap && Object.keys(importedNameMap).length > 0) {
      setNameMap(importedNameMap);
      const nameEntries = Object.entries(importedNameMap).map(([key, name]) => ({ key, name }));
      const chunks = [];
      let cur = [], curSize = 0;
      for (const e of nameEntries) {
        const size = JSON.stringify(e).length + 1;
        if (curSize + size > NAMEMAP_CHUNK_BUDGET && cur.length > 0) { chunks.push(cur); cur = []; curSize = 0; }
        cur.push(e); curSize += size;
      }
      if (cur.length > 0) chunks.push(cur);
      const nb = writeBatch(db);
      chunks.slice(0, NAMEMAP_MAX_CHUNKS).forEach((chunkEntries, i) => {
        nb.set(doc(db, 'config', i === 0 ? 'nameMap' : `nameMap_${i}`), { entries: chunkEntries });
      });
      for (let i = Math.max(chunks.length, 1); i < NAMEMAP_MAX_CHUNKS; i++) nb.delete(doc(db, 'config', `nameMap_${i}`)); // ลบ chunk เก่าที่เกินรอบนี้ (no-op ถ้าไม่มี)
      nb.commit().catch(err => console.error('nameMap write failed:', err.code));
    }
    const updated = applyBarcodeMap(catalog, map);
    const matched = updated.filter(it => it.barcode).length; // จำนวนรายการเบิกที่ได้ barcode หลัง merge
    setCatalog(updated);
    setDoc(doc(db, 'config', 'catalog'), { items: updated, ...(catalogMeta ? { _meta: catalogMeta } : {}) });
    setCatalogByPacker(prev => {
      const result = {};
      for (const code of Object.keys(prev)) {
        result[code] = applyBarcodeMap(prev[code], map);
      }
      setDoc(doc(db, 'config', 'catalogByPacker'), { assignments: result });
      return result;
    });
    showToast(`Barcode map: ${matched} รายการ matched ✓`);
  }

  function handleCostMapImport(map, meta) {
    setCostMap(map);
    const entries = Object.entries(map).map(([key, cost]) => ({ key, cost }));
    setDoc(doc(db, 'config', 'costMap'), { entries, ...(meta ? { _meta: meta } : {}) })
      .catch(err => console.error('costMap write failed:', err.code));
    showToast(`Cost map: ${entries.length} รายการ ✓`);
  }

  function handleLotMapImport(map, meta) {
    setLotMap(map);
    // map = { [sku]: [{lot, qty, exp?}, ...] } — ทั้งก้อน (มี exp) ~1.3MB เกิน 1MB/doc → แบ่งเขียนเป็น chunk ละ ~700KB
    const entries = Object.entries(map).map(([key, lots]) => ({ key, lots }));
    const total = entries.reduce((s, e) => s + (e.lots?.length || 0), 0);
    const chunks = [];
    let cur = [], curSize = 0;
    for (const e of entries) {
      const size = JSON.stringify(e).length; // ประมาณขนาด Firestore ต่อ entry (ทั้ง SKU อยู่ chunk เดียวกันเสมอ ไม่แตกข้าม doc)
      if (curSize + size > LOTMAP_CHUNK_BUDGET && cur.length > 0) { chunks.push(cur); cur = []; curSize = 0; }
      cur.push(e); curSize += size;
    }
    if (cur.length > 0) chunks.push(cur);
    const batch = writeBatch(db);
    chunks.forEach((chunkEntries, i) => {
      const ref = doc(db, 'config', i === 0 ? 'lotMap' : `lotMap_${i}`);
      batch.set(ref, { entries: chunkEntries, ...(i === 0 && meta ? { _meta: meta } : {}) });
    });
    // ลบ chunk เก่าที่รอบนี้ไม่ใช้ (import ก่อนหน้าอาจมี chunk มากกว่า — delete doc ที่ไม่มีอยู่เป็น no-op)
    for (let i = Math.max(chunks.length, 1); i < LOTMAP_MAX_CHUNKS; i++) batch.delete(doc(db, 'config', `lotMap_${i}`));
    return batch.commit()
      .then(() => showToast(`LOT map: ${entries.length} SKU · ${total} LOT ✓ (${chunks.length} doc)`, 'success'))
      .catch(err => {
        console.error('lotMap write failed:', err.code);
        showToast('⚠ Firestore error: ' + err.code, 'error');
        throw err;
      });
  }

  function distributeCatalog(items) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const result = Object.fromEntries(PACKERS.map(p => [p.code, []]));
    shuffled.forEach((item, i) => {
      result[PACKERS[i % PACKERS.length].code].push(item);
    });
    for (const code of Object.keys(result)) {
      result[code].sort((a, b) => items.indexOf(a) - items.indexOf(b));
    }
    setCatalogByPacker(result);
    setDoc(doc(db, 'config', 'catalogByPacker'), { assignments: result });
  }

  function computeCatalogByPacker(items, assignments) {
    const result = {};
    PACKERS.forEach(p => {
      const zones = assignments[p.code] || [];
      result[p.code] = zones.length > 0
        ? items.filter(item => {
            const m = (item.location || '').match(/^([A-Za-z]+)/);
            return zones.includes(m ? m[1].toUpperCase() : null);
          })
        : items;
    });
    return result;
  }

  function handleZoneAssign(assignments) {
    setZoneAssignments(assignments);
    setDoc(doc(db, 'config', 'zoneAssignments'), { assignments });
    const result = computeCatalogByPacker(catalog, assignments);
    setCatalogByPacker(result);
    setDoc(doc(db, 'config', 'catalogByPacker'), { assignments: result });
    showToast('บันทึกโซนแล้ว ✓', 'success');
  }

  const screenProps = { boxes, setBoxes, activeBoxId, setActiveBoxId, catalog, catalogLoaded, itemsByBox, setItemsByBox, history, setHistory, clearBoxes, clearFirestore, deleteBox, packer, setTab, showToast, createNewBox, generateCSV, triggerDownload, receiveBoxIds, setReceiveBoxIds, costMap, lotMap, barcodeMap, factorMap, nameMap, pendingApprovalBoxId, setPendingApprovalBoxId };

  // Gate: ยังไม่ login → แสดงหน้า Login (ทั้ง Android + Desktop)
  if (!profile) {
    return (
      <>
        <Login onLogin={setProfile} showToast={showToast} />
        <Toast toasts={toasts} />
      </>
    );
  }

  if (isAndroidMode) {
    return (
      <>
        <AndroidApp
          screenProps={screenProps}
          profile={profile}
          logout={logout}
          packer={packer}
          setPacker={setPacker}
          PACKERS={PACKERS}
          catalogByPacker={catalogByPacker}
          onScanProgress={handleScanProgress}
          catalogMeta={catalogMeta}
        />
        <Toast toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>Warehouse - Inbound &amp; Outbound</h1>
        <div className="tabs">
          {TABS.filter(t => (ROLE_TABS[profile.role] || []).includes(t.k)).map((t) => {
            const problemReceiveN = boxes.filter(b => b.problemReported && !b.problemResolved).length;
            const problemOutboundN = boxes.filter(b => b.problemReviewed && !b.problemResolved).length;
            const badgeCount = t.k === 'receive' ? boxes.filter(b => b.receivePending).length + problemReceiveN
              : t.k === 'closed' ? boxes.filter(b => b.status === 'closed').length + problemOutboundN
              : 0;
            return (
              <button key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)} style={{ position: 'relative' }}>
                {t.label}
                {badgeCount > 0 && (
                  <span style={{
                    marginLeft: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                    background: '#e8692b', color: 'white', fontSize: 11, fontWeight: 700,
                    fontFamily: 'JetBrains Mono', verticalAlign: 'middle',
                  }}>{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            {profile.warehouse ? '📦 WAREHOUSE' : `🏢 ${profile.name}`}
          </span>
          <button className="btn sm ghost" onClick={logout} title="ออกจากระบบ">ออกจากระบบ</button>
        </div>
      </div>

      <div className={`canvas${!showAll && tab === 'closed' ? ' canvas-wide' : ''}`}>
        {(showAll || tab === 'flow') && (
          <>
            <div className="screen-label">
              <span className="num">00</span> Dashboard แพ็คกิ้ง
              <span className="desc">— ติดตามความคืบหน้าพนักงานแพ็คกิ้งแต่ละคน</span>
            </div>
            <PackerDashboard
              catalogByPacker={catalogByPacker}
              boxes={boxes}
              itemsByBox={itemsByBox}
              PACKERS={PACKERS}
              scanProgress={scanProgress}
            />
          </>
        )}

        {showAll && <div className="section-divider">screens</div>}

        {(showAll || tab === 'list') && (
          <>
            <div className="screen-label">
              <span className="num">01</span> Box List
              <span className="desc">— อัปโหลดไฟล์เรียงตามลำดับ</span>
            </div>
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <ImportCatalog catalog={catalog} meta={catalogMeta} onImport={(items, meta) => {
                  const updated = Object.keys(barcodeMap).length > 0 ? applyBarcodeMap(items, barcodeMap) : items;
                  setCatalog(updated);
                  setDoc(doc(db, 'config', 'catalog'), { items: updated, ...(meta ? { _meta: meta } : {}) })
                    .then(() => console.log('Firestore catalog saved', updated.length, 'items'))
                    .catch(err => { console.error('Firestore catalog write failed:', err.code, err.message); showToast('⚠ Firestore error: ' + err.code); });
                  // ใช้โซนที่กำหนดไว้เดิมกับ Picklist ใหม่ทันที — ไม่ต้องเข้าไปกดบันทึกโซนซ้ำทุกครั้งที่อัปโหลด
                  const result = computeCatalogByPacker(updated, zoneAssignments);
                  setCatalogByPacker(result);
                  setDoc(doc(db, 'config', 'catalogByPacker'), { assignments: result });
                  showToast(`นำเข้าแล้ว ${items.length} รายการ ✓`);
                }} />
                <button className="btn sm" style={{ minWidth: 240 }} onClick={() => setShowZoneAssign(true)}>
                  📍 กำหนดโซน
                </button>
              </div>
              <ImportBarcodeMap
                matchCount={Object.keys(barcodeMap).length}
                meta={barcodeMapMeta}
                onImport={handleBarcodeMapImport}
              />
              <ImportCostMap
                matchCount={Object.keys(costMap).length}
                meta={costMapMeta}
                onImport={handleCostMapImport}
              />
              <ImportLotMap
                matchCount={Object.keys(lotMap).length}
                meta={lotMapMeta}
                onImport={handleLotMapImport}
                factorMap={factorMap}
              />
            </div>
            <BoxList {...screenProps} />
          </>
        )}

        {(showAll || tab === 'scan') && (
          <>
            <div className="screen-label" style={{ marginTop: 40 }}>
              <span className="num">02</span>พนักงานแพ็คกิ้ง
              <span className="desc">— จัดสินค้าลงลัง</span>
            </div>

            {/* packer selector — above all variants */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 16, flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)' }}>
                พนักงานแพ็คกิ้ง:
              </span>
              {PACKERS.map(p => {
                const active = packer?.code === p.code;
                return (
                  <button
                    key={p.code}
                    onClick={() => setPacker(active ? null : p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px',
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 999,
                      background: active ? 'var(--accent)' : 'white',
                      color: active ? 'white' : 'var(--ink)',
                      fontFamily: 'system-ui', fontSize: 15,
                      cursor: 'pointer',
                      boxShadow: active ? '2px 2px 0 var(--line)' : '1px 1px 0 var(--line)',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, opacity: 0.75 }}>{p.code}</span>
                    <span style={{ fontWeight: active ? 700 : 400 }}>{p.name}</span>
                  </button>
                );
              })}
              {packer && (
                <span style={{ fontFamily: 'system-ui', fontSize: 14, color: 'var(--mute)' }}>
                  · กำลังแพ็คโดย <b>{packer.name}</b>
                  {catalogByPacker[packer.code] && (
                    <span style={{ marginLeft: 6 }}>({catalogByPacker[packer.code].length} SKU)</span>
                  )}
                </span>
              )}
            </div>

            {packer ? (
              <PackScanC key={`${packer.code}-${(catalogByPacker[packer.code] || catalog).length}`} {...screenProps} catalog={catalogByPacker[packer.code] || catalog} onScanProgress={handleScanProgress} catalogMeta={catalogMeta} />
            ) : (
              <div style={{
                border: '2px dashed var(--line)', borderRadius: 14,
                padding: '60px 20px', textAlign: 'center',
                background: 'var(--paper-dark)',
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
                <div style={{ fontFamily: 'system-ui', fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'system-ui', fontSize: 16, color: 'var(--mute)' }}>
                  กดปุ่มชื่อพนักงานด้านบนเพื่อดูรายการสินค้าที่ต้องแพ็ค
                </div>
              </div>
            )}
          </>
        )}

        {(showAll || tab === 'closed') && (
          <>
            <div className="screen-label" style={{ marginTop: 40 }}>
              <span className="num">03</span> รายการส่งสินค้า
              <span className="desc">— ออกเลข POS + บาร์โค้ดปิดลัง พร้อมพิมพ์</span>
            </div>
            <BoxClosedLabel {...screenProps} />
          </>
        )}

        {(showAll || tab === 'lookup') && (
          <>
            <div className="screen-label" style={{ marginTop: 40 }}>
              <span className="num">04</span> สแกนบาร์โค้ดลัง → ดูรายการ
              <span className="desc">— ยืนยันสินค้าในลังโดยไม่ต้องเปิดลัง</span>
            </div>
            <LookupByBoxBarcode {...screenProps} />
          </>
        )}

{(showAll || tab === 'receive') && (
          <>
            <div className="screen-label" style={{ marginTop: 40 }}>
              <span className="num">06</span> รับสินค้าเข้าสาขา
              <span className="desc">— สาขาสแกนบาร์โค้ดลัง → ตรวจและยืนยันรับสินค้า</span>
            </div>
            <BranchReceive {...screenProps} branch={profile.role === 'branch' ? profile.code : null} />
          </>
        )}

        <div style={{ marginTop: 50, padding: 20, borderTop: '2px dashed var(--line)', fontFamily: 'system-ui', color: 'var(--mute)' }}>
          <b style={{ fontFamily: 'system-ui', fontSize: 20 }}>NOTED</b>
          <ul style={{ marginTop: 8 }}>
            <li>แสดงสถานะการดำเนินงานของพนักงานแพ็คกิ้งแต่ละคน</li>
            <li>รายการเบิกสินค้าดึงข้อมูลจากไฟล์ PickList_xxx โดยตรง</li>
            <li>รายการเบิกสินค้าจัดสรรให้พนักงานแพ็คกิ้งได้รับเท่าๆกัน</li>
            <li>ภายในหนึ่งลังจะแบ่งสินค้าแต่ละ SKU ตาม Dimension ไม่ให้เกินขนาดลัง</li>
            <li>Outbound ใส่เลขที่เอกสารก่อนถึงจะพิมพ์ใบปิดลัง + ส่งออกไฟล์ Text ได้</li>
            <li>ลังไหนสินค้าขาด/เสียหาย/ไม่ครบ ถ่ายรูปและอัปโหลดแจ้งคลังสินค้า</li>
            <li>สาขาสแกนสินค้าเข้าแบบ Blind Receiving</li>
          </ul>
        </div>
      </div>

      {showZoneAssign && (
        <ZoneAssign
          catalog={catalog}
          packers={PACKERS}
          zoneAssignments={zoneAssignments}
          onSave={handleZoneAssign}
          onClose={() => setShowZoneAssign(false)}
        />
      )}
      <Toast toasts={toasts} />
    </>
  );
}
