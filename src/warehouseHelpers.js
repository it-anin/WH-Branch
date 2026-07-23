import { lookupFactor, picklistRunKey, zoneOfItem } from './units.js';

export const HISTORY_RETENTION_DAYS = 30;

export function shouldSubscribeToProgress({ isAndroid = false, role = null, tab = null } = {}) {
  return !isAndroid && role === 'warehouse' && (tab === 'flow' || tab === 'list');
}

export function shouldSubscribeToHistory({ isAndroid = false, role = null, tab = null } = {}) {
  return !isAndroid && role === 'warehouse' && tab === 'list';
}

export const RECEIVE_PROBLEM_TYPE_OPTIONS = [
  { value: 'damaged', label: 'ชำรุด' },
  { value: 'lot_exp_mismatch', label: 'LOT/EXP ไม่ตรง' },
  { value: 'wrong_item', label: 'สินค้าผิด' },
  { value: 'other', label: 'อื่น ๆ' },
];

export const RECEIVE_PROBLEM_STATUSES = new Set([
  'draft',
  'pending_recheck',
  'submitted',
  'resolved',
]);

const numberOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const cleanText = (value) => String(value ?? '').trim();

// Receiving always accepts a recognized barcode. Cost only controls whether the
// operator may type a quantity after the first scan; it must never force a
// high-value carton/pack to be broken down and scanned as smaller units.
export function receiveBarcodePolicy(costMap, sku, unit, threshold = 1000) {
  const cost = numberOrZero(costMap?.[`${cleanText(sku)}__${cleanText(unit)}`]);
  return {
    cost,
    scanAllowed: true,
    quantityEditable: cost <= threshold,
  };
}

// Deterministic Firestore id: one receive problem per box + SKU. Encoding each
// segment also prevents a slash in an imported box/SKU from becoming a path.
export function receiveProblemId(boxId, sku) {
  const encodeSegment = value => encodeURIComponent(cleanText(value)).replace(/_/g, '%5F');
  return `${encodeSegment(boxId)}__${encodeSegment(sku)}`;
}

export function normalizeReceiveProblem(input, now = Date.now()) {
  const boxId = cleanText(input?.boxId);
  const sku = cleanText(input?.sku);
  const status = RECEIVE_PROBLEM_STATUSES.has(input?.status) ? input.status : 'draft';
  const allowedTypes = new Set(RECEIVE_PROBLEM_TYPE_OPTIONS.map(option => option.value));
  const types = [...new Set((input?.types || []).filter(type => allowedTypes.has(type)))];
  const affected = Number(input?.affectedQty);
  const affectedQty = Number.isInteger(affected) && affected > 0 ? affected : null;
  const createdAt = Number.isFinite(Number(input?.createdAt)) ? Number(input.createdAt) : now;

  return {
    ...input,
    id: receiveProblemId(boxId, sku),
    boxId,
    sku,
    name: cleanText(input?.name),
    barcode: cleanText(input?.barcode),
    unit: cleanText(input?.unit),
    lotExpRows: (input?.lotExpRows || []).map(row => ({
      lot: cleanText(row?.lot),
      exp: cleanText(row?.exp),
    })),
    types,
    affectedQty,
    note: cleanText(input?.note),
    image: input?.image || null,
    imageName: cleanText(input?.imageName),
    reportedBy: input?.reportedBy || null,
    status,
    createdAt,
    updatedAt: now,
  };
}

export function upsertReceiveProblemList(problems, problem) {
  const next = normalizeReceiveProblem(problem, problem?.updatedAt || Date.now());
  return [...(problems || []).filter(item => item.id !== next.id), next]
    .sort((a, b) => numberOrZero(a.createdAt) - numberOrZero(b.createdAt));
}

export function problemTypeLabels(types) {
  const labels = Object.fromEntries(RECEIVE_PROBLEM_TYPE_OPTIONS.map(option => [option.value, option.label]));
  return (types || []).map(type => labels[type] || type);
}

