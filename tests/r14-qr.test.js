import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QR_EXPIRY_STATUS,
  QR_VALIDATION,
  R14102HeaderError,
  buildQrPayload,
  canEncodeQrVersion,
  classifyExpiry,
  flattenQrProducts,
  paginateQrRows,
  parseLotRows,
  parseR14102Rows,
  parseTransactionTimestamp,
  qrModuleCount,
  searchQrProducts,
} from '../src/r14QrHelpers.js';

const HEADER = [
  'CF_ITEMNAME',
  'CF_QUANTITY',
  'CF_LOTNO',
  'CF_WAREHOUSE_NAME',
  'CF_UNITNAME',
  'CF_ITEMID',
  'CF_EXPIREDATE_TEXT',
  'TRANDATE',
];

function row({
  name = 'Product',
  qty = '1',
  lot = 'LOT-1',
  warehouse = 'Warehouse',
  unit = 'piece',
  sku = 'SKU-1',
  exp = '31/12/2030',
  transactionDate = '01/01/2026 08:00:00',
} = {}) {
  return [name, qty, lot, warehouse, unit, sku, exp, transactionDate];
}

test('R14.102 is header-driven, preserves leading zeros and filters QR before aggregation', () => {
  const rows = [
    HEADER,
    row({
      sku: '00123',
      lot: '0007',
      name: 'Old warehouse name',
      qty: '2',
      exp: '01/01/2030',
      transactionDate: '02/01/2026 08:00:00',
    }),
    row({
      sku: '00123',
      lot: '0007',
      name: 'Front Store name must not leak',
      warehouse: 'Front Store',
      qty: '3',
      exp: '03/03/2033',
      transactionDate: '05/01/2026 08:00:00',
    }),
    row({
      sku: '00123',
      lot: '0007',
      name: 'Latest warehouse name',
      qty: '-1',
      exp: '02/02/2032',
      transactionDate: '04/01/2026 09:30:00',
    }),
    row({
      sku: '00999',
      lot: '0001',
      warehouse: 'Front Store',
      qty: '4',
      exp: '01/01/2035',
    }),
  ];

  const result = parseR14102Rows(rows, {
    '00123__piece': 10,
    '00999__piece': 2,
  });

  assert.equal(result.isR14102, true);
  assert.deepEqual(result.lotMap, {
    '00123': [{ lot: '0007', qty: 40, exp: '03/03/2033' }],
    '00999': [{ lot: '0001', qty: 8, exp: '01/01/2035' }],
  });
  assert.deepEqual(result.qrProducts, {
    '00123': {
      sku: '00123',
      name: 'Latest warehouse name',
      lots: [{ lot: '0007', exp: '02/02/2032', validation: QR_VALIDATION.VALID }],
    },
  });
  assert.equal(result.counts.warehouseRowCount, 2);
  assert.equal(result.counts.qrSkuCount, 1);
  assert.equal(result.counts.qrLotCount, 1);
});

test('full TRANDATE time selects the latest EXP and exact timestamp conflicts are blocked', () => {
  const rows = [
    HEADER,
    row({
      lot: 'TIME',
      exp: '01/01/2030',
      transactionDate: '10/05/2026 08:15:00',
    }),
    row({
      lot: 'TIME',
      exp: '02/02/2031',
      name: 'Newest by time',
      transactionDate: '10/05/2026 20:45:01',
    }),
    row({
      lot: 'TIE',
      exp: '03/03/2032',
      transactionDate: '11/05/2026 12:00:00',
    }),
    row({
      lot: 'TIE',
      exp: '04/04/2033',
      transactionDate: '11/05/2026 12:00:00',
    }),
  ];

  const result = parseR14102Rows(rows);
  assert.deepEqual(result.qrProducts['SKU-1'], {
    sku: 'SKU-1',
    name: 'Product',
    lots: [
      {
        lot: 'TIE',
        exp: '',
        validation: QR_VALIDATION.EXP_CONFLICT,
        expCandidates: ['03/03/2032', '04/04/2033'],
      },
      { lot: 'TIME', exp: '02/02/2031', validation: QR_VALIDATION.VALID },
    ],
  });
  assert.equal(result.counts.warningCounts.exp_conflict, 1);
  assert.ok(
    parseTransactionTimestamp('10/05/2026 20:45:01')
      > parseTransactionTimestamp('10/05/2026 08:15:00'),
  );
});

test('QR data keeps positive stock only and reports missing or invalid print fields', () => {
  const rows = [
    HEADER,
    row({ lot: 'REMOVED', qty: '2' }),
    row({ lot: 'REMOVED', qty: '-2', transactionDate: '02/01/2026 08:00:00' }),
    row({ lot: '', exp: '31/12/2030', sku: 'MISSING-LOT' }),
    row({ lot: 'MISSING-EXP', exp: '', sku: 'NO-EXP' }),
    row({ lot: 'BAD-EXP', exp: '31/02/2030', sku: 'BAD-EXP-SKU' }),
    row({
      lot: 'BAD-DATE',
      exp: '31/12/2030',
      sku: 'BAD-DATE-SKU',
      transactionDate: 'not a timestamp',
    }),
  ];

  const result = parseR14102Rows(rows);
  assert.equal(result.qrProducts['SKU-1'], undefined);
  assert.equal(
    result.qrProducts['MISSING-LOT'].lots[0].validation,
    QR_VALIDATION.MISSING_LOT,
  );
  assert.equal(
    result.qrProducts['NO-EXP'].lots[0].validation,
    QR_VALIDATION.MISSING_EXP,
  );
  assert.equal(
    result.qrProducts['BAD-EXP-SKU'].lots[0].validation,
    QR_VALIDATION.INVALID_EXP,
  );
  assert.equal(
    result.qrProducts['BAD-DATE-SKU'].lots[0].validation,
    QR_VALIDATION.INVALID_TRANDATE,
  );
  assert.equal(result.counts.qrLotCount, 4);
  assert.equal(result.counts.warningCount, 4);
});

