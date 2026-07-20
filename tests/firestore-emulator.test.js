import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  query,
  setDoc,
  terminate,
  where,
  writeBatch,
} from 'firebase/firestore';

import {
  buildTopLevelFieldPatch,
  isHistoryExpired,
  normalizeReceiveProblem,
} from '../src/warehouseHelpers.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const run = Boolean(emulatorHost);
const testProjectId = process.env.GCLOUD_PROJECT || 'wh-regression';

function makeClient(name) {
  const app = initializeApp({ projectId: testProjectId, apiKey: 'demo-key', appId: `demo-${name}` }, name);
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

test('receive problem drafts reload, update per SKU, and submit atomically with the box', { skip: !run }, async () => {
  const pda = makeClient(`problem-pda-${Date.now()}`);
  const warehouse = makeClient(`problem-warehouse-${Date.now()}`);
  const boxId = `PROBLEM-${Date.now()}`;
  const boxRef = doc(pda.db, 'boxes', boxId);
  const first = normalizeReceiveProblem({
    boxId, sku: 'SKU-1', name: 'สินค้า 1', types: ['damaged'], note: 'กล่องบุบ', status: 'draft',
  }, 1000);
  const second = normalizeReceiveProblem({
    boxId, sku: 'SKU-2', name: 'สินค้า 2', types: ['lot_exp_mismatch'], status: 'draft',
  }, 1000);
  const abandoned = normalizeReceiveProblem({
    boxId, sku: 'SKU-DRAFT', name: 'Draft ที่ยังไม่ส่ง', types: ['other'], status: 'draft',
  }, 4000);

  try {
    await setDoc(boxRef, { id: boxId, status: 'exported', problemReported: false });
    await setDoc(doc(pda.db, 'receiveProblems', first.id), first, { merge: true });
    await setDoc(doc(pda.db, 'receiveProblems', first.id), {
      note: 'กล่องบุบและฉลากขาด', types: ['damaged', 'other'], updatedAt: 2000,
    }, { merge: true });
    await setDoc(doc(pda.db, 'receiveProblems', second.id), second, { merge: true });

    const reloaded = await getDocs(query(
      collection(warehouse.db, 'receiveProblems'), where('boxId', '==', boxId),
    ));
    assert.equal(reloaded.size, 2);
    assert.equal(reloaded.docs.find(item => item.id === first.id).data().note, 'กล่องบุบและฉลากขาด');

    const submit = writeBatch(pda.db);
    submit.set(boxRef, {
      problemReported: true,
      problemReviewed: true,
      problemType: 'item',
      problemIds: [first.id, second.id],
      problemCount: 2,
    }, { merge: true });
    for (const problem of [first, second]) {
      submit.set(doc(pda.db, 'receiveProblems', problem.id), {
        status: 'submitted', submittedAt: 3000, updatedAt: 3000,
      }, { merge: true });
    }
    await submit.commit();

    const [savedBox, submitted] = await Promise.all([
      getDoc(doc(warehouse.db, 'boxes', boxId)),
      getDocs(query(collection(warehouse.db, 'receiveProblems'), where('boxId', '==', boxId))),
    ]);
    assert.equal(savedBox.data().problemCount, 2);
    assert.deepEqual(submitted.docs.map(item => item.data().status).sort(), ['submitted', 'submitted']);

    await setDoc(doc(pda.db, 'receiveProblems', abandoned.id), abandoned);
    const beforeDelete = await getDocs(query(collection(pda.db, 'receiveProblems'), where('boxId', '==', boxId)));
    const remove = writeBatch(pda.db);
    remove.delete(boxRef);
    beforeDelete.docs
      .filter(problemDoc => problemDoc.data().status === 'draft' || problemDoc.data().status === 'pending_recheck')
      .forEach(problemDoc => remove.delete(doc(pda.db, 'receiveProblems', problemDoc.id)));
    await remove.commit();
    assert.equal((await getDoc(doc(warehouse.db, 'boxes', boxId))).exists(), false);
    assert.equal((await getDoc(doc(warehouse.db, 'receiveProblems', abandoned.id))).exists(), false);
    assert.equal((await getDocs(query(collection(warehouse.db, 'receiveProblems'), where('boxId', '==', boxId)))).size, 2);
  } finally {
    await Promise.all([
      deleteDoc(boxRef).catch(() => {}),
      deleteDoc(doc(pda.db, 'receiveProblems', first.id)).catch(() => {}),
      deleteDoc(doc(pda.db, 'receiveProblems', second.id)).catch(() => {}),
      deleteDoc(doc(pda.db, 'receiveProblems', abandoned.id)).catch(() => {}),
    ]);
    await Promise.all([closeClient(pda), closeClient(warehouse)]);
  }
});
