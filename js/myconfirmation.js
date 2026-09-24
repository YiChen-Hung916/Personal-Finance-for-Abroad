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


function formatMoney(
  value,
  currency
) {

  const amount =
    Number(value || 0);

  return `${escapeHtml(
    currency || ''
  )} ${amount.toFixed(2)}`;
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

  if (
    !db ||
    !currentUser ||
    !page
  ) {

    console.error(
      'myConfirmationPage: missing required dependency.'
    );

    return;
  }


  // ----------------------------------------------------
  // Initial page
  // ----------------------------------------------------

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
            ? '請依照信用卡通知核對交易金額與結帳幣值。'
            : 'Verify each transaction using the amount and settlement currency shown in your card notification.'
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

    // ==================================================
    // 1. Load receipts assigned to current user
    // ==================================================
    //
    // We only query confirmationUserId in Firestore.
    //
    // status === pending and paymentMethod === card
    // are filtered locally.
    //
    // This keeps the first version simple and avoids
    // needing a composite Firestore index.
    // ==================================================

    const receiptQuery =
      query(
        collection(
          db,
          'receipts'
        ),
        where(
          'confirmationUserId',
          '==',
          currentUser.uid
        )
      );


    const receiptSnapshot =
      await getDocs(
        receiptQuery
      );


    const assignedReceipts = [];


    receiptSnapshot.forEach(
      receiptDoc => {

        const data =
          receiptDoc.data();


        // Drafts do not need confirmation.
        if (
          data.status !== 'pending'
        ) {
          return;
        }


        // Cash transactions do not need card confirmation.
        if (
          data.paymentMethod !== 'card'
        ) {
          return;
        }


        assignedReceipts.push({
          id: receiptDoc.id,
          ...data
        });
      }
    );


    // ==================================================
    // 2. Sort newest first
    // ==================================================

    assignedReceipts.sort(
      (a, b) => {

        const dateA =
          `${a.purchaseDate || ''} ${a.purchaseTime || ''}`;

        const dateB =
          `${b.purchaseDate || ''} ${b.purchaseTime || ''}`;

        return dateB.localeCompare(
          dateA
        );
      }
    );


    // ==================================================
    // 3. Check whether each receipt has already been
    //    confirmed by the current user.
    //
    // Parent receipt remains "pending", so confirmation
    // existence determines whether it still belongs on
    // this page.
    // ==================================================

    const receiptsNeedingConfirmation = [];


    for (
      const receipt of assignedReceipts
    ) {

      const confirmationRef =
        doc(
          db,
          'receipts',
          receipt.id,
          'confirmations',
          currentUser.uid
        );


      const confirmationSnapshot =
        await getDoc(
          confirmationRef
        );


      if (
        !confirmationSnapshot.exists()
      ) {

        receiptsNeedingConfirmation.push(
          receipt
        );
      }
    }


    // ==================================================
    // 4. Nothing to confirm
    // ==================================================

    if (
      receiptsNeedingConfirmation.length === 0
    ) {

      renderEmptyState(
        list,
        lang
      );

      return;
    }


    // ==================================================
    // 5. Render cards
    // ==================================================

    list.innerHTML =
      receiptsNeedingConfirmation
        .map(
          receipt =>
            confirmationCardHtml(
              receipt,
              lang
            )
        )
        .join('');


    // ==================================================
    // 6. Attach button listeners
    // ==================================================

    list
      .querySelectorAll(
        '.submit-my-confirmation-btn'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            async () => {

              const receiptId =
                button.dataset.receiptId;


              const receipt =
                receiptsNeedingConfirmation
                  .find(
                    item =>
                      item.id === receiptId
                  );


              if (!receipt) {

                console.error(
                  'Receipt not found:',
                  receiptId
                );

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
        }
      );


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
              : 'Failed to load transactions requiring confirmation.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(
            error.message
          )}
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


  const expectedAmount =
    Number(
      receipt.total || 0
    );


  // ----------------------------------------------------
  // Currency that we expect to appear on the card
  // notification.
  //
  // Current Receipt schema only stores this when
  // foreign-currency settlement was explicitly selected.
  // ----------------------------------------------------

  const expectedSettlementCurrency =
    receipt.expectedSettlementCurrency
      ? String(
          receipt.expectedSettlementCurrency
        )
          .trim()
          .toUpperCase()
      : null;


  // ----------------------------------------------------
  // Common currencies
  // ----------------------------------------------------

  const commonCurrencies = [
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


  // Make sure the receipt currency is available even
  // if a new currency is introduced later.

  if (
    receiptCurrency &&
    !commonCurrencies.includes(
      receiptCurrency
    )
  ) {

    commonCurrencies.unshift(
      receiptCurrency
    );
  }


  const currencyOptions =
    commonCurrencies
      .map(
        code => {

          const selected =
            code === receiptCurrency
              ? 'selected'
              : '';


          return `
            <option
              value="${escapeHtml(code)}"
              ${selected}
            >
              ${escapeHtml(code)}
            </option>
          `;
        }
      )
      .join('');


  return `
    <div
      class="card my-confirmation-card"
      data-receipt-id="${escapeHtml(
        receipt.id
      )}"
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
                  ${escapeHtml(
                    receipt.branch
                  )}
                </div>
              `
              : ''
          }

        </div>


        <div class="my-confirmation-total">

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '收據金額'
                : 'Receipt Total'
            }
          </div>


          <strong>
            ${formatMoney(
              expectedAmount,
              receiptCurrency
            )}
          </strong>

        </div>

      </div>


      <hr>


      <div class="grid">

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '信用卡通知金額'
                : 'Card Notification Amount'
            }

            <sup class="required-mark">
              *
            </sup>

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

            <sup class="required-mark">
              *
            </sup>

          </span>


          <select
            class="my-confirmation-currency"
          >
            ${currencyOptions}
          </select>

        </label>

      </div>


      ${
        expectedSettlementCurrency
          ? `
            <p class="muted my-confirmation-note">

              ${
                lang === 'zh-TW'
                  ? `此筆交易預期信用卡結帳幣值為 ${escapeHtml(
                      expectedSettlementCurrency
                    )}。`
                  : `Expected card settlement currency: ${escapeHtml(
                      expectedSettlementCurrency
                    )}.`
              }

            </p>
          `
          : `
            <p class="muted my-confirmation-note">

              ${
                lang === 'zh-TW'
                  ? '此筆交易沒有另外記錄外幣結帳選擇；信用卡通知幣值仍會保存。'
                  : 'No separate foreign-currency settlement choice was recorded. The notification currency will still be saved.'
              }

            </p>
          `
      }


      <div
        class="my-confirmation-result"
        hidden
      ></div>


      <div class="actions">

        <button
          class="primary submit-my-confirmation-btn"
          data-receipt-id="${escapeHtml(
            receipt.id
          )}"
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


  const amountInput =
    card.querySelector(
      '.my-confirmation-amount'
    );


  const currencySelect =
    card.querySelector(
      '.my-confirmation-currency'
    );


  const resultBox =
    card.querySelector(
      '.my-confirmation-result'
    );


  // ====================================================
  // Input
  // ====================================================

  const rawAmount =
    amountInput.value.trim();


  const reportedCurrency =
    currencySelect.value
      .trim()
      .toUpperCase();


  // ====================================================
  // Validation
  // ====================================================

  if (
    rawAmount === ''
  ) {

    alert(
      lang === 'zh-TW'
        ? '請輸入信用卡通知金額。'
        : 'Please enter the amount shown in the card notification.'
    );


    amountInput.focus();

    return;
  }


  const reportedAmount =
    Number(rawAmount);


  if (
    !Number.isFinite(
      reportedAmount
    ) ||
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


  if (
    !reportedCurrency
  ) {

    alert(
      lang === 'zh-TW'
        ? '請選擇信用卡通知幣值。'
        : 'Please select the card notification currency.'
    );

    return;
  }


  // ====================================================
  // Amount Match
  // ====================================================

  const expectedAmount =
    Number(
      receipt.total || 0
    );


  // Compare using cents to avoid floating-point issues.

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


  // ====================================================
  // Currency Match
  // ====================================================

  const expectedSettlementCurrency =
    receipt.expectedSettlementCurrency
      ? String(
          receipt.expectedSettlementCurrency
        )
          .trim()
          .toUpperCase()
      : null;


  let settlementCurrencyMatchStatus =
    'not_applicable';


  if (
    expectedSettlementCurrency
  ) {

    settlementCurrencyMatchStatus =
      reportedCurrency ===
      expectedSettlementCurrency
        ? 'match'
        : 'mismatch';
  }


  // ====================================================
  // Overall Mismatch
  // ====================================================

  const hasMismatch =
    amountMatchStatus ===
      'mismatch' ||
    settlementCurrencyMatchStatus ===
      'mismatch';


  // ====================================================
  // UI: submitting
  // ====================================================

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
          : 'This transaction is not currently pending confirmation.'
      );
    }


    // ==================================================
    // Check again whether confirmation already exists
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
    // Save Confirmation
    // ==================================================

    await setDoc(
      confirmationRef,
      {
        receiptId:
          receipt.id,

        confirmationUserId:
          currentUser.uid,


        // ----------------------------------------------
        // Amount
        // ----------------------------------------------

        expectedAmount,

        reportedAmount,

        amountMatchStatus,


        // ----------------------------------------------
        // Currency
        // ----------------------------------------------

        receiptCurrency:
          String(
            receipt.currency || ''
          )
            .trim()
            .toUpperCase(),

        expectedSettlementCurrency,

        reportedCurrency,

        settlementCurrencyMatchStatus,


        // ----------------------------------------------
        // Overall result
        // ----------------------------------------------

        hasMismatch,


        // ----------------------------------------------
        // Owner resolution
        //
        // Used later by the Owner mismatch module.
        // ----------------------------------------------

        mismatchResolved:
          false,

        mismatchResolvedAt:
          null,

        mismatchResolvedBy:
          null,


        // ----------------------------------------------
        // Audit
        // ----------------------------------------------

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
    // Success Result
    // ==================================================

    resultBox.hidden =
      false;


    resultBox.innerHTML = `
      <div>

        <strong>
          ${
            hasMismatch
              ? (
                  lang === 'zh-TW'
                    ? '核對結果：有不一致'
                    : 'Result: Mismatch found'
                )
              : (
                  lang === 'zh-TW'
                    ? '核對完成'
                    : 'Confirmation complete'
                )
          }
        </strong>


        <div>
          ${
            lang === 'zh-TW'
              ? '金額'
              : 'Amount'
          }：

          ${
            amountMatchStatus ===
            'match'
              ? (
                  lang === 'zh-TW'
                    ? '一致'
                    : 'Match'
                )
              : (
                  lang === 'zh-TW'
                    ? '不一致'
                    : 'Mismatch'
                )
          }
        </div>


        <div>
          ${
            lang === 'zh-TW'
              ? '結帳幣值'
              : 'Settlement Currency'
          }：

          ${
            settlementCurrencyMatchStatus ===
            'not_applicable'
              ? (
                  lang === 'zh-TW'
                    ? '無預期幣值可供核對'
                    : 'No expected currency recorded'
                )
              : settlementCurrencyMatchStatus ===
                'match'
                ? (
                    lang === 'zh-TW'
                      ? '一致'
                      : 'Match'
                  )
                : (
                    lang === 'zh-TW'
                      ? '不一致'
                      : 'Mismatch'
                  )
          }
        </div>

      </div>
    `;


    if (
      hasMismatch
    ) {

      resultBox.classList.add(
        'warn'
      );
    }


    button.textContent =
      lang === 'zh-TW'
        ? '已確認'
        : 'Confirmed';


    // ==================================================
    // Remove from My Confirmations
    // ==================================================

    setTimeout(
      () => {

        card.remove();


        const remaining =
          document.querySelectorAll(
            '.my-confirmation-card'
          );


        if (
          remaining.length === 0
        ) {

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

      },
      1200
    );


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
