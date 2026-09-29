// ======================================================
// My Confirmation
//
// Firestore:
//
// receipts/{receiptId}
//   └─ confirmations/{userUid}
//
// Supports:
// 1. Full single-receipt confirmation page
// 2. Dashboard quick confirmation
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

import {
  attachPendingReminderInfo,
  getPendingReminderClass
} from './pending.js';

import {
  getFxReference,
  buildFxDisplay
} from './fx.js';

import {
  getMyPendingTransfers
} from './transfer.js';

import {
  getMyPendingRefunds
} from './refund.js';


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

function fxReferenceHtml(
  fxDisplay,
  network,
  lang
) {

  if (!fxDisplay) {
    return '';
  }


  const networkLabel =
    String(
      network || ''
    ).trim() ||
    fxDisplay.source ||
    'FX';


  return `
    <div
      class="fx-reference"
      style="
        margin-top: 8px;
        font-size: 0.9rem;
        line-height: 1.45;
      "
    >
      <div>
        <strong>
          ${escapeHtml(networkLabel)}
        </strong>

        <span class="muted">
          ${
            lang === 'zh-TW'
              ? `參考日期：${escapeHtml(
                  fxDisplay.formattedReferenceDate
                )}`
              : `Reference date: ${escapeHtml(
                  fxDisplay.formattedReferenceDate
                )}`
          }
        </span>
      </div>

      <div>
  ${Number(
    fxDisplay.foreignAmount
  ).toLocaleString(
    'en-US',
    {
      maximumFractionDigits: 2
    }
  )}
  ${escapeHtml(
    fxDisplay.currency
  )}
  ≈
  ${escapeHtml(
    fxDisplay.formattedConvertedAmount
  )}
  ${escapeHtml(
    fxDisplay.homeCurrency
  )}
</div>


      <div>
        1
        ${escapeHtml(
          fxDisplay.currency
        )}
        ≈
        ${escapeHtml(
          fxDisplay.formattedRate
        )}
        ${escapeHtml(
          fxDisplay.homeCurrency
        )}

        <span class="muted">
          （${escapeHtml(
            fxDisplay.sourceLabel
          )}）
        </span>
      </div>
    </div>
  `;
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


function getCurrencyOptions(
  selectedCurrency = ''
) {

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


  const normalized =
    String(selectedCurrency || '')
      .trim()
      .toUpperCase();


  if (
    normalized &&
    !currencies.includes(normalized)
  ) {

    currencies.unshift(
      normalized
    );
  }


  return currencies
    .map(code => `
      <option
        value="${escapeHtml(code)}"
        ${
          code === normalized
            ? 'selected'
            : ''
        }
      >
        ${escapeHtml(code)}
      </option>
    `)
    .join('');
}


// ======================================================
// FX Reference
// ======================================================

async function renderFxReferenceForConfirmation({
  receipt,
  container,
  lang
}) {

  if (
    !receipt ||
    !container ||
    receipt.paymentMethod !== 'card'
  ) {

    return;
  }


  const currency =
    String(
      receipt.currency || ''
    )
      .trim()
      .toUpperCase();


  // TWD does not need FX reference.
  if (
    !currency ||
    currency === 'TWD'
  ) {

    return;
  }


  const network =
    receipt.cardSnapshot?.network ||
    '';


  if (!network) {

    return;
  }


  const fxTarget =
    container.querySelector(
      '.my-confirmation-fx-reference'
    );


  if (!fxTarget) {

    return;
  }


  try {

    const fxReference =
      await getFxReference({
        purchaseDate:
          receipt.purchaseDate,

        currency,

        network
      });


    if (!fxReference.available) {

      fxTarget.innerHTML = '';

      return;
    }


    const fxDisplay =
      buildFxDisplay(
        fxReference,
        receipt.total
      );


    if (!fxDisplay) {

      fxTarget.innerHTML = '';

      return;
    }


    fxTarget.innerHTML =
      fxReferenceHtml(
        fxDisplay,
        network,
        lang
      );


  } catch (error) {

    console.error(
      'Failed to load FX reference:',
      error
    );


    fxTarget.innerHTML = '';
  }
}


// ======================================================
// Get Pending Confirmations
// ======================================================

export async function getMyPendingConfirmations({
  db,
  currentUser
}) {

  if (!db || !currentUser) {
    return [];
  }


  // ====================================================
  // New receipts:
  // confirmationUserIds: [uidA, uidB, uidC]
  // ====================================================

  const multiUserQuery =
    query(
      collection(db, 'receipts'),
      where(
        'confirmationUserIds',
        'array-contains',
        currentUser.uid
      )
    );


  // ====================================================
  // Legacy receipts:
  // confirmationUserId: uidA
  //
  // Keep this temporarily so old receipts still work.
  // ====================================================

  const legacyUserQuery =
    query(
      collection(db, 'receipts'),
      where(
        'confirmationUserId',
        '==',
        currentUser.uid
      )
    );


  const [
    multiUserSnapshot,
    legacyUserSnapshot
  ] =
    await Promise.all([
      getDocs(multiUserQuery),
      getDocs(legacyUserQuery)
    ]);


  // ====================================================
  // Merge both query results
  //
  // A new receipt may match BOTH queries because during
  // migration we still keep confirmationUserId as the
  // first confirmer. Map prevents duplicates.
  // ====================================================

  const receiptMap =
    new Map();


  const addReceipt =
    receiptDoc => {

      const data =
        receiptDoc.data();


      if (data.status !== 'pending') {
        return;
      }


      if (data.paymentMethod !== 'card') {
        return;
      }


      receiptMap.set(
        receiptDoc.id,
        {
          id: receiptDoc.id,
          ...data
        }
      );
    };


  multiUserSnapshot.forEach(
    addReceipt
  );


  legacyUserSnapshot.forEach(
    addReceipt
  );


  const assignedReceipts =
    Array.from(
      receiptMap.values()
    );


  // Newest first
  assignedReceipts.sort((a, b) => {

    const dateA =
      `${a.purchaseDate || ''} ${a.purchaseTime || ''}`;

    const dateB =
      `${b.purchaseDate || ''} ${b.purchaseTime || ''}`;

    return dateB.localeCompare(dateA);
  });


  const receiptsNeedingConfirmation = [];


  // ====================================================
  // IMPORTANT:
  //
  // A receipt is complete as soon as ANY assigned user
  // has submitted a confirmation.
  //
  // Therefore we check the entire confirmations
  // subcollection, not only confirmations/currentUser.
  // ====================================================

  for (const receipt of assignedReceipts) {

    const confirmationsRef =
      collection(
        db,
        'receipts',
        receipt.id,
        'confirmations'
      );


    const confirmationSnapshot =
      await getDocs(
        confirmationsRef
      );


    if (confirmationSnapshot.empty) {

      receiptsNeedingConfirmation.push(
        receipt
      );
    }
  }


  return receiptsNeedingConfirmation;
}


// ======================================================
// Shared Save Function
//
// BOTH Dashboard and full confirmation page use this.
// ======================================================

export async function saveMyConfirmation({
  db,
  currentUser,
  receipt,
  notificationCurrencyType,
  amountMatchStatus,
  reportedAmount = null,
  reportedCurrency = null,
  notes = ''
}) {
  

  if (!db || !currentUser || !receipt) {
    throw new Error(
      'Missing confirmation dependency.'
    );
  }


  if (
    notificationCurrencyType !== 'local' &&
    notificationCurrencyType !== 'foreign'
  ) {
    throw new Error(
      'Invalid notification currency type.'
    );
  }


  if (
    amountMatchStatus !== 'match' &&
    amountMatchStatus !== 'mismatch'
  ) {
    throw new Error(
      'Invalid amount confirmation result.'
    );
  }


  // ====================================================
  // Confirm that the current user is assigned
  //
  // New receipts:
  //   confirmationUserIds: [uidA, uidB, uidC]
  //
  // Legacy receipts:
  //   confirmationUserId: uidA
  // ====================================================

  const assignedConfirmationUserIds =
    Array.isArray(
      receipt.confirmationUserIds
    )
      ? receipt.confirmationUserIds.filter(
          Boolean
        )
      : [];


  const isAssignedUser =
    assignedConfirmationUserIds.includes(
      currentUser.uid
    ) ||
    (
      assignedConfirmationUserIds.length === 0 &&
      receipt.confirmationUserId ===
        currentUser.uid
    );


  if (!isAssignedUser) {

    throw new Error(
      'This transaction is not assigned to the current user.'
    );
  }


  if (receipt.status !== 'pending') {
    throw new Error(
      'This transaction is not pending confirmation.'
    );
  }


  const expectedAmount =
    Number(receipt.total || 0);


  const expectedCurrency =
    getExpectedCurrency(receipt);


  const amountMismatch =
    amountMatchStatus === 'mismatch';


  let finalReportedAmount;
  let finalReportedCurrency;


  // --------------------------------------------------
  // Amount matches
  // --------------------------------------------------

  if (!amountMismatch) {

    finalReportedAmount =
      expectedAmount;

    finalReportedCurrency =
      expectedCurrency;
  }


  // --------------------------------------------------
  // Amount mismatch
  // --------------------------------------------------

  else {

    finalReportedAmount =
      Number(reportedAmount);


    if (
      !Number.isFinite(finalReportedAmount) ||
      finalReportedAmount < 0
    ) {
      throw new Error(
        'Invalid card notification amount.'
      );
    }


    finalReportedCurrency =
      String(
        reportedCurrency || ''
      )
        .trim()
        .toUpperCase();


    if (!finalReportedCurrency) {
      throw new Error(
        'Card notification currency is required.'
      );
    }
  }


// --------------------------------------------------
// Currency-type mismatch
//
// Current rule:
// - Receipt is expected to be charged in foreign currency.
// - "以外幣結帳" is kept only as receipt information.
// - Card notification = foreign -> currency matches.
// - Card notification = local/TWD -> currency mismatch.
//
// IMPORTANT:
// Currency mismatch and amount mismatch are independent.
// Example:
// Receipt USD 7
// Card notification TWD 210
// User may answer:
//   currency = local
//   amount = match
//
// Result:
//   currencyTypeMismatch = true
//   amountMismatch = false
//   hasMismatch = true
// --------------------------------------------------

const foreignCurrencyWasSelected =
  receipt.foreignCurrencySettlementOffered === true;


const receiptCurrency =
  String(
    receipt.currency || ''
  )
    .trim()
    .toUpperCase();


const expectedNotificationCurrencyType =
  receiptCurrency === 'TWD'
    ? 'local'
    : 'foreign';


const currencyTypeMismatch =
  notificationCurrencyType !==
  expectedNotificationCurrencyType;


const currencyTypeMatchStatus =
  currencyTypeMismatch
    ? 'mismatch'
    : 'match';


  // --------------------------------------------------
  // Overall mismatch
  // --------------------------------------------------

  const hasMismatch =
    amountMismatch ||
    currencyTypeMismatch;


  const mismatchReasons = [];


  if (amountMismatch) {
    mismatchReasons.push('amount');
  }


  if (currencyTypeMismatch) {
    mismatchReasons.push(
      'currencyType'
    );
  }


  // --------------------------------------------------
  // Confirmation document
  // --------------------------------------------------

    // ====================================================
  // Confirmation document
  //
  // Any ONE assigned confirmer completes the receipt.
  // Therefore check whether ANY confirmation already
  // exists before allowing another submission.
  // ====================================================

  const confirmationsRef =
    collection(
      db,
      'receipts',
      receipt.id,
      'confirmations'
    );


  const existingConfirmations =
    await getDocs(
      confirmationsRef
    );


  if (!existingConfirmations.empty) {

    throw new Error(
      'This transaction has already been confirmed.'
    );
  }


  // The confirmation document is still stored under
  // the UID of the person who actually confirmed it.
  const confirmationRef =
    doc(
      db,
      'receipts',
      receipt.id,
      'confirmations',
      currentUser.uid
    );
  
  
  await setDoc(
    confirmationRef,
    {
      receiptId:
        receipt.id,

      confirmationUserId:
        currentUser.uid,


      // Currency type shown by card notification
      notificationCurrencyType,


      // Amount answer
      confirmationResult:
        amountMismatch
          ? 'mismatch'
          : 'match',

      expectedAmount,

      reportedAmount:
        finalReportedAmount,

      amountMatchStatus,

      amountMismatch,


      // Currency
      receiptCurrency:
        String(
          receipt.currency || ''
        )
          .trim()
          .toUpperCase(),

      expectedSettlementCurrency:
        expectedCurrency,

      reportedCurrency:
        finalReportedCurrency,

      foreignCurrencyWasSelected,

      currencyTypeMatchStatus,

      currencyTypeMismatch,


      // Overall
      hasMismatch,

      mismatchReasons,


      // Notes
      notes:
        String(notes || '').trim(),


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


  return {
    hasMismatch,
    amountMismatch,
    currencyTypeMismatch,
    mismatchReasons
  };
}


// ======================================================
// Main Confirmation Page
//
// receiptId:
// - provided -> show one Receipt confirmation
// - missing  -> unified pending queue:
//               Receipt + Transfer + Refund
// ======================================================

export async function myConfirmationPage({
  db,
  currentUser,
  lang,
  page,
  receiptId = null
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
      ? '這裡顯示所有需要你確認的收據、轉帳與退款。'
      : 'All receipts, transfers, and refunds requiring your confirmation are shown here.'
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
  // One specific Receipt confirmation
  // ==================================================

  if (receiptId) {

    const receipts =
      await getMyPendingConfirmations({
        db,
        currentUser
      });


    const requestedIndex =
      receipts.findIndex(
        receipt =>
          receipt.id === receiptId
      );


    if (requestedIndex === -1) {

      location.hash =
        '#my-confirmations';

      return;
    }


    renderSingleConfirmation({
      db,
      currentUser,
      lang,
      list,
      receipts,
      currentIndex:
        requestedIndex
    });


    return;
  }


  // ==================================================
  // Unified confirmation queue
  // ==================================================

  const [
    receipts,
    transfers,
    refunds
  ] =
    await Promise.all([

      getMyPendingConfirmations({
        db,
        currentUser
      }),

      getMyPendingTransfers({
        db,
        currentUser
      }),

      getMyPendingRefunds({
        db,
        currentUser
      })

    ]);


  const totalPending =
    receipts.length +
    transfers.length +
    refunds.length;


  if (totalPending === 0) {

    renderEmptyState(
      list,
      lang
    );

    return;
  }


  renderConfirmationList({
    list,
    receipts,
    transfers,
    refunds,
    lang
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
// Render Confirmation List
// ======================================================

function renderConfirmationList({
  list,
  receipts,
  transfers,
  refunds,
  lang
}) {

  const sortedReceipts =
    [...receipts]
      .map(receipt =>
        attachPendingReminderInfo(
          receipt
        )
      )
      .sort((a, b) =>
        String(
          a.purchaseDate || ''
        ).localeCompare(
          String(
            b.purchaseDate || ''
          )
        )
      );


  const sortedTransfers =
    [...transfers]
      .sort((a, b) =>
        String(
          a.transferDate || ''
        ).localeCompare(
          String(
            b.transferDate || ''
          )
        )
      );


  const sortedRefunds =
    [...refunds]
      .sort((a, b) =>
        String(
          a.refundDate || ''
        ).localeCompare(
          String(
            b.refundDate || ''
          )
        )
      );


  // --------------------------------------------------
  // Receipt rows
  // --------------------------------------------------

  const receiptRows =
    sortedReceipts
      .map(receipt => {

        const reminderClass =
          getPendingReminderClass(
            receipt.daysWaiting
          );


        const receiptCurrency =
          getExpectedCurrency(
            receipt
          );


        const waitingText =
          Number.isFinite(
            receipt.daysWaiting
          )
            ? (
                lang === 'zh-TW'
                  ? `${receipt.daysWaiting} 天`
                  : `${receipt.daysWaiting} days`
              )
            : '—';


        return `

          <button
            type="button"
            class="
              confirmation-queue-row
              confirmation-queue-receipt
              ${reminderClass}
            "
            data-confirmation-type="receipt"
            data-confirmation-id="${escapeHtml(
              receipt.id
            )}"
          >

            <span class="confirmation-queue-date">
              ${escapeHtml(
                receipt.purchaseDate || '—'
              )}
            </span>


            <span class="confirmation-queue-main">

              <strong>
                ${escapeHtml(
                  receipt.store || '—'
                )}
              </strong>

              <small class="muted">
                ${
                  lang === 'zh-TW'
                    ? '收據'
                    : 'Receipt'
                }
              </small>

            </span>


            <strong class="confirmation-queue-amount">
              ${formatMoney(
                receipt.total || 0,
                receiptCurrency
              )}
            </strong>


            <span
              class="
                confirmation-queue-status
                muted
              "
            >
              ${escapeHtml(
                waitingText
              )}
            </span>


            <span class="confirmation-queue-action">
              ${
                lang === 'zh-TW'
                  ? '確認 ›'
                  : 'Confirm ›'
              }
            </span>

          </button>

        `;

      })
      .join('');


  // --------------------------------------------------
  // Transfer rows
  // --------------------------------------------------

  const transferRows =
    sortedTransfers
      .map(transfer => {

        const senderName =
          transfer.senderName ||
          (
            lang === 'zh-TW'
              ? '轉帳人'
              : 'Sender'
          );


        return `

          <button
            type="button"
            class="
              confirmation-queue-row
              confirmation-queue-transfer
            "
            data-confirmation-type="transfer"
            data-confirmation-id="${escapeHtml(
              transfer.id
            )}"
          >

            <span class="confirmation-queue-date">
              ${escapeHtml(
                transfer.transferDate || '—'
              )}
            </span>


            <span class="confirmation-queue-main">

              <strong>
                ${escapeHtml(
                  senderName
                )}
              </strong>

              <small class="muted">
                ${
                  lang === 'zh-TW'
                    ? '轉帳給你'
                    : 'Transfer to you'
                }
              </small>

            </span>


            <strong class="confirmation-queue-amount">
              ${formatMoney(
                transfer.amount || 0,
                transfer.currency || ''
              )}
            </strong>


            <span
              class="
                confirmation-queue-status
                muted
              "
            >
              ${
                lang === 'zh-TW'
                  ? '等待收款確認'
                  : 'Awaiting receipt'
              }
            </span>


            <span class="confirmation-queue-action">
              ${
                lang === 'zh-TW'
                  ? '確認 ›'
                  : 'Confirm ›'
              }
            </span>

          </button>

        `;

      })
      .join('');


  // --------------------------------------------------
  // Refund rows
  // --------------------------------------------------

  const refundRows =
    sortedRefunds
      .map(refund => {

        return `

          <button
            type="button"
            class="
              confirmation-queue-row
              confirmation-queue-refund
            "
            data-confirmation-type="refund"
            data-confirmation-id="${escapeHtml(
              refund.id
            )}"
          >

            <span class="confirmation-queue-date">
              ${escapeHtml(
                refund.refundDate || '—'
              )}
            </span>


            <span class="confirmation-queue-main">

              <strong>
                ${escapeHtml(
                  refund.store || '—'
                )}
              </strong>

              <small class="muted">
                ${
                  lang === 'zh-TW'
                    ? '退款'
                    : 'Refund'
                }
              </small>

            </span>


            <strong class="confirmation-queue-amount">
              +${formatMoney(
                refund.amount || 0,
                refund.currency || ''
              )}
            </strong>


            <span
              class="
                confirmation-queue-status
                muted
              "
            >
              ${escapeHtml(
                refund.destinationLabel ||
                (
                  lang === 'zh-TW'
                    ? '等待退款'
                    : 'Awaiting refund'
                )
              )}
            </span>


            <span class="confirmation-queue-action">
              ${
                lang === 'zh-TW'
                  ? '確認 ›'
                  : 'Confirm ›'
              }
            </span>

          </button>

        `;

      })
      .join('');


  // --------------------------------------------------
  // Section helper
  // --------------------------------------------------

  function sectionHtml({
    type,
    titleZh,
    titleEn,
    count,
    rows
  }) {

    if (count === 0) {
      return '';
    }


    return `

      <section
        class="
          confirmation-queue-section
          confirmation-queue-section-${type}
        "
      >

        <div class="confirmation-queue-heading">

          <h2>
            ${
              lang === 'zh-TW'
                ? titleZh
                : titleEn
            }

            <span class="badge">
              ${count}
            </span>
          </h2>

        </div>


        <div class="confirmation-queue-header">

          <span>
            ${
              lang === 'zh-TW'
                ? '日期'
                : 'Date'
            }
          </span>

          <span>
            ${
              lang === 'zh-TW'
                ? '項目'
                : 'Item'
            }
          </span>

          <span>
            ${
              lang === 'zh-TW'
                ? '金額'
                : 'Amount'
            }
          </span>

          <span>
            ${
              lang === 'zh-TW'
                ? '狀態'
                : 'Status'
            }
          </span>

          <span></span>

        </div>


        <div class="confirmation-queue-list">
          ${rows}
        </div>

      </section>

    `;
  }


  // --------------------------------------------------
  // Final page
  // --------------------------------------------------

  list.innerHTML = `

    <div class="confirmation-queue">

      ${sectionHtml({
        type: 'receipt',
        titleZh: '收據',
        titleEn: 'Receipts',
        count: sortedReceipts.length,
        rows: receiptRows
      })}


      ${sectionHtml({
        type: 'transfer',
        titleZh: '轉帳',
        titleEn: 'Transfers',
        count: sortedTransfers.length,
        rows: transferRows
      })}


      ${sectionHtml({
        type: 'refund',
        titleZh: '退款',
        titleEn: 'Refunds',
        count: sortedRefunds.length,
        rows: refundRows
      })}

    </div>

  `;


  // --------------------------------------------------
  // Row navigation
  // --------------------------------------------------

  list
    .querySelectorAll(
      '.confirmation-queue-row'
    )
    .forEach(row => {

      row.onclick = () => {

        const type =
          row.dataset
            .confirmationType;


        const id =
          row.dataset
            .confirmationId;


        if (!id) {
          return;
        }


        if (type === 'receipt') {

          location.hash =
            `#my-confirmations/${id}`;

          return;
        }


        if (type === 'transfer') {

          location.hash =
            `#transfer-detail/${id}`;

          return;
        }


        if (type === 'refund') {

          location.hash =
            `#refund-detail/${id}`;

        }

      };

    });
}



// ======================================================
// Render One Confirmation
// ======================================================

function renderSingleConfirmation({
  db,
  currentUser,
  lang,
  list,
  receipts,
  currentIndex
}) {

  const receipt =
    receipts[currentIndex];


  if (!receipt) {

    renderEmptyState(
      list,
      lang
    );

    return;
  }


  list.innerHTML =
    confirmationCardHtml(
      receipt,
      lang
    );

  renderFxReferenceForConfirmation({
    receipt,
    container: list,
    lang
  });

// --------------------------------------------------
// Restore Dashboard quick-confirmation draft
// --------------------------------------------------

const draftKey =
  `confirmation-draft-${receipt.id}`;


const draftRaw =
  sessionStorage.getItem(
    draftKey
  );


if (draftRaw) {

  try {

    const draft =
      JSON.parse(
        draftRaw
      );


    const restoredCard =
      list.querySelector(
        '.my-confirmation-card'
      );


    if (
      draft.notificationCurrencyType
    ) {

      const currencyRadio =
        restoredCard.querySelector(
          `.notification-currency-type[value="${draft.notificationCurrencyType}"]`
        );


      if (currencyRadio) {
        currencyRadio.checked =
          true;
      }
    }


    if (
      draft.amountMatchStatus
    ) {

      const amountRadio =
        restoredCard.querySelector(
          `.confirmation-match-choice[value="${draft.amountMatchStatus}"]`
        );


      if (amountRadio) {
        amountRadio.checked =
          true;
      }


      const restoredMismatchFields =
        restoredCard.querySelector(
          '.mismatch-fields'
        );


      if (restoredMismatchFields) {

        restoredMismatchFields.hidden =
          draft.amountMatchStatus !==
          'mismatch';
      }
    }


    sessionStorage.removeItem(
      draftKey
    );


  } catch (error) {

    console.error(
      'Failed to restore confirmation draft:',
      error
    );


    sessionStorage.removeItem(
      draftKey
    );
  }
}

  
  // --------------------------------------------------
  // View receipt details
  // --------------------------------------------------

  const detailButton =
    list.querySelector(
      '.viewReceiptDetailBtn'
    );


  if (detailButton) {

    detailButton.onclick = () => {

      location.hash =
        `#receipt-detail/${receipt.id}`;
    };
  }


  // --------------------------------------------------
  // Match / mismatch UI
  // --------------------------------------------------

  const card =
    list.querySelector(
      '.my-confirmation-card'
    );


  const mismatchFields =
    card.querySelector(
      '.mismatch-fields'
    );


  card
    .querySelectorAll(
      '.confirmation-match-choice'
    )
    .forEach(radio => {

      radio.addEventListener(
        'change',
        () => {

          mismatchFields.hidden =
            radio.value !== 'mismatch';
        }
      );
    });


  // --------------------------------------------------
  // Submit
  // --------------------------------------------------

  const submitButton =
    card.querySelector(
      '.submit-my-confirmation-btn'
    );


  submitButton.onclick =
    async () => {

      await submitFullConfirmation({
        db,
        currentUser,
        lang,
        receipt,
        button:
          submitButton,
        receipts,
        currentIndex,
        list
      });
    };
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

      <div class="actions">
        <button
          type="button"
          onclick="location.hash='#dashboard'"
        >
          ${
            lang === 'zh-TW'
              ? '回到 Dashboard'
              : 'Back to Dashboard'
          }
        </button>
      </div>

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

  const expectedCurrency =
    getExpectedCurrency(
      receipt
    );


  const expectedAmount =
    Number(
      receipt.total || 0
    );


  const currencyOptions =
    getCurrencyOptions(
      expectedCurrency
    );


  const receiptWithReminder =
    attachPendingReminderInfo(
      receipt
    );


  const reminderClass =
    getPendingReminderClass(
      receiptWithReminder.daysWaiting
    );


  return `
    <div
      class="
        card
        my-confirmation-card
        ${reminderClass}
      "
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
            Receipt
          </div>

          <strong>
            ${formatMoney(
              expectedAmount,
              expectedCurrency
            )}
          </strong>

          <div
            class="my-confirmation-fx-reference"
          ></div>

        </div>

      </div>


      <div class="actions">

        <button
          type="button"
          class="viewReceiptDetailBtn"
        >
          ${
            lang === 'zh-TW'
              ? '檢視明細'
              : 'View Details'
          }
        </button>

      </div>


      <hr>


      <div class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '信用卡通知顯示的請款幣值？'
              : 'What currency type is shown in the card notification?'
          }

          <sup class="required-mark">*</sup>

        </span>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="notification-currency-type"
            name="currency-type-${escapeHtml(receipt.id)}"
            value="local"
          >

          ${
            lang === 'zh-TW'
              ? '台幣'
              : 'TWD'
          }

        </label>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="notification-currency-type"
            name="currency-type-${escapeHtml(receipt.id)}"
            value="foreign"
          >

          ${
            lang === 'zh-TW'
              ? '外幣'
              : 'Foreign currency'
          }

        </label>

      </div>


      <div class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '信用卡通知金額是否相符？'
              : 'Does the card notification amount match?'
          }

          <sup class="required-mark">*</sup>

        </span>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="confirmation-match-choice"
            name="match-${escapeHtml(receipt.id)}"
            value="match"
          >

          ${
            lang === 'zh-TW'
              ? '相符'
              : 'Match'
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


      <label class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '備註（選填）'
              : 'Notes (optional)'
          }

        </span>

        <textarea
          class="my-confirmation-notes"
          rows="3"
          placeholder="${
            lang === 'zh-TW'
              ? '例如：信用卡通知上的商家名稱不同、其他核對資訊等'
              : 'e.g. different merchant name shown by the card notification'
          }"
        ></textarea>

      </label>


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
// Submit Full Confirmation
// ======================================================

async function submitFullConfirmation({
  db,
  currentUser,
  lang,
  receipt,
  button,
  receipts,
  currentIndex,
  list
}) {

  const card =
    button.closest(
      '.my-confirmation-card'
    );


  if (!card) {
    return;
  }


  // --------------------------------------------------
  // Currency type
  // --------------------------------------------------

  const currencyTypeChoice =
    card.querySelector(
      '.notification-currency-type:checked'
    );


  if (!currencyTypeChoice) {

    alert(
      lang === 'zh-TW'
        ? '請選擇信用卡通知顯示的請款幣值是台幣或外幣。'
        : 'Please select whether the card notification shows TWD or foreign currency.'
    );

    return;
  }


  // --------------------------------------------------
  // Amount match choice
  // --------------------------------------------------

  const selectedChoice =
    card.querySelector(
      '.confirmation-match-choice:checked'
    );


  if (!selectedChoice) {

    alert(
      lang === 'zh-TW'
        ? '請選擇信用卡通知金額是相符或不符。'
        : 'Please select whether the card notification amount matches.'
    );

    return;
  }


  const notificationCurrencyType =
    currencyTypeChoice.value;


  const amountMatchStatus =
    selectedChoice.value;


  const notes =
    card
      .querySelector(
        '.my-confirmation-notes'
      )
      ?.value
      .trim() || '';


  let reportedAmount = null;
  let reportedCurrency = null;


  // --------------------------------------------------
  // Mismatch fields
  // --------------------------------------------------

  if (
    amountMatchStatus === 'mismatch'
  ) {

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


  button.disabled = true;


  button.textContent =
    lang === 'zh-TW'
      ? '正在送出…'
      : 'Submitting…';


  try {

    const result =
      await saveMyConfirmation({
        db,
        currentUser,
        receipt,
        notificationCurrencyType,
        amountMatchStatus,
        reportedAmount,
        reportedCurrency,
        notes
      });


    const resultBox =
      card.querySelector(
        '.my-confirmation-result'
      );


    resultBox.hidden =
      false;


    resultBox.innerHTML = `
      <strong>
        ${
          result.hasMismatch
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


    if (result.hasMismatch) {

      resultBox.classList.add(
        'warn'
      );
    }


    button.textContent =
      lang === 'zh-TW'
        ? '已確認'
        : 'Confirmed';


    // Disable confirmation inputs after submission.
    card
      .querySelectorAll(
        'input, select, textarea'
      )
      .forEach(input => {
        input.disabled = true;
      });


    // Remove submit button.
    button.hidden = true;


    // ------------------------------------------------
    // Navigation appears AFTER confirmation
    // ------------------------------------------------

    const previousReceipt =
      currentIndex > 0
        ? receipts[currentIndex - 1]
        : null;


    const nextReceipt =
      currentIndex < receipts.length - 1
        ? receipts[currentIndex + 1]
        : null;


    const navigation =
      document.createElement(
        'div'
      );


    navigation.className =
      'actions confirmation-navigation';


    navigation.innerHTML = `

      ${
        previousReceipt
          ? `
            <button
              type="button"
              class="previousConfirmationBtn"
            >
              ${
                lang === 'zh-TW'
                  ? '← 前一筆'
                  : '← Previous'
              }
            </button>
          `
          : ''
      }


      <button
        type="button"
        class="dashboardConfirmationBtn"
      >
        ${
          lang === 'zh-TW'
            ? '回到 Dashboard'
            : 'Back to Dashboard'
        }
      </button>


      ${
        nextReceipt
          ? `
            <button
              type="button"
              class="nextConfirmationBtn primary"
            >
              ${
                lang === 'zh-TW'
                  ? '下一筆 →'
                  : 'Next →'
              }
            </button>
          `
          : ''
      }

    `;


    card.appendChild(
      navigation
    );


    const previousButton =
      navigation.querySelector(
        '.previousConfirmationBtn'
      );


    if (
      previousButton &&
      previousReceipt
    ) {

      previousButton.onclick =
        () => {

          location.hash =
            `#my-confirmations/${previousReceipt.id}`;
        };
    }


    const nextButton =
      navigation.querySelector(
        '.nextConfirmationBtn'
      );


    if (
      nextButton &&
      nextReceipt
    ) {

      nextButton.onclick =
        () => {

          location.hash =
            `#my-confirmations/${nextReceipt.id}`;
        };
    }


    navigation
      .querySelector(
        '.dashboardConfirmationBtn'
      )
      .onclick =
        () => {

          location.hash =
            '#dashboard';
        };


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
