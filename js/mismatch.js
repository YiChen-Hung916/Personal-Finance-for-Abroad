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
