import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Helpers
// ======================================================

function escapeHtml(value) {

  return String(
    value ?? ''
  )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function formatMoney(
  amount,
  currency
) {

  const value =
    Number(amount || 0);


  return `${
    String(
      currency || ''
    )
      .trim()
      .toUpperCase()
  } ${
    value.toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  }`;
}


function timestampMs(value) {

  if (!value) {
    return 0;
  }


  if (
    typeof value.toMillis ===
    'function'
  ) {
    return value.toMillis();
  }


  if (
    typeof value.toDate ===
    'function'
  ) {
    return value
      .toDate()
      .getTime();
  }


  if (
    typeof value.seconds ===
    'number'
  ) {
    return value.seconds * 1000;
  }


  const parsed =
    new Date(value).getTime();


  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


// ======================================================
// Is Receipt assigned to current Authorized User
// ======================================================

function isAssignedToUser(
  receipt,
  userId
) {

  const confirmationUserIds =
    Array.isArray(
      receipt.confirmationUserIds
    )
      ? receipt.confirmationUserIds
          .filter(Boolean)
      : [];


  if (
    confirmationUserIds.includes(
      userId
    )
  ) {
    return true;
  }


  // Legacy single-confirmer data.
  if (
    confirmationUserIds.length === 0 &&
    receipt.confirmationUserId === userId
  ) {
    return true;
  }


  return false;
}


// ======================================================
// Load current user's confirmation for one Receipt
// ======================================================

async function loadMyConfirmation({
  db,
  receipt,
  currentUser
}) {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          'receipts',
          receipt.id,
          'confirmations'
        )
      );


    const myConfirmationDoc =
      snapshot.docs.find(
        confirmationDoc => {

          const data =
            confirmationDoc.data();


          return (
            confirmationDoc.id ===
              currentUser.uid ||
            data.confirmationUserId ===
              currentUser.uid ||
            data.confirmedBy ===
              currentUser.uid
          );
        }
      );


    if (!myConfirmationDoc) {
      return null;
    }


    return {
      id:
        myConfirmationDoc.id,

      ...myConfirmationDoc.data()
    };


  } catch (error) {

    console.error(
      `Failed to load confirmation for Receipt ${receipt.id}:`,
      error
    );


    return null;
  }
}


// ======================================================
// Load Related Receipts
// ======================================================

async function loadRelatedReceipts({
  db,
  currentUser
}) {

  const receiptSnapshot =
    await getDocs(
      collection(
        db,
        'receipts'
      )
    );


  const allReceipts =
    receiptSnapshot.docs.map(
      receiptDoc => ({
        id:
          receiptDoc.id,

        ...receiptDoc.data()
      })
    );


  const relatedReceipts =
    allReceipts.filter(
      receipt =>
        isAssignedToUser(
          receipt,
          currentUser.uid
        )
    );


  const results = [];


  for (
    const receipt
    of relatedReceipts
  ) {

    const confirmation =
      await loadMyConfirmation({
        db,
        receipt,
        currentUser
      });


    results.push({
      ...receipt,
      myConfirmation:
        confirmation
    });
  }


  // Newest purchase first.
  results.sort(
    (a, b) => {

      const dateCompare =
        String(
          b.purchaseDate || ''
        ).localeCompare(
          String(
            a.purchaseDate || ''
          )
        );


      if (dateCompare !== 0) {
        return dateCompare;
      }


      return (
        timestampMs(b.createdAt) -
        timestampMs(a.createdAt)
      );
    }
  );


  return results;
}


// ======================================================
// Receipt Status
// ======================================================

function getRelatedReceiptStatus({
  receipt,
  lang
}) {

  const confirmation =
    receipt.myConfirmation;


  // No confirmation document yet.
  if (!confirmation) {

    return {
      key: 'pending',

      text:
        lang === 'zh-TW'
          ? '需要你確認'
          : 'Needs Confirmation'
    };
  }


  if (
    confirmation.hasMismatch === true ||
    confirmation.confirmationResult ===
      'mismatch'
  ) {

    if (
      confirmation.mismatchResolved ===
      true
    ) {

      return {
        key: 'confirmed',

        text:
          lang === 'zh-TW'
            ? '回報不符 · Owner 已處理'
            : 'Mismatch · Resolved by Owner'
      };
    }


    return {
      key: 'confirmed',

      text:
        lang === 'zh-TW'
          ? '回報不符 · 等待 Owner 處理'
          : 'Mismatch · Waiting for Owner'
    };
  }


  return {
    key: 'confirmed',

    text:
      lang === 'zh-TW'
        ? '確認相符'
        : 'Confirmed · Matched'
  };
}


