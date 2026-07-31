const R14_WAREHOUSE = 'Warehouse';
const MAX_WARNING_SAMPLES = 50;

export const R14_REQUIRED_HEADERS = Object.freeze([
  'TRANDATE',
  'CF_EXPIREDATE_TEXT',
  'CF_WAREHOUSE_NAME',
  'CF_ITEMID',
  'CF_ITEMNAME',
  'CF_LOTNO',
  'CF_UNITNAME',
  'CF_QUANTITY',
]);

export const QR_VALIDATION = Object.freeze({
  VALID: 'valid',
  MISSING_LOT: 'missing_lot',
  MISSING_EXP: 'missing_exp',
  INVALID_EXP: 'invalid_exp',
  INVALID_TRANDATE: 'invalid_trandate',
  EXP_CONFLICT: 'exp_conflict',
});

export const QR_EXPIRY_STATUS = Object.freeze({
  VALID: 'valid',
  EXPIRED: 'expired',
  EXPIRES_TODAY: 'expires_today',
  NO_EXPIRY: 'no_expiry',
  INVALID: 'invalid',
});

export class R14102HeaderError extends Error {
  constructor(message, { missingHeaders = [], duplicateHeaders = [] } = {}) {
    super(message);
    this.name = 'R14102HeaderError';
    this.code = duplicateHeaders.length ? 'duplicate_headers' : 'missing_headers';
    this.missingHeaders = missingHeaders;
    this.duplicateHeaders = duplicateHeaders;
  }
}

function cellText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizedHeader(value) {
  return cellText(value).replace(/^\uFEFF/, '').toLowerCase();
}

function indexHeaders(headerRow) {
  const index = new Map();
  const duplicates = new Set();
  (headerRow || []).forEach((value, column) => {
    const header = normalizedHeader(value);
    if (!header) return;
    if (index.has(header)) duplicates.add(header);
    else index.set(header, column);
  });
  return { index, duplicates };
}

function requiredHeaderKey(header) {
  return header.toLowerCase();
}

function looksLikeR14102(index) {
  // R01.119 also contains warehouse/name columns. The full transaction timestamp
  // and explicit expiry text are the reliable R14.102 markers.
  return index.has('trandate') || index.has('cf_expiredate_text');
}

function detectR14102Columns(headerRow) {
  const { index, duplicates } = indexHeaders(headerRow);
  const missingHeaders = R14_REQUIRED_HEADERS
    .filter(header => !index.has(requiredHeaderKey(header)));
  const duplicateHeaders = R14_REQUIRED_HEADERS
    .filter(header => duplicates.has(requiredHeaderKey(header)));

  if (!looksLikeR14102(index)) return null;

  if (missingHeaders.length || duplicateHeaders.length) {
    const parts = [];
    if (missingHeaders.length) parts.push(`missing: ${missingHeaders.join(', ')}`);
    if (duplicateHeaders.length) parts.push(`duplicate: ${duplicateHeaders.join(', ')}`);
    throw new R14102HeaderError(
      `Invalid R14.102 header (${parts.join('; ')})`,
      { missingHeaders, duplicateHeaders },
    );
  }

  return {
    transactionDate: index.get('trandate'),
    exp: index.get('cf_expiredate_text'),
    warehouse: index.get('cf_warehouse_name'),
    sku: index.get('cf_itemid'),
    name: index.get('cf_itemname'),
    lot: index.get('cf_lotno'),
    unit: index.get('cf_unitname'),
    qty: index.get('cf_quantity'),
  };
}

function detectOperationalColumns(headerRow) {
  const { index } = indexHeaders(headerRow);
  if (index.has('cf_lotno') && index.has('cf_itemid')) {
    return {
      lot: index.get('cf_lotno'),
      sku: index.get('cf_itemid'),
      qty: index.get('cf_quantity') ?? 5,
      unit: index.get('cf_unitname') ?? 6,
      exp: index.get('cf_expiredate_text') ?? null,
      // คง semantics lotMap เดิม: ใช้ CF_TRANDATE (วันที่) ก่อน ส่วน QR index ใช้ TRANDATE ที่มีเวลาแยกต่างหาก
      transactionDate: index.get('cf_trandate') ?? index.get('trandate') ?? null,
    };
  }
  return {
    lot: 0,
    sku: 1,
    qty: 5,
    unit: 6,
    exp: null,
    transactionDate: null,
  };
}

