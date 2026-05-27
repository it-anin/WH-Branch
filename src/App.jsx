import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, runTransaction } from 'firebase/firestore';
import { db } from './firebase.js';

import BoxList from './screens/BoxList.jsx';
import PackScanC from './screens/PackScanC.jsx';
import BoxClosedLabel from './screens/BoxClosedLabel.jsx';
import LookupByBoxBarcode from './screens/LookupByBoxBarcode.jsx';
import BranchReceive from './screens/BranchReceive.jsx';
import PackerDashboard from './screens/PackerDashboard.jsx';
import AndroidApp from './screens/AndroidApp.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import Toast from './components/Toast.jsx';
import ImportCatalog from './components/ImportCatalog.jsx';
import ImportBarcodeMap from './components/ImportBarcodeMap.jsx';
import ImportCostMap from './components/ImportCostMap.jsx';

const TABS = [
  { k: 'flow',   label: 'Dashboard' },
  { k: 'list',   label: 'รายการเบิกสินค้า' },
  { k: 'scan',   label: 'แพ็คกิ้ง' },
  { k: 'closed', label: 'Outbound' },
  { k: 'receive', label: '📥 รับสินค้า (สาขา)' },
];

const DEFAULT_TWEAKS = {
  density: 'comfy',
  variant: 'A',
  accent: 'orange',
  barcode: '1D',
  annotations: 'on',
};

const ACCENTS = { orange: '#e8692b', blue: '#2b6ce8', green: '#5c8a3a', pink: '#d94a8a' };
const ACCENT_SOFT = { orange: '#f5c9a8', blue: '#b8cef5', green: '#c4d8a8', pink: '#f5c2db' };

const isAndroidMode = new URLSearchParams(window.location.search).get('android') === '1';

