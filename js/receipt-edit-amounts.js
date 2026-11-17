
import {
  doc,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export function openReceiptAmountEditor({
  db,
  currentUser,
  currentRole,
  receipt,
  lang = 'zh-TW',
  onSaved
}) {
  if (currentRole !== 'owner') {
    alert('Only the owner can edit receipts.');
    return;
  }

  const zh = lang === 'zh-TW';
  const currency = receipt.currency || 'USD';

  document.getElementById('receiptAmountEditor')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'receiptAmountEditor';

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.55)',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px'
  });

  const panel = document.createElement('div');

  Object.assign(panel.style, {
    background: '#fff',
    color: '#222',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: '12px',
    padding: '24px',
    boxSizing: 'border-box'
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const money = value => Number(value || 0).toFixed(2);

  panel.innerHTML = `
    <h2>${zh ? '編輯金額摘要' : 'Edit Amount Summary'}</h2>

    <p>
      ${zh
        ? '商品小計會保留原值，僅修改整張收據的折扣、稅及費用。'
        : 'Item subtotal remains unchanged.'}
    </p>

    <p>
      ${zh ? '商品折後小計' : 'Items Subtotal'}：
      <strong>
        ${currency} ${money(receipt.itemsSubtotal)}
      </strong>
    </p>

    <label class="field">
      ${zh ? '整張收據折扣' : 'Receipt Discount'}
      <input
        id="editReceiptDiscount"
        type="number"
        min="0"
        step="0.01"
        value="${money(receipt.receiptDiscount)}"
      >
    </label>

    <label class="field">
      ${zh ? '稅' : 'Tax'}
      <input
        id="editReceiptTax"
        type="number"
        min="0"
        step="0.01"
        value="${money(receipt.tax)}"
      >
    </label>

    <label class="field">
      ${zh ? '小費／其他費用' : 'Fees'}
      <input
        id="editReceiptFees"
        type="number"
        min="0"
        step="0.01"
        value="${money(receipt.fees)}"
      >
    </label>

    <p>
      ${zh ? '更新後總額' : 'Updated Total'}：
      <strong id="editReceiptNewTotal"></strong>
    </p>

    <p id="editReceiptAmountError"
       style="color:#b91c1c"></p>

    <div class="actions">
      <button type="button" id="editReceiptCancel">
        ${zh ? '取消' : 'Cancel'}
      </button>

      <button type="button"
              class="primary"
              id="editReceiptSave">
        ${zh ? '儲存變更' : 'Save Changes'}
      </button>
    </div>
  `;

  const field = id => panel.querySelector(`#${id}`);

  const discountInput = field('editReceiptDiscount');
  const taxInput = field('editReceiptTax');
  const feesInput = field('editReceiptFees');
  const totalOutput = field('editReceiptNewTotal');
  const errorOutput = field('editReceiptAmountError');
  const saveButton = field('editReceiptSave');
  const cancelButton = field('editReceiptCancel');

  function readAmounts() {
    const inputs = [
      discountInput,
      taxInput,
      feesInput
    ];

    const values = inputs.map(input => {
      if (input.value.trim() === '') return NaN;
      return Number(input.value);
    });

    if (values.some(
      value => !Number.isFinite(value) || value < 0
    )) {
      throw new Error(
        zh
          ? '請輸入有效且不小於 0 的金額。'
          : 'Enter valid non-negative amounts.'
      );
    }

    return {
      receiptDiscount: values[0],
      tax: values[1],
      fees: values[2]
    };
  }

  function calculateTotal(subtotal, amounts) {
    return Math.max(
      0,
      Number(subtotal || 0) -
      amounts.receiptDiscount +
      amounts.tax +
      amounts.fees
    );
  }

  function preview() {
    try {
      const amounts = readAmounts();

      totalOutput.textContent =
        `${currency} ${money(
          calculateTotal(receipt.itemsSubtotal, amounts)
        )}`;

      errorOutput.textContent = '';
      saveButton.disabled = false;
    } catch (error) {
      totalOutput.textContent = '—';
      errorOutput.textContent = error.message;
      saveButton.disabled = true;
    }
  }

  [discountInput, taxInput, feesInput].forEach(input => {
    input.addEventListener('input', preview);
  });

  cancelButton.onclick = () => overlay.remove();

  saveButton.onclick = async () => {
    let amounts;

    try {
      amounts = readAmounts();
    } catch (error) {
      alert(error.message);
      return;
    }

    const confirmed = window.confirm(
      zh
        ? '確定更新這張 Receipt 的金額摘要嗎？'
        : 'Save these receipt amount changes?'
    );

    if (!confirmed) return;

    saveButton.disabled = true;
    cancelButton.disabled = true;
    errorOutput.textContent = '';

    try {
      const receiptRef = doc(
        db,
        'receipts',
        receipt.id
      );

      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(receiptRef);

        if (!snapshot.exists()) {
          throw new Error('Receipt no longer exists.');
        }

        const latest = snapshot.data();

        // Use the latest subtotal, not a stale value
        // from the open detail page.
        const total = calculateTotal(
          latest.itemsSubtotal,
          amounts
        );

        transaction.update(receiptRef, {
          ...amounts,
          total,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid
        });
      });

      overlay.remove();

      if (typeof onSaved === 'function') {
        await onSaved();
      }
    } catch (error) {
      console.error('Edit Amounts failed:', error);
      errorOutput.textContent = error.message;
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  };

  preview();
}