function parseQuantity(value) {
  const parsed = Number.parseFloat(cellText(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function factorFor(factorMap, sku, unit) {
  const factor = Number(factorMap?.[`${sku}__${unit}`] ?? 1);
  return Number.isFinite(factor) ? factor : 1;
}

function utcTimestamp(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const value = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(value);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
    || check.getUTCSeconds() !== second
  ) {
    return null;
  }
  return value;
}

export function parseTransactionTimestamp(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's serial-date epoch, including the conventional leap-year offset.
    return Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000);
  }

  const text = cellText(value);
  if (!text) return null;

  const thaiStyle = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (thaiStyle) {
    return utcTimestamp(
      Number(thaiStyle[3]),
      Number(thaiStyle[2]),
      Number(thaiStyle[1]),
      Number(thaiStyle[4] || 0),
      Number(thaiStyle[5] || 0),
      Number(thaiStyle[6] || 0),
      Number((thaiStyle[7] || '').padEnd(3, '0') || 0),
    );
  }

  const isoStyle = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z)?)?$/,
  );
  if (isoStyle) {
    return utcTimestamp(
      Number(isoStyle[1]),
      Number(isoStyle[2]),
      Number(isoStyle[3]),
      Number(isoStyle[4] || 0),
      Number(isoStyle[5] || 0),
      Number(isoStyle[6] || 0),
      Number((isoStyle[7] || '').padEnd(3, '0') || 0),
    );
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial)) {
      return Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000);
    }
  }
  return null;
}