export default function App() {
  const [tab, setTab] = useState(() => localStorage.getItem('wh_tab') || 'flow');
  const [tweaks, setTweaks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wh_tweaks')) || {}; }
    catch { return {}; }
  });
  const [open, setOpen] = useState(false);

  const [boxes, _setBoxes] = useState([]);
  const [activeBoxId, setActiveBoxId] = useState(null);
  const [packer, setPacker] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [itemsByBox, _setItemsByBox] = useState({});
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wh_history')) || []; }
    catch { return []; }
  });
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef([]);
  const [receiveBoxIds, _setReceiveBoxIds] = useState([]);
  const [scanProgress, setScanProgress] = useState({});

  const boxesRef = useRef([]);
  const itemsByBoxRef = useRef({});
  const receiveBoxIdsRef = useRef([]);

  const merged = { ...DEFAULT_TWEAKS, ...tweaks };

  useEffect(() => { localStorage.setItem('wh_tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('wh_tweaks', JSON.stringify(merged)); }, [tweaks]);
  useEffect(() => { localStorage.setItem('wh_history', JSON.stringify(history)); }, [history]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ACCENTS[merged.accent]);
    document.documentElement.style.setProperty('--accent-soft', ACCENT_SOFT[merged.accent]);
    document.documentElement.style.setProperty('--note-display', merged.annotations === 'on' ? 'block' : 'none');
  }, [merged.accent, merged.annotations]);

  useEffect(() => {
    return () => toastTimers.current.forEach(clearTimeout);
  }, []);

  // Android hardware scanner bridge — รับ wh-scan event จาก WebView → inject เข้า input ที่ focused
  useEffect(() => {
    function onAndroidScan(e) {
      const barcode = e.detail;
      if (!barcode) return;

      // หา input ที่ focused อยู่ก่อน ถ้าไม่มีให้หา input แรกที่มองเห็นได้
      let input = document.activeElement;
      if (!input || input.tagName !== 'INPUT' || input.type === 'file' || input.disabled) {
        const all = Array.from(document.querySelectorAll('input[type="text"],input:not([type])'));
        input = all.find(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly;
        });
      }
      if (!input) return;

      // React synthetic event trick: ตั้งค่าผ่าน native setter แล้ว dispatch input event
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
      if (snap.exists()) setCatalog(snap.data().items || []);
    }, onErr('catalog'));
    const unsubCatalogByPacker = onSnapshot(doc(db, 'config', 'catalogByPacker'), snap => {
      if (snap.exists()) setCatalogByPacker(snap.data().assignments || {});
    }, onErr('catalogByPacker'));
    const unsubBarcodeMap = onSnapshot(doc(db, 'config', 'barcodeMap'), snap => {
      if (snap.exists()) {
        const entries = snap.data().entries || [];
        const map = Object.fromEntries(entries.map(e => [e.key, e.barcodes]));
        setBarcodeMap(map);
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
      }
    }, onErr('costMap'));
    return () => { unsubBoxes(); unsubItems(); unsubReceive(); unsubCatalog(); unsubBarcodeMap(); unsubCatalogByPacker(); unsubProgress(); unsubCostMap(); };
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
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
    toastTimers.current.push(timer);
  }, []);

  function generateBoxId(currentBoxes) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayPrefix = `BX-${mm}${dd}-`;
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
    const todayKey = `${mm}${dd}`;
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
    const newBox = { id: newId, pos: '—', status: 'open', packer: packer || null, skuCount: 0, totalQty: 0, updated: time, createdAt: Date.now() };
    setBoxes(prev => [newBox, ...prev]);
    setActiveBoxId(newId);
    return newId;
  }

  function clearBoxes() {
    if (boxes.length === 0) { showToast('ไม่มีข้อมูลลังในวันนี้'); return; }
    if (!window.confirm(`ล้างข้อมูลลังทั้งหมด ${boxes.length} ลัง?\nข้อมูลจะถูกเก็บในประวัติย้อนหลัง 1 เดือน`)) return;
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const label = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const entry = { dateKey, label, clearedAt: now.toISOString(), boxes: [...boxes] };
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    setHistory(prev => [entry, ...prev.filter(h => new Date(h.clearedAt) > cutoff)]);
    const batch = writeBatch(db);
    boxesRef.current.forEach(b => batch.delete(doc(db, 'boxes', b.id)));
    Object.keys(itemsByBoxRef.current).forEach(id => batch.delete(doc(db, 'boxItems', id)));
    Object.keys(scanProgress).forEach(id => batch.delete(doc(db, 'progress', id)));
    batch.delete(doc(db, 'config', 'receive'));
    batch.commit();
    boxesRef.current = [];
    itemsByBoxRef.current = {};
    receiveBoxIdsRef.current = [];
    _setBoxes([]);
    _setItemsByBox({});
    _setReceiveBoxIds([]);
    showToast('ล้างข้อมูลแล้ว · เก็บประวัติไว้ 1 เดือน');
  }

  async function clearFirestore() {
    if (!window.confirm(
      'ล้างข้อมูล Firestore ทั้งหมด?\n\n' +
      '— boxes, boxItems, progress\n' +
      '— catalog, barcodeMap, receive\n\n' +
      '⚠ ไม่สามารถกู้คืนได้'
    )) return;
    try {
      const batch = writeBatch(db);
      boxesRef.current.forEach(b => batch.delete(doc(db, 'boxes', b.id)));
      Object.keys(itemsByBoxRef.current).forEach(id => batch.delete(doc(db, 'boxItems', id)));
      Object.keys(scanProgress).forEach(id => batch.delete(doc(db, 'progress', id)));
      batch.delete(doc(db, 'config', 'catalog'));
      batch.delete(doc(db, 'config', 'barcodeMap'));
      batch.delete(doc(db, 'config', 'catalogByPacker'));
      batch.delete(doc(db, 'config', 'receive'));
      batch.delete(doc(db, 'config', 'costMap'));
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
      setCostMap({});
      showToast('ล้าง Firestore ทั้งหมดแล้ว ✓');
    } catch (err) {
      console.error('clearFirestore failed:', err);
      showToast('⚠ ลบข้อมูลล้มเหลว: ' + err.code);
    }
  }

  function generateCSV(targetBoxes) {
    const header = 'box_id,pos_number,sku_count,total_qty,status,updated';
    const rows = targetBoxes.map(b =>
      [b.id, b.pos, b.skuCount, b.totalQty, b.status, b.updated].join(',')
    );
    return [header, ...rows].join('\n');
  }

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
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
    { code: 'EMP-03', name: 'เต้' },
    { code: 'EMP-04', name: 'ตั๋ง' },
  ];

  const [catalogByPacker, setCatalogByPacker] = useState({});
  const [barcodeMap, setBarcodeMap] = useState({});
  const [costMap, setCostMap] = useState({});

  // debug helper — พิมพ์ใน console: __wh.sku('708422') | __wh.info()
  useEffect(() => {
    window.__wh = {
      sku: (s) => {
        const inCatalog = catalog.filter(c => c.sku === s).map(c => ({ sku: c.sku, unit: c.unit, barcode: c.barcode }));
        const inMap     = Object.keys(barcodeMap).filter(k => k.startsWith(s + '__')).map(k => ({ key: k, barcodes: barcodeMap[k] }));
        console.table(inCatalog.length ? inCatalog : [{ note: 'ไม่พบใน catalog' }]);
        console.table(inMap.length     ? inMap     : [{ note: 'ไม่พบใน barcodeMap' }]);
      },
      info: () => {
        console.log(`catalog: ${catalog.length} items | barcodeMap keys: ${Object.keys(barcodeMap).length}`);
        if (catalog.length > 0) console.table(catalog.slice(0, 5).map(c => ({ sku: c.sku, unit: c.unit, barcode: c.barcode })));
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
        const r = catalog.filter(c => c.sku.toLowerCase().includes(s.toLowerCase())).map(c => ({ sku: c.sku, unit: c.unit, barcode: c.barcode, src: 'catalog' }));
        const allPacker = Object.entries(catalogByPacker).flatMap(([code, items]) =>
          items.filter(c => c.sku.toLowerCase().includes(s.toLowerCase())).map(c => ({ sku: c.sku, unit: c.unit, barcode: c.barcode, src: `packer:${code}` }))
        );
        const combined = [...r, ...allPacker];
        console.table(combined.length ? combined : [{ note: `ไม่พบ SKU ที่มี "${s}" ในทั้ง catalog และ catalogByPacker` }]);
      },
    };
  }, [catalog, barcodeMap, catalogByPacker]);

  function applyBarcodeMap(items, map) {
    const skusInMap = new Set(Object.keys(map).map(k => k.split('__')[0]));
    return items.map(item => {
      const key = `${item.sku}__${item.unit}`;
      const barcodes = map[key];
      if (barcodes && barcodes.length > 0) return { ...item, barcode: barcodes.join(',') };
      if (skusInMap.has(item.sku)) return { ...item, barcode: '' }; // SKU มีใน map แต่ unit ไม่ตรง → clear
      return item; // SKU ไม่มีใน map เลย → ใช้ barcode เดิมจาก ColC
    });
  }

  function handleBarcodeMapImport(map) {
    setBarcodeMap(map);
    const mapEntries = Object.entries(map).map(([key, barcodes]) => ({ key, barcodes }));
    setDoc(doc(db, 'config', 'barcodeMap'), { entries: mapEntries })
      .catch(err => console.error('barcodeMap write failed:', err.code));
    const matched = catalog.filter(item => map[`${item.sku}__${item.unit}`]).length;
    const updated = applyBarcodeMap(catalog, map);
    setCatalog(updated);
    setDoc(doc(db, 'config', 'catalog'), { items: updated });
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

  function handleCostMapImport(map) {
    setCostMap(map);
    const entries = Object.entries(map).map(([key, cost]) => ({ key, cost }));
    setDoc(doc(db, 'config', 'costMap'), { entries })
      .catch(err => console.error('costMap write failed:', err.code));
    showToast(`Cost map: ${entries.length} รายการ ✓`);
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

  const screenProps = { boxes, setBoxes, activeBoxId, setActiveBoxId, catalog, itemsByBox, setItemsByBox, history, setHistory, clearBoxes, clearFirestore, packer, setTab, showToast, createNewBox, generateCSV, triggerDownload, receiveBoxIds, setReceiveBoxIds, costMap };

  if (isAndroidMode) {
    return (
      <>
        <AndroidApp
          screenProps={screenProps}
          packer={packer}
          setPacker={setPacker}
          PACKERS={PACKERS}
          catalogByPacker={catalogByPacker}
          onScanProgress={handleScanProgress}
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
          {TABS.map((t) => (
            <button key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="canvas">
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
              <span className="desc">— ภาพรวมลังทั้งหมดวันนี้</span>
            </div>
            <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
              <ImportCatalog catalog={catalog} onImport={(items) => {
                const updated = Object.keys(barcodeMap).length > 0 ? applyBarcodeMap(items, barcodeMap) : items;
                setCatalog(updated);
                setDoc(doc(db, 'config', 'catalog'), { items: updated })
                  .then(() => console.log('Firestore catalog saved', updated.length, 'items'))
                  .catch(err => { console.error('Firestore catalog write failed:', err.code, err.message); showToast('⚠ Firestore error: ' + err.code); });
                showToast(`นำเข้าแล้ว ${items.length} รายการ ✓`);
              }} />
              <ImportBarcodeMap
                matchCount={Object.keys(barcodeMap).length}
                onImport={handleBarcodeMapImport}
              />
              <ImportCostMap
                matchCount={Object.keys(costMap).length}
                onImport={handleCostMapImport}
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
              <span style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)' }}>
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
                      fontFamily: 'Patrick Hand', fontSize: 15,
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
                <span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>
                  · กำลังแพ็คโดย <b>{packer.name}</b>
                  {catalogByPacker[packer.code] && (
                    <span style={{ marginLeft: 6 }}>({catalogByPacker[packer.code].length} SKU)</span>
                  )}
                </span>
              )}
              <button
                className="btn sm ghost"
                onClick={() => { distributeCatalog(catalog); showToast('สุ่มรายการใหม่แล้ว ✓'); }}
                title="สุ่มแบ่งรายการเบิกใหม่"
              >
                🔀 สุ่มใหม่
              </button>
            </div>

            {packer ? (
              <PackScanC key={`${packer.code}-${Object.keys(catalogByPacker).length}`} {...screenProps} catalog={catalogByPacker[packer.code] || catalog} onScanProgress={handleScanProgress} />
            ) : (
              <div style={{
                border: '2px dashed var(--line)', borderRadius: 14,
                padding: '60px 20px', textAlign: 'center',
                background: 'var(--paper-dark)',
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 16, color: 'var(--mute)' }}>
                  กดปุ่มชื่อพนักงานด้านบนเพื่อดูรายการสินค้าที่ต้องแพ็ค
                </div>
              </div>
            )}
          </>
        )}

        {(showAll || tab === 'closed') && (
          <>
            <div className="screen-label" style={{ marginTop: 40 }}>
              <span className="num">03</span> ปิดลังสำเร็จ + สติกเกอร์
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
            <BranchReceive {...screenProps} />
          </>
        )}

        <div style={{ marginTop: 50, padding: 20, borderTop: '2px dashed var(--line)', fontFamily: 'Patrick Hand', color: 'var(--mute)' }}>
          <b style={{ fontFamily: 'Caveat', fontSize: 20 }}>NOTED</b>
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

      <TweaksPanel tweaks={merged} setTweaks={setTweaks} open={open} setOpen={setOpen} />
      <Toast toasts={toasts} />
    </>
  );
}
