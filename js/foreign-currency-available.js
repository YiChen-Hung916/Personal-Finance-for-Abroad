import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import {
  getStores,
  normalizeStoreKey
} from './stores.js';

const HISTORY = 'merchantCurrencyOptions';
const RESPONSES = 'foreignCurrencyResponses';
const PAUSE_AFTER = 3;

const normalize = value =>
  normalizeStoreKey(String(value || ''));

function keyOf(record) {
  return record.storeId
    ? `id:${record.storeId}`
    : `name:${normalize(record.storeName)}`;
}

function matchesStore(record, store) {
  if (record.storeId && store.id) {
    return record.storeId === store.id ||
      normalize(record.storeName) === normalize(store.name);
  }
  return normalize(record.storeName) === normalize(store.name);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

export async function getCurrencyData(db) {
  const [oldSnap, newSnap] = await Promise.all([
    getDocs(collection(db, HISTORY)),
    getDocs(collection(db, RESPONSES))
  ]);

  const oldRecords = oldSnap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    result: 'offered',
    purchaseDate: d.data().observedPurchaseDate || '',
    legacy: true
  }));

  const responses = newSnap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    legacy: false
  }));

  // 新版資料優先；舊版紀錄只補充尚未遷移的收據。
  const newReceiptIds = new Set(
    responses.map(r => r.sourceReceiptId).filter(Boolean)
  );

  const legacyRecords = oldRecords.filter(
    r => !r.sourceReceiptId ||
      !newReceiptIds.has(r.sourceReceiptId)
  );

  return [...legacyRecords, ...responses];
}

export function getStoreCurrencyStatus(records, store) {
  const matched = records
    .filter(r => matchesStore(r, store))
    .sort((a, b) => {
      const dateA = String(a.purchaseDate || '');
      const dateB = String(b.purchaseDate || '');
      return dateB.localeCompare(dateA);
    });

  const everOffered = matched.some(
    r => r.result === 'offered'
  );

  let consecutiveNo = 0;

  for (const r of matched) {
    if (r.result === 'offered') break;
    if (r.result === 'not_offered') {
      consecutiveNo++;
    }
    // unknown 不計數，也不重設。
  }

  return {
    everOffered,
    consecutiveNo,
    paused: everOffered && consecutiveNo >= PAUSE_AFTER
  };
}

export async function renderForeignCurrencyStores({
  db,
  container,
  lang = 'zh-TW'
}) {
  container.innerHTML = '<p class="muted">Loading...</p>';

  try {
    const [stores, records] = await Promise.all([
      getStores(db),
      getCurrencyData(db)
    ]);

    const available = stores
      .map(store => ({
        ...store,
        currencyStatus: getStoreCurrencyStatus(records, store)
      }))
      .filter(s => s.currencyStatus.everOffered)
      .sort((a, b) =>
        Number(b.usageCount || 0) -
        Number(a.usageCount || 0) ||
        String(a.name).localeCompare(String(b.name))
      );

    container.innerHTML = `
      <h2>${lang === 'zh-TW'
        ? '可用外幣的店家'
        : 'Stores Offering Foreign Currency'}</h2>
      <p class="muted">
        ${lang === 'zh-TW'
          ? '依總消費次數由高至低排列'
          : 'Sorted by total receipt usage'}
      </p>
      ${
        available.length
          ? `<div class="foreign-store-list">
              ${available.map(s => `
                <div class="foreign-store-item">
                  <strong>${escapeHtml(s.name)}</strong>
                  <span>
                    ${Number(s.usageCount || 0)}
                    ${lang === 'zh-TW' ? '次' : 'visits'}
                  </span>
                  <small class="muted">
                    ${s.currencyStatus.paused
                      ? (lang === 'zh-TW'
                          ? '暫停提醒'
                          : 'Reminder paused')
                      : (lang === 'zh-TW'
                          ? '提醒中'
                          : 'Reminder active')}
                  </small>
                </div>
              `).join('')}
            </div>`
          : `<p class="muted">${
              lang === 'zh-TW'
                ? '目前沒有外幣結帳紀錄。'
                : 'No records yet.'
            }</p>`
      }
    `;
  } catch (error) {
    console.error('Currency store list error:', error);
    container.textContent =
      lang === 'zh-TW'
        ? '無法載入外幣店家紀錄。'
        : 'Unable to load currency records.';
  }
}

export async function saveCurrencyResponse({
  db,
  currentUser,
  receiptId,
  store,
  purchaseDate,
  result
}) {
  if (!receiptId || !store?.id) {
    throw new Error('Receipt ID and Store ID are required.');
  }

  if (!['offered', 'not_offered', 'unknown'].includes(result)) {
    throw new Error('Invalid currency response.');
  }

  // 使用 Receipt ID 作為文件 ID，避免同張收據重複計數。
  await setDoc(
    doc(db, RESPONSES, receiptId),
    {
      sourceReceiptId: receiptId,
      storeId: store.id,
      storeName: store.name,
      storeKey: normalize(store.name),
      purchaseDate: purchaseDate || '',
      result,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    },
    { merge: true }
  );
}
