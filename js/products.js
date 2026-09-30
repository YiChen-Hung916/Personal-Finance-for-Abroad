import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Product Master Data
// ======================================================

export const PRODUCT_CATEGORIES = [
  'Beverages',
  'Dairy',
  'Produce',
  'Meat',
  'Seafood',
  'Bakery',
  'Food',
  'Snacks',
  'Household',
  'Personal Care',
  'Clothing',
  'Electronics',
  'Other'
];


// ======================================================
// Normalize
// ======================================================

export function normalizeProductKey(value = '') {

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


// ======================================================
// Category Detection
// ======================================================

const CATEGORY_RULES = {

  Dairy: [
    'milk',
    'whole milk',
    'skim milk',
    'yogurt',
    'yoghurt',
    'cheese',
    'butter',
    'cream',
    'half and half'
  ],

  Produce: [
    'apple',
    'banana',
    'orange',
    'avocado',
    'lettuce',
    'tomato',
    'potato',
    'onion',
    'garlic',
    'spinach',
    'broccoli',
    'carrot',
    'grape',
    'strawberry',
    'blueberry'
  ],

  Meat: [
    'chicken',
    'beef',
    'pork',
    'steak',
    'ground beef',
    'sausage',
    'bacon'
  ],

  Seafood: [
    'salmon',
    'shrimp',
    'tuna',
    'fish',
    'cod'
  ],

  Bakery: [
    'bread',
    'bagel',
    'croissant',
    'muffin',
    'bun'
  ],

  Beverages: [
    'water',
    'juice',
    'coffee',
    'tea',
    'soda',
    'sparkling water'
  ],

  Snacks: [
    'chips',
    'cookie',
    'cookies',
    'cracker',
    'crackers',
    'chocolate',
    'candy',
    'popcorn'
  ],

  Household: [
    'paper towel',
    'paper towels',
    'toilet paper',
    'detergent',
    'dish soap',
    'trash bag',
    'trash bags',
    'cleaner',
    'sponge'
  ],

  'Personal Care': [
    'shampoo',
    'conditioner',
    'toothpaste',
    'toothbrush',
    'body wash',
    'soap',
    'lotion',
    'deodorant'
  ],

  Clothing: [
    'shirt',
    't-shirt',
    'pants',
    'jeans',
    'socks',
    'jacket',
    'shoes'
  ],

  Electronics: [
    'charger',
    'cable',
    'adapter',
    'headphones',
    'keyboard',
    'mouse',
    'battery',
    'batteries'
  ]
};


export function detectProductCategory(productName = '') {

  const key =
    normalizeProductKey(productName);

  if (!key) {
    return '';
  }


  for (
    const [category, keywords]
    of Object.entries(CATEGORY_RULES)
  ) {

    const matched =
      keywords.some(keyword => {

        const normalizedKeyword =
          normalizeProductKey(keyword);

        return (
          key === normalizedKeyword ||
          key.includes(normalizedKeyword)
        );
      });


    if (matched) {
      return category;
    }
  }


  return 'Other';
}


// ======================================================
// Read Products
// ======================================================

export async function getProducts(db, {
  includeMerged = false
} = {}) {

  const snapshot =
    await getDocs(
      collection(db, 'products')
    );


  return snapshot.docs
    .map(productDoc => ({
      id: productDoc.id,
      ...productDoc.data()
    }))
    .filter(product =>
      includeMerged ||
      product.status !== 'merged'
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


// ======================================================
// Create Product
// ======================================================

export async function createProduct({
  db,
  currentUser,
  name,
  category = ''
}) {

  const cleanName =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (!cleanName) {
    throw new Error('Product name is required.');
  }


  const normalizedName =
    normalizeProductKey(cleanName);


  const products =
    await getProducts(
      db,
      { includeMerged: true }
    );


  const duplicate =
    products.find(product =>
      product.normalizedName === normalizedName &&
      product.status !== 'merged'
    );


  if (duplicate) {
    throw new Error('This product already exists.');
  }


  const autoCategory =
    detectProductCategory(cleanName);


  return await addDoc(
    collection(db, 'products'),
    {
      name: cleanName,

      normalizedName,

      aliases: [],

      category:
        category || autoCategory || 'Other',

      categorySource:
        category
          ? 'manual'
          : 'auto',

      usageCount: 0,

      isFrequent: false,

      status: 'active',

      mergedIntoId: null,
      mergedAt: null,
      mergedBy: null,

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


// ======================================================
// Update Product
// ======================================================

export async function updateProduct({
  db,
  currentUser,
  productId,
  name,
  category
}) {

  const cleanName =
    String(name || '')
      .trim()
      .replace(/\s+/g, ' ');


  if (!cleanName) {
    throw new Error('Product name is required.');
  }


  await updateDoc(
    doc(db, 'products', productId),
    {
      name: cleanName,

      normalizedName:
        normalizeProductKey(cleanName),

      category:
        category || 'Other',

      categorySource:
        'manual',

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


// ======================================================
// Merge Product
// ======================================================

export async function mergeProduct({
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
    throw new Error('Please select two different products.');
  }


  const sourceRef =
    doc(db, 'products', sourceId);

  const targetRef =
    doc(db, 'products', targetId);


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
    throw new Error('Product could not be found.');
  }


  const source =
    sourceSnapshot.data();

  const target =
    targetSnapshot.data();


  if (source.status === 'merged') {
    throw new Error('Source product is already merged.');
  }


  if (target.status === 'merged') {
    throw new Error('Cannot merge into a merged product.');
  }


  const targetAliases =
    Array.isArray(target.aliases)
      ? target.aliases
      : [];


  const sourceAliases =
    Array.isArray(source.aliases)
      ? source.aliases
      : [];


  const mergedAliases =
    [
      ...new Set([
        ...targetAliases,
        source.name,
        ...sourceAliases
      ].filter(Boolean))
    ];


  await updateDoc(
    targetRef,
    {
      aliases:
        mergedAliases,

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


// ======================================================
// Undo Product Merge
// ======================================================

export async function undoProductMerge({
  db,
  currentUser,
  sourceId
}) {

  const sourceRef =
    doc(db, 'products', sourceId);


  const sourceSnapshot =
    await getDoc(sourceRef);


  if (!sourceSnapshot.exists()) {
    throw new Error('Product could not be found.');
  }


  const source =
    sourceSnapshot.data();


  if (
    source.status !== 'merged' ||
    !source.mergedIntoId
  ) {
    throw new Error('This product is not merged.');
  }


  const targetRef =
    doc(
      db,
      'products',
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


    const namesToRemove =
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
          .map(normalizeProductKey)
      );


    const cleanedAliases =
      aliases.filter(alias =>
        !namesToRemove.has(
          normalizeProductKey(alias)
        )
      );


    await updateDoc(
      targetRef,
      {
        aliases:
          cleanedAliases,

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