function expiryParts(value) {
  const text = cellText(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const timestamp = utcTimestamp(year, month, day);
  return timestamp == null ? null : { day, month, year, timestamp };
}

export function classifyExpiry(exp, today = new Date()) {
  const parsed = expiryParts(exp);
  if (!parsed) return QR_EXPIRY_STATUS.INVALID;
  if (parsed.year === 9999) return QR_EXPIRY_STATUS.NO_EXPIRY;

  const todayTimestamp = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (parsed.timestamp < todayTimestamp) return QR_EXPIRY_STATUS.EXPIRED;
  if (parsed.timestamp === todayTimestamp) return QR_EXPIRY_STATUS.EXPIRES_TODAY;
  return QR_EXPIRY_STATUS.VALID;
}

function buildOperationalLotMap(rows, factorMap, columns) {
  const totals = new Map();

  (rows || []).slice(1).forEach(values => {
    const lot = cellText(values?.[columns.lot]);
    const sku = cellText(values?.[columns.sku]);
    const quantity = parseQuantity(values?.[columns.qty]) ?? 0;
    const unit = cellText(values?.[columns.unit]);
    if (!sku || !lot) return;

    if (!totals.has(sku)) totals.set(sku, new Map());
    const lots = totals.get(sku);
    if (!lots.has(lot)) {
      lots.set(lot, { qty: 0, exp: '', timestamp: Number.NEGATIVE_INFINITY });
    }
    const current = lots.get(lot);
    current.qty += quantity * factorFor(factorMap, sku, unit);

    if (columns.exp != null) {
      const exp = cellText(values?.[columns.exp]);
      const parsedTimestamp = columns.transactionDate == null
        ? 0
        : parseTransactionTimestamp(values?.[columns.transactionDate]);
      const timestamp = parsedTimestamp ?? Number.NEGATIVE_INFINITY;
      if (exp && timestamp >= current.timestamp) {
        current.exp = exp;
        current.timestamp = timestamp;
      }
    }
  });

  const lotMap = {};
  totals.forEach((lots, sku) => {
    lots.forEach((entry, lot) => {
      if (!(entry.qty > 0)) return;
      if (!lotMap[sku]) lotMap[sku] = [];
      lotMap[sku].push({
        lot,
        qty: entry.qty,
        ...(entry.exp ? { exp: entry.exp } : {}),
      });
    });
  });
  return lotMap;
}

export function parseLotRows(rows, factorMap = {}) {
  const columns = detectOperationalColumns(rows?.[0]);
  return buildOperationalLotMap(rows, factorMap, columns);
}

function createWarningCollector() {
  const samples = [];
  const byCode = {};
  let total = 0;
  return {
    add(code, details = {}) {
      total += 1;
      byCode[code] = (byCode[code] || 0) + 1;
      if (samples.length < MAX_WARNING_SAMPLES) samples.push({ code, ...details });
    },
    result() {
      return { samples, total, byCode };
    },
  };
}

function setLatestCandidates(group, timestamp, exp) {
  if (timestamp > group.latestTimestamp) {
    group.latestTimestamp = timestamp;
    group.expCandidates = new Set([exp]);
    return;
  }
  if (timestamp === group.latestTimestamp) group.expCandidates.add(exp);
}

function lotValidation(group, lot, candidates) {
  if (!lot) return QR_VALIDATION.MISSING_LOT;
  if (group.hasInvalidTransactionDate) return QR_VALIDATION.INVALID_TRANDATE;
  if (candidates.length > 1) return QR_VALIDATION.EXP_CONFLICT;
  const exp = candidates[0] || '';
  if (!exp) return QR_VALIDATION.MISSING_EXP;
  if (!expiryParts(exp)) return QR_VALIDATION.INVALID_EXP;
  return QR_VALIDATION.VALID;
}

function buildQrProducts(rows, factorMap, columns) {
  const groupsBySku = new Map();
  const latestNames = new Map();
  const warningCollector = createWarningCollector();
  let warehouseRowCount = 0;

  (rows || []).slice(1).forEach((values, offset) => {
    const warehouse = cellText(values?.[columns.warehouse]);
    if (warehouse !== R14_WAREHOUSE) return;
    warehouseRowCount += 1;

    const row = offset + 2;
    const sku = cellText(values?.[columns.sku]);
    if (!sku) {
      warningCollector.add('missing_sku', { row });
      return;
    }

    const quantity = parseQuantity(values?.[columns.qty]);
    if (quantity == null) {
      warningCollector.add('invalid_qty', { row, sku });
      return;
    }

    const lot = cellText(values?.[columns.lot]);
    const exp = cellText(values?.[columns.exp]);
    const name = cellText(values?.[columns.name]);
    const unit = cellText(values?.[columns.unit]);
    const parsedTimestamp = parseTransactionTimestamp(values?.[columns.transactionDate]);
    const timestamp = parsedTimestamp ?? Number.NEGATIVE_INFINITY;

    if (!groupsBySku.has(sku)) groupsBySku.set(sku, new Map());
    const groupsByLot = groupsBySku.get(sku);
    if (!groupsByLot.has(lot)) {
      groupsByLot.set(lot, {
        qty: 0,
        latestTimestamp: Number.NEGATIVE_INFINITY,
        expCandidates: new Set(),
        hasInvalidTransactionDate: false,
      });
    }
    const group = groupsByLot.get(lot);
    group.qty += quantity * factorFor(factorMap, sku, unit);
    if (parsedTimestamp == null) group.hasInvalidTransactionDate = true;
    setLatestCandidates(group, timestamp, exp);

    const currentName = latestNames.get(sku);
    if (
      !currentName
      || timestamp > currentName.timestamp
      || (timestamp === currentName.timestamp && name)
    ) {
      latestNames.set(sku, { name, timestamp });
    }
  });

  const qrProducts = {};
  groupsBySku.forEach((groupsByLot, sku) => {
    const lots = [];
    groupsByLot.forEach((group, lot) => {
      if (!(group.qty > 0)) return;
      const candidates = [...group.expCandidates].sort((a, b) => a.localeCompare(b));
      const validation = lotValidation(group, lot, candidates);
      const exp = candidates.length === 1 ? candidates[0] : '';
      const lotEntry = {
        lot,
        exp,
        validation,
        ...(validation === QR_VALIDATION.EXP_CONFLICT
          ? { expCandidates: candidates }
          : {}),
      };
      lots.push(lotEntry);
      if (validation !== QR_VALIDATION.VALID) {
        warningCollector.add(validation, { sku, lot, expCandidates: candidates });
      }
    });
    if (!lots.length) return;

    lots.sort((a, b) => a.lot.localeCompare(b.lot, undefined, { numeric: true }));
    const name = latestNames.get(sku)?.name || '';
    if (!name) warningCollector.add('missing_name', { sku });
    qrProducts[sku] = { sku, name, lots };
  });

  const warningResult = warningCollector.result();
  return {
    qrProducts,
    warehouseRowCount,
    warnings: warningResult.samples,
    warningCount: warningResult.total,
    warningCounts: warningResult.byCode,
  };
}

function countLots(map) {
  return Object.values(map).reduce(
    (total, value) => total + (Array.isArray(value) ? value.length : value?.lots?.length || 0),
    0,
  );
}

export function parseR14102Rows(rows, factorMap = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const r14Columns = detectR14102Columns(safeRows[0]);
  const lotMap = parseLotRows(safeRows, factorMap);
  const inputRowCount = Math.max(0, safeRows.length - 1);

  if (!r14Columns) {
    return {
      lotMap,
      qrProducts: {},
      isR14102: false,
      warnings: [],
      counts: {
        inputRowCount,
        warehouseRowCount: 0,
        lotSkuCount: Object.keys(lotMap).length,
        lotCount: countLots(lotMap),
        qrSkuCount: 0,
        qrLotCount: 0,
        warningCount: 0,
        warningCounts: {},
      },
    };
  }

  const qrResult = buildQrProducts(safeRows, factorMap, r14Columns);
  return {
    lotMap,
    qrProducts: qrResult.qrProducts,
    isR14102: true,
    warnings: qrResult.warnings,
    counts: {
      inputRowCount,
      warehouseRowCount: qrResult.warehouseRowCount,
      lotSkuCount: Object.keys(lotMap).length,
      lotCount: countLots(lotMap),
      qrSkuCount: Object.keys(qrResult.qrProducts).length,
      qrLotCount: countLots(qrResult.qrProducts),
      warningCount: qrResult.warningCount,
      warningCounts: qrResult.warningCounts,
    },
  };
}

export function buildQrPayload(lotOrEntry, expValue) {
  const lot = typeof lotOrEntry === 'object' && lotOrEntry !== null
    ? cellText(lotOrEntry.lot)
    : cellText(lotOrEntry);
  const exp = typeof lotOrEntry === 'object' && lotOrEntry !== null
    ? cellText(lotOrEntry.exp)
    : cellText(expValue);
  return `LOT:${lot}\nEXP:${exp}`;
}

const QR_BYTE_CAPACITY = Object.freeze({
  L: [0, 17, 32, 53],
  M: [0, 14, 26, 42],
  Q: [0, 11, 20, 32],
  H: [0, 7, 14, 24],
});

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value ?? '')).length;
}

