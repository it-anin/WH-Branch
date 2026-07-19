import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  setDoc,
  terminate,
  writeBatch,
} from 'firebase/firestore';

import {
  buildTopLevelFieldPatch,
  isHistoryExpired,
} from '../src/warehouseHelpers.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const run = Boolean(emulatorHost);

function makeClient(name) {
  const app = initializeApp({ projectId: 'wh-regression', apiKey: 'demo-key', appId: `demo-${name}` }, name);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const [host, port] = emulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  return { app, db };
}

async function closeClient(client) {
  await terminate(client.db);
  await deleteApp(client.app);
}

test('two Firestore clients preserve different top-level box fields', { skip: !run }, async () => {
  const first = makeClient(`first-${Date.now()}`);
  const second = makeClient(`second-${Date.now()}`);
  const id = `PATCH-${Date.now()}`;
  const firstRef = doc(first.db, 'boxes', id);
  const secondRef = doc(second.db, 'boxes', id);
  const base = { id, status: 'exported', note: '', receivingBy: null };

  try {
    await setDoc(firstRef, base);
    const [firstSnapshot, secondSnapshot] = await Promise.all([getDoc(firstRef), getDoc(secondRef)]);
    const noteNext = { ...firstSnapshot.data(), note: 'คลังตรวจแล้ว' };
    const receiveNext = { ...secondSnapshot.data(), receivingBy: { code: 'SSS-01', name: 'สาขา' } };

    await Promise.all([
      setDoc(firstRef, buildTopLevelFieldPatch(firstSnapshot.data(), noteNext, null), { merge: true }),
      setDoc(secondRef, buildTopLevelFieldPatch(secondSnapshot.data(), receiveNext, null), { merge: true }),
    ]);

    const saved = (await getDoc(firstRef)).data();
    assert.equal(saved.note, 'คลังตรวจแล้ว');
    assert.deepEqual(saved.receivingBy, { code: 'SSS-01', name: 'สาขา' });
  } finally {
    await deleteDoc(firstRef).catch(() => {});
    await Promise.all([closeClient(first), closeClient(second)]);
  }
});

test('history deletion persists and 30-day cleanup keeps the boundary', { skip: !run }, async () => {
  const first = makeClient(`history-first-${Date.now()}`);
  const second = makeClient(`history-second-${Date.now()}`);
  const prefix = `H-${Date.now()}`;
  const now = new Date('2026-07-19T12:00:00.000Z');
  const entries = [
    { id: `${prefix}-boundary`, clearedAt: '2026-06-19T12:00:00.000Z' },
    { id: `${prefix}-expired`, clearedAt: '2026-06-19T11:59:59.999Z' },
    { id: `${prefix}-manual`, clearedAt: '2026-07-18T12:00:00.000Z' },
  ];

  try {
    await Promise.all(entries.map(entry => setDoc(doc(first.db, 'history', entry.id), entry)));
    const cleanup = writeBatch(first.db);
    entries.filter(entry => isHistoryExpired(entry.clearedAt, now)).forEach(entry => {
      cleanup.delete(doc(first.db, 'history', entry.id));
    });
    await cleanup.commit();

    assert.equal((await getDoc(doc(second.db, 'history', entries[0].id))).exists(), true);
    assert.equal((await getDoc(doc(second.db, 'history', entries[1].id))).exists(), false);

    await deleteDoc(doc(first.db, 'history', entries[2].id));
    assert.equal((await getDoc(doc(second.db, 'history', entries[2].id))).exists(), false);
  } finally {
    await Promise.all(entries.map(entry => deleteDoc(doc(first.db, 'history', entry.id)).catch(() => {})));
    await Promise.all([closeClient(first), closeClient(second)]);
  }
});

test('warehouse lifecycle persists open to received without orphaning box items', { skip: !run }, async () => {
  const client = makeClient(`flow-${Date.now()}`);
  const id = `FLOW-${Date.now()}`;
  const boxRef = doc(client.db, 'boxes', id);
  const itemsRef = doc(client.db, 'boxItems', id);

  try {
    await setDoc(boxRef, { id, status: 'open', branch: 'SSS' });
    const persistedItems = [{
      sku: 'SKU-1', gotBase: 2, qty: 2,
      scannedLots: [{ lot: 'LOT-01', exp: '31/12/2027', qty: 2, unit: 'ชิ้น' }],
    }];
    await setDoc(itemsRef, { items: persistedItems });
    for (const patch of [
      { status: 'closed' },
      { status: 'exported', pos: 'POS-001' },
      { receivePending: true, receivedBy: { code: 'SSS-01' } },
      { status: 'received', receivePending: false },
    ]) {
      await setDoc(boxRef, patch, { merge: true });
    }

    const [boxSnapshot, itemSnapshot] = await Promise.all([getDoc(boxRef), getDoc(itemsRef)]);
    assert.equal(boxSnapshot.data().status, 'received');
    assert.equal(boxSnapshot.data().receivePending, false);
    assert.equal(boxSnapshot.data().pos, 'POS-001');
    assert.deepEqual(itemSnapshot.data().items, persistedItems);
  } finally {
    await Promise.all([deleteDoc(boxRef).catch(() => {}), deleteDoc(itemsRef).catch(() => {})]);
    await closeClient(client);
  }
});
