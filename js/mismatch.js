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


  const mismatchQuery =
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


  const mismatchSnapshot =
    await getDocs(
      mismatchQuery
    );


  const mismatches = [];


  for (
    const confirmationDoc
    of mismatchSnapshot.docs
  ) {

    const confirmation =
      confirmationDoc.data();


    const receiptId =
      confirmation.receiptId;


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
      id: confirmationDoc.id,

      confirmationId:
        confirmationDoc.id,

      confirmationPath:
        confirmationDoc.ref.path,

      confirmation,

      receipt
    });
  }


  // Oldest transaction first.
  mismatches.sort(
    (a, b) => {

      const dateA =
        String(
          a.receipt.purchaseDate || ''
        );

      const dateB =
        String(
          b.receipt.purchaseDate || ''
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


  const mismatchQuery =
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


  const mismatchSnapshot =
    await getDocs(
      mismatchQuery
    );


  const mismatches = [];


  for (
    const confirmationDoc
    of mismatchSnapshot.docs
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


  // Oldest transaction first.
  mismatches.sort(
    (a, b) => {

      const dateA =
        String(
          a.receipt.purchaseDate || ''
        );

      const dateB =
        String(
          b.receipt.purchaseDate || ''
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

  const {
    receipt,
    confirmation
  } = item;


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


  return `

    <div
      class="card mismatch-card"
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
              <span class="mismatch-reason-badge">
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
        item =>
          item.confirmation
            .mismatchResolved !== true
      );


    const resolvedMismatches =
      allMismatches.filter(
        item =>
          item.confirmation
            .mismatchResolved === true
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


    // Restore the requested tab from the hash.
// Example:
// #mismatches?tab=resolved
const mismatchParams =
  new URLSearchParams(
    location.hash.split('?')[1] || ''
  );

const requestedTab =
  mismatchParams.get('tab');

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
      resolved
        ? '#mismatches?tab=resolved'
        : '#mismatches?tab=pending';
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
            location.hash =
              '#mismatches?tab=resolved';


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
