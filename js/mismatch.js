// ======================================================
// Mismatch / Owner Resolution
//
// Firestore:
// receipts/{receiptId}
//   └─ confirmations/{userUid}
//
// Responsibilities:
// 1. Load unresolved confirmation mismatches
// 2. Render Owner mismatch list
// 3. Render mismatch detail
// 4. Resolve mismatch
// ======================================================


import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
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
  currency = ''
) {

  return `${
    escapeHtml(currency)
  } ${
    Number(value || 0).toFixed(2)
  }`;
}


// ======================================================
// Mismatch Labels
// ======================================================

function getMismatchReasonLabels({
  confirmation,
  lang
}) {

  const reasons = [];


  if (
    confirmation.amountMismatch === true
  ) {

    reasons.push(
      lang === 'zh-TW'
        ? '金額不符'
        : 'Amount mismatch'
    );
  }


  if (
    confirmation.currencyTypeMismatch === true
  ) {

    reasons.push(
      lang === 'zh-TW'
        ? '請款幣值不符'
        : 'Currency mismatch'
    );
  }


  return reasons;
}


// ======================================================
// Load Unresolved Mismatches
// ======================================================

export async function getUnresolvedMismatches({
  db
}) {

  if (!db) {
    return [];
  }


  // ==================================================
  // 1. Receipt mismatches
  // ==================================================

  const receiptMismatchQuery =
    query(
      collectionGroup(
        db,
        'confirmations'
      ),
      where(
        'hasMismatch',
        '==',
        true
      ),
      where(
        'mismatchResolved',
        '==',
        false
      )
    );


  const receiptMismatchSnapshot =
    await getDocs(
      receiptMismatchQuery
    );


  const mismatches = [];


  for (
    const confirmationDoc
    of receiptMismatchSnapshot.docs
  ) {

    const confirmation =
      confirmationDoc.data();


    const receiptId =
      confirmation.receiptId ||
      confirmationDoc.ref.parent.parent?.id;


    if (!receiptId) {
      continue;
    }


    const receiptSnapshot =
      await getDoc(
        doc(
          db,
          'receipts',
          receiptId
        )
      );


    if (!receiptSnapshot.exists()) {
      continue;
    }


    const receipt = {
      id: receiptSnapshot.id,
      ...receiptSnapshot.data()
    };


    mismatches.push({

      type:
        'receipt',

      id:
        confirmationDoc.id,

      confirmationId:
        confirmationDoc.id,

      confirmationPath:
        confirmationDoc.ref.path,

      confirmation,

      receipt

    });
  }


  // ==================================================
  // 2. Transfer mismatches
  // ==================================================
  //
  // Query by status only, then filter resolution
  // client-side for backward compatibility with
  // older Transfer documents that may not contain
  // transferMismatchResolved.
  // ==================================================

  const transferMismatchQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'status',
        '==',
        'mismatch'
      )
    );


  const transferMismatchSnapshot =
    await getDocs(
      transferMismatchQuery
    );


  transferMismatchSnapshot.docs
    .map(transferDoc => ({
      id:
        transferDoc.id,

      ...transferDoc.data()
    }))
    .filter(transfer =>
      transfer.transferMismatchResolved !== true
    )
    .forEach(transfer => {

      mismatches.push({

        type:
          'transfer',

        id:
          transfer.id,

        transfer

      });

    });



  // ==================================================
// 3. Refund mismatches
// ==================================================

const refundMismatchQuery =
  query(
    collection(
      db,
      'refunds'
    ),
    where(
      'status',
      '==',
      'mismatch'
    )
  );


const refundMismatchSnapshot =
  await getDocs(
    refundMismatchQuery
  );


refundMismatchSnapshot.docs
  .map(refundDoc => ({
    id:
      refundDoc.id,

    ...refundDoc.data()
  }))
  .filter(refund =>
    refund.refundMismatchResolved !== true
  )
  .forEach(refund => {

    mismatches.push({

      type:
        'refund',

      id:
        refund.id,

      refund

    });
  });


  // ==================================================
  // 4. Unmatched transaction reports
  // ==================================================

  const unmatchedQuery =
    query(
      collection(
        db,
        'unmatchedTransactions'
      ),
      where(
        'status',
        '==',
        'open'
      )
    );


  const unmatchedSnapshot =
    await getDocs(
      unmatchedQuery
    );


  unmatchedSnapshot.docs
    .forEach(reportDoc => {

      const report = {
        id:
          reportDoc.id,

        ...reportDoc.data()
      };


      mismatches.push({

        type:
          'unmatched',

        id:
          report.id,

        unmatched:
          report

      });

    });

  
  // ==================================================
  // 5. Oldest transaction first
  // ==================================================

  mismatches.sort(
    (a, b) => {

      const dateA =
        String(
          a.type === 'transfer'
            ? a.transfer?.transferDate || ''
            : (
          a.type === 'refund'
            ? a.refund?.refundDate || ''
            : (
                a.type === 'unmatched'
                  ? a.unmatched?.transactionDate || ''
                  : a.receipt?.purchaseDate || ''
              )
        )
        );


      const dateB =
        String(
          b.type === 'transfer'
            ? b.transfer?.transferDate || ''
            : (
          b.type === 'refund'
            ? b.refund?.refundDate || ''
            : (
                b.type === 'unmatched'
                  ? b.unmatched?.transactionDate || ''
                  : b.receipt?.purchaseDate || ''
              )
        )
        );


      if (!dateA && !dateB) {
        return 0;
      }

      if (!dateA) {
        return 1;
      }

      if (!dateB) {
        return -1;
      }


      return dateA.localeCompare(
        dateB
      );
    }
  );


  return mismatches;
}


// ======================================================
// Load All Mismatches
// Used by the full mismatch page.
// Dashboard should continue using getUnresolvedMismatches().
// ======================================================

