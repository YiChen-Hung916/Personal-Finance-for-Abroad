// ======================================================
// My Confirmation
//
// Purpose:
// Show card transactions assigned to the currently
// signed-in user and allow that user to confirm the
// amount and settlement currency shown by the card.
//
// Firestore:
//
// receipts/{receiptId}
//   └─ confirmations/{userUid}
//
// This module does NOT change the parent receipt status.
// ======================================================


import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Helpers
// ======================================================

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function formatMoney(value, currency) {
  return `${escapeHtml(currency || '')} ${Number(value || 0).toFixed(2)}`;
}


function getExpectedCurrency(receipt) {

  return String(
    receipt.expectedSettlementCurrency ||
    receipt.currency ||
    ''
  )
    .trim()
    .toUpperCase();
}


// ======================================================
// Shared Data Function
//
// Used by:
// 1. My Confirmation page
// 2. Dashboard
//
// This ensures both places use exactly the same logic.
// ======================================================

export async function getMyPendingConfirmations({
  db,
  currentUser
}) {

  if (!db || !currentUser) {
    return [];
  }


  const receiptQuery =
    query(
      collection(db, 'receipts'),
      where(
        'confirmationUserId',
        '==',
        currentUser.uid
      )
    );


  const receiptSnapshot =
    await getDocs(receiptQuery);


  const assignedReceipts = [];


  receiptSnapshot.forEach(receiptDoc => {

    const data =
      receiptDoc.data();


    // Only submitted card receipts need confirmation.
    if (data.status !== 'pending') {
      return;
    }


    if (data.paymentMethod !== 'card') {
      return;
    }


    assignedReceipts.push({
      id: receiptDoc.id,
      ...data
    });
  });


  // Newest first
  assignedReceipts.sort((a, b) => {

    const dateA =
      `${a.purchaseDate || ''} ${a.purchaseTime || ''}`;

    const dateB =
      `${b.purchaseDate || ''} ${b.purchaseTime || ''}`;

    return dateB.localeCompare(dateA);
  });


  // Remove receipts already confirmed by this user.
  const receiptsNeedingConfirmation = [];


  for (const receipt of assignedReceipts) {

    const confirmationRef =
      doc(
        db,
        'receipts',
        receipt.id,
        'confirmations',
        currentUser.uid
      );


    const confirmationSnapshot =
      await getDoc(confirmationRef);


    if (!confirmationSnapshot.exists()) {

      receiptsNeedingConfirmation.push(
        receipt
      );
    }
  }


  return receiptsNeedingConfirmation;
}


// ======================================================
// Main Page
// ======================================================

