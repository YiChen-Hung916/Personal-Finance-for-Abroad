import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


export function normalizeStoreKey(value = '') {

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


export async function getStores(
  db,
  {
    includeMerged = false
  } = {}
) {

  const snapshot =
    await getDocs(
      collection(db, 'stores')
    );


  return snapshot.docs
    .map(storeDoc => ({
      id: storeDoc.id,
      ...storeDoc.data()
    }))
    .filter(store =>
      includeMerged ||
      store.status !== 'merged'
    )
    .sort((a, b) =>
      String(a.name || '')
        .localeCompare(
          String(b.name || ''),
          undefined,
          { sensitivity: 'base' }
        )
    );
}


export async function createStore({
  db,
  currentUser,
  name
}) {

  const cleanName =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (!cleanName) {
    throw new Error('Store name is required.');
  }


  const normalizedName =
    normalizeStoreKey(cleanName);


  const stores =
    await getStores(
      db,
      { includeMerged: true }
    );


  const duplicate =
    stores.find(store =>
      store.normalizedName === normalizedName &&
      store.status !== 'merged'
    );


  if (duplicate) {
    throw new Error('This store already exists.');
  }


  return await addDoc(
    collection(db, 'stores'),
    {
      name:
        cleanName,

      normalizedName,

      aliases: [],

      usageCount:
        0,

      isFrequent:
        false,

      status:
        'active',

      mergedIntoId:
        null,

      mergedAt:
        null,

      mergedBy:
        null,

      createdAt:
        serverTimestamp(),

      createdBy:
        currentUser.uid,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}

export async function updateStore({
  db,
  currentUser,
  storeId,
  name
}) {

  const cleanName =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (!cleanName) {
    throw new Error('Store name is required.');
  }


  const normalizedName =
    normalizeStoreKey(cleanName);


  const stores =
    await getStores(
      db,
      { includeMerged: true }
    );


  const duplicate =
    stores.find(store =>
      store.id !== storeId &&
      store.normalizedName ===
        normalizedName &&
      store.status !== 'merged'
    );


  if (duplicate) {
    throw new Error('This store already exists.');
  }


  await updateDoc(
    doc(db, 'stores', storeId),
    {
      name:
        cleanName,

      normalizedName,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


export async function mergeStore({
  db,
  currentUser,
  sourceId,
  targetId
}) {

  if (
    !sourceId ||
    !targetId ||
    sourceId === targetId
  ) {
    throw new Error('Please select two different stores.');
  }


  const sourceRef =
    doc(db, 'stores', sourceId);

  const targetRef =
    doc(db, 'stores', targetId);


  const [
    sourceSnapshot,
    targetSnapshot
  ] =
    await Promise.all([
      getDoc(sourceRef),
      getDoc(targetRef)
    ]);


  if (
    !sourceSnapshot.exists() ||
    !targetSnapshot.exists()
  ) {
    throw new Error('Store could not be found.');
  }


  const source =
    sourceSnapshot.data();

  const target =
    targetSnapshot.data();


  if (source.status === 'merged') {
    throw new Error('Source store is already merged.');
  }


  if (target.status === 'merged') {
    throw new Error('Cannot merge into a merged store.');
  }


  const targetAliases =
    Array.isArray(target.aliases)
      ? target.aliases
      : [];


  const sourceAliases =
    Array.isArray(source.aliases)
      ? source.aliases
      : [];


  await updateDoc(
    targetRef,
    {
      aliases: [
        ...new Set([
          ...targetAliases,
          source.name,
          ...sourceAliases
        ].filter(Boolean))
      ],

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );


  await updateDoc(
    sourceRef,
    {
      status:
        'merged',

      mergedIntoId:
        targetId,

      mergedAt:
        serverTimestamp(),

      mergedBy:
        currentUser.uid,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


export async function undoStoreMerge({
  db,
  currentUser,
  sourceId
}) {

  const sourceRef =
    doc(db, 'stores', sourceId);


  const sourceSnapshot =
    await getDoc(sourceRef);


  if (!sourceSnapshot.exists()) {
    throw new Error('Store could not be found.');
  }


  const source =
    sourceSnapshot.data();


  if (
    source.status !== 'merged' ||
    !source.mergedIntoId
  ) {
    throw new Error('This store is not merged.');
  }


  const targetRef =
    doc(
      db,
      'stores',
      source.mergedIntoId
    );


  const targetSnapshot =
    await getDoc(targetRef);


  if (targetSnapshot.exists()) {

    const target =
      targetSnapshot.data();


    const aliases =
      Array.isArray(target.aliases)
        ? target.aliases
        : [];


    const removeKeys =
      new Set(
        [
          source.name,
          ...(
            Array.isArray(source.aliases)
              ? source.aliases
              : []
          )
        ]
          .filter(Boolean)
          .map(normalizeStoreKey)
      );


    await updateDoc(
      targetRef,
      {
        aliases:
          aliases.filter(alias =>
            !removeKeys.has(
              normalizeStoreKey(alias)
            )
          ),

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentUser.uid
      }
    );
  }


  await updateDoc(
    sourceRef,
    {
      status:
        'active',

      mergedIntoId:
        null,

      mergedAt:
        null,

      mergedBy:
        null,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


// ======================================================
// Record Store Usage
// ======================================================

export async function recordStoreUsage({
  db,
  currentUser,
  storeId
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !storeId
  ) {
    return;
  }


  const storeRef =
    doc(
      db,
      'stores',
      storeId
    );


  const snapshot =
    await getDoc(
      storeRef
    );


  if (!snapshot.exists()) {
    return;
  }


  const store =
    snapshot.data();


  if (
    store.status === 'merged'
  ) {
    return;
  }


  const currentUsage =
    Number(
      store.usageCount || 0
    );


  const nextUsage =
    currentUsage + 1;


  await updateDoc(
    storeRef,
    {

      usageCount:
        increment(1),

      isFrequent:
        nextUsage >= 5,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


// ======================================================
// Remove Store Usage
// ======================================================
//
// Used when Owner deletes a submitted Receipt.
//
// One submitted Receipt counts its Store once.
//
// usageCount is never allowed to go below 0.
// ======================================================

export async function removeStoreUsage({
  db,
  currentUser,
  storeId
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !storeId
  ) {
    return;
  }


  const storeRef =
    doc(
      db,
      'stores',
      storeId
    );


  const snapshot =
    await getDoc(
      storeRef
    );


  if (!snapshot.exists()) {
    return;
  }


  const store =
    snapshot.data();


  const currentUsage =
    Math.max(
      0,
      Number(
        store.usageCount || 0
      )
    );


  const nextUsage =
    Math.max(
      0,
      currentUsage - 1
    );


  await updateDoc(
    storeRef,
    {

      usageCount:
        nextUsage,

      isFrequent:
        nextUsage >= 5,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}