async function getAllMismatches({
  db
}) {

  if (!db) {
    return [];
  }


  const mismatches = [];


  
  // ==================================================
  // 1. Receipt mismatches
  // ==================================================

  const receiptMismatchQuery =
    query(
      collectionGroup(
        db,
        'confirmations'
      ),
      where(
        'hasMismatch',
        '==',
        true
      )
    );


  const receiptMismatchSnapshot =
    await getDocs(
      receiptMismatchQuery
    );


  for (
    const confirmationDoc
    of receiptMismatchSnapshot.docs
  ) {

    const confirmation =
      confirmationDoc.data();


    const receiptId =
      confirmation.receiptId ||
      confirmationDoc.ref.parent.parent?.id;


    if (!receiptId) {
      continue;
    }


    const receiptSnapshot =
      await getDoc(
        doc(
          db,
          'receipts',
          receiptId
        )
      );


    if (!receiptSnapshot.exists()) {
      continue;
    }


    const receipt = {
      id:
        receiptSnapshot.id,

      ...receiptSnapshot.data()
    };


    mismatches.push({

      type:
        'receipt',

      id:
        confirmationDoc.id,

      confirmationId:
        confirmationDoc.id,

      confirmationPath:
        confirmationDoc.ref.path,

      confirmation,

      receipt

    });
  }


  // ==================================================
  // 2. Transfer mismatches
  // ==================================================

  const transferMismatchQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'status',
        '==',
        'mismatch'
      )
    );


  const transferMismatchSnapshot =
    await getDocs(
      transferMismatchQuery
    );


  transferMismatchSnapshot.docs
    .forEach(transferDoc => {

      const transfer = {
        id:
          transferDoc.id,

        ...transferDoc.data()
      };


      mismatches.push({

        type:
          'transfer',

        id:
          transfer.id,

        transfer

      });

    });


    // ==================================================
  // 3. Refund mismatches
  // ==================================================

  const refundMismatchQuery =
    query(
      collection(
        db,
        'refunds'
      ),
      where(
        'status',
        '==',
        'mismatch'
      )
    );


  const refundMismatchSnapshot =
    await getDocs(
      refundMismatchQuery
    );


  refundMismatchSnapshot.docs
    .forEach(refundDoc => {

      const refund = {
        id:
          refundDoc.id,

        ...refundDoc.data()
      };


      mismatches.push({

        type:
          'refund',

        id:
          refund.id,

        refund

      });

    });



   // ==================================================
  // 4. Unmatched transaction reports
  // ==================================================

  const unmatchedSnapshot =
    await getDocs(
      collection(
        db,
        'unmatchedTransactions'
      )
    );


  unmatchedSnapshot.docs
    .forEach(reportDoc => {

      const report = {
        id:
          reportDoc.id,

        ...reportDoc.data()
      };


      mismatches.push({

        type:
          'unmatched',

        id:
          report.id,

        unmatched:
          report

      });

    });

  
  // ==================================================
  // 5. Oldest transaction first
  // ==================================================

  mismatches.sort(
    (a, b) => {

      const dateA =
        String(
          a.type === 'transfer'
            ? a.transfer?.transferDate || ''
: (
          a.type === 'refund'
            ? a.refund?.refundDate || ''
            : (
                a.type === 'unmatched'
                  ? a.unmatched?.transactionDate || ''
                  : a.receipt?.purchaseDate || ''
              )
        )
        );


      const dateB =
        String(
          b.type === 'transfer'
            ? b.transfer?.transferDate || ''
            : (
          b.type === 'refund'
            ? b.refund?.refundDate || ''
            : (
                b.type === 'unmatched'
                  ? b.unmatched?.transactionDate || ''
                  : b.receipt?.purchaseDate || ''
              )
        )
  );


      if (!dateA && !dateB) {
        return 0;
      }

      if (!dateA) {
        return 1;
      }

      if (!dateB) {
        return -1;
      }


      return dateA.localeCompare(
        dateB
      );
    }
  );


  return mismatches;
}

// ======================================================
// Compact Owner Dashboard Card
// ======================================================

