import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  buildThermalQrGraphic,
  buildQrPayload,
  classifyExpiry,
  paginateQrLabelItems,
  QR_EXPIRY_STATUS,
  QR_LABEL_SHEET,
  QR_THERMAL_PRINT,
  QR_VALIDATION,
  splitQrLabelCopies,
} from '../r14QrHelpers.js';

const PAGE_SIZE = 50;
const MAX_QR_MODULES = QR_THERMAL_PRINT.maxCoreModules; // QR Version 3
const MAX_PRINT_LABELS = 100;
const PRINT_STYLE_ID = 'product-qr-print-style';
const PRINT_BODY_CLASS = 'product-qr-printing';

const clampCopies = value => Math.min(100, Math.max(1, Number.parseInt(value, 10) || 1));

function qrRowKey(row) {
  return JSON.stringify([row.sku, row.lot, row.exp, row.lotIndex]);
}

function generateQrGraphic(row) {
  const payload = buildQrPayload(row);
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  if (qr.modules.size > MAX_QR_MODULES) {
    throw new Error(`ข้อมูลยาวเกิน QR Version 3 (${qr.modules.size} modules)`);
  }
  return buildThermalQrGraphic(qr.modules);
}

function validationCode(validation) {
  if (validation === false) return 'invalid';
  if (typeof validation === 'string') return validation.trim().toLowerCase();
  if (validation && typeof validation === 'object') {
    return String(
      validation.status
      ?? validation.code
      ?? validation.type
      ?? (validation.valid === false ? 'invalid' : ''),
    ).trim().toLowerCase();
  }
  return '';
}

function getRowState(row) {
  const name = String(row.rawName ?? '').trim();
  const lot = String(row.lot ?? '').trim();
  const exp = String(row.exp ?? '').trim();
  const code = validationCode(row.validation);
  const candidates = Array.isArray(row.expCandidates)
    ? [...new Set(row.expCandidates.map(value => String(value ?? '').trim()).filter(Boolean))]
    : [];

  if (!name) {
    return {
      key: 'missing-name',
      label: 'ไม่มีชื่อสินค้า',
      detail: 'กรุณาตรวจสอบ CF_ITEMNAME ใน R14.102',
      blocked: true,
      tone: 'danger',
    };
  }
  if (
    candidates.length > 1
    || code === QR_VALIDATION.EXP_CONFLICT
    || /conflict|ambiguous|ขัดแย้ง/.test(code)
  ) {
    return {
      key: 'conflict',
      label: 'EXP ขัดแย้ง',
      detail: candidates.length > 1 ? candidates.join(', ') : 'พบ EXP มากกว่าหนึ่งค่า',
      blocked: true,
      tone: 'danger',
    };
  }
  if (
    !lot
    || code === QR_VALIDATION.MISSING_LOT
    || /missing[_ -]?lot|lot[_ -]?missing/.test(code)
  ) {
    return {
      key: 'missing-lot',
      label: 'ไม่มี LOT',
      detail: 'ไม่สามารถสร้าง QR ได้',
      blocked: true,
      tone: 'danger',
    };
  }
  if (
    !exp
    || code === QR_VALIDATION.MISSING_EXP
    || /missing[_ -]?exp|exp[_ -]?missing/.test(code)
  ) {
    return {
      key: 'missing-exp',
      label: 'ไม่มี EXP',
      detail: 'ไม่สามารถสร้าง QR ได้',
      blocked: true,
      tone: 'danger',
    };
  }

  if (
    code === QR_VALIDATION.INVALID_EXP
    || code === QR_VALIDATION.INVALID_TRANDATE
    || !code
    || (code && code !== QR_VALIDATION.VALID)
    || classifyExpiry(exp) === QR_EXPIRY_STATUS.INVALID
  ) {
    return {
      key: 'invalid',
      label: 'ข้อมูลไม่ถูกต้อง',
      detail: code === QR_VALIDATION.INVALID_TRANDATE
        ? 'TRANDATE ไม่ถูกต้อง จึงเลือก EXP ล่าสุดไม่ได้'
        : !code
          ? 'ไม่พบผลการตรวจสอบจาก R14.102'
          : 'ข้อมูลจาก R14.102 ไม่ผ่านการตรวจสอบ',
      blocked: true,
      tone: 'danger',
    };
  }

  const expiryStatus = classifyExpiry(exp);
  if (expiryStatus === QR_EXPIRY_STATUS.EXPIRES_TODAY) {
    return {
      key: 'expires-today',
      label: 'หมดอายุวันนี้',
      detail: 'ต้องยืนยันอีกครั้งก่อนพิมพ์',
      blocked: false,
      warning: true,
      tone: 'danger',
    };
  }
  if (expiryStatus === QR_EXPIRY_STATUS.EXPIRED) {
    return {
      key: 'expired',
      label: 'หมดอายุแล้ว',
      detail: 'ต้องยืนยันอีกครั้งก่อนพิมพ์',
      blocked: false,
      warning: true,
      tone: 'danger',
    };
  }

  return {
    key: 'ready',
    label: 'พร้อมพิมพ์',
    detail: '',
    blocked: false,
    warning: false,
    tone: 'success',
  };
}

