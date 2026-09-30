import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  increment
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
    // English
    'whole milk',
    'skim milk',
    'milk',
    'yogurt',
    'yoghurt',
    'cheese',
    'butter',
    'cream',
    'half and half',

    // 中文
    '全脂牛奶',
    '低脂牛奶',
    '脫脂牛奶',
    '鮮奶',
    '牛奶',
    '羊奶',
    '優格',
    '優酪乳',
    '乳酪',
    '起司',
    '芝士',
    '奶油',
    '鮮奶油'
  ],

  Produce: [
    // English
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
    'blueberry',

    // 中文
    '蘋果',
    '香蕉',
    '柳橙',
    '橘子',
    '酪梨',
    '萵苣',
    '生菜',
    '番茄',
    '蕃茄',
    '馬鈴薯',
    '洋蔥',
    '大蒜',
    '菠菜',
    '花椰菜',
    '青花菜',
    '紅蘿蔔',
    '胡蘿蔔',
    '葡萄',
    '草莓',
    '藍莓',
    '蔬菜',
    '水果'
  ],

  Meat: [
    // English
    'chicken',
    'beef',
    'pork',
    'steak',
    'ground beef',
    'sausage',
    'bacon',

    // 中文
    '雞胸肉',
    '雞胸',
    '雞肉',
    '牛絞肉',
    '絞牛肉',
    '牛排',
    '牛肉',
    '豬肉',
    '豬排',
    '香腸',
    '培根'
  ],

  Seafood: [
    // English
    'salmon',
    'shrimp',
    'tuna',
    'fish',
    'cod',

    // 中文
    '鮭魚',
    '三文魚',
    '蝦',
    '鮪魚',
    '吞拿魚',
    '鱈魚',
    '魚'
  ],

  Bakery: [
    // English
    'bread',
    'bagel',
    'croissant',
    'muffin',
    'bun',

    // 中文
    '吐司',
    '麵包',
    '貝果',
    '可頌',
    '鬆餅',
    '餐包'
  ],

  Beverages: [
    // English
    'sparkling water',
    'water',
    'juice',
    'coffee',
    'tea',
    'soda',

    // 中文
    '氣泡水',
    '礦泉水',
    '飲用水',
    '果汁',
    '咖啡',
    '茶',
    '汽水',
    '飲料'
  ],

  Snacks: [
    // English
    'chips',
    'cookie',
    'cookies',
    'cracker',
    'crackers',
    'chocolate',
    'candy',
    'popcorn',

    // 中文
    '洋芋片',
    '薯片',
    '餅乾',
    '巧克力',
    '糖果',
    '爆米花',
    '零食'
  ],

  Household: [
    // English
    'paper towel',
    'paper towels',
    'toilet paper',
    'detergent',
    'dish soap',
    'trash bag',
    'trash bags',
    'cleaner',
    'sponge',

    // 中文
    '廚房紙巾',
    '紙巾',
    '衛生紙',
    '洗衣精',
    '洗衣粉',
    '洗碗精',
    '垃圾袋',
    '清潔劑',
    '海綿'
  ],

  'Personal Care': [
    // English
    'shampoo',
    'conditioner',
    'toothpaste',
    'toothbrush',
    'body wash',
    'soap',
    'lotion',
    'deodorant',

    // 中文
    '洗髮精',
    '洗髮乳',
    '潤髮乳',
    '護髮乳',
    '牙膏',
    '牙刷',
    '沐浴乳',
    '肥皂',
    '乳液',
    '止汗劑',
    '除臭劑'
  ],

  Clothing: [
    // English
    't-shirt',
    'shirt',
    'pants',
    'jeans',
    'socks',
    'jacket',
    'shoes',

    // 中文
    'T恤',
    '上衣',
    '襯衫',
    '褲子',
    '牛仔褲',
    '襪子',
    '外套',
    '鞋子',
    '鞋'
  ],

  Electronics: [
    // English
    'charger',
    'cable',
    'adapter',
    'headphones',
    'keyboard',
    'mouse',
    'battery',
    'batteries',

    // 中文
    '充電器',
    '充電線',
    '傳輸線',
    '電線',
    '轉接器',
    '耳機',
    '鍵盤',
    '滑鼠',
    '電池'
  ],

  Food: [
    // English
    'rice',
    'pasta',
    'noodle',
    'noodles',
    'egg',
    'eggs',
    'flour',
    'sugar',
    'salt',

    // 中文
    '白米',
    '米',
    '義大利麵',
    '麵條',
    '泡麵',
    '雞蛋',
    '蛋',
    '麵粉',
    '糖',
    '鹽'
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


// ======================================================
// Record Product Usage
// ======================================================

export async function recordProductUsage({
  db,
  currentUser,
  productId
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !productId
  ) {
    return;
  }


  const productRef =
    doc(
      db,
      'products',
      productId
    );


  const snapshot =
    await getDoc(
      productRef
    );


  if (!snapshot.exists()) {
    return;
  }


  const product =
    snapshot.data();


  if (
    product.status === 'merged'
  ) {
    return;
  }


  const currentUsage =
    Number(
      product.usageCount || 0
    );


  const nextUsage =
    currentUsage + 1;


  await updateDoc(
    productRef,
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
// Remove Product Usage
// ======================================================
//
// Used when Owner deletes a submitted Receipt.
//
// One submitted Receipt counts each Product once,
// so Receipt deletion must reverse that count once.
//
// usageCount is never allowed to go below 0.
// ======================================================

export async function removeProductUsage({
  db,
  currentUser,
  productId
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !productId
  ) {
    return;
  }


  const productRef =
    doc(
      db,
      'products',
      productId
    );


  const snapshot =
    await getDoc(
      productRef
    );


  if (!snapshot.exists()) {
    return;
  }


  const product =
    snapshot.data();


  const currentUsage =
    Math.max(
      0,
      Number(
        product.usageCount || 0
      )
    );


  const nextUsage =
    Math.max(
      0,
      currentUsage - 1
    );


  await updateDoc(
    productRef,
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