export function mismatchDashboardCardHtml({
  item,
  lang
}) {


   // ==================================================
  // Unmatched transaction report
  // ==================================================

  if (
    item.type === 'unmatched'
  ) {

    const report =
      item.unmatched;


    if (!report) {
      return '';
    }


    const resolved =
      report.status === 'resolved';


    const cardLabel =
      [
        report.cardSnapshot?.issuer,
        report.cardSnapshot?.cardName,
        report.cardSnapshot?.last4
          ? `•••• ${report.cardSnapshot.last4}`
          : ''
      ]
        .filter(Boolean)
        .join(' · ');


    return `

      <div
        class="card${resolved ? '' : ' mismatch-card'}"
        data-mismatch-type="unmatched"
        data-unmatched-id="${escapeHtml(
          report.id
        )}"
      >

        <div class="mismatch-card-main">

          <div>

            <strong>
              ${
                lang === 'zh-TW'
                  ? '未找到交易'
                  : 'Unmatched Transaction'
              }
              ·
              ${escapeHtml(
                report.merchant || '—'
              )}
            </strong>

            <span class="muted">
              ${escapeHtml(
                report.transactionDate || '—'
              )}
            </span>

          </div>


          <strong>
            ${formatMoney(
              report.amount || 0,
              report.currency || ''
            )}
          </strong>

        </div>


        ${
          cardLabel
            ? `
                <div class="field">

                  <span class="field-label">
                    ${
                      lang === 'zh-TW'
                        ? '信用卡'
                        : 'Card'
                    }
                  </span>

                  <span>
                    ${escapeHtml(cardLabel)}
                  </span>

                </div>
              `
            : ''
        }


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '回報人'
                : 'Reported by'
            }
          </span>

          <span>
            ${escapeHtml(
              report.reporterUserName || '—'
            )}
          </span>

        </div>


        <div class="mismatch-reasons">

          <span class="${
            resolved
              ? 'badge'
              : 'mismatch-reason-badge'
          }">
            ${
              resolved
                ? (
                    lang === 'zh-TW'
                      ? '已處理'
                      : 'Resolved'
                  )
                : (
                    lang === 'zh-TW'
                      ? '系統找不到對應 Receipt'
                      : 'No matching Receipt found'
                  )
            }
          </span>

        </div>


        <div class="actions">

          <button
            type="button"
            class="view-mismatch-btn"
            data-mismatch-type="unmatched"
            data-unmatched-id="${escapeHtml(
              report.id
            )}"
          >
            ${
              lang === 'zh-TW'
                ? '查看'
                : 'View'
            }
          </button>

        </div>

      </div>
    `;
  }

  
  // ==================================================
// Refund mismatch
// ==================================================

if (item.type === 'refund') {

  const refund =
    item.refund;


  if (!refund) {
    return '';
  }


  const resolved =
    refund.refundMismatchResolved === true;


  const expectedCurrency =
    String(
      refund.currency || ''
    )
      .trim()
      .toUpperCase();


  const reportedCurrency =
    String(
      refund.reportedCurrency || ''
    )
      .trim()
      .toUpperCase();


  const amountMismatch =
    Number(
      refund.reportedAmount
    ) !==
    Number(
      refund.amount
    );


  const currencyMismatch =
    reportedCurrency !==
    expectedCurrency;


  return `

    <div
      class="card${resolved ? '' : ' mismatch-card'}"
      data-mismatch-type="refund"
      data-refund-id="${escapeHtml(
        refund.id
      )}"
    >

      <div class="mismatch-card-main">

        <div>

          <strong>
            ${
              lang === 'zh-TW'
                ? '退款'
                : 'Refund'
            }
            ·
            ${escapeHtml(
              refund.store || '—'
            )}
          </strong>

          <span class="muted">
            ${escapeHtml(
              refund.refundDate || '—'
            )}
          </span>

        </div>


        <strong>
          ${formatMoney(
            refund.amount || 0,
            expectedCurrency
          )}
        </strong>

      </div>


      <div class="field">

        <span class="field-label">
          ${
            lang === 'zh-TW'
              ? '實際收到'
              : 'Actually Received'
          }
        </span>

        <strong>
          ${formatMoney(
            refund.reportedAmount || 0,
            reportedCurrency
          )}
        </strong>

      </div>


      <div class="mismatch-reasons">

        ${
          amountMismatch
            ? `
                <span class="${
                  resolved
                    ? 'badge'
                    : 'mismatch-reason-badge'
                }">
                  ${
                    lang === 'zh-TW'
                      ? '退款金額不符'
                      : 'Refund amount mismatch'
                  }
                </span>
              `
            : ''
        }

        ${
          currencyMismatch
            ? `
                <span class="${
                  resolved
                    ? 'badge'
                    : 'mismatch-reason-badge'
                }">
                  ${
                    lang === 'zh-TW'
                      ? '退款幣值不符'
                      : 'Refund currency mismatch'
                  }
                </span>
              `
            : ''
        }

      </div>


      <div class="actions">

        <button
          type="button"
          class="view-mismatch-btn"
          data-mismatch-type="refund"
          data-refund-id="${escapeHtml(
            refund.id
          )}"
        >
          ${
            lang === 'zh-TW'
              ? '查看'
              : 'View'
          }
        </button>

      </div>

    </div>
  `;
}

  // ==================================================
  // Transfer mismatch
  // ==================================================

  if (item.type === 'transfer') {

    const transfer =
      item.transfer;


    if (!transfer) {
      return '';
    }


    const resolved =
      transfer.transferMismatchResolved === true;


    const currency =
      String(
        transfer.currency || ''
      )
        .trim()
        .toUpperCase();


    return `

      <div
        class="card${resolved ? '' : ' mismatch-card'}"
        data-mismatch-type="transfer"
        data-transfer-id="${escapeHtml(
          transfer.id
        )}"
      >

        <div class="mismatch-card-main">

          <div>

            <strong>
              ${escapeHtml(
                lang === 'zh-TW'
                  ? '轉帳'
                  : 'Transfer'
              )}
            </strong>

            <span class="muted">
              ${escapeHtml(
                transfer.transferDate || '—'
              )}
            </span>

          </div>


          <strong>
            ${formatMoney(
              transfer.amount || 0,
              currency
            )}
          </strong>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '轉帳'
                : 'Transfer'
            }
          </span>

          <span>
            ${escapeHtml(
              transfer.senderName || '—'
            )}
            →
            ${escapeHtml(
              transfer.receiverName || '—'
            )}
          </span>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '實際收到'
                : 'Actually Received'
            }
          </span>

          <strong>
            ${formatMoney(
              transfer.reportedAmount || 0,
              currency
            )}
          </strong>

        </div>


        <div class="mismatch-reasons">

          <span class="${
            resolved
              ? 'badge'
              : 'mismatch-reason-badge'
          }">
            ${
              lang === 'zh-TW'
                ? '轉帳金額不符'
                : 'Transfer amount mismatch'
            }
          </span>

        </div>


        <div class="actions">

          <button
            type="button"
            class="view-mismatch-btn"
            data-mismatch-type="transfer"
            data-transfer-id="${escapeHtml(
              transfer.id
            )}"
          >
            ${
              lang === 'zh-TW'
                ? '查看'
                : 'View'
            }
          </button>

        </div>

      </div>

    `;
  }


  // ==================================================
  // Receipt mismatch
  // ==================================================

  const {
    receipt,
    confirmation
  } = item;


  if (
    !receipt ||
    !confirmation
  ) {
    return '';
  }


  const reasons =
    getMismatchReasonLabels({
      confirmation,
      lang
    });


  const receiptCurrency =
    String(
      receipt.currency || ''
    )
      .trim()
      .toUpperCase();


  const resolved =
    confirmation.mismatchResolved === true;


  return `

    <div
      class="card${resolved ? '' : ' mismatch-card'}"
      data-mismatch-type="receipt"
      data-receipt-id="${escapeHtml(
        receipt.id
      )}"
      data-confirmation-user-id="${escapeHtml(
        confirmation.confirmationUserId || ''
      )}"
    >

      <div class="mismatch-card-main">

        <div>

          <strong>
            ${escapeHtml(
              receipt.store || '—'
            )}
          </strong>

          <span class="muted">
            ${escapeHtml(
              receipt.purchaseDate || '—'
            )}
          </span>

        </div>


        <strong>
          ${formatMoney(
            receipt.total || 0,
            receiptCurrency
          )}
        </strong>

      </div>


      <div class="mismatch-reasons">

        ${
          reasons
            .map(reason => `
              <span class="${
                resolved
                  ? 'badge'
                  : 'mismatch-reason-badge'
              }">
                ${escapeHtml(reason)}
              </span>
            `)
            .join('')
        }

      </div>


      <div class="actions">

        <button
          type="button"
          class="view-mismatch-btn"
          data-mismatch-type="receipt"
          data-receipt-id="${escapeHtml(
            receipt.id
          )}"
          data-confirmation-user-id="${escapeHtml(
            confirmation.confirmationUserId || ''
          )}"
        >
          ${
            lang === 'zh-TW'
              ? '查看'
              : 'View'
          }
        </button>

      </div>

    </div>

  `;
}


// ======================================================
// Resolve Mismatch
// ======================================================

