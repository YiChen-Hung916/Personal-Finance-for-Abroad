// ======================================================
// Receipt Draft
//
// Firestore:
//
// receipts/{receiptId}
//   status = "draft"
//
// receipts/{receiptId}/items/{itemId}
//
// Responsibilities:
//
// - Load all Receipt drafts
// - Render Owner draft list
// - Load one draft for editing
// - Delete one draft
//
// IMPORTANT:
//
// The Receipt form itself stays in receipt.js.
// receiptdraft.js manages Draft data / Draft list only.
// ======================================================


import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Helpers
// ======================================================

function clean(value) {

  return String(
    value ?? ''
  ).trim();
}


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


// ======================================================
// Timestamp → Date
// ======================================================

function timestampToDate(value) {

  if (!value) {
    return null;
  }


  if (
    typeof value.toDate === 'function'
  ) {

    return value.toDate();
  }


  if (
    value instanceof Date
  ) {

    return value;
  }


  return null;
}


// ======================================================
// Format Date / Time
// ======================================================

function formatUpdatedAt(
  value,
  lang
) {

  const date =
    timestampToDate(value);


  if (!date) {

    return (
      lang === 'zh-TW'
        ? '—'
        : '—'
    );
  }


  try {

    return new Intl.DateTimeFormat(
      lang === 'zh-TW'
        ? 'zh-TW'
        : 'en-US',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(date);

  } catch {

    return date.toLocaleString();
  }
}


// ======================================================
// Format Purchase Date
// ======================================================

function formatPurchaseDate(
  value,
  lang
) {

  const text =
    clean(value);


  if (!text) {

    return (
      lang === 'zh-TW'
        ? '尚未填寫日期'
        : 'Date not entered'
    );
  }


  const parts =
    text.split('-');


  if (parts.length !== 3) {
    return escapeHtml(text);
  }


  const [
    year,
    month,
    day
  ] = parts;


  if (lang === 'zh-TW') {

    return `${year}/${month}/${day}`;
  }


  return `${month}/${day}/${year}`;
}


// ======================================================
// Format Money
// ======================================================

function formatMoney(
  amount,
  currency
) {

  const numericAmount =
    Number(amount || 0);


  return `${
    escapeHtml(
      clean(currency) || 'USD'
    )
  } ${
    numericAmount.toFixed(2)
  }`;
}


// ======================================================
// Load Draft Items
// ======================================================

export async function getReceiptDraftItems({
  db,
  receiptId
}) {

  if (
    !db ||
    !receiptId
  ) {

    return [];
  }


  const snapshot =
    await getDocs(
      collection(
        db,
        'receipts',
        receiptId,
        'items'
      )
    );


  return snapshot.docs
    .map(itemDoc => ({

      id:
        itemDoc.id,

      ...itemDoc.data()

    }));
}


// ======================================================
// Load One Draft
// ======================================================

export async function getReceiptDraft({
  db,
  receiptId
}) {

  if (
    !db ||
    !receiptId
  ) {

    return null;
  }


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


  if (
    !receiptSnapshot.exists()
  ) {

    return null;
  }


  const receipt = {

    id:
      receiptSnapshot.id,

    ...receiptSnapshot.data()

  };


  // ----------------------------------------------------
  // Safety:
  // only status === draft may enter Draft editor.
  // ----------------------------------------------------

  if (
    receipt.status !== 'draft'
  ) {

    return null;
  }


  const items =
    await getReceiptDraftItems({
      db,
      receiptId
    });


  return {
    receipt,
    items
  };
}


// ======================================================
// Load All Drafts
// ======================================================

export async function getReceiptDrafts({
  db
}) {

  if (!db) {
    return [];
  }


  const draftQuery =
    query(
      collection(
        db,
        'receipts'
      ),
      where(
        'status',
        '==',
        'draft'
      )
    );


  const snapshot =
    await getDocs(
      draftQuery
    );


  const drafts = [];


  for (
    const receiptDoc
    of snapshot.docs
  ) {

    const receipt = {

      id:
        receiptDoc.id,

      ...receiptDoc.data()

    };


    // --------------------------------------------------
    // Count items for Draft list.
    // --------------------------------------------------

    const itemSnapshot =
      await getDocs(
        collection(
          db,
          'receipts',
          receipt.id,
          'items'
        )
      );


    drafts.push({

      ...receipt,

      itemCount:
        itemSnapshot.size

    });
  }


  // ----------------------------------------------------
  // Most recently edited first.
  //
  // No Firestore orderBy here, so we avoid requiring
  // another Firestore index.
  // ----------------------------------------------------

  drafts.sort(
    (a, b) => {

      const aDate =
        timestampToDate(
          a.updatedAt ||
          a.createdAt
        );


      const bDate =
        timestampToDate(
          b.updatedAt ||
          b.createdAt
        );


      const aTime =
        aDate
          ? aDate.getTime()
          : 0;


      const bTime =
        bDate
          ? bDate.getTime()
          : 0;


      return bTime - aTime;
    }
  );


  return drafts;
}


// ======================================================
// Delete Draft
// ======================================================

export async function deleteReceiptDraft({
  db,
  currentUser,
  receiptId
}) {

  if (
    !db ||
    !currentUser ||
    !receiptId
  ) {

    throw new Error(
      'Missing Draft delete information.'
    );
  }


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


  if (
    !receiptSnapshot.exists()
  ) {

    throw new Error(
      'Draft does not exist.'
    );
  }


  const receipt =
    receiptSnapshot.data();


  // ----------------------------------------------------
  // Safety:
  //
  // This function is ONLY allowed to delete Drafts.
  //
  // Submitted Receipts must continue using the separate
  // Owner Receipt Delete workflow.
  // ----------------------------------------------------

  if (
    receipt.status !== 'draft'
  ) {

    throw new Error(
      'This Receipt is no longer a Draft.'
    );
  }


  // ----------------------------------------------------
  // Delete Draft items first.
  // ----------------------------------------------------

  const itemSnapshot =
    await getDocs(
      collection(
        db,
        'receipts',
        receiptId,
        'items'
      )
    );


  for (
    const itemDoc
    of itemSnapshot.docs
  ) {

    await deleteDoc(
      itemDoc.ref
    );
  }


  // ----------------------------------------------------
  // Draft has:
  //
  // - no confirmations
  // - no Master Data usage
  // - no merchantCurrencyOptions
  //
  // Therefore deleting the parent is sufficient after
  // deleting its item subcollection.
  // ----------------------------------------------------

  await deleteDoc(
    receiptRef
  );


  return true;
}


// ======================================================
// Draft Card
// ======================================================

function draftCardHtml({
  draft,
  lang
}) {

  const store =
    clean(
      draft.store
    ) ||
    (
      lang === 'zh-TW'
        ? '未填寫商店'
        : 'Store not entered'
    );


  const itemCount =
    Number(
      draft.itemCount || 0
    );


  const itemText =
    itemCount > 0

      ? (
          lang === 'zh-TW'
            ? `${itemCount} 個品項`
            : `${
                itemCount
              } item${
                itemCount === 1
                  ? ''
                  : 's'
              }`
        )

      : (
          lang === 'zh-TW'
            ? '尚未輸入品項'
            : 'No items yet'
        );


  const updatedAt =
    formatUpdatedAt(
      draft.updatedAt ||
      draft.createdAt,
      lang
    );


  return `
    <article
      class="receipt-draft-card"
      data-draft-id="${escapeHtml(
        draft.id
      )}"
    >

      <div class="receipt-draft-card-main">

        <div class="receipt-draft-card-heading">

          <h3 class="receipt-draft-store">
            ${escapeHtml(store)}
          </h3>

          <span class="badge">
            ${
              lang === 'zh-TW'
                ? '草稿'
                : 'Draft'
            }
          </span>

        </div>


        <div class="receipt-draft-meta">

          <span>
            ${
              formatPurchaseDate(
                draft.purchaseDate,
                lang
              )
            }
          </span>

          <span>
            ${formatMoney(
              draft.total,
              draft.currency
            )}
          </span>

          <span>
            ${escapeHtml(
              itemText
            )}
          </span>

        </div>


        <div class="receipt-draft-updated muted">

          ${
            lang === 'zh-TW'
              ? '最近修改：'
              : 'Last updated: '
          }

          ${escapeHtml(updatedAt)}

        </div>

      </div>


      <div class="receipt-draft-actions">

        <button
          type="button"
          class="primary editReceiptDraftBtn"
          data-draft-id="${escapeHtml(
            draft.id
          )}"
        >
          ${
            lang === 'zh-TW'
              ? '繼續編輯'
              : 'Continue Editing'
          }
        </button>


        <button
          type="button"
          class="deleteReceiptDraftBtn"
          data-draft-id="${escapeHtml(
            draft.id
          )}"
        >
          ${
            lang === 'zh-TW'
              ? '刪除'
              : 'Delete'
          }
        </button>

      </div>

    </article>
  `;
}


// ======================================================
// Draft List Page
// ======================================================

export async function receiptDraftsPage({
  db,
  currentUser,
  currentRole,
  lang,
  page
}) {

  // ----------------------------------------------------
  // Owner only
  // ----------------------------------------------------

  if (
    !currentUser ||
    currentRole !== 'owner'
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '無法存取'
              : 'Access Denied'
          }
        </h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以查看 Receipt 草稿。'
              : 'Only the Owner can view Receipt drafts.'
          }
        </p>

      </section>
    `;

    return;
  }


  // ----------------------------------------------------
  // Initial UI
  // ----------------------------------------------------

  page.innerHTML = `
    <section class="panel receipt-drafts-page">

      <div class="receipt-drafts-header">

        <div>

          <h1>
            ${
              lang === 'zh-TW'
                ? '收據草稿'
                : 'Receipt Drafts'
            }
          </h1>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '尚未正式送出的 Receipt。'
                : 'Receipts that have not been submitted yet.'
            }
          </p>

        </div>


        <button
          type="button"
          id="newReceiptFromDraftPage"
          class="primary"
        >
          ${
            lang === 'zh-TW'
              ? '＋ 新增 Receipt'
              : '+ New Receipt'
          }
        </button>

      </div>


      <div id="receiptDraftList">

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '正在載入草稿…'
              : 'Loading drafts…'
          }
        </p>

      </div>

    </section>
  `;


  const list =
    page.querySelector(
      '#receiptDraftList'
    );


  const newReceiptButton =
    page.querySelector(
      '#newReceiptFromDraftPage'
    );


  if (newReceiptButton) {

    newReceiptButton.onclick =
      () => {

        location.hash =
          '#new-receipt';
      };
  }


  // ----------------------------------------------------
  // Load
  // ----------------------------------------------------

  try {

    const drafts =
      await getReceiptDrafts({
        db
      });


    if (!drafts.length) {

      list.innerHTML = `
        <div class="receipt-draft-empty">

          <p>
            ${
              lang === 'zh-TW'
                ? '目前沒有草稿。'
                : 'There are no drafts.'
            }
          </p>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '在新增 Receipt 時按「儲存草稿」，草稿就會出現在這裡。'
                : 'Use “Save Draft” while creating a Receipt to save it here.'
            }
          </p>

        </div>
      `;

      return;
    }


    list.innerHTML = `

      <div class="receipt-draft-count muted">

        ${
          lang === 'zh-TW'
            ? `共 ${drafts.length} 筆草稿`
            : `${
                drafts.length
              } draft${
                drafts.length === 1
                  ? ''
                  : 's'
              }`
        }

      </div>


      <div class="receipt-draft-list">

        ${
          drafts
            .map(draft =>
              draftCardHtml({
                draft,
                lang
              })
            )
            .join('')
        }

      </div>
    `;


    // ==================================================
    // Continue Editing
    // ==================================================

    list
      .querySelectorAll(
        '.editReceiptDraftBtn'
      )
      .forEach(button => {

        button.onclick =
          () => {

            const draftId =
              button.dataset.draftId;


            if (!draftId) {
              return;
            }


            location.hash =
              `#receipt-draft/${draftId}`;
          };
      });


    // ==================================================
    // Delete
    // ==================================================

    list
      .querySelectorAll(
        '.deleteReceiptDraftBtn'
      )
      .forEach(button => {

        button.onclick =
          async () => {

            const draftId =
              button.dataset.draftId;


            if (!draftId) {
              return;
            }


            const confirmed =
              window.confirm(

                lang === 'zh-TW'

                  ? (
                      '確定要刪除這份 Receipt 草稿嗎？\n\n' +
                      '此操作無法復原。'
                    )

                  : (
                      'Delete this Receipt draft?\n\n' +
                      'This action cannot be undone.'
                    )
              );


            if (!confirmed) {
              return;
            }


            button.disabled =
              true;


            try {

              await deleteReceiptDraft({
                db,
                currentUser,
                receiptId:
                  draftId
              });


              // ----------------------------------------
              // Remove the card immediately.
              // ----------------------------------------

              const card =
                button.closest(
                  '.receipt-draft-card'
                );


              if (card) {
                card.remove();
              }


              // ----------------------------------------
              // Refresh page so count / empty state are
              // always correct.
              // ----------------------------------------

              await receiptDraftsPage({
                db,
                currentUser,
                currentRole,
                lang,
                page
              });


            } catch (error) {

              console.error(
                'Failed to delete Receipt Draft:',
                error
              );


              alert(
                `${
                  lang === 'zh-TW'
                    ? '刪除草稿失敗'
                    : 'Failed to delete draft'
                }: ${error.message}`
              );


              button.disabled =
                false;
            }
          };
      });


  } catch (error) {

    console.error(
      'Failed to load Receipt Drafts:',
      error
    );


    list.innerHTML = `
      <p class="muted">

        ${
          lang === 'zh-TW'
            ? '無法載入 Receipt 草稿。'
            : 'Unable to load Receipt drafts.'
        }

        <br>

        ${escapeHtml(
          error.message
        )}

      </p>
    `;
  }
}


// ======================================================
// END OF RECEIPT DRAFT MODULE
// ======================================================