export async function myConfirmationPage({
  db,
  currentUser,
  lang,
  page
}) {

  if (!db || !currentUser || !page) {

    console.error(
      'myConfirmationPage: missing required dependency.'
    );

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '需要確認'
            : 'My Confirmations'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '請依照信用卡通知核對交易是否與 Receipt 相符。'
            : 'Compare each transaction with the card notification.'
        }
      </p>

      <div id="myConfirmationList">

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '正在載入…'
              : 'Loading…'
          }
        </p>

      </div>

    </section>
  `;


  const list =
    page.querySelector(
      '#myConfirmationList'
    );


  try {

    const receipts =
      await getMyPendingConfirmations({
        db,
        currentUser
      });


    if (receipts.length === 0) {

      renderEmptyState(
        list,
        lang
      );

      return;
    }


    list.innerHTML =
      receipts
        .map(receipt =>
          confirmationCardHtml(
            receipt,
            lang
          )
        )
        .join('');


    // ==================================================
    // Match / Mismatch radio buttons
    // ==================================================

    list
      .querySelectorAll(
        '.my-confirmation-card'
      )
      .forEach(card => {

        const radios =
          card.querySelectorAll(
            '.confirmation-match-choice'
          );


        const mismatchFields =
          card.querySelector(
            '.mismatch-fields'
          );


        radios.forEach(radio => {

          radio.addEventListener(
            'change',
            () => {

              mismatchFields.hidden =
                radio.value !== 'mismatch';
            }
          );
        });
      });


    // ==================================================
    // Submit buttons
    // ==================================================

    list
      .querySelectorAll(
        '.submit-my-confirmation-btn'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          async () => {

            const receiptId =
              button.dataset.receiptId;


            const receipt =
              receipts.find(
                item =>
                  item.id === receiptId
              );


            if (!receipt) {
              return;
            }


            await submitMyConfirmation({
              db,
              currentUser,
              lang,
              receipt,
              button
            });
          }
        );
      });


  } catch (error) {

    console.error(
      'Failed to load my confirmations:',
      error
    );


    list.innerHTML = `
      <div class="card">

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入需要確認的交易失敗。'
              : 'Failed to load confirmations.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(error.message)}
        </p>

      </div>
    `;
  }
}


// ======================================================
// Empty State
// ======================================================

function renderEmptyState(
  list,
  lang
) {

  list.innerHTML = `
    <div class="card">

      <p>
        ${
          lang === 'zh-TW'
            ? '目前沒有需要確認的交易。'
            : 'There are currently no transactions requiring confirmation.'
        }
      </p>

    </div>
  `;
}


// ======================================================
// Confirmation Card
// ======================================================

function confirmationCardHtml(
  receipt,
  lang
) {

  const receiptCurrency =
    String(
      receipt.currency || ''
    )
      .trim()
      .toUpperCase();


  const expectedCurrency =
    getExpectedCurrency(receipt);


  const expectedAmount =
    Number(
      receipt.total || 0
    );


  const currencies = [
    'USD',
    'TWD',
    'JPY',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'KRW',
    'HKD',
    'SGD'
  ];


  if (
    expectedCurrency &&
    !currencies.includes(expectedCurrency)
  ) {

    currencies.unshift(
      expectedCurrency
    );
  }


  const currencyOptions =
    currencies
      .map(code => `
        <option
          value="${escapeHtml(code)}"
          ${
            code === expectedCurrency
              ? 'selected'
              : ''
          }
        >
          ${escapeHtml(code)}
        </option>
      `)
      .join('');


  return `
    <div
      class="card my-confirmation-card"
      data-receipt-id="${escapeHtml(receipt.id)}"
    >

      <div class="my-confirmation-header">

        <div>

          <h2>
            ${escapeHtml(
              receipt.store || '—'
            )}
          </h2>

          <div class="muted">

            ${escapeHtml(
              receipt.purchaseDate || '—'
            )}

            ${
              receipt.purchaseTime
                ? ` · ${escapeHtml(
                    receipt.purchaseTime
                  )}`
                : ''
            }

          </div>

          ${
            receipt.branch
              ? `
                <div class="muted">
                  ${escapeHtml(receipt.branch)}
                </div>
              `
              : ''
          }

        </div>


        <div class="my-confirmation-total">

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? 'Receipt'
                : 'Receipt'
            }
          </div>

          <strong>
            ${formatMoney(
              expectedAmount,
              expectedCurrency
            )}
          </strong>

        </div>

      </div>


      <hr>


      <div class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '信用卡通知是否與 Receipt 相符？'
              : 'Does the card notification match the receipt?'
          }

          <sup class="required-mark">*</sup>

        </span>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="confirmation-match-choice"
            name="match-${escapeHtml(receipt.id)}"
            value="match"
            checked
          >

          ${
            lang === 'zh-TW'
              ? `相符（${formatMoney(
                  expectedAmount,
                  expectedCurrency
                )}）`
              : `Match (${formatMoney(
                  expectedAmount,
                  expectedCurrency
                )})`
          }

        </label>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="confirmation-match-choice"
            name="match-${escapeHtml(receipt.id)}"
            value="mismatch"
          >

          ${
            lang === 'zh-TW'
              ? '不符'
              : 'Does not match'
          }

        </label>

      </div>


      <div
        class="mismatch-fields"
        hidden
      >

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '請輸入信用卡通知中實際顯示的金額與幣值。'
              : 'Enter the amount and currency actually shown in the card notification.'
          }
        </p>


        <div class="grid">

          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '信用卡通知金額'
                  : 'Card Notification Amount'
              }

              <sup class="required-mark">*</sup>

            </span>


            <input
              class="my-confirmation-amount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              placeholder="0.00"
            >

          </label>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '信用卡通知幣值'
                  : 'Card Notification Currency'
              }

              <sup class="required-mark">*</sup>

            </span>


            <select
              class="my-confirmation-currency"
            >
              ${currencyOptions}
            </select>

          </label>

        </div>

      </div>


      <div
        class="my-confirmation-result"
        hidden
      ></div>


      <div class="actions">

        <button
          class="primary submit-my-confirmation-btn"
          data-receipt-id="${escapeHtml(receipt.id)}"
        >

          ${
            lang === 'zh-TW'
              ? '送出確認'
              : 'Submit Confirmation'
          }

        </button>

      </div>

    </div>
  `;
}


// ======================================================
// Submit Confirmation
// ======================================================

async function submitMyConfirmation({
  db,
  currentUser,
  lang,
  receipt,
  button
}) {

  const card =
    button.closest(
      '.my-confirmation-card'
    );


  if (!card) {
    return;
  }


  const selectedChoice =
    card.querySelector(
      '.confirmation-match-choice:checked'
    );


  if (!selectedChoice) {
    return;
  }


  const userSaysMatch =
    selectedChoice.value === 'match';


  const expectedAmount =
    Number(
      receipt.total || 0
    );


  const expectedCurrency =
    getExpectedCurrency(receipt);


  let reportedAmount;
  let reportedCurrency;


  // ====================================================
  // User selected "Match"
  // ====================================================

  if (userSaysMatch) {

    reportedAmount =
      expectedAmount;

    reportedCurrency =
      expectedCurrency;
  }


  // ====================================================
  // User selected "Mismatch"
  // ====================================================

  else {

    const amountInput =
      card.querySelector(
        '.my-confirmation-amount'
      );


    const currencySelect =
      card.querySelector(
        '.my-confirmation-currency'
      );


    const rawAmount =
      amountInput.value.trim();


    if (rawAmount === '') {

      alert(
        lang === 'zh-TW'
          ? '請輸入信用卡通知金額。'
          : 'Please enter the card notification amount.'
      );

      amountInput.focus();

      return;
    }


    reportedAmount =
      Number(rawAmount);


    if (
      !Number.isFinite(reportedAmount) ||
      reportedAmount < 0
    ) {

      alert(
        lang === 'zh-TW'
          ? '信用卡通知金額格式不正確。'
          : 'The card notification amount is invalid.'
      );

      amountInput.focus();

      return;
    }


    reportedCurrency =
      String(
        currencySelect.value || ''
      )
        .trim()
        .toUpperCase();


    if (!reportedCurrency) {

      alert(
        lang === 'zh-TW'
          ? '請選擇信用卡通知幣值。'
          : 'Please select the card notification currency.'
      );

      return;
    }
  }


  // ====================================================
  // Calculate Match Status
  // ====================================================

  const expectedAmountCents =
    Math.round(
      expectedAmount * 100
    );


  const reportedAmountCents =
    Math.round(
      reportedAmount * 100
    );


  const amountMatchStatus =
    expectedAmountCents ===
    reportedAmountCents
      ? 'match'
      : 'mismatch';


  const settlementCurrencyMatchStatus =
    reportedCurrency ===
    expectedCurrency
      ? 'match'
      : 'mismatch';


  const hasMismatch =
    amountMatchStatus === 'mismatch' ||
    settlementCurrencyMatchStatus === 'mismatch';


  // Important:
  // If user selected "Does not match" but entered the
  // exact same amount + currency, warn them.
  if (
    !userSaysMatch &&
    !hasMismatch
  ) {

    alert(
      lang === 'zh-TW'
        ? '你選擇了「不符」，但輸入的金額與幣值都和 Receipt 相同。請重新確認。'
        : 'You selected "Does not match", but the amount and currency match the receipt.'
    );

    return;
  }


  button.disabled = true;


  button.textContent =
    lang === 'zh-TW'
      ? '正在送出…'
      : 'Submitting…';


  try {

    // ==================================================
    // Safety checks
    // ==================================================

    if (
      receipt.confirmationUserId !==
      currentUser.uid
    ) {

      throw new Error(
        lang === 'zh-TW'
          ? '這筆交易不是指定給目前使用者確認。'
          : 'This transaction is not assigned to the current user.'
      );
    }


    if (
      receipt.status !== 'pending'
    ) {

      throw new Error(
        lang === 'zh-TW'
          ? '這筆交易目前不是待確認狀態。'
          : 'This transaction is not pending confirmation.'
      );
    }


    // ==================================================
    // Confirmation Document
    // ==================================================

    const confirmationRef =
      doc(
        db,
        'receipts',
        receipt.id,
        'confirmations',
        currentUser.uid
      );


    const existingConfirmation =
      await getDoc(
        confirmationRef
      );


    if (
      existingConfirmation.exists()
    ) {

      throw new Error(
        lang === 'zh-TW'
          ? '這筆交易已經確認過。'
          : 'This transaction has already been confirmed.'
      );
    }


    // ==================================================
    // Save
    // ==================================================

    await setDoc(
      confirmationRef,
      {
        receiptId:
          receipt.id,

        confirmationUserId:
          currentUser.uid,


        // User's top-level answer
        confirmationResult:
          userSaysMatch
            ? 'match'
            : 'mismatch',


        // Amount
        expectedAmount,
        reportedAmount,
        amountMatchStatus,


        // Currency
        receiptCurrency:
          String(
            receipt.currency || ''
          )
            .trim()
            .toUpperCase(),

        expectedSettlementCurrency:
          expectedCurrency,

        reportedCurrency,

        settlementCurrencyMatchStatus,


        // Overall result
        hasMismatch,


        // Owner resolution
        mismatchResolved:
          false,

        mismatchResolvedAt:
          null,

        mismatchResolvedBy:
          null,


        // Audit
        confirmedAt:
          serverTimestamp(),

        confirmedBy:
          currentUser.uid,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );


    // ==================================================
    // Success
    // ==================================================

    const resultBox =
      card.querySelector(
        '.my-confirmation-result'
      );


    resultBox.hidden =
      false;


    resultBox.innerHTML = `
      <strong>
        ${
          hasMismatch
            ? (
                lang === 'zh-TW'
                  ? '已送出：資料不符'
                  : 'Submitted: Mismatch'
              )
            : (
                lang === 'zh-TW'
                  ? '已確認相符'
                  : 'Confirmed Match'
              )
        }
      </strong>
    `;


    if (hasMismatch) {

      resultBox.classList.add(
        'warn'
      );
    }


    button.textContent =
      lang === 'zh-TW'
        ? '已確認'
        : 'Confirmed';


    setTimeout(() => {

      card.remove();


      const remaining =
        document.querySelectorAll(
          '.my-confirmation-card'
        );


      if (remaining.length === 0) {

        const list =
          document.querySelector(
            '#myConfirmationList'
          );


        if (list) {

          renderEmptyState(
            list,
            lang
          );
        }
      }

    }, 1200);


  } catch (error) {

    console.error(
      'Failed to submit confirmation:',
      error
    );


    alert(
      `${
        lang === 'zh-TW'
          ? '送出確認失敗'
          : 'Failed to submit confirmation'
      }: ${error.message}`
    );


    button.disabled =
      false;


    button.textContent =
      lang === 'zh-TW'
        ? '送出確認'
        : 'Submit Confirmation';
  }
}