function normalizeRows(products) {
  return Object.entries(products || {}).flatMap(([skuKey, product]) => {
    const sku = String(product?.sku ?? skuKey ?? '').trim();
    const rawName = String(product?.name ?? '').trim();
    const name = rawName || sku;
    const lots = Array.isArray(product?.lots) ? product.lots : [];
    return lots.map((lotEntry, lotIndex) => {
      const row = {
        sku,
        name,
        rawName,
        lot: String(lotEntry?.lot ?? '').trim(),
        exp: String(lotEntry?.exp ?? '').trim(),
        validation: lotEntry?.validation,
        expCandidates: lotEntry?.expCandidates,
        lotIndex,
      };
      return { ...row, state: getRowState(row) };
    });
  }).sort((a, b) => (
    a.sku.localeCompare(b.sku, 'th', { numeric: true })
    || a.lot.localeCompare(b.lot, 'th', { numeric: true })
  ));
}

function formatImportedAt(value) {
  if (!value) return '';
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function lineFontSize(value, baseLength = 0) {
  const length = String(value ?? '').length + baseLength;
  if (length > 24) return '0.78mm';
  if (length > 18) return '0.92mm';
  if (length > 14) return '1.05mm';
  return '1.18mm';
}

function ProductQrLabel({ row, graphic, preview = false, unit: requestedUnit }) {
  const unit = requestedUnit ?? (preview ? '14px' : '1mm');
  const requestedSizeMm = Number(graphic?.sizeMm);
  const qrSizeMm = Number.isFinite(requestedSizeMm) && requestedSizeMm > 0
    ? Math.min(QR_THERMAL_PRINT.maxOuterSizeMm, requestedSizeMm)
    : QR_THERMAL_PRINT.maxOuterSizeMm;

  return (
    <div
      className="product-qr-label"
      style={{
        '--qr-label-unit': unit,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--qr-label-unit) * 0.12)',
        padding: 'calc(var(--qr-label-unit) * 0.12)',
        background: '#fff',
        color: '#000',
        fontFamily: 'Arial, Tahoma, sans-serif',
      }}
    >
      <div style={{
        flex: '0 0 calc(var(--qr-label-unit) * 9.65)',
        width: 'calc(var(--qr-label-unit) * 9.65)',
        height: 'calc(var(--qr-label-unit) * 9.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {graphic?.path && graphic?.totalModules ? (
          <svg
            className="product-qr-code"
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${graphic.totalModules} ${graphic.totalModules}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            shapeRendering="crispEdges"
            colorRendering="optimizeSpeed"
            focusable="false"
            aria-hidden="true"
            style={{
              display: 'block',
              width: `calc(var(--qr-label-unit) * ${qrSizeMm})`,
              height: `calc(var(--qr-label-unit) * ${qrSizeMm})`,
              flex: '0 0 auto',
              background: '#fff',
            }}
          >
            <rect
              className="product-qr-code-bg"
              width={graphic.totalModules}
              height={graphic.totalModules}
              fill="#fff"
            />
            <path className="product-qr-code-modules" d={graphic.path} fill="#000" />
          </svg>
        ) : (
          <div style={{
            width: '88%',
            height: '88%',
            display: 'grid',
            placeItems: 'center',
            border: '1px dashed #777',
            fontSize: 'calc(var(--qr-label-unit) * 0.75)',
          }}>
            QR
          </div>
        )}
      </div>

      <div style={{
        minWidth: 0,
        flex: 1,
        height: 'calc(var(--qr-label-unit) * 9.5)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 'calc(var(--qr-label-unit) * 1.22)',
          fontWeight: 800,
          lineHeight: 1.05,
          whiteSpace: 'nowrap',
        }}>
          {row.sku}
        </div>
        <div
          title={row.name}
          style={{
            marginTop: 'calc(var(--qr-label-unit) * 0.1)',
            fontSize: 'calc(var(--qr-label-unit) * 1.02)',
            fontWeight: 600,
            lineHeight: 1.05,
            height: 'calc(var(--qr-label-unit) * 2.15)',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {row.name}
        </div>
        <div style={{
          marginTop: 'calc(var(--qr-label-unit) * 0.12)',
          borderTop: 'calc(var(--qr-label-unit) * 0.06) solid #000',
          paddingTop: 'calc(var(--qr-label-unit) * 0.12)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: preview
            ? `calc(var(--qr-label-unit) * ${Number.parseFloat(lineFontSize(row.lot, 4))})`
            : lineFontSize(row.lot, 4),
          fontWeight: 800,
          lineHeight: 1.12,
          whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
        }}>
          LOT:{row.lot}
        </div>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: preview
            ? `calc(var(--qr-label-unit) * ${Number.parseFloat(lineFontSize(row.exp, 4))})`
            : lineFontSize(row.exp, 4),
          fontWeight: 800,
          lineHeight: 1.12,
          whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
        }}>
          EXP:{row.exp}
        </div>
      </div>
    </div>
  );
}