export async function resolveMismatch({
  db,
  currentUser,
  receiptId,
  confirmationUserId
}) {

  if (
    !db ||
    !currentUser ||
    !receiptId ||
    !confirmationUserId
  ) {

    throw new Error(
      'Missing mismatch resolution dependency.'
    );
  }


  const confirmationRef =
    doc(
      db,
      'receipts',
      receiptId,
      'confirmations',
      confirmationUserId
    );


  const confirmationSnapshot =
    await getDoc(
      confirmationRef
    );


  if (!confirmationSnapshot.exists()) {

    throw new Error(
      'Confirmation not found.'
    );
  }


  const confirmation =
    confirmationSnapshot.data();

// ------------------------------------------------
// Load confirmer profile
// ------------------------------------------------


  if (
    confirmation.hasMismatch !== true
  ) {

    throw new Error(
      'This confirmation does not contain a mismatch.'
    );
  }


  if (
    confirmation.mismatchResolved === true
  ) {

    throw new Error(
      'This mismatch has already been resolved.'
    );
  }


  await updateDoc(
    confirmationRef,
    {
      mismatchResolved:
        true,

      mismatchResolvedAt:
        serverTimestamp(),

      mismatchResolvedBy:
        currentUser.uid,

      updatedAt:
        serverTimestamp()
    }
  );
}


// ======================================================
// Owner Mismatch List Page
// ======================================================