// ======================================================
// Receipt Card
// ======================================================

function relatedReceiptCardHtml({
  receipt,
  lang
}) {

  const status =
    getRelatedReceiptStatus({
      receipt,
      lang
    });


  const store =
    receipt.store ||
    receipt.storeSnapshot?.name ||
    '—';


  const purchaseDate =
    receipt.purchaseDate ||
    '—';


  return `

    <div
      class="authorized-related-receipt"
      data-related-receipt-id="${
        escapeHtml(
          receipt.id
        )
      }"
    >

      <div
        class="authorized-related-receipt-main"
      >

        <div>

          <div>
            <strong>
              ${escapeHtml(store)}
            </strong>
          </div>


          <div class="muted">

            ${escapeHtml(
              purchaseDate
            )}

            ·

            ${escapeHtml(
              formatMoney(
                receipt.total || 0,
                receipt.currency || ''
              )
            )}

          </div>


          <div
            class="
              authorized-related-receipt-status
              ${
                status.key === 'pending'
                  ? 'is-pending'
                  : 'is-confirmed'
              }
            "
          >
            ${escapeHtml(
              status.text
            )}
          </div>

        </div>


        <button
          type="button"
          class="
            secondary
            authorized-related-open
          "
          data-related-receipt-id="${
            escapeHtml(
              receipt.id
            )
          }"
        >

          ${
            status.key === 'pending'
              ? (
                  lang === 'zh-TW'
                    ? '確認'
                    : 'Confirm'
                )
              : (
                  lang === 'zh-TW'
                    ? '查看'
                    : 'View'
                )
          }

        </button>

      </div>

    </div>
  `;
}


// ======================================================
// Authorized User Related Receipts Page
// ======================================================

