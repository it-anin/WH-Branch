import { doc, runTransaction } from 'firebase/firestore';

function stableDataSignature(value) {
  const normalize = input => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input)
          .filter(key => input[key] !== undefined)
          .sort()
          .map(key => [key, normalize(input[key])])
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

// Atomic compare-and-set for the Outbound item editor. Firestore retries the
// callback if either document changes, then the content check rejects a stale
// editor instead of allowing last-write-wins data loss.
export async function commitWarehouseBoxItems(db, {
  boxId,
  expectedItems = [],
  items = [],
  summaryPatch = {},
}) {
  const itemsRef = doc(db, 'boxItems', boxId);
  const boxRef = doc(db, 'boxes', boxId);
  await runTransaction(db, async transaction => {
    const itemsSnapshot = await transaction.get(itemsRef);
    const boxSnapshot = await transaction.get(boxRef);
    if (!boxSnapshot.exists()) {
      const error = new Error('warehouse-box-missing');
      error.code = 'warehouse-box-missing';
      throw error;
    }
    if (!['closed', 'exported'].includes(boxSnapshot.data().status)) {
      const error = new Error('warehouse-box-not-editable');
      error.code = 'warehouse-box-not-editable';
      throw error;
    }
    const storedItems = itemsSnapshot.exists() ? (itemsSnapshot.data().items || []) : [];
    if (stableDataSignature(storedItems) !== stableDataSignature(expectedItems)) {
      const error = new Error('warehouse-edit-conflict');
      error.code = 'warehouse-edit-conflict';
      throw error;
    }
    transaction.set(itemsRef, { items }, { merge: true });
    transaction.set(boxRef, summaryPatch, { merge: true });
  });
}