test('NOLOT, NOTLOT and year 9999 remain literal and printable', () => {
  const result = parseR14102Rows([
    HEADER,
    row({ sku: 'A', lot: 'NOLOT', exp: '31/12/9999' }),
    row({ sku: 'B', lot: 'NOTLOT', exp: '01/01/9999' }),
  ]);

  assert.equal(result.qrProducts.A.lots[0].validation, QR_VALIDATION.VALID);
  assert.equal(result.qrProducts.B.lots[0].validation, QR_VALIDATION.VALID);
  assert.equal(
    buildQrPayload(result.qrProducts.A.lots[0]),
    'LOT:NOLOT\nEXP:31/12/9999',
  );
  assert.equal(
    classifyExpiry('31/12/9999', new Date(2026, 6, 29)),
    QR_EXPIRY_STATUS.NO_EXPIRY,
  );
});

test('legacy header and positional R01.119 rows keep operational lotMap behavior', () => {
  const namedLegacy = [
    [
      'cf_lotno',
      'cf_itemid',
      'cf_itemname',
      'cf_warehouse_name',
      'cf_branch_name',
      'cf_quantity',
      'cf_unitname',
    ],
    ['L-1', '00001', 'Legacy product', 'Warehouse', 'Branch', '2', 'box'],
    ['L-1', '00001', 'Legacy product', 'Warehouse', 'Branch', '-1', 'box'],
    ['L-2', '00001', 'Legacy product', 'Warehouse', 'Branch', '0', 'piece'],
  ];
  const parsed = parseR14102Rows(namedLegacy, { '00001__box': 12 });

  assert.equal(parsed.isR14102, false);
  assert.deepEqual(parsed.qrProducts, {});
  assert.deepEqual(parsed.lotMap, {
    '00001': [{ lot: 'L-1', qty: 12 }],
  });

  const positional = [
    ['unknown headers'],
    ['P-LOT', 'P-SKU', '', '', '', '3', 'piece'],
  ];
  assert.deepEqual(parseLotRows(positional), {
    'P-SKU': [{ lot: 'P-LOT', qty: 3 }],
  });
});

test('an R14-looking file with missing or duplicate strict headers is rejected', () => {
  const missingHeader = HEADER.filter(header => header !== 'CF_EXPIREDATE_TEXT');
  assert.throws(
    () => parseR14102Rows([missingHeader]),
    error => (
      error instanceof R14102HeaderError
      && error.code === 'missing_headers'
      && error.missingHeaders.includes('CF_EXPIREDATE_TEXT')
    ),
  );

  const duplicateHeader = [...HEADER, 'CF_LOTNO'];
  assert.throws(
    () => parseR14102Rows([duplicateHeader]),
    error => (
      error instanceof R14102HeaderError
      && error.code === 'duplicate_headers'
      && error.duplicateHeaders.includes('CF_LOTNO')
    ),
  );
});

test('expiry classification distinguishes expired, today, active and invalid values', () => {
  const today = new Date(2026, 6, 29, 18, 30);
  assert.equal(classifyExpiry('28/07/2026', today), QR_EXPIRY_STATUS.EXPIRED);
  assert.equal(classifyExpiry('29/07/2026', today), QR_EXPIRY_STATUS.EXPIRES_TODAY);
  assert.equal(classifyExpiry('30/07/2026', today), QR_EXPIRY_STATUS.VALID);
  assert.equal(classifyExpiry('31/02/2026', today), QR_EXPIRY_STATUS.INVALID);
  assert.equal(classifyExpiry('', today), QR_EXPIRY_STATUS.INVALID);
});

test('QR payload guard uses UTF-8 bytes and Version 3-M capacity', () => {
  const payload = buildQrPayload('LOT-001', '31/12/2030');
  assert.equal(payload, 'LOT:LOT-001\nEXP:31/12/2030');
  assert.equal(canEncodeQrVersion(payload), true);
  assert.equal(canEncodeQrVersion('A'.repeat(42)), true);
  assert.equal(canEncodeQrVersion('A'.repeat(43)), false);
  assert.equal(canEncodeQrVersion('ก'.repeat(15)), false);
  assert.equal(qrModuleCount(3, 4), 37);
  assert.equal(qrModuleCount(0, 4), null);
});

test('search ranks exact SKU/LOT matches and pagination clamps page bounds', () => {
  const products = {
    '100': {
      sku: '100',
      name: 'Alpha cream',
      lots: [{ lot: 'LOT-B', exp: '01/01/2030', validation: QR_VALIDATION.VALID }],
    },
    '200': {
      sku: '200',
      name: 'LOT-B appears in name',
      lots: [{ lot: 'LOT-A', exp: '02/02/2031', validation: QR_VALIDATION.VALID }],
    },
  };

  assert.equal(flattenQrProducts(products).length, 2);
  assert.equal(searchQrProducts(products, '100')[0].sku, '100');
  assert.equal(searchQrProducts(products, 'lot-a')[0].sku, '200');
  assert.deepEqual(paginateQrRows([1, 2, 3], 99, 2), {
    items: [3],
    page: 2,
    pageSize: 2,
    total: 3,
    totalPages: 2,
  });
});