export async function mismatchPage({
  db,
  currentRole,
  lang,
  page
}) {

  if (!db || !page) {
    return;
  }


  // Owner only.
  if (currentRole !== 'owner') {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '無權存取'
              : 'Access Denied'
          }
        </h1>

      </section>
    `;

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '不符項目'
            : 'Mismatches'
        }
      </h1>


      <div class="actions">

        <button
          type="button"
          id="showPendingMismatches"
          class="primary"
        >
          ${
            lang === 'zh-TW'
              ? '待處理'
              : 'Pending'
          }
          <span id="pendingMismatchCount"></span>
        </button>


        <button
          type="button"
          id="showResolvedMismatches"
        >
          ${
            lang === 'zh-TW'
              ? '已處理'
              : 'Resolved'
          }
          <span id="resolvedMismatchCount"></span>
        </button>

      </div>


      <div id="mismatchList">

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
      '#mismatchList'
    );


  const pendingButton =
    page.querySelector(
      '#showPendingMismatches'
    );


  const resolvedButton =
    page.querySelector(
      '#showResolvedMismatches'
    );


  const pendingCount =
    page.querySelector(
      '#pendingMismatchCount'
    );


  const resolvedCount =
    page.querySelector(
      '#resolvedMismatchCount'
    );


  try {

    const allMismatches =
      await getAllMismatches({
        db
      });


    const pendingMismatches =
  allMismatches.filter(
    item => {

      if (
        item.type === 'unmatched'
      ) {

        return (
          item.unmatched
            ?.status !== 'resolved'
        );
      }
      
      if (item.type === 'transfer') {

        return (
          item.transfer
            ?.transferMismatchResolved !== true
        );
      }


      if (item.type === 'refund') {

        return (
          item.refund
            ?.refundMismatchResolved !== true
        );
      }


      return (
        item.confirmation
          ?.mismatchResolved !== true
      );
    }
  );


const resolvedMismatches =
  allMismatches.filter(
    item => {

      if (
        item.type === 'unmatched'
      ) {

        return (
          item.unmatched
            ?.status === 'resolved'
        );
      }
      
      if (item.type === 'transfer') {

        return (
          item.transfer
            ?.transferMismatchResolved === true
        );
      }


      if (item.type === 'refund') {

        return (
          item.refund
            ?.refundMismatchResolved === true
        );
      }


      return (
        item.confirmation
          ?.mismatchResolved === true
      );
    }
  );


    pendingCount.textContent =
      ` ${pendingMismatches.length}`;


    resolvedCount.textContent =
      ` ${resolvedMismatches.length}`;


    function renderMismatchList(
      items,
      type
    ) {

      if (items.length === 0) {

        list.innerHTML = `
          <div class="card">

            <p>
              ${
                type === 'pending'
                  ? (
                      lang === 'zh-TW'
                        ? '目前沒有需要處理的不符項目。'
                        : 'There are currently no unresolved mismatches.'
                    )
                  : (
                      lang === 'zh-TW'
                        ? '目前沒有已處理的不符項目。'
                        : 'There are currently no resolved mismatches.'
                    )
              }
            </p>

          </div>
        `;

        return;
      }


      list.innerHTML =
        items
          .map(item =>
            mismatchDashboardCardHtml({
              item,
              lang
            })
          )
          .join('');


      bindMismatchViewButtons(
        list
      );
    }


    function showPending() {

  sessionStorage.setItem(
    'mismatchActiveTab',
    'pending'
  );

  pendingButton.classList.add(
    'primary'
  );

  resolvedButton.classList.remove(
    'primary'
  );

  renderMismatchList(
    pendingMismatches,
    'pending'
  );
}


    function showResolved() {

  sessionStorage.setItem(
    'mismatchActiveTab',
    'resolved'
  );

  resolvedButton.classList.add(
    'primary'
  );

  pendingButton.classList.remove(
    'primary'
  );

  renderMismatchList(
    resolvedMismatches,
    'resolved'
  );
}


    pendingButton.onclick =
      showPending;


    resolvedButton.onclick =
      showResolved;


    // Restore the last selected mismatch tab.
const requestedTab =
  sessionStorage.getItem('mismatchActiveTab');

if (requestedTab === 'resolved') {
  showResolved();
} else {
  showPending();
}
    

  } catch (error) {

    console.error(
      'Failed to load mismatches:',
      error
    );


    list.innerHTML = `
      <div class="card">

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入不符項目失敗。'
              : 'Failed to load mismatches.'
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
// Bind "View" Buttons
// ======================================================

export function bindMismatchViewButtons(
  container
) {

  if (!container) {
    return;
  }


  container
    .querySelectorAll(
      '.view-mismatch-btn'
    )
    .forEach(button => {

      button.onclick =
        () => {

          const mismatchType =
            button.dataset.mismatchType;


          // ==========================================
          // Unmatched transaction report
          // ==========================================

          if (
            mismatchType === 'unmatched'
          ) {

            const unmatchedId =
              button.dataset.unmatchedId;


            if (!unmatchedId) {
              return;
            }


            location.hash =
              `#unmatched-detail/${unmatchedId}`;

            return;
          }

          
          // ==========================================
          // Transfer mismatch
          // ==========================================

          if (
            mismatchType === 'transfer'
          ) {

            const transferId =
              button.dataset.transferId;


            if (!transferId) {
              return;
            }


            location.hash =
              `#transfer-detail/${transferId}`;

            return;
          }

// ==========================================
// Refund mismatch
// ==========================================

if (
  mismatchType === 'refund'
) {

  const refundId =
    button.dataset.refundId;


  if (!refundId) {
    return;
  }


  location.hash =
    `#refund-detail/${refundId}`;

  return;
}

          
          // ==========================================
          // Receipt mismatch
          // ==========================================

          const receiptId =
            button.dataset.receiptId;


          const confirmationUserId =
            button.dataset.confirmationUserId;


          if (
            !receiptId ||
            !confirmationUserId
          ) {
            return;
          }


          location.hash =
            `#mismatches/${receiptId}/${confirmationUserId}`;
        };

    });
}

// ======================================================
// Owner Mismatch Detail Page
// ======================================================

export async function mismatchDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  receiptId,
  confirmationUserId
}) {

  // --------------------------------------------------
  // Owner only
  // --------------------------------------------------

  if (
    !db ||
    !currentUser ||
    !page ||
    currentRole !== 'owner'
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '無權存取'
              : 'Access Denied'
          }
        </h1>

      </section>
    `;

    return;
  }


  // --------------------------------------------------
  // Validate route parameters
  // --------------------------------------------------

  if (
    !receiptId ||
    !confirmationUserId
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '不符項目'
              : 'Mismatch'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '缺少必要的資料。'
              : 'Required information is missing.'
          }
        </p>

      </section>
    `;

    return;
  }


  // --------------------------------------------------
  // Loading
  // --------------------------------------------------

  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '不符項目明細'
            : 'Mismatch Detail'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入…'
            : 'Loading…'
        }
      </p>

    </section>
  `;


  try {

    // ------------------------------------------------
    // Load Receipt
    // ------------------------------------------------

    const receiptRef =
      doc(
        db,
        'receipts',
        receiptId
      );


    const receiptSnapshot =
      await getDoc(
        receiptRef
      );


    if (!receiptSnapshot.exists()) {

      throw new Error(
        lang === 'zh-TW'
          ? '找不到這筆 Receipt。'
          : 'Receipt not found.'
      );
    }


    const receipt = {
      id: receiptSnapshot.id,
      ...receiptSnapshot.data()
    };


    // ------------------------------------------------
    // Load Confirmation
    // ------------------------------------------------

    const confirmationRef =
      doc(
        db,
        'receipts',
        receiptId,
        'confirmations',
        confirmationUserId
      );


    const confirmationSnapshot =
      await getDoc(
        confirmationRef
      );


    if (!confirmationSnapshot.exists()) {

      throw new Error(
        lang === 'zh-TW'
          ? '找不到這筆確認資料。'
          : 'Confirmation not found.'
      );
    }


    const confirmation =
      confirmationSnapshot.data();


    // ------------------------------------------------
// Load confirmer profile
// ------------------------------------------------

let confirmerName = '';


try {

  const confirmerSnapshot =
    await getDoc(
      doc(
        db,
        'users',
        confirmationUserId
      )
    );


  if (confirmerSnapshot.exists()) {

    const confirmerProfile =
      confirmerSnapshot.data();


    confirmerName =
      String(
        confirmerProfile.displayName ||
        confirmerProfile.name ||
        confirmerProfile.preferredName ||
        ''
      ).trim();
  }


} catch (error) {

  console.warn(
    'Failed to load confirmer profile:',
    error
  );
}



    // ------------------------------------------------
    // This page is only for mismatch records
    // ------------------------------------------------

    if (
      confirmation.hasMismatch !== true
    ) {

      throw new Error(
        lang === 'zh-TW'
          ? '這筆確認沒有回報不符。'
          : 'This confirmation does not contain a mismatch.'
      );
    }


    // ------------------------------------------------
    // Values
    // ------------------------------------------------

    const receiptCurrency =
      String(
        receipt.currency || ''
      )
        .trim()
        .toUpperCase();


    const receiptAmount =
      Number(
        receipt.total || 0
      );


    const notificationCurrencyType =
      confirmation.notificationCurrencyType;


    const notificationCurrencyLabel =

      notificationCurrencyType === 'local'

        ? (
            lang === 'zh-TW'
              ? '台幣'
              : 'Local currency'
          )

        : notificationCurrencyType === 'foreign'

          ? (
              lang === 'zh-TW'
                ? '外幣'
                : 'Foreign currency'
            )

          : '—';


    const amountStatusLabel =

      confirmation.amountMismatch === true

        ? (
            lang === 'zh-TW'
              ? '不符'
              : 'Does not match'
          )

        : (
            lang === 'zh-TW'
              ? '相符'
              : 'Matches'
          );


    const reasons =
      getMismatchReasonLabels({
        confirmation,
        lang
      });


    const resolved =
      confirmation.mismatchResolved === true;


    // ------------------------------------------------
    // Reported amount
    // ------------------------------------------------

    const reportedCurrency =
      String(
        confirmation.reportedCurrency || ''
      )
        .trim()
        .toUpperCase();


    const reportedAmount =
      Number(
        confirmation.reportedAmount
      );


    const showReportedAmount =
      confirmation.amountMismatch === true &&
      Number.isFinite(
        reportedAmount
      );


    // ------------------------------------------------
    // Render
    // ------------------------------------------------

    page.innerHTML = `

      <div class="actions">

        <button
          type="button"
          id="backToMismatchList"
        >
          ← ${
            lang === 'zh-TW'
              ? '返回不符項目'
              : 'Back to Mismatches'
          }
        </button>

      </div>


      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '不符項目明細'
              : 'Mismatch Detail'
          }
        </h1>


        <div class="card mismatch-card">

          <div class="mismatch-card-main">

            <div>

              <strong>
                ${escapeHtml(
                  receipt.store || '—'
                )}
              </strong>

              <span class="muted">
                ${escapeHtml(
                  receipt.purchaseDate || '—'
                )}
              </span>

            </div>


            <strong>

              ${formatMoney(
                receiptAmount,
                receiptCurrency
              )}

            </strong>

          </div>


          <div class="mismatch-reasons">

            ${
              reasons
                .map(reason => `
                  <span class="mismatch-reason-badge">
                    ${escapeHtml(reason)}
                  </span>
                `)
                .join('')
            }

          </div>

        </div>

      </section>


      <section class="panel">

        <h2>
  ${
    confirmerName
      ? (
          lang === 'zh-TW'
            ? `${escapeHtml(confirmerName)} 回報`
            : `Reported by ${escapeHtml(confirmerName)}`
        )
      : (
          lang === 'zh-TW'
            ? '確認者回報'
            : 'Confirmation Report'
        )
  }