export function receiveProblemRoute({ result, recheckMode = false, isPharmacist = false, hasProblems = false }) {
  if (result === 'ok') {
    return hasProblems
      ? { action: 'submit_problem', problemStatus: 'submitted', problemType: 'item' }
      : { action: 'receive_pending', problemStatus: null, problemType: null };
  }
  if (recheckMode && isPharmacist) {
    return {
      action: 'submit_problem',
      problemStatus: hasProblems ? 'submitted' : null,
      problemType: hasProblems ? 'mixed' : 'incomplete',
    };
  }
  return {
    action: 'pending_recheck',
    problemStatus: hasProblems ? 'pending_recheck' : null,
    problemType: 'incomplete',
  };
}

export function isReceiveProblemExpired(problem, now, retentionDays = HISTORY_RETENTION_DAYS) {
  if (problem?.status === 'draft' || problem?.status === 'pending_recheck') return false;
  const timestamp = numberOrZero(problem?.resolvedAt || problem?.submittedAt || problem?.updatedAt);
  return timestamp > 0 && timestamp < historyCutoff(now, retentionDays).getTime();
}

export const expectedBaseQty = (item) =>
  numberOrZero(item?.gotBase ?? item?.qty ?? item?.got ?? 0);

// แปลง EXP ค.ศ. → พ.ศ. เฉพาะตอนสร้างไฟล์ Text; หน้าจอแพ็ค/รับยังแสดงค่าดิบ
// ตามสินค้าจริงเพื่อไม่ให้พนักงานสับสนระหว่างตรวจของ
export function toBuddhistExpiry(exp) {
  if (!exp) return '';
  const [day, month, year] = String(exp).split('/');
  const yearNumber = Number(year);
  if (!yearNumber) return exp;
  return yearNumber < 2400 ? `${day}/${month}/${yearNumber + 543}` : exp;
}

// แหล่งเดียวของแถว LOT/EXP ที่ใช้ทั้ง Outbound export และ Branch PDA
// - ลังใหม่: ใช้ scannedLots ตาม LOT+หน่วยที่สแกนจริง
// - ลังเก่า: fallback item.lot/item.exp
// - EXP ที่ขาด: เติมจาก lotMap ด้วย LOT เดียวกัน
export function buildLotRows(item, lotMap = {}) {
  const fallbackBarcode = item?.scannedBarcode || item?.barcode || '';
  const fallbackUnit = item?.scannedUnit || item?.unit || '';
  const fallbackLots = lotMap?.[item?.sku] || [];
  const lotExpiry = (lot) => fallbackLots.find(entry => entry.lot === lot)?.exp || '';

  if (Array.isArray(item?.scannedLots) && item.scannedLots.length > 0) {
    return item.scannedLots.map(({ lot, qty, exp, scannedBarcode, unit }) => ({
      barcode: scannedBarcode || fallbackBarcode,
      qty: numberOrZero(qty),
      lot: lot || '',
      exp: exp || lotExpiry(lot),
      unit: unit || fallbackUnit,
    }));
  }

  const fallbackLot = item?.lot || fallbackLots[0]?.lot || '';
  return [{
    barcode: fallbackBarcode,
    qty: numberOrZero(item?.qty ?? item?.got),
    lot: fallbackLot,
    exp: item?.exp || lotExpiry(fallbackLot),
    unit: fallbackUnit,
  }];
}

