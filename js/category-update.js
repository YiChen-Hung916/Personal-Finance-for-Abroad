
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import {
  normalizeProductKey
} from './products.js';

// ==========================================
// Category Batch Update
// ==========================================

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function matchesProduct(item, product) {
  // Prefer the stable product ID.
  if (item.productId) {
    return item.productId === product.id;
  }

  // Older receipts may not have productId.
  const key = normalizeProductKey(
    item.productKey || item.product || ''
  );

  const productKeys = [
    product.name,
    ...(Array.isArray(product.aliases)
      ? product.aliases
      : [])
  ].map(normalizeProductKey);

  return Boolean(key) && productKeys.includes(key);
}

function getSource(item) {
  if (
    item.categorySource === 'manual' ||
    item.categorySource === 'default' ||
    item.categorySource === 'batch'
  ) {
    return item.categorySource;
  }

  return 'legacy';
}

function displayDate(receipt) {
  return receipt.purchaseDate ||
    receipt.submittedDate ||
    '—';
}

function displayAmount(receipt) {
  const value = Number(receipt.total || 0);
  const currency = receipt.currency || 'USD';

  return `${currency} ${value.toFixed(2)}`;
}

export async function openCategoryBatchUpdate({
  db,
  currentUser,
  currentRole,
  product,
  oldCategory,
  newCategory,
  lang = 'zh-TW'
}) {
  if (currentRole !== 'owner' || !currentUser) {
    throw new Error('Only the owner can update receipts.');
  }

  if (!product?.id || !newCategory) {
    throw new Error('Invalid product or category.');
  }

  // Prevent two overlapping dialogs.
  document.querySelector(
    '#categoryBatchOverlay'
  )?.remove();

  const zh = lang === 'zh-TW';

  const overlay = document.createElement('div');
  overlay.id = 'categoryBatchOverlay';

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10000',
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px'
  });

  const panel = document.createElement('section');

  Object.assign(panel.style, {
    width: '100%',
    maxWidth: '850px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#fff',
    color: '#222',
    borderRadius: '12px',
    padding: '20px',
    boxSizing: 'border-box'
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  panel.innerHTML = `
    <h2>
      ${zh ? '批次更新 Receipt 分類' : 'Batch Category Update'}
    </h2>
    <p>
      <strong>${escapeText(product.name)}</strong>
      <br>
      ${escapeText(oldCategory || '—')}
      → ${escapeText(newCategory)}
    </p>
    <p id="categoryBatchStatus">
      ${zh ? '正在搜尋歷史收據…' : 'Searching receipts...'}
    </p>
    <div id="categoryBatchResults"></div>
    <div class="actions">
      <button type="button" id="categoryBatchClose">
        ${zh ? '關閉' : 'Close'}
      </button>
    </div>
  `;

  panel.querySelector(
    '#categoryBatchClose'
  ).onclick = close;

  const status = panel.querySelector(
    '#categoryBatchStatus'
  );

  const results = panel.querySelector(
    '#categoryBatchResults'
  );

  // Each entry represents one item in one receipt.
  const matches = [];

  try {
    const receiptsSnapshot = await getDocs(
      collection(db, 'receipts')
    );

    // Read all item subcollections, including legacy
    // receipts that have no productId.
    for (const receiptDoc of receiptsSnapshot.docs) {
      const receipt = receiptDoc.data();

      // Drafts are not submitted historical receipts.
      if (receipt.status === 'draft') {
        continue;
      }

      const itemsSnapshot = await getDocs(
        collection(db, 'receipts', receiptDoc.id, 'items')
      );

      for (const itemDoc of itemsSnapshot.docs) {
        const item = itemDoc.data();

        if (!matchesProduct(item, product)) {
          continue;
        }

        const source = getSource(item);

        // Only receipts with the old category are
        // candidates for this specific change.
        if (item.category !== oldCategory) {
          continue;
        }

        matches.push({
          receiptId: receiptDoc.id,
          itemId: itemDoc.id,
          receipt,
          item,
          source,
          selected: false
        });
      }
    }

    if (!matches.length) {
      status.textContent = zh
        ? '沒有找到符合舊分類的歷史商品紀錄。'
        : 'No matching historical items found.';

      return;
    }

    matches.sort((a, b) =>
      displayDate(b.receipt).localeCompare(
        displayDate(a.receipt)
      )
    );

    const eligible = matches.filter(
      entry => entry.source !== 'manual'
    );

    const legacyCount = matches.filter(
      entry => entry.source === 'legacy'
    ).length;

    status.textContent = zh
      ? `找到 ${matches.length} 筆商品紀錄，其中 ${legacyCount} 筆為舊資料。`
      : `Found ${matches.length} items; ${legacyCount} legacy items.`;

    const rows = matches.map((entry, index) => {
      const manual = entry.source === 'manual';

      const sourceLabel = {
        default: zh ? '預設分類' : 'Default',
        batch: zh ? '曾批次更新' : 'Previously updated',
        manual: zh ? '單張手動設定（保護）' : 'Manual (protected)',
        legacy: zh ? '舊資料（需自行勾選）' : 'Legacy (opt-in)'
      }[entry.source];

      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="categoryBatchItem"
              data-index="${index}"
              ${manual ? 'disabled' : ''}
            >
          </td>
          <td>${escapeText(displayDate(entry.receipt))}</td>
          <td>${escapeText(entry.receipt.store || '—')}</td>
          <td>${escapeText(entry.item.product || '—')}</td>
          <td>${escapeText(displayAmount(entry.receipt))}</td>
          <td>${escapeText(entry.item.category || '—')}</td>
          <td>${escapeText(newCategory)}</td>
          <td>${escapeText(sourceLabel)}</td>
        </tr>
      `;
    }).join('');

    results.innerHTML = `
      <p style="font-size:0.9rem">
        ${zh
          ? '預設全部不勾選。請確認每筆資料後再更新。'
          : 'All items start unchecked. Review before updating.'}
      </p>

      <div class="actions">
        <button type="button" id="categoryBatchSelectAll">
          ${zh ? '全選可更新項目' : 'Select Eligible'}
        </button>
        <button type="button" id="categoryBatchClearAll">
          ${zh ? '全部取消' : 'Clear All'}
        </button>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th>${zh ? '選取' : 'Select'}</th>
              <th>${zh ? '日期' : 'Date'}</th>
              <th>${zh ? '商店' : 'Store'}</th>
              <th>Product</th>
              <th>${zh ? '收據總額' : 'Receipt Total'}</th>
              <th>${zh ? '原分類' : 'Old'}</th>
              <th>${zh ? '新分類' : 'New'}</th>
              <th>${zh ? '來源' : 'Source'}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p id="categoryBatchSelectionCount"></p>

      <div class="actions">
        <button
          type="button"
          id="categoryBatchApply"
          class="primary"
        >
          ${zh ? '確認更新所選紀錄' : 'Update Selected Items'}
        </button>
      </div>
    `;

    const checkboxes = [
      ...results.querySelectorAll('.categoryBatchItem')
    ];

    const count = results.querySelector(
      '#categoryBatchSelectionCount'
    );

    function updateCount() {
      const selectedCount = checkboxes.filter(
        checkbox => checkbox.checked
      ).length;

      count.textContent = zh
        ? `已選取 ${selectedCount} 筆`
        : `${selectedCount} items selected`;
    }

    results.querySelector(
      '#categoryBatchSelectAll'
    ).onclick = () => {
      checkboxes.forEach(checkbox => {
        if (!checkbox.disabled) {
          checkbox.checked = true;
        }
      });

      updateCount();
    };

    results.querySelector(
      '#categoryBatchClearAll'
    ).onclick = () => {
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
      });

      updateCount();
    };

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCount);
    });

    updateCount();

    results.querySelector(
      '#categoryBatchApply'
    ).onclick = async () => {
      const selected = checkboxes
        .filter(checkbox => checkbox.checked)
        .map(checkbox =>
          matches[Number(checkbox.dataset.index)]
        );

      if (!selected.length) {
        alert(zh
          ? '請先選擇至少一筆紀錄。'
          : 'Select at least one item.');
        return;
      }

      const confirmed = window.confirm(
        zh
          ? `確定更新 ${selected.length} 筆商品紀錄嗎？此操作會修改 Firestore 中的歷史資料。`
          : `Update ${selected.length} historical items?`
      );

      if (!confirmed) return;

      const applyButton = results.querySelector(
        '#categoryBatchApply'
      );

      applyButton.disabled = true;
      status.textContent = zh
        ? '正在更新，請勿關閉視窗…'
        : 'Updating, please wait...';

      try {
        // Group selected items by receipt.
        const byReceipt = new Map();

        for (const entry of selected) {
          if (!byReceipt.has(entry.receiptId)) {
            byReceipt.set(entry.receiptId, []);
          }

          byReceipt.get(entry.receiptId).push(entry);
        }

        let updatedCount = 0;

        // Each receipt is committed atomically.
        for (const [receiptId, entries] of byReceipt) {
          // Re-read current items to avoid overwriting
          // newer manual changes made since preview.
          const latestSnapshot = await getDocs(
            collection(db, 'receipts', receiptId, 'items')
          );

          const latestItems = latestSnapshot.docs.map(
            itemDoc => ({
              id: itemDoc.id,
              ...itemDoc.data()
            })
          );

          const entryIds = new Set(
            entries.map(entry => entry.itemId)
          );

          const updates = latestItems.filter(item =>
            entryIds.has(item.id) &&
            matchesProduct(item, product) &&
            item.category === oldCategory &&
            getSource(item) !== 'manual'
          );

          if (!updates.length) continue;

          const updatedIds = new Set(
            updates.map(item => item.id)
          );

          const categories = [
            ...new Set(
              latestItems.map(item =>
                updatedIds.has(item.id)
                  ? newCategory
                  : item.category
              ).filter(Boolean)
            )
          ];

          const batch = writeBatch(db);

          for (const item of updates) {
            batch.update(
              doc(db, 'receipts', receiptId, 'items', item.id),
              {
                category: newCategory,
                categorySource: 'batch'
              }
            );
          }

          // Keep receipt-level category filters in sync.
          batch.update(
            doc(db, 'receipts', receiptId),
            {
              categories,
              updatedAt: serverTimestamp(),
              updatedBy: currentUser.uid
            }
          );

          await batch.commit();
          updatedCount += updates.length;
        }

        status.textContent = zh
          ? `完成！已更新 ${updatedCount} 筆商品紀錄。`
          : `Done! Updated ${updatedCount} items.`;

        results.innerHTML = `
          <p>
            ${zh
              ? '更新完成。請到 History 檢查結果。'
              : 'Update complete. Check History.'}
          </p>
        `;
      } catch (error) {
        console.error('Category batch update failed:', error);

        status.textContent = zh
          ? '更新未完全完成，請重新檢查資料。'
          : 'Update did not fully complete. Review the data.';

        alert(error.message);
        applyButton.disabled = false;
      }
    };
  } catch (error) {
    console.error('Unable to load receipt categories:', error);

    status.textContent = zh
      ? '讀取歷史 Receipt 失敗。'
      : 'Failed to load historical receipts.';

    results.textContent = error.message;
  }
}