</h2>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '信用卡通知顯示的請款幣值'
                : 'Card notification currency type'
            }
          </span>

          <strong>
            ${escapeHtml(
              notificationCurrencyLabel
            )}
          </strong>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '信用卡通知金額'
                : 'Card notification amount'
            }
          </span>

          <strong>
            ${escapeHtml(
              amountStatusLabel
            )}
          </strong>

        </div>


        ${
          showReportedAmount
            ? `
                <div class="field">

                  <span class="field-label">
                    ${
                      lang === 'zh-TW'
                        ? '實際通知金額'
                        : 'Reported amount'
                    }
                  </span>

                  <strong>

                    ${formatMoney(
                      reportedAmount,
                      reportedCurrency
                    )}

                  </strong>

                </div>
              `
            : ''
        }


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '備註'
                : 'Notes'
            }
          </span>

          <div>
            ${
              confirmation.notes
                ? escapeHtml(
                    confirmation.notes
                  )
                : '—'
            }
          </div>

        </div>


        <div class="actions">

          <button
            type="button"
            id="viewMismatchReceipt"
          >
            ${
              lang === 'zh-TW'
                ? '檢視 Receipt 明細'
                : 'View Receipt Detail'
            }
          </button>

        </div>

      </section>


      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? 'Owner 處理'
              : 'Owner Resolution'
          }
        </h2>


        ${
          resolved

            ? `
                <div class="card">

                  <strong>
                    ${
                      lang === 'zh-TW'
                        ? '✓ 已處理'
                        : '✓ Resolved'
                    }
                  </strong>

                </div>
              `

            : `
                <p class="muted">
                  ${
                    lang === 'zh-TW'
                      ? '確認問題已處理完成後，可將此項目標記為已處理。'
                      : 'Mark this item as resolved after the issue has been handled.'
                  }
                </p>

                <div class="actions">

                  <button
                    type="button"
                    id="resolveMismatchBtn"
                    class="primary"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '標記已處理'
                        : 'Mark as Resolved'
                    }
                  </button>

                </div>
              `
        }

      </section>

    `;


    // ------------------------------------------------
    // Back
    // ------------------------------------------------

    page.querySelector(
  '#backToMismatchList'
).onclick =
  () => {

    location.hash =
      '#mismatches';
  };


    // ------------------------------------------------
    // Receipt Detail
    // ------------------------------------------------

    page.querySelector(
      '#viewMismatchReceipt'
    ).onclick =
      () => {

        location.hash =
          `#receipt-detail/${receiptId}`;
      };


    // ------------------------------------------------
    // Resolve
    // ------------------------------------------------

    const resolveButton =
      page.querySelector(
        '#resolveMismatchBtn'
      );


    if (resolveButton) {

      resolveButton.onclick =
        async () => {

          const confirmed =
            window.confirm(
              lang === 'zh-TW'
                ? '確定要將這筆不符項目標記為已處理嗎？'
                : 'Mark this mismatch as resolved?'
            );


          if (!confirmed) {
            return;
          }


          resolveButton.disabled =
            true;


          resolveButton.textContent =
            lang === 'zh-TW'
              ? '處理中…'
              : 'Saving…';


          try {

            await resolveMismatch({
              db,
              currentUser,
              receiptId,
              confirmationUserId
            });


            // The item is now resolved, so return to the Resolved list.
            sessionStorage.setItem(
  'mismatchActiveTab',
  'resolved'
);

location.hash =
  '#mismatches';


          } catch (error) {

            console.error(
              'Failed to resolve mismatch:',
              error
            );


            alert(
              (
                lang === 'zh-TW'
                  ? '標記失敗：'
                  : 'Failed: '
              ) +
              error.message
            );


            resolveButton.disabled =
              false;


            resolveButton.textContent =
              lang === 'zh-TW'
                ? '標記已處理'
                : 'Mark as Resolved';
          }

        };
    }


  } catch (error) {

    console.error(
      'Failed to load mismatch detail:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '不符項目明細'
              : 'Mismatch Detail'
          }
        </h1>


        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入不符項目明細失敗。'
              : 'Failed to load mismatch detail.'
          }
        </p>


        <p class="muted">
          ${escapeHtml(
            error.message
          )}
        </p>


        <div class="actions">

          <button
            type="button"
            id="backToMismatchList"
          >
            ${
              lang === 'zh-TW'
                ? '返回不符項目'
                : 'Back to Mismatches'
            }
          </button>

        </div>

      </section>
    `;


    const backButton =
      page.querySelector(
        '#backToMismatchList'
      );


    if (backButton) {

      backButton.onclick =
        () => {

          location.hash =
            '#mismatches';
        };
    }
  }
}


// ======================================================
// Owner Unmatched Transaction Detail
// ======================================================

export async function unmatchedTransactionDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  reportId
}) {

  if (
    !db ||
    !currentUser ||
    !page ||
    currentRole !== 'owner' ||
    !reportId
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '無權存取'
              : 'Access Denied'
          }
        </h1>

      </section>
    `;

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入未找到的交易…'
            : 'Loading unmatched transaction…'
        }
      </p>

    </section>
  `;


  try {

    const reportRef =
      doc(
        db,
        'unmatchedTransactions',
        reportId
      );


    const reportSnapshot =
      await getDoc(
        reportRef
      );


    if (
      !reportSnapshot.exists()
    ) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            ${
              lang === 'zh-TW'
                ? '找不到這筆回報'
                : 'Report Not Found'
            }
          </h1>

          <div class="actions">

            <button
              type="button"
              id="backToMismatchList"
            >
              ${
                lang === 'zh-TW'
                  ? '返回需要處理'
                  : 'Back'
              }
            </button>

          </div>

        </section>
      `;


      page.querySelector(
        '#backToMismatchList'
      ).onclick =
        () => {

          location.hash =
            '#mismatches';
        };


      return;
    }


    const report = {
      id:
        reportSnapshot.id,

      ...reportSnapshot.data()
    };


    const resolved =
      report.status === 'resolved';


    const cardLabel =
      [
        report.cardSnapshot?.issuer,
        report.cardSnapshot?.cardName,
        report.cardSnapshot?.last4
          ? `•••• ${report.cardSnapshot.last4}`
          : ''
      ]
        .filter(Boolean)
        .join(' · ');


    let linkedReceipt = null;


    if (
      report.linkedReceiptId
    ) {

      try {

        const linkedReceiptSnapshot =
          await getDoc(
            doc(
              db,
              'receipts',
              report.linkedReceiptId
            )
          );


        if (
          linkedReceiptSnapshot.exists()
        ) {

          linkedReceipt = {
            id:
              linkedReceiptSnapshot.id,

            ...linkedReceiptSnapshot.data()
          };
        }

      } catch (error) {

        console.error(
          'Failed to load linked receipt:',
          error
        );
      }
    }


    let receiptOptions = '';


    if (!resolved) {

      const receiptSnapshot =
        await getDocs(
          collection(
            db,
            'receipts'
          )
        );


      const receipts =
        receiptSnapshot.docs
          .map(receiptDoc => ({
            id:
              receiptDoc.id,

            ...receiptDoc.data()
          }))
          .sort(
            (a, b) =>
              String(
                b.purchaseDate || ''
              ).localeCompare(
                String(
                  a.purchaseDate || ''
                )
              )
          );


      receiptOptions =
        receipts
          .map(receipt => {

            const label =
              [
                receipt.purchaseDate || '—',
                receipt.store || '—',
                `${receipt.currency || ''} ${Number(
                  receipt.total || 0
                ).toFixed(2)}`
              ].join(' · ');


            return `
              <option
                value="${escapeHtml(
                  receipt.id
                )}"
              >
                ${escapeHtml(label)}
              </option>
            `;
          })
          .join('');
    }


    let resolutionTypeText = '—';


    if (
      report.resolutionType ===
      'linkedReceipt'
    ) {

      resolutionTypeText =
        lang === 'zh-TW'
          ? '找到對應 Receipt'
          : 'Matching Receipt found';

    } else if (
      report.resolutionType ===
      'unrecordedTransaction'
    ) {

      resolutionTypeText =
        lang === 'zh-TW'
          ? '確認為尚未記錄的交易'
          : 'Confirmed as unrecorded transaction';

    } else if (
      report.resolutionType ===
      'invalidTransaction'
    ) {

      resolutionTypeText =
        lang === 'zh-TW'
          ? '非有效交易 / 不需處理'
          : 'Invalid / no action required';
    }


    page.innerHTML = `

      <section class="panel">

        <div class="actions">

          <button
            type="button"
            id="backToMismatchList"
          >
            ${
              lang === 'zh-TW'
                ? '← 返回需要處理'
                : '← Back'
            }
          </button>

        </div>


        <h1>
          ${
            lang === 'zh-TW'
              ? '未找到的交易'
              : 'Unmatched Transaction'
          }
        </h1>


        <div class="card">

          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '狀態'
                  : 'Status'
              }
            </span>

            <strong>
              ${
                resolved
                  ? (
                      lang === 'zh-TW'
                        ? '已處理'
                        : 'Resolved'
                    )
                  : (
                      lang === 'zh-TW'
                        ? '等待處理'
                        : 'Pending'
                    )
              }
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '回報人'
                  : 'Reported by'
              }
            </span>

            <span>
              ${escapeHtml(
                report.reporterUserName || '—'
              )}
            </span>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '交易日期'
                  : 'Transaction Date'
              }
            </span>

            <span>
              ${escapeHtml(
                report.transactionDate || '—'
              )}
            </span>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '信用卡'
                  : 'Card'
              }
            </span>

            <span>
              ${escapeHtml(
                cardLabel || '—'
              )}
            </span>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '商家 / 店家'
                  : 'Merchant / Store'
              }
            </span>

            <span>
              ${escapeHtml(
                report.merchant || '—'
              )}
            </span>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '商品'
                  : 'Product'
              }
            </span>

            <span>
              ${escapeHtml(
                report.product || '—'
              )}
            </span>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '金額'
                  : 'Amount'
              }
            </span>

            <strong>
              ${formatMoney(
                report.amount || 0,
                report.currency || ''
              )}
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '備註'
                  : 'Notes'
              }
            </span>

            <span>
              ${escapeHtml(
                report.notes || '—'
              )}
            </span>

          </div>

        </div>

      </section>


      ${
        resolved

          ? `

              <section class="panel">

                <h2>
                  ${
                    lang === 'zh-TW'
                      ? 'Owner 處理結果'
                      : 'Owner Resolution'
                  }
                </h2>


                <div class="card">

                  <div class="field">

                    <span class="field-label">
                      ${
                        lang === 'zh-TW'
                          ? '處理方式'
                          : 'Resolution'
                      }
                    </span>

                    <strong>
                      ${escapeHtml(
                        resolutionTypeText
                      )}
                    </strong>

                  </div>


                  ${
                    report.resolutionType ===
                      'linkedReceipt'

                      ? `

                          <div class="field">

                            <span class="field-label">
                              Receipt
                            </span>

                            <span>
                              ${
                                linkedReceipt
                                  ? escapeHtml(
                                      `${
                                        linkedReceipt.purchaseDate || '—'
                                      } · ${
                                        linkedReceipt.store || '—'
                                      } · ${
                                        linkedReceipt.currency || ''
                                      } ${
                                        Number(
                                          linkedReceipt.total || 0
                                        ).toFixed(2)
                                      }`
                                    )
                                  : escapeHtml(
                                      report.linkedReceiptId || '—'
                                    )
                              }
                            </span>

                          </div>


                          ${
                            linkedReceipt
                              ? `
                                  <div class="actions">

                                    <button
                                      type="button"
                                      id="viewLinkedReceipt"
                                    >
                                      ${
                                        lang === 'zh-TW'
                                          ? '查看 Receipt'
                                          : 'View Receipt'
                                      }
                                    </button>

                                  </div>
                                `
                              : ''
                          }

                        `
                      : ''
                  }


                  <div class="field">

                    <span class="field-label">
                      ${
                        lang === 'zh-TW'
                          ? '處理備註'
                          : 'Resolution Notes'
                      }
                    </span>

                    <span>
                      ${escapeHtml(
                        report.resolutionNotes || '—'
                      )}
                    </span>

                  </div>

                </div>

              </section>
            `

          : `

              <section class="panel">

                <h2>
                  ${
                    lang === 'zh-TW'
                      ? 'Owner 處理'
                      : 'Owner Resolution'
                  }
                </h2>


                <div class="field">

                  <label
                    for="unmatchedResolutionType"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '處理方式 *'
                        : 'Resolution *'
                    }
                  </label>

                  <select
                    id="unmatchedResolutionType"
                  >

                    <option value="">
                      ${
                        lang === 'zh-TW'
                          ? '請選擇'
                          : 'Select'
                      }
                    </option>

                    <option value="linkedReceipt">
                      ${
                        lang === 'zh-TW'
                          ? '找到對應 Receipt'
                          : 'Matching Receipt found'
                      }
                    </option>

                    <option value="unrecordedTransaction">
                      ${
                        lang === 'zh-TW'
                          ? '確認為尚未記錄的交易'
                          : 'Confirmed as unrecorded transaction'
                      }
                    </option>

                    <option value="invalidTransaction">
                      ${
                        lang === 'zh-TW'
                          ? '非有效交易 / 不需處理'
                          : 'Invalid / no action required'
                      }
                    </option>

                  </select>

                </div>


                <div
                  id="linkedReceiptField"
                  class="field"
                  hidden
                >

                  <label
                    for="linkedReceiptSelect"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '對應 Receipt *'
                        : 'Matching Receipt *'
                    }
                  </label>

                  <select
                    id="linkedReceiptSelect"
                  >

                    <option value="">
                      ${
                        lang === 'zh-TW'
                          ? '請選擇 Receipt'
                          : 'Select Receipt'
                      }
                    </option>

                    ${receiptOptions}

                  </select>

                </div>


                <div class="field">

                  <label
                    for="unmatchedResolutionNotes"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '處理備註'
                        : 'Resolution Notes'
                    }
                  </label>

                  <textarea
                    id="unmatchedResolutionNotes"
                    rows="4"
                  ></textarea>

                </div>


                <p
                  id="unmatchedResolutionMessage"
                  class="muted"
                ></p>


                <div class="actions">

                  <button
                    type="button"
                    id="resolveUnmatchedBtn"
                    class="primary"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '完成處理'
                        : 'Resolve'
                    }
                  </button>

                </div>

              </section>
            `
      }

    `;


    page.querySelector(
      '#backToMismatchList'
    ).onclick =
      () => {

        location.hash =
          '#mismatches';
      };


    const viewLinkedReceipt =
      page.querySelector(
        '#viewLinkedReceipt'
      );


    if (
      viewLinkedReceipt &&
      linkedReceipt
    ) {

      viewLinkedReceipt.onclick =
        () => {

          location.hash =
            `#receipt-detail/${linkedReceipt.id}`;
        };
    }


    if (resolved) {
      return;
    }


    const resolutionTypeSelect =
      page.querySelector(
        '#unmatchedResolutionType'
      );


    const linkedReceiptField =
      page.querySelector(
        '#linkedReceiptField'
      );


    const linkedReceiptSelect =
      page.querySelector(
        '#linkedReceiptSelect'
      );


    const resolutionNotes =
      page.querySelector(
        '#unmatchedResolutionNotes'
      );


    const message =
      page.querySelector(
        '#unmatchedResolutionMessage'
      );


    const resolveButton =
      page.querySelector(
        '#resolveUnmatchedBtn'
      );


    resolutionTypeSelect.onchange =
      () => {

        linkedReceiptField.hidden =
          resolutionTypeSelect.value !==
          'linkedReceipt';


        if (
          resolutionTypeSelect.value !==
          'linkedReceipt'
        ) {

          linkedReceiptSelect.value =
            '';
        }
      };


    resolveButton.onclick =
      async () => {

        const resolutionType =
          resolutionTypeSelect.value;


        const linkedReceiptId =
          linkedReceiptSelect.value;


        const cleanNotes =
          String(
            resolutionNotes.value || ''
          ).trim();


        message.textContent = '';


        if (!resolutionType) {

          message.textContent =
            lang === 'zh-TW'
              ? '請選擇處理方式。'
              : 'Please select a resolution.';

          return;
        }


        if (
          resolutionType ===
            'linkedReceipt' &&
          !linkedReceiptId
        ) {

          message.textContent =
            lang === 'zh-TW'
              ? '請選擇對應的 Receipt。'
              : 'Please select a matching Receipt.';

          return;
        }


        const confirmed =
          window.confirm(
            lang === 'zh-TW'
              ? '確定要完成這筆問題回報的處理嗎？完成後會移到「已處理」。'
              : 'Resolve this report?'
          );


        if (!confirmed) {
          return;
        }


        resolveButton.disabled =
          true;


        resolveButton.textContent =
          lang === 'zh-TW'
            ? '處理中…'
            : 'Saving…';


        try {

          await updateDoc(
            reportRef,
            {
              status:
                'resolved',

              resolutionType,

              resolutionNotes:
                cleanNotes,

              linkedReceiptId:
                resolutionType ===
                  'linkedReceipt'
                  ? linkedReceiptId
                  : null,

              resolvedBy:
                currentUser.uid,

              resolvedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );


          sessionStorage.setItem(
            'mismatchActiveTab',
            'resolved'
          );


          location.hash =
            '#mismatches';


        } catch (error) {

          console.error(
            'Failed to resolve unmatched transaction:',
            error
          );


          message.textContent =
            lang === 'zh-TW'
              ? `處理失敗：${error.message}`
              : `Failed: ${error.message}`;


          resolveButton.disabled =
            false;


          resolveButton.textContent =
            lang === 'zh-TW'
              ? '完成處理'
              : 'Resolve';
        }
      };


  } catch (error) {

    console.error(
      'Failed to load unmatched transaction:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '目前無法載入這筆回報'
              : 'Unable to Load Report'
          }
        </h1>

        <p class="danger">
          ${escapeHtml(
            error.message
          )}
        </p>

        <div class="actions">

          <button
            type="button"
            id="backToMismatchList"
          >
            ${
              lang === 'zh-TW'
                ? '返回需要處理'
                : 'Back'
            }
          </button>

        </div>

      </section>
    `;


    page.querySelector(
      '#backToMismatchList'
    ).onclick =
      () => {

        location.hash =
          '#mismatches';
      };
  }
}