function ProductQrSheet({ labels = [], preview = false }) {
  const unit = preview ? '5px' : '1mm';
  const safeLabels = Array.isArray(labels)
    ? labels.slice(0, QR_LABEL_SHEET.capacity)
    : [];

  return (
    <div
      className={preview ? 'product-qr-sheet-preview' : 'product-qr-print-sheet'}
      style={{
        '--qr-sheet-unit': unit,
        width: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.widthMm})`,
        height: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.heightMm})`,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: `repeat(${QR_LABEL_SHEET.columns}, calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.labelWidthMm}))`,
        gridTemplateRows: `repeat(${QR_LABEL_SHEET.rows}, calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.labelHeightMm}))`,
        columnGap: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.columnGapMm})`,
        rowGap: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.rowGapMm})`,
        padding: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.paddingYmm}) calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.paddingXmm})`,
        overflow: 'hidden',
        background: preview ? '#dceff0' : '#fff',
      }}
    >
      {Array.from({ length: QR_LABEL_SHEET.capacity }, (_, slotIndex) => {
        const label = safeLabels[slotIndex];
        return (
          <div
            className="product-qr-print-slot"
            key={slotIndex}
            style={{
              width: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.labelWidthMm})`,
              height: `calc(var(--qr-sheet-unit) * ${QR_LABEL_SHEET.labelHeightMm})`,
              boxSizing: 'border-box',
              overflow: 'hidden',
              border: preview ? '1px dashed rgba(45, 90, 90, .35)' : 'none',
              borderRadius: preview ? 'calc(var(--qr-sheet-unit) * 0.7)' : 0,
              background: '#fff',
            }}
          >
            {label && (
              <ProductQrLabel
                row={label.row}
                graphic={label.graphic}
                preview={preview}
                unit={unit}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ state }) {
  const colors = state.tone === 'success'
    ? { color: '#39752a', background: '#eaf5e5', border: '#8aba75' }
    : { color: '#b42d25', background: '#fdebea', border: '#e8a39e' };
  return (
    <span
      title={state.detail || state.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        padding: '2px 8px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: colors.color,
        background: colors.background,
      }}
    >
      {state.label}
    </span>
  );
}