export function canEncodeQrVersion(payload, options = {}) {
  const normalizedOptions = typeof options === 'number' ? { version: options } : options;
  const version = Number(normalizedOptions.version ?? 3);
  const errorCorrectionLevel = String(
    normalizedOptions.errorCorrectionLevel ?? 'M',
  ).toUpperCase();
  const capacity = QR_BYTE_CAPACITY[errorCorrectionLevel]?.[version];
  return Number.isFinite(capacity) && utf8ByteLength(payload) <= capacity;
}

export function qrModuleCount(version = 3, quietZoneModules = 4) {
  const numericVersion = Number(version);
  const numericQuietZone = Number(quietZoneModules);
  if (
    !Number.isInteger(numericVersion)
    || numericVersion < 1
    || numericVersion > 40
    || !Number.isFinite(numericQuietZone)
    || numericQuietZone < 0
  ) {
    return null;
  }
  return 17 + (numericVersion * 4) + (numericQuietZone * 2);
}

export function flattenQrProducts(qrProducts = {}) {
  return Object.values(qrProducts).flatMap(product => (
    (product?.lots || []).map(lot => ({
      sku: cellText(product?.sku),
      name: cellText(product?.name),
      ...lot,
      lot: cellText(lot?.lot),
      exp: cellText(lot?.exp),
    }))
  ));
}

function qrSearchRank(row, query) {
  const sku = row.sku.toLocaleLowerCase();
  const lot = row.lot.toLocaleLowerCase();
  const name = row.name.toLocaleLowerCase();
  if (sku === query) return 0;
  if (lot === query) return 1;
  if (sku.startsWith(query)) return 2;
  if (lot.startsWith(query)) return 3;
  if (sku.includes(query)) return 4;
  if (name.includes(query)) return 5;
  if (lot.includes(query)) return 6;
  return Number.POSITIVE_INFINITY;
}

export function searchQrProducts(qrProducts, searchText = '') {
  const rows = Array.isArray(qrProducts) ? qrProducts : flattenQrProducts(qrProducts);
  const query = cellText(searchText).toLocaleLowerCase();
  if (!query) return [...rows];
  return rows
    .map((row, order) => ({ row, order, rank: qrSearchRank(row, query) }))
    .filter(result => Number.isFinite(result.rank))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(result => result.row);
}

export function paginateQrRows(rows, requestedPage = 1, requestedPageSize = 50) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const pageSize = Math.max(1, Math.floor(Number(requestedPageSize) || 50));
  const total = safeRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  const start = (page - 1) * pageSize;
  return {
    items: safeRows.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export const QR_LABEL_SHEET = Object.freeze({
  widthMm: 90,
  heightMm: 60,
  columns: 4,
  rows: 5,
  labelWidthMm: 20,
  labelHeightMm: 10,
  paddingXmm: 2,
  paddingYmm: 2,
  columnGapMm: 2,
  rowGapMm: 1.5,
  capacity: 20,
});

export function splitQrLabelCopies(requestedCopies, requestedCapacity = QR_LABEL_SHEET.capacity) {
  const copies = Math.max(0, Math.floor(Number(requestedCopies) || 0));
  const capacity = Math.max(1, Math.floor(Number(requestedCapacity) || QR_LABEL_SHEET.capacity));
  const sheets = [];

  for (let remaining = copies; remaining > 0; remaining -= capacity) {
    sheets.push(Math.min(capacity, remaining));
  }

  return sheets;
}