export async function authorizedUserRelatedPage({
  db,
  currentUser,
  currentRole,
  lang,
  page
}) {

  // --------------------------------------------------
  // Authorized User only
  // --------------------------------------------------

  if (
    currentRole !== 'authorizedUser'
  ) {

    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '無法開啟此頁面'
              : 'Page Unavailable'
          }
        </h2>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '此頁面僅供 Authorized User 使用。'
              : 'This page is only available to Authorized Users.'
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

      <h2>
        ${
          lang === 'zh-TW'
            ? '我的相關收據'
            : 'My Related Receipts'
        }
      </h2>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入相關收據…'
            : 'Loading related Receipts…'
        }
      </p>

    </section>
  `;


  try {

    const receipts =
      await loadRelatedReceipts({
        db,
        currentUser
      });


    // ----------------------------------------------
    // Pre-compute status
    // ----------------------------------------------

    const preparedReceipts =
      receipts.map(
        receipt => ({
          ...receipt,

          relatedStatus:
            getRelatedReceiptStatus({
              receipt,
              lang
            })
        })
      );


    // ----------------------------------------------
    // Page
    // ----------------------------------------------

    page.innerHTML = `

      <section class="panel">

        <div
          class="authorized-related-heading"
        >

          <h2>
            ${
              lang === 'zh-TW'
                ? '我的相關收據'
                : 'My Related Receipts'
            }

            ${
              preparedReceipts.length > 0
                ? `
                    <span class="badge">
                      ${preparedReceipts.length}
                    </span>
                  `
                : ''
            }

          </h2>

        </div>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '這裡顯示所有指派給你確認的收據，包括待確認與已確認紀錄。'
              : 'All Receipts assigned to you are shown here, including pending and completed confirmations.'
          }
        </p>


        <div
          class="authorized-related-filters"
        >

          <button
            type="button"
            class="
              secondary
              authorized-related-filter
              active
            "
            data-related-filter="all"
          >
            ${
              lang === 'zh-TW'
                ? '全部'
                : 'All'
            }
          </button>


          <button
            type="button"
            class="
              secondary
              authorized-related-filter
            "
            data-related-filter="pending"
          >
            ${
              lang === 'zh-TW'
                ? '待確認'
                : 'Pending'
            }
          </button>


          <button
            type="button"
            class="
              secondary
              authorized-related-filter
            "
            data-related-filter="confirmed"
          >
            ${
              lang === 'zh-TW'
                ? '已確認'
                : 'Confirmed'
            }
          </button>

        </div>


        <div
          id="authorizedRelatedCount"
          class="muted"
        ></div>


        <div
          id="authorizedRelatedList"
          class="authorized-related-list"
        ></div>

      </section>
    `;


    const list =
      page.querySelector(
        '#authorizedRelatedList'
      );


    const count =
      page.querySelector(
        '#authorizedRelatedCount'
      );


    // ----------------------------------------------
    // Render
    // ----------------------------------------------

    function render(
      filter = 'all'
    ) {

      const visibleReceipts =
        filter === 'all'

          ? preparedReceipts

          : preparedReceipts.filter(
              receipt =>
                receipt
                  .relatedStatus
                  .key === filter
            );


      count.textContent =
        lang === 'zh-TW'
          ? `共 ${visibleReceipts.length} 筆收據`
          : `${visibleReceipts.length} Receipts`;


      if (
        visibleReceipts.length === 0
      ) {

        list.innerHTML = `

          <p class="muted">

            ${
              lang === 'zh-TW'
                ? '目前沒有符合條件的相關收據。'
                : 'There are no related Receipts matching this filter.'
            }

          </p>
        `;

        return;
      }


      list.innerHTML =
        visibleReceipts
          .map(
            receipt =>
              relatedReceiptCardHtml({
                receipt,
                lang
              })
          )
          .join('');


      // ------------------------------------------
      // Open Receipt
      // ------------------------------------------

      list
        .querySelectorAll(
          '.authorized-related-open'
        )
        .forEach(
          button => {

            button.onclick =
              event => {

                event.stopPropagation();


                const receiptId =
                  button.dataset
                    .relatedReceiptId;


                if (!receiptId) {
                  return;
                }


                const receipt =
                  preparedReceipts.find(
                    item =>
                      item.id ===
                      receiptId
                  );


                if (!receipt) {
                  return;
                }


                if (
                  receipt
                    .relatedStatus
                    .key === 'pending'
                ) {

                  location.hash =
                    `#my-confirmations/${receiptId}`;

                } else {

                  location.hash =
                    `#receipt-detail/${receiptId}`;
                }
              };

          }
        );


      // ------------------------------------------
      // Card click = Receipt Detail
      // ------------------------------------------

      list
        .querySelectorAll(
          '.authorized-related-receipt'
        )
        .forEach(
          card => {

            card.onclick = () => {

              const receiptId =
                card.dataset
                  .relatedReceiptId;


              if (!receiptId) {
                return;
              }


              location.hash =
                `#receipt-detail/${receiptId}`;
            };

          }
        );
    }


    // ----------------------------------------------
    // Filters
    // ----------------------------------------------

    page
      .querySelectorAll(
        '.authorized-related-filter'
      )
      .forEach(
        button => {

          button.onclick = () => {

            const filter =
              button.dataset
                .relatedFilter ||
              'all';


            page
              .querySelectorAll(
                '.authorized-related-filter'
              )
              .forEach(
                filterButton => {

                  filterButton
                    .classList
                    .remove(
                      'active'
                    );
                }
              );


            button.classList.add(
              'active'
            );


            render(filter);
          };

        }
      );


    render('all');


  } catch (error) {

    console.error(
      'Failed to load Authorized User related Receipts:',
      error
    );


    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '我的相關收據'
              : 'My Related Receipts'
          }
        </h2>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '目前無法載入相關收據。請重新整理後再試一次。'
              : 'Unable to load related Receipts. Please refresh and try again.'
          }
        </p>

      </section>
    `;
  }
}