export default function ProductQrPage({
  products = {},
  meta = null,
  setTab,
  showToast,
  loaded = true,
  loadError = null,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [copies, setCopies] = useState(1);
  const [qrGraphic, setQrGraphic] = useState(null);
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [printJob, setPrintJob] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState(() => new Set());
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const generationRef = useRef(0);
  const selectAllRef = useRef(null);

  const rows = useMemo(() => normalizeRows(products), [products]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th-TH');
    if (!query) return rows;
    return rows.filter(row => (
      row.sku.toLocaleLowerCase('th-TH').includes(query)
      || row.name.toLocaleLowerCase('th-TH').includes(query)
      || row.lot.toLocaleLowerCase('th-TH').includes(query)
    ));
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedRows = useMemo(
    () => rows.filter(row => selectedRowKeys.has(qrRowKey(row))),
    [rows, selectedRowKeys],
  );
  const selectableVisibleRows = visibleRows.filter(row => !row.state.blocked);
  const selectedVisibleCount = selectableVisibleRows.filter(
    row => selectedRowKeys.has(qrRowKey(row)),
  ).length;
  const allVisibleSelected = selectableVisibleRows.length > 0
    && selectedVisibleCount === selectableVisibleRows.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    setPage(1);
  }, [search, products]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    const validKeys = new Set(
      rows.filter(row => !row.state.blocked).map(qrRowKey),
    );
    setSelectedRowKeys(current => {
      const next = new Set([...current].filter(key => validKeys.has(key)));
      if (next.size === current.size && [...next].every(key => current.has(key))) return current;
      return next;
    });
  }, [rows]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  useEffect(() => () => {
    generationRef.current += 1;
    document.getElementById(PRINT_STYLE_ID)?.remove();
    document.body.classList.remove(PRINT_BODY_CLASS);
  }, []);

  useEffect(() => {
    if (!printJob) return undefined;

    let cleaned = false;
    let fallbackTimer;
    let firstFrame;
    let secondFrame;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener('afterprint', cleanup);
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      document.getElementById(PRINT_STYLE_ID)?.remove();
      document.body.classList.remove(PRINT_BODY_CLASS);
      setPrintJob(null);
    };

    document.getElementById(PRINT_STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    style.textContent = `
      @media print {
        @page {
          size: ${QR_LABEL_SHEET.widthMm}mm ${QR_LABEL_SHEET.heightMm}mm !important;
          margin: 0 !important;
        }
        html, body {
          width: ${QR_LABEL_SHEET.widthMm}mm !important;
          min-width: ${QR_LABEL_SHEET.widthMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: visible !important;
        }
        body.${PRINT_BODY_CLASS} > * { display: none !important; }
        body.${PRINT_BODY_CLASS} > .product-qr-print-root {
          display: block !important;
          width: ${QR_LABEL_SHEET.widthMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body.${PRINT_BODY_CLASS} > .print-only-label { display: none !important; }
        .product-qr-print-sheet {
          display: grid !important;
          position: relative !important;
          width: ${QR_LABEL_SHEET.widthMm}mm !important;
          height: ${QR_LABEL_SHEET.heightMm}mm !important;
          margin: 0 !important;
          padding: ${QR_LABEL_SHEET.paddingYmm}mm ${QR_LABEL_SHEET.paddingXmm}mm !important;
          grid-template-columns: repeat(${QR_LABEL_SHEET.columns}, ${QR_LABEL_SHEET.labelWidthMm}mm) !important;
          grid-template-rows: repeat(${QR_LABEL_SHEET.rows}, ${QR_LABEL_SHEET.labelHeightMm}mm) !important;
          column-gap: ${QR_LABEL_SHEET.columnGapMm}mm !important;
          row-gap: ${QR_LABEL_SHEET.rowGapMm}mm !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          break-after: page;
          page-break-after: always;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .product-qr-print-sheet:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .product-qr-print-slot {
          width: ${QR_LABEL_SHEET.labelWidthMm}mm !important;
          height: ${QR_LABEL_SHEET.labelHeightMm}mm !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }
        .product-qr-code {
          shape-rendering: crispEdges !important;
          color-rendering: optimizeSpeed !important;
          opacity: 1 !important;
          filter: none !important;
        }
        .product-qr-code-bg { fill: #fff !important; }
        .product-qr-code-modules {
          fill: #000 !important;
          stroke: none !important;
          opacity: 1 !important;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add(PRINT_BODY_CLASS);
    window.addEventListener('afterprint', cleanup, { once: true });

    const waitForImage = async image => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode();
          return;
        }
        if (image.complete) return;
        await new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      } catch {
        // ถ้า browser decode SVG data URI ไม่ได้ ให้ print ต่อเพื่อให้ dialog ยังเปิดได้
      }
    };

    const prepareAndPrint = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        // font fallback ที่กำหนดไว้บนฉลากยังใช้งานได้
      }
      if (cleaned) return;

      const printRoot = document.querySelector('body > .product-qr-print-root');
      const images = printRoot ? [...printRoot.querySelectorAll('img')] : [];
      await Promise.all(images.map(waitForImage));
      if (cleaned) return;

      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          try {
            window.print();
          } catch {
            cleanup();
          } finally {
            // afterprint เป็นตัว cleanup หลัก; timer ป้องกัน browser ที่ไม่ส่ง event นี้
            if (!cleaned) fallbackTimer = window.setTimeout(cleanup, 60_000);
          }
        });
      });
    };
    prepareAndPrint();

    return cleanup;
  }, [printJob]);

  const notify = (message, type = 'warn') => {
    if (typeof showToast === 'function') showToast(message, type);
  };

  const toggleRowSelection = row => {
    if (row.state.blocked || bulkLoading || printJob) return;
    const key = qrRowKey(row);
    const alreadySelected = selectedRowKeys.has(key);
    if (!alreadySelected && selectedRowKeys.size >= MAX_PRINT_LABELS) {
      notify(`เลือกพิมพ์ได้สูงสุด ${MAX_PRINT_LABELS} รายการต่อครั้ง`);
      return;
    }
    setSelectedRowKeys(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    if (bulkLoading || printJob || selectableVisibleRows.length === 0) return;
    const visibleKeys = selectableVisibleRows.map(qrRowKey);
    if (allVisibleSelected) {
      setSelectedRowKeys(current => {
        const next = new Set(current);
        visibleKeys.forEach(key => next.delete(key));
        return next;
      });
      return;
    }

    const missingKeys = visibleKeys.filter(key => !selectedRowKeys.has(key));
    if (selectedRowKeys.size + missingKeys.length > MAX_PRINT_LABELS) {
      notify(`เลือกทั้งหมดในหน้านี้ไม่ได้ เพราะเกิน ${MAX_PRINT_LABELS} รายการ`);
      return;
    }
    setSelectedRowKeys(current => new Set([...current, ...missingKeys]));
  };

  const clearSelection = () => {
    if (bulkLoading || printJob) return;
    setSelectedRowKeys(new Set());
  };

  const closePreview = () => {
    generationRef.current += 1;
    setSelected(null);
    setQrGraphic(null);
    setQrError('');
    setQrLoading(false);
    setCopies(1);
  };

  const closeBulkPreview = () => {
    if (printJob) return;
    generationRef.current += 1;
    setBulkPreview(null);
    setBulkLoading(false);
  };

  const openPreview = async row => {
    if (row.state.blocked) {
      notify(`${row.state.label}: ${row.state.detail || 'ไม่สามารถพิมพ์ได้'}`);
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSelected(row);
    setCopies(1);
    setQrGraphic(null);
    setQrError('');
    setQrLoading(true);

    try {
      const graphic = generateQrGraphic(row);
      if (generationRef.current !== generation) return;
      setQrGraphic(graphic);
    } catch (error) {
      if (generationRef.current !== generation) return;
      const message = error?.message || 'สร้าง QR ไม่สำเร็จ';
      setQrError(message);
      notify(message);
    } finally {
      if (generationRef.current === generation) setQrLoading(false);
    }
  };

  const openBulkPreview = async () => {
    if (selectedRows.length === 0 || bulkLoading || printJob) return;
    if (selectedRows.length > MAX_PRINT_LABELS) {
      notify(`เลือกพิมพ์ได้สูงสุด ${MAX_PRINT_LABELS} รายการต่อครั้ง`);
      return;
    }
    const blockedRow = selectedRows.find(row => row.state.blocked);
    if (blockedRow) {
      notify(`${blockedRow.sku} LOT ${blockedRow.lot}: ${blockedRow.state.label}`);
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setBulkLoading(true);
    try {
      const labels = await Promise.all(selectedRows.map(async row => {
        try {
          return { row, graphic: generateQrGraphic(row) };
        } catch (error) {
          throw new Error(`SKU ${row.sku} LOT ${row.lot}: ${error?.message || 'สร้าง QR ไม่สำเร็จ'}`);
        }
      }));
      if (generationRef.current !== generation) return;
      setBulkPreview({ labels });
    } catch (error) {
      if (generationRef.current !== generation) return;
      notify(error?.message || 'สร้าง QR หลายรายการไม่สำเร็จ');
    } finally {
      if (generationRef.current === generation) setBulkLoading(false);
    }
  };

  const startPrint = () => {
    if (!selected || selected.state.blocked || qrLoading || !qrGraphic || qrError) return;

    if (selected.state.warning) {
      const confirmed = window.confirm(
        `${selected.state.label}\nSKU ${selected.sku}\nLOT ${selected.lot}\nEXP ${selected.exp}\n\nยืนยันพิมพ์สติ๊กเกอร์หรือไม่?`,
      );
      if (!confirmed) return;
    }

    const normalizedCopies = clampCopies(copies);
    setCopies(normalizedCopies);
    setPrintJob({
      labels: Array.from(
        { length: normalizedCopies },
        () => ({ row: selected, graphic: qrGraphic }),
      ),
    });
  };

  const startBulkPrint = () => {
    const labels = bulkPreview?.labels || [];
    if (labels.length === 0 || bulkLoading || printJob) return;
    const currentRowsByKey = new Map(rows.map(row => [qrRowKey(row), row]));
    const staleLabel = labels.find(label => !currentRowsByKey.has(qrRowKey(label.row)));
    if (staleLabel) {
      notify(`ข้อมูล SKU ${staleLabel.row.sku} LOT ${staleLabel.row.lot} เปลี่ยนแล้ว กรุณาเลือกใหม่`);
      return;
    }
    const refreshedLabels = labels.map(label => ({
      ...label,
      row: currentRowsByKey.get(qrRowKey(label.row)),
    }));
    const blockedLabel = refreshedLabels.find(label => label.row.state.blocked);
    if (blockedLabel) {
      notify(`${blockedLabel.row.sku} LOT ${blockedLabel.row.lot}: ${blockedLabel.row.state.label}`);
      return;
    }

    const warnings = refreshedLabels.filter(label => label.row.state.warning);
    if (warnings.length > 0) {
      const examples = warnings.slice(0, 5).map(
        label => `• SKU ${label.row.sku} · LOT ${label.row.lot} · ${label.row.state.label}`,
      ).join('\n');
      const remaining = warnings.length > 5 ? `\nและอีก ${warnings.length - 5} รายการ` : '';
      const confirmed = window.confirm(
        `พบสินค้าหมดอายุหรือหมดอายุวันนี้ ${warnings.length} รายการ\n${examples}${remaining}\n\nยืนยันพิมพ์ทั้งหมดหรือไม่?`,
      );
      if (!confirmed) return;
    }

    setPrintJob({ labels: refreshedLabels });
  };

  const fileName = meta?.fileName ?? meta?.filename ?? meta?.sourceFile ?? '';
  const importedAt = formatImportedAt(
    meta?.importedAt
    ?? meta?.updatedAt
    ?? meta?.uploadedAt
    ?? meta?.fileDate,
  );
  const productCount = Object.keys(products || {}).length;
  const normalizedCopyCount = clampCopies(copies);
  const previewSheetCounts = splitQrLabelCopies(normalizedCopyCount);
  const previewFilledCount = previewSheetCounts[0] ?? 1;
  const singlePreviewLabels = selected
    ? Array.from({ length: previewFilledCount }, () => ({ row: selected, graphic: qrGraphic }))
    : [];
  const bulkPreviewSheets = paginateQrLabelItems(bulkPreview?.labels || []);
  const bulkWarningCount = (bulkPreview?.labels || []).filter(
    label => label.row.state.warning,
  ).length;
  const printSheets = paginateQrLabelItems(printJob?.labels || []);

  return (
    <div style={{ fontFamily: 'system-ui, Tahoma, sans-serif' }}>
      <style>{`
        .product-qr-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(30, 27, 22, 0.58);
        }
        .product-qr-modal {
          width: min(680px, 96vw);
          max-height: 94vh;
          overflow: auto;
          box-sizing: border-box;
          padding: 20px;
          border: 1px solid #d6d0c4;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 18px 50px rgba(0,0,0,.25);
        }
        .product-qr-print-root { display: none; }
        @media (max-width: 760px) {
          .product-qr-table-wrap { overflow-x: auto; }
          .product-qr-preview-scale { transform: scale(.82); transform-origin: center; margin: -12px -28px; }
        }
        @media print {
          .product-qr-modal-backdrop { display: none !important; }
        }
      `}</style>

      <div className="frame">
        <div className="frame-header" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="hand" style={{ fontSize: 24 }}>QR สินค้า</div>
            <div style={{ marginTop: 3, color: 'var(--mute)', fontSize: 12 }}>
              กระดาษ 90×60 มม. · สติ๊กเกอร์ 20×10 มม. · 4×5 ดวงต่อแผ่น
            </div>
          </div>
          <div style={{
            marginLeft: 'auto',
            textAlign: 'right',
            color: 'var(--mute)',
            fontSize: 11,
            lineHeight: 1.5,
          }}>
            {fileName ? <div><strong>ไฟล์:</strong> {fileName}</div> : <div>ยังไม่มีข้อมูลไฟล์ R14.102</div>}
            {importedAt && <div><strong>นำเข้า:</strong> {importedAt}</div>}
            <div>{productCount.toLocaleString()} SKU · {rows.length.toLocaleString()} SKU+LOT</div>
          </div>
        </div>

        {!loaded ? (
          <div style={{
            minHeight: 280,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            color: 'var(--mute)',
          }}>
            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⌛</div>
              <div style={{ fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
                กำลังโหลดข้อมูล QR สินค้า...
              </div>
              <div style={{ fontSize: 13 }}>กำลังอ่านดัชนี Warehouse จาก Firestore</div>
            </div>
          </div>
        ) : loadError ? (
          <div style={{
            minHeight: 280,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            color: '#a82821',
          }}>
            <div>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠</div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>โหลดข้อมูล QR ไม่สำเร็จ</div>
              <div style={{ maxWidth: 520, fontSize: 12, overflowWrap: 'anywhere' }}>
                {String(loadError?.message || loadError)}
              </div>
              {typeof setTab === 'function' && (
                <button className="btn ghost" onClick={() => setTab('list')} style={{ marginTop: 16 }}>
                  ไปหน้านำเข้า R14.102
                </button>
              )}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            minHeight: 280,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            color: 'var(--mute)',
          }}>
            <div>
              <div style={{ fontSize: 42, marginBottom: 8 }}>▦</div>
              <div style={{ fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
                ยังไม่มีข้อมูล QR สินค้า
              </div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                กรุณานำเข้าไฟล์ R14.102 (LOT+EXP) ใหม่หนึ่งครั้ง
              </div>
              {typeof setTab === 'function' && (
                <button className="btn primary" onClick={() => setTab('list')}>
                  ไปหน้านำเข้า R14.102
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}>
              <input
                className="input"
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="ค้นหา SKU, ชื่อสินค้า หรือ LOT..."
                aria-label="ค้นหาสินค้าสำหรับพิมพ์ QR"
                style={{ width: 'min(480px, 100%)', flex: '1 1 320px' }}
              />
              <div style={{ color: 'var(--mute)', fontSize: 12 }}>
                พบ {filteredRows.length.toLocaleString()} รายการ
              </div>
            </div>

            {selectedRows.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 12,
                padding: '10px 12px',
                border: '1px solid #8aba75',
                borderRadius: 9,
                background: '#f1f8ed',
              }}>
                <div>
                  <div style={{ color: '#39752a', fontWeight: 800 }}>
                    เลือกแล้ว {selectedRows.length.toLocaleString()} รายการ ·
                    {' '}{Math.ceil(selectedRows.length / QR_LABEL_SHEET.capacity).toLocaleString()} แผ่น
                  </div>
                  <div style={{ marginTop: 2, color: 'var(--mute)', fontSize: 11 }}>
                    พิมพ์รายการละ 1 ดวง · เลือกได้สูงสุด {MAX_PRINT_LABELS} รายการต่อครั้ง
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn sm ghost"
                    type="button"
                    onClick={clearSelection}
                    disabled={bulkLoading || !!printJob}
                  >
                    ล้างที่เลือก
                  </button>
                  <button
                    className="btn sm primary"
                    type="button"
                    onClick={openBulkPreview}
                    disabled={bulkLoading || !!printJob}
                  >
                    {bulkLoading
                      ? 'กำลังสร้าง QR...'
                      : `พิมพ์รายการที่เลือก (${selectedRows.length.toLocaleString()})`}
                  </button>
                </div>
              </div>
            )}

            <div
              className="product-qr-table-wrap"
              style={{ border: '1.5px solid var(--line)', borderRadius: 9, background: '#fff' }}
            >
              <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 42, textAlign: 'center' }}>
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        disabled={selectableVisibleRows.length === 0 || bulkLoading || !!printJob}
                        aria-label="เลือกสินค้าที่พิมพ์ได้ทั้งหมดในหน้านี้"
                        title="เลือกสินค้าที่พิมพ์ได้ทั้งหมดในหน้านี้"
                        style={{ width: 17, height: 17, cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ width: 105 }}>SKU</th>
                    <th>ชื่อสินค้า</th>
                    <th style={{ width: 125 }}>LOT</th>
                    <th style={{ width: 105 }}>EXP</th>
                    <th style={{ width: 125 }}>สถานะ</th>
                    <th style={{ width: 72, textAlign: 'center' }}>QR</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => {
                    const key = qrRowKey(row);
                    const isSelected = selectedRowKeys.has(key);
                    const selectionDisabled = row.state.blocked
                      || bulkLoading
                      || !!printJob
                      || (!isSelected && selectedRowKeys.size >= MAX_PRINT_LABELS);
                    return (
                      <tr key={key} style={{ background: isSelected ? '#f5faf2' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(row)}
                            disabled={selectionDisabled}
                            aria-label={`เลือก SKU ${row.sku} LOT ${row.lot}`}
                            title={row.state.blocked
                              ? `${row.state.label}: ${row.state.detail}`
                              : 'เลือกพิมพ์รายการนี้ร่วมกับรายการอื่น'}
                            style={{ width: 17, height: 17, cursor: selectionDisabled ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                        <td className="mono" style={{ fontWeight: 700 }}>{row.sku}</td>
                        <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} title={row.name}>
                          {row.name}
                        </td>
                        <td className="mono">{row.lot || '—'}</td>
                        <td className="mono">{row.exp || '—'}</td>
                        <td>
                          <StatusBadge state={row.state} />
                          {row.state.detail && (
                            <div style={{
                              color: row.state.tone === 'danger' ? '#b42d25' : 'var(--mute)',
                              fontSize: 10,
                              marginTop: 3,
                            }}>
                              {row.state.detail}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn sm primary"
                            type="button"
                            onClick={() => openPreview(row)}
                            disabled={row.state.blocked || bulkLoading || !!printJob}
                            title={row.state.blocked ? `${row.state.label}: ${row.state.detail}` : 'ดูตัวอย่าง QR'}
                            style={{
                              minWidth: 48,
                              opacity: row.state.blocked || bulkLoading || printJob ? 0.42 : 1,
                              cursor: row.state.blocked || bulkLoading || printJob ? 'not-allowed' : 'pointer',
                            }}
                          >
                            QR
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: 'var(--mute)' }}>
                        ไม่พบ SKU, ชื่อสินค้า หรือ LOT ที่ค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 12,
              }}>
                <div style={{ color: 'var(--mute)', fontSize: 12 }}>
                  หน้า {page.toLocaleString()} / {pageCount.toLocaleString()} · แสดงไม่เกิน {PAGE_SIZE} รายการต่อหน้า
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn sm ghost"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                  >
                    ← ก่อนหน้า
                  </button>
                  <button
                    className="btn sm ghost"
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                  >
                    ถัดไป →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && createPortal(
        <div
          className="product-qr-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !printJob) closePreview();
          }}
        >
          <div
            className="product-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-qr-preview-title"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div id="product-qr-preview-title" style={{ fontSize: 20, fontWeight: 800 }}>
                  ตัวอย่างแผ่นสติ๊กเกอร์ QR
                </div>
                <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 2 }}>
                  SKU {selected.sku} · LOT {selected.lot}
                </div>
              </div>
              <button
                className="btn sm ghost"
                type="button"
                onClick={closePreview}
                disabled={!!printJob}
                aria-label="ปิดตัวอย่าง"
                style={{ marginLeft: 'auto' }}
              >
                ✕
              </button>
            </div>

            {selected.state.warning && (
              <div style={{
                marginTop: 14,
                border: '1px solid #e4a09a',
                borderRadius: 8,
                padding: '9px 11px',
                color: '#a82821',
                background: '#fdebea',
                fontWeight: 700,
                fontSize: 13,
              }}>
                ⚠ {selected.state.label} — ระบบจะขอยืนยันอีกครั้งก่อนเปิดหน้าพิมพ์
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '20px 0 14px',
              overflow: 'hidden',
            }}>
              <div className="product-qr-preview-scale">
                <div style={{
                  boxSizing: 'content-box',
                  overflow: 'hidden',
                  border: '1px solid #aaa',
                  boxShadow: '0 4px 14px rgba(0,0,0,.12)',
                  background: '#fff',
                }}>
                  <ProductQrSheet
                    labels={singlePreviewLabels}
                    preview
                  />
                </div>
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              color: 'var(--mute)',
              fontSize: 11,
              marginBottom: 14,
            }}>
              ตัวอย่างแผ่นที่ 1 จาก {previewSheetCounts.length} แผ่น ·
              {' '}{previewFilledCount}/{QR_LABEL_SHEET.capacity} ดวงในแผ่นแรก
            </div>

            {qrLoading && (
              <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 13, marginBottom: 12 }}>
                กำลังสร้าง QR...
              </div>
            )}
            {qrError && (
              <div style={{
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 8,
                color: '#a82821',
                background: '#fdebea',
                fontSize: 12,
              }}>
                สร้าง QR ไม่สำเร็จ: {qrError}
              </div>
            )}

            <div style={{
              marginBottom: 14,
              padding: '8px 10px',
              borderRadius: 8,
              color: '#594c37',
              background: '#fff7df',
              fontSize: 12,
              fontWeight: 700,
              textAlign: 'center',
            }}>
              ตั้งค่าไดรเวอร์: กระดาษ 90×60 มม. · Margins None · Scale 100% · Copies 1
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'end',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              borderTop: '1px solid var(--line)',
              paddingTop: 14,
            }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>
                จำนวนสติ๊กเกอร์ ({previewSheetCounts.length} แผ่น)
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={copies}
                  onChange={event => setCopies(clampCopies(event.target.value))}
                  onBlur={() => setCopies(clampCopies(copies))}
                  disabled={!!printJob}
                  style={{ display: 'block', width: 100, marginTop: 4, textAlign: 'center' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn ghost" type="button" onClick={closePreview} disabled={!!printJob}>
                  ยกเลิก
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={startPrint}
                  disabled={qrLoading || !qrGraphic || !!qrError || !!printJob}
                  style={{
                    opacity: qrLoading || !qrGraphic || qrError || printJob ? 0.45 : 1,
                    cursor: qrLoading || !qrGraphic || qrError || printJob ? 'not-allowed' : 'pointer',
                  }}
                >
                  {printJob ? 'กำลังเปิดหน้าพิมพ์...' : `พิมพ์ ${normalizedCopyCount} ดวง`}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {bulkPreview && createPortal(
        <div
          className="product-qr-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !printJob) closeBulkPreview();
          }}
        >
          <div
            className="product-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-qr-bulk-preview-title"
            style={{ width: 'min(760px, 96vw)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div id="product-qr-bulk-preview-title" style={{ fontSize: 20, fontWeight: 800 }}>
                  ตัวอย่างพิมพ์ QR หลายรายการ
                </div>
                <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 2 }}>
                  {bulkPreview.labels.length.toLocaleString()} รายการ ·
                  {' '}{bulkPreviewSheets.length.toLocaleString()} แผ่น · รายการละ 1 ดวง
                </div>
              </div>
              <button
                className="btn sm ghost"
                type="button"
                onClick={closeBulkPreview}
                disabled={!!printJob}
                aria-label="ปิดตัวอย่างหลายรายการ"
                style={{ marginLeft: 'auto' }}
              >
                ✕
              </button>
            </div>

            {bulkWarningCount > 0 && (
              <div style={{
                marginTop: 14,
                border: '1px solid #e4a09a',
                borderRadius: 8,
                padding: '9px 11px',
                color: '#a82821',
                background: '#fdebea',
                fontWeight: 700,
                fontSize: 13,
              }}>
                ⚠ มีสินค้าหมดอายุหรือหมดอายุวันนี้ {bulkWarningCount.toLocaleString()} รายการ
                {' '}ระบบจะขอยืนยันอีกครั้งก่อนพิมพ์
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '20px 0 10px',
              overflow: 'hidden',
            }}>
              <div className="product-qr-preview-scale">
                <div style={{
                  boxSizing: 'content-box',
                  overflow: 'hidden',
                  border: '1px solid #aaa',
                  boxShadow: '0 4px 14px rgba(0,0,0,.12)',
                  background: '#fff',
                }}>
                  <ProductQrSheet labels={bulkPreviewSheets[0] || []} preview />
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 11, marginBottom: 12 }}>
              ตัวอย่างแผ่นที่ 1 จาก {bulkPreviewSheets.length.toLocaleString()} แผ่น
              {bulkPreview.labels.length > QR_LABEL_SHEET.capacity
                ? ` · แสดง ${QR_LABEL_SHEET.capacity} รายการแรก`
                : ''}
            </div>

            <div style={{
              maxHeight: 160,
              overflow: 'auto',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: '#fff',
            }}>
              {bulkPreview.labels.map(({ row }, index) => (
                <div
                  key={qrRowKey(row)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px minmax(90px, .8fr) minmax(100px, 1fr) minmax(95px, .8fr)',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 9px',
                    borderBottom: index < bulkPreview.labels.length - 1 ? '1px solid var(--line)' : 'none',
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: 'var(--mute)', textAlign: 'right' }}>{index + 1}.</span>
                  <span className="mono" style={{ fontWeight: 800 }}>{row.sku}</span>
                  <span className="mono">LOT {row.lot}</span>
                  <span className="mono">EXP {row.exp}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 12,
              padding: '8px 10px',
              borderRadius: 8,
              color: '#594c37',
              background: '#fff7df',
              fontSize: 12,
              fontWeight: 700,
              textAlign: 'center',
            }}>
              ตั้งค่าไดรเวอร์: กระดาษ 90×60 มม. · Margins None · Scale 100% · Copies 1
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 14,
              borderTop: '1px solid var(--line)',
              paddingTop: 14,
            }}>
              <button className="btn ghost" type="button" onClick={closeBulkPreview} disabled={!!printJob}>
                ยกเลิก
              </button>
              <button className="btn primary" type="button" onClick={startBulkPrint} disabled={!!printJob}>
                {printJob
                  ? 'กำลังเปิดหน้าพิมพ์...'
                  : `พิมพ์ ${bulkPreview.labels.length.toLocaleString()} รายการ`}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {printJob && createPortal(
        <div className="product-qr-print-root" aria-hidden="true">
          {printSheets.map((labels, sheetIndex) => (
            <ProductQrSheet
              key={sheetIndex}
              labels={labels}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
