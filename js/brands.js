import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


export function normalizeBrandKey(value = '') {

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


export async function getBrands(
  db,
  {
    includeMerged = false
  } = {}
) {

  const snapshot =
    await getDocs(
      collection(db, 'brands')
    );


  return snapshot.docs
    .map(brandDoc => ({
      id: brandDoc.id,
      ...brandDoc.data()
    }))
    .filter(brand =>
      includeMerged ||
      brand.status !== 'merged'
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


export async function createBrand({
  db,
  currentUser,
  name
}) {

  const cleanName =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (!cleanName) {
    throw new Error('Brand name is required.');
  }


  const normalizedName =
    normalizeBrandKey(cleanName);


  const brands =
    await getBrands(
      db,
      { includeMerged: true }
    );


  const duplicate =
    brands.find(brand =>
      brand.normalizedName === normalizedName &&
      brand.status !== 'merged'
    );


  if (duplicate) {
    throw new Error('This brand already exists.');
  }


  return await addDoc(
    collection(db, 'brands'),
    {
      name:
        cleanName,

      normalizedName,

      aliases: [],

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


export async function mergeBrand({
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
    throw new Error('Please select two different brands.');
  }


  const sourceRef =
    doc(db, 'brands', sourceId);

  const targetRef =
    doc(db, 'brands', targetId);


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
    throw new Error('Brand could not be found.');
  }


  const source =
    sourceSnapshot.data();

  const target =
    targetSnapshot.data();


  if (source.status === 'merged') {
    throw new Error('Source brand is already merged.');
  }


  if (target.status === 'merged') {
    throw new Error('Cannot merge into a merged brand.');
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


export async function undoBrandMerge({
  db,
  currentUser,
  sourceId
}) {

  const sourceRef =
    doc(db, 'brands', sourceId);


  const sourceSnapshot =
    await getDoc(sourceRef);


  if (!sourceSnapshot.exists()) {
    throw new Error('Brand could not be found.');
  }


  const source =
    sourceSnapshot.data();


  if (
    source.status !== 'merged' ||
    !source.mergedIntoId
  ) {
    throw new Error('This brand is not merged.');
  }


  const targetRef =
    doc(
      db,
      'brands',
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
          .map(normalizeBrandKey)
      );


    await updateDoc(
      targetRef,
      {
        aliases:
          aliases.filter(alias =>
            !removeKeys.has(
              normalizeBrandKey(alias)
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