// รวม LOT/EXP ต่อ SKU สำหรับหน้ารับสินค้า โดยไม่ส่งจำนวนไปให้ component
// เพื่อรักษา blind receiving และตัดค่าซ้ำจาก SKU ที่อยู่หลายแถวใน boxItems
export function buildReceiveLotExpMap(items, lotMap = {}) {
  const result = {};
  const seenBySku = new Map();

  (items || []).forEach(item => {
    const sku = String(item?.sku || '');
    if (!result[sku]) result[sku] = [];
    if (!seenBySku.has(sku)) seenBySku.set(sku, new Set());
    const seen = seenBySku.get(sku);

    buildLotRows(item, lotMap).forEach(({ lot, exp }) => {
      if (!lot && !exp) return;
      const key = `${lot || ''}\u0000${exp || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      result[sku].push({ lot: lot || '', exp: exp || '' });
    });
  });

  return result;
}

// A barcode can be repeated on multiple Picklist rows. Walk the packing rows in
// their original order and select the first matching row that is not complete.
export function findIncompletePackTarget(catalog, items, barcode, matchesBarcode) {
  const matchingCatalog = (catalog || []).filter(item => matchesBarcode(item, barcode));
  const matchingKeys = new Set(matchingCatalog.map(item =>
    `${picklistRunKey(item.picklistRunId)}\u0000${item.sku}\u0000${item.unit || ''}`,
  ));
  if (matchingKeys.size === 0) return null;

  const itemIndex = (items || []).findIndex(item =>
    matchingKeys.has(`${picklistRunKey(item.picklistRunId)}\u0000${item.sku}\u0000${item.unit || ''}`)
    && numberOrZero(item.gotBase) < numberOrZero(item.need),
  );
  if (itemIndex < 0) return null;

  const target = items[itemIndex];
  const catalogItem = matchingCatalog.find(item =>
    item.sku === target.sku
    && (item.unit || '') === (target.unit || '')
    && picklistRunKey(item.picklistRunId) === picklistRunKey(target.picklistRunId)
    && (!item.picklistRowId || !target.picklistRowId || item.picklistRowId === target.picklistRowId),
  );
  return catalogItem ? { catalogItem, target, itemIndex } : null;
}

function mergeBarcodeText(...values) {
  const result = [];
  values.forEach(value => String(value || '').split(',').forEach(part => {
    const barcode = part.trim();
    if (barcode && !result.includes(barcode)) result.push(barcode);
  }));
  return result.join(',');
}

// Receiving is blind-counted per SKU, so duplicate SKU rows must have one
// expected base quantity and one result line.
export function aggregateReceiveItems(items) {
  const result = [];
  const bySku = new Map();

  (items || []).forEach(item => {
    const sku = String(item?.sku || '');
    if (!bySku.has(sku)) {
      const aggregate = {
        ...item,
        gotBase: expectedBaseQty(item),
        barcode: mergeBarcodeText(item?.barcode, item?.scannedBarcode),
        _sourceRows: 1,
      };
      bySku.set(sku, aggregate);
      result.push(aggregate);
      return;
    }

    const aggregate = bySku.get(sku);
    aggregate.gotBase += expectedBaseQty(item);
    aggregate.barcode = mergeBarcodeText(
      aggregate.barcode,
      item?.barcode,
      item?.scannedBarcode,
    );
    aggregate._sourceRows += 1;
  });

  return result;
}

export function buildReceiveDifferences(items, scanCounts = {}) {
  return aggregateReceiveItems(items)
    .map(item => {
      const needed = expectedBaseQty(item);
      const got = numberOrZero(scanCounts[item.sku]);
      const diff = needed - got;
      return diff === 0 ? null : {
        sku: item.sku,
        name: item.name,
        needed,
        got,
        diff,
      };
    })
    .filter(Boolean);
}

function lotFactor(factorMap, item, lotEntry) {
  const unit = lotEntry?.unit || item?.scannedUnit || '';
  return unit ? lookupFactor(factorMap || {}, item.sku, unit) : 1;
}

function fallbackLotEntry(item, qty) {
  return {
    lot: item.lot || '',
    qty,
    exp: item.exp || '',
    scannedBarcode: item.scannedBarcode || item.barcode || '',
    // ลังเก่าที่ไม่มี scannedUnit ใช้ factor=1 ตาม convention เดิม แม้ item.unit
    // จะเป็นหน่วย Picklist ที่มี factor มากกว่า 1
    unit: item.scannedUnit || '',
  };
}

// Outbound edit mode must edit the same per-(LOT + unit) representation that
// packing/export/receiving use. Temporary ids live only in React state and are
// stripped again by finalizePackedItemEdits before Firestore is updated.
export function preparePackedItemsForEdit(items = []) {
  return (items || []).map((item, itemIndex) => {
    const itemEditId = `${item?.picklistRowId || item?.catalogRowId || `${item?.sku || 'item'}__${item?.unit || ''}`}__${itemIndex}`;
    const currentQty = Math.max(0, numberOrZero(item?.qty ?? item?.got));
    const sourceLots = Array.isArray(item?.scannedLots) && item.scannedLots.length > 0
      ? item.scannedLots
      : [fallbackLotEntry(item || {}, currentQty)];

    const editableLots = sourceLots.map((entry, lotIndex) => {
      const lot = cleanText(entry?.lot);
      return {
        ...entry,
        lot,
        qty: Math.max(0, numberOrZero(entry?.qty)),
        exp: cleanText(entry?.exp),
        scannedBarcode: cleanText(entry?.scannedBarcode),
        // Do not fall back to item.unit here. For legacy boxes without
        // scannedUnit the established convention is factor=1.
        unit: cleanText(entry?.unit) || cleanText(item?.scannedUnit),
        __editLotId: `${itemEditId}__lot__${lotIndex}`,
      };
    });

    return {
      ...item,
      __editItemId: itemEditId,
      __editOriginal: {
        editableLots: editableLots.map(normalizeEditLot),
        scannedLots: Array.isArray(item?.scannedLots)
          ? item.scannedLots.map(entry => ({ ...entry }))
          : item?.scannedLots,
        qty: item?.qty,
        got: item?.got,
        gotBase: item?.gotBase,
        lot: item?.lot,
        exp: item?.exp,
        scannedBarcode: item?.scannedBarcode,
        scannedUnit: item?.scannedUnit,
      },
      scannedLots: editableLots,
    };
  });
}

export function resolveWarehouseScanParent(items = [], sku = '', scannedUnit = '') {
  const skuParents = (items || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.sku === sku);
  if (skuParents.length === 0) return { index: -1, ambiguous: false };
  if (skuParents.length === 1) return { index: skuParents[0].index, ambiguous: false };

  const unitParents = skuParents.filter(({ item }) =>
    item?.unit === scannedUnit
    || (item?.scannedLots || []).some(entry => (entry?.unit || item?.scannedUnit || '') === scannedUnit)
  );
  return unitParents.length === 1
    ? { index: unitParents[0].index, ambiguous: false }
    : { index: -1, ambiguous: true };
}

function normalizeEditLot(entry) {
  const { __editLotId, ...persisted } = entry || {};
  return {
    ...persisted,
    lot: cleanText(entry?.lot),
    qty: Math.max(0, Math.trunc(numberOrZero(entry?.qty))),
    exp: cleanText(entry?.exp),
    scannedBarcode: cleanText(entry?.scannedBarcode),
    unit: cleanText(entry?.unit),
  };
}

// Rebuild each original boxItem from its editable LOT rows. Duplicate
// (LOT + unit) rows are merged to keep the same canonical shape as PackScanC.
export function finalizePackedItemEdits(items = [], factorMap = {}) {
  return (items || []).flatMap(item => {
    const { __editItemId, __editOriginal, ...persistedItem } = item || {};
    const normalizedRows = (item?.scannedLots || []).map(normalizeEditLot);

    // A no-op save must be byte-for-byte safe for both modern and legacy
    // items. In particular, do not turn a legacy null/absent scannedLots into
    // a new array or recalculate it with today's factor map.
    if (__editOriginal
      && JSON.stringify(normalizedRows) === JSON.stringify(__editOriginal.editableLots)) {
      return [{
        ...persistedItem,
        qty: __editOriginal.qty,
        got: __editOriginal.got,
        gotBase: __editOriginal.gotBase,
        scannedLots: __editOriginal.scannedLots,
        lot: __editOriginal.lot,
        exp: __editOriginal.exp,
        scannedBarcode: __editOriginal.scannedBarcode,
        scannedUnit: __editOriginal.scannedUnit,
      }];
    }

    const byLotUnit = new Map();

    normalizedRows
      .filter(entry => entry.qty > 0)
      .forEach(entry => {
        const key = `${entry.lot}\u0000${entry.unit}`;
        const previous = byLotUnit.get(key);
        if (previous?.exp && entry.exp && previous.exp !== entry.exp) {
          const error = new Error(`LOT ${entry.lot || 'ไม่ระบุ'} หน่วย ${entry.unit || 'ไม่ระบุ'} มี EXP ไม่ตรงกัน`);
          error.code = 'conflicting-lot-exp';
          throw error;
        }
        const merged = previous
          ? {
              ...previous,
              ...entry,
              qty: previous.qty + entry.qty,
              exp: entry.exp || previous.exp,
              scannedBarcode: entry.scannedBarcode || previous.scannedBarcode,
            }
          : entry;
        // The later duplicate row remains the LIFO entry.
        if (previous) byLotUnit.delete(key);
        byLotUnit.set(key, merged);
      });

    const scannedLots = [...byLotUnit.values()];
    if (scannedLots.length === 0) return [];

    const qty = scannedLots.reduce((sum, entry) => sum + entry.qty, 0);
    const calculatedBase = scannedLots.reduce(
      (sum, entry) => sum + entry.qty * lotFactor(factorMap, persistedItem, entry),
      0,
    );
    const unitTotals = rows => {
      const totals = new Map();
      rows.filter(entry => entry.qty > 0).forEach(entry => {
        totals.set(entry.unit, (totals.get(entry.unit) || 0) + entry.qty);
      });
      return JSON.stringify([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)));
    };
    const originalGotBase = Number(__editOriginal?.gotBase);
    const hasOriginalGotBase = __editOriginal?.gotBase !== null
      && __editOriginal?.gotBase !== ''
      && Number.isFinite(originalGotBase);
    const gotBase = __editOriginal
      && hasOriginalGotBase
      && unitTotals(normalizedRows) === unitTotals(__editOriginal.editableLots || [])
      ? originalGotBase
      : calculatedBase;
    const latest = scannedLots[scannedLots.length - 1];

    return [{
      ...persistedItem,
      qty,
      got: qty,
      gotBase,
      scannedLots,
      lot: latest.lot,
      exp: latest.exp,
      scannedBarcode: latest.scannedBarcode,
      scannedUnit: latest.unit,
    }];
  });
}

// Used by packing to reserve LOT stock from every closed box plus the current
// open box. Multi-LOT items must be counted entry-by-entry; using item.lot with
// the parent total assigns the whole quantity to only the latest LOT.
export function calculateLotUsage({ boxes = [], itemsByBox = {}, currentItems = [], factorMap = {} } = {}) {
  const usage = {};
  const addItem = item => {
    const qty = Math.max(0, numberOrZero(item?.qty ?? item?.got));
    const entries = Array.isArray(item?.scannedLots) && item.scannedLots.length > 0
      ? item.scannedLots
      : (item?.lot ? [fallbackLotEntry(item, qty)] : []);

    entries.forEach(entry => {
      const lot = cleanText(entry?.lot);
      const entryQty = Math.max(0, numberOrZero(entry?.qty));
      if (!lot || entryQty <= 0) return;
      const key = `${item?.sku || ''}__${lot}`;
      usage[key] = (usage[key] || 0) + entryQty * lotFactor(factorMap, item, entry);
    });
  };

  (boxes || []).forEach(box => {
    if (!['closed', 'exported', 'received'].includes(box?.status)) return;
    (itemsByBox?.[box.id] || []).forEach(addItem);
  });
  (currentItems || []).forEach(addItem);
  return usage;
}

// Adjust only the clicked row. scannedLots is treated as a stack: the latest
// lot/unit entry is the one changed by +/- and all counters are recomputed from
// that breakdown.
export function adjustPackedItem(items, rowIndex, delta, factorMap = {}) {
  if (!Number.isInteger(rowIndex) || !items?.[rowIndex] || ![-1, 1].includes(delta)) {
    return items;
  }

  const current = items[rowIndex];
  const currentQty = Math.max(0, numberOrZero(current.qty ?? current.got));
  if (delta < 0 && currentQty === 0) return items;

  let lots = Array.isArray(current.scannedLots) && current.scannedLots.length > 0
    ? current.scannedLots.map(entry => ({ ...entry, qty: Math.max(0, numberOrZero(entry.qty)) }))
    : [fallbackLotEntry(current, currentQty)];

  if (delta > 0) {
    if (lots.length === 0) lots = [fallbackLotEntry(current, 1)];
    else lots[lots.length - 1].qty += 1;
  } else {
    const last = lots.length - 1;
    lots[last].qty -= 1;
    if (lots[last].qty <= 0) lots.splice(last, 1);
  }

  const qty = lots.reduce((sum, entry) => sum + numberOrZero(entry.qty), 0);
  const gotBase = lots.reduce(
    (sum, entry) => sum + numberOrZero(entry.qty) * lotFactor(factorMap, current, entry),
    0,
  );
  const latest = lots[lots.length - 1];
  const updated = {
    ...current,
    qty,
    got: qty,
    gotBase,
    scannedLots: lots,
    ...(latest?.lot ? { lot: latest.lot } : {}),
    ...(latest?.exp ? { exp: latest.exp } : {}),
    ...(latest?.scannedBarcode ? { scannedBarcode: latest.scannedBarcode } : {}),
    ...(latest?.unit ? { scannedUnit: latest.unit } : {}),
  };

  return items.map((item, index) => index === rowIndex ? updated : item);
}

// A catalog row belongs to at most one packer. If legacy assignments contain
// the same zone more than once, packer order deterministically chooses the owner.
export function computeCatalogByPacker(items, assignments, packers, getZone = zoneOfItem) {
  const result = Object.fromEntries((packers || []).map(packer => [packer.code, []]));
  (items || []).forEach(item => {
    const zone = getZone(item);
    const owner = (packers || []).find(packer =>
      (assignments?.[packer.code] || []).includes(zone),
    );
    if (owner) result[owner.code].push(item);
  });
  return result;
}

export function assignZoneExclusively(assignments, packerCode, zone, checked) {
  const next = Object.fromEntries(
    Object.entries(assignments || {}).map(([code, zones]) => [code, [...(zones || [])]]),
  );
  if (checked) {
    Object.keys(next).forEach(code => {
      next[code] = next[code].filter(value => value !== zone);
    });
    next[packerCode] = [...(next[packerCode] || []), zone].sort();
  } else {
    next[packerCode] = (next[packerCode] || []).filter(value => value !== zone);
  }
  return next;
}

export function normalizeExclusiveZoneAssignments(assignments, packers) {
  const claimed = new Set();
  const result = {};
  (packers || []).forEach(packer => {
    result[packer.code] = (assignments?.[packer.code] || []).filter(zone => {
      if (claimed.has(zone)) return false;
      claimed.add(zone);
      return true;
    });
  });
  return result;
}

// Compare only top-level fields against the client's previous snapshot. This
// prevents a stale full-document write from erasing fields changed by a second
// client. The caller supplies Firestore's deleteField() sentinel.
export function buildTopLevelFieldPatch(previous, next, deletedValue) {
  const patch = {};
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  keys.delete('id');
  keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(next || {}, key) || next[key] === undefined) {
      if (Object.prototype.hasOwnProperty.call(previous || {}, key)) patch[key] = deletedValue;
    } else if (!Object.is(previous?.[key], next[key])) {
      patch[key] = next[key];
    }
  });
  return patch;
}

function itemSearchText(item) {
  const lotBarcodes = (item?.scannedLots || []).map(entry => entry.scannedBarcode || '');
  return [
    item?.sku,
    item?.barcode,
    item?.scannedBarcode,
    item?.name,
    ...lotBarcodes,
  ].join(' ').toLowerCase();
}

export function filterTodayBoxes(boxes, itemsByBox, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return boxes || [];
  return (boxes || []).filter(box =>
    String(box.id || '').toLowerCase().includes(needle)
    || String(box.pos || '').toLowerCase().includes(needle)
    || (itemsByBox?.[box.id] || []).some(item => itemSearchText(item).includes(needle)),
  );
}

// Resolve a branch receiving box scan without reporting a false "not found"
// while the initial Firestore snapshots are still loading. Keeping this pure
// also makes the Android startup race independently testable.
export function resolveReceiveBoxScan(boxes, rawQuery, { ready = true, loadError = null } = {}) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) return { status: 'empty', query };
  if (loadError) return { status: 'load-error', query, error: loadError };
  if (!ready) return { status: 'loading', query };

  const compactQuery = query.replace(/\s/g, '');
  const box = (boxes || []).find(candidate =>
    String(candidate?.id || '').toLowerCase().includes(query)
    || String(candidate?.pos || '').replace(/\s/g, '').toLowerCase().includes(compactQuery),
  );
  return box ? { status: 'found', query, box } : { status: 'not-found', query };
}

export function historyCutoff(now, retentionDays = HISTORY_RETENTION_DAYS) {
  return new Date(new Date(now).getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isHistoryExpired(clearedAt, now, retentionDays = HISTORY_RETENTION_DAYS) {
  const timestamp = new Date(clearedAt).getTime();
  return Number.isFinite(timestamp) && timestamp < historyCutoff(now, retentionDays).getTime();
}
