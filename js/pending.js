import {
  collection,
  doc,
  getDoc,
  getDocs
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


function money(value, currency = 'USD') {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}


function getExpectedCurrency(receipt) {
  return String(
    receipt.expectedSettlementCurrency ||
    receipt.currency ||
    'USD'
  )
    .trim()
    .toUpperCase();
}


function daysWaiting(purchaseDate) {

  if (!purchaseDate) {
    return null;
  }

  const purchase =
    new Date(`${purchaseDate}T00:00:00`);

  if (
    Number.isNaN(
      purchase.getTime()
    )
  ) {
    return null;
  }

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const difference =
    today.getTime() -
    purchase.getTime();

  return Math.max(
    0,
    Math.floor(
      difference /
      (1000 * 60 * 60 * 24)
    )
  );
}


// ======================================================
// Get User Display Name
// ======================================================

async function getUserDisplayName({
  db,
  userId
}) {

  if (!userId) {
    return '—';
  }

  try {

    const userSnapshot =
      await getDoc(
        doc(
          db,
          'users',
          userId
        )
      );

    if (!userSnapshot.exists()) {
      return userId;
    }

    const user =
      userSnapshot.data();

    return (
      user.displayAs ||
      user.displayName ||
      user.name ||
      userId
    );

  } catch (error) {

    console.error(
      'Failed to load user:',
      userId,
      error
    );

    return userId;
  }
}


// ======================================================
// Get All Pending Receipts
// ======================================================

export async function getAllPendingReceipts({
  db
}) {

  const receiptSnapshot =
    await getDocs(
      collection(
        db,
        'receipts'
      )
    );


  const candidateReceipts =
    receiptSnapshot.docs
      .map(receiptDoc => ({
        id: receiptDoc.id,
        ...receiptDoc.data()
      }))
      .filter(receipt =>

        receipt.paymentMethod === 'card' &&

        receipt.status === 'pending' &&

        Boolean(
          receipt.confirmationUserId
        )
      );


  const pendingChecks =
    await Promise.all(

      candidateReceipts.map(
        async receipt => {

          const confirmationSnapshot =
            await getDoc(
              doc(
                db,
                'receipts',
                receipt.id,
                'confirmations',
                receipt.confirmationUserId
              )
            );


          if (
            confirmationSnapshot.exists()
          ) {
            return null;
          }


          const confirmationUserName =
            await getUserDisplayName({
              db,
              userId:
                receipt.confirmationUserId
            });


          return {
            ...receipt,

            confirmationUserName,

            daysWaiting:
              daysWaiting(
                receipt.purchaseDate
              )
          };
        }
      )
    );


  return pendingChecks
    .filter(Boolean)
    .sort((a, b) => {

      const dateA =
        String(
          a.purchaseDate || ''
        );

      const dateB =
        String(
          b.purchaseDate || ''
        );

      return dateB.localeCompare(
        dateA
      );
    });
}


// ======================================================
// Group Pending Receipts by Confirmation User
// ======================================================

export function groupPendingByUser(
  receipts
) {

  const groups =
    new Map();


  receipts.forEach(receipt => {

    const userId =
      receipt.confirmationUserId ||
      'unknown';


    if (!groups.has(userId)) {

      groups.set(
        userId,
        {
          userId,

          userName:
            receipt.confirmationUserName ||
            '—',

          receipts: []
        }
      );
    }


    groups
      .get(userId)
      .receipts
      .push(receipt);
  });


  return Array.from(
    groups.values()
  );
}


// ======================================================
// Pending Page
// ======================================================

export async function pendingPage({
  db,
  currentRole,
  lang,
  page
}) {

  // --------------------------------------------------
  // Owner only
  // --------------------------------------------------

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

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以查看所有未確認交易。'
              : 'Only owners can view all pending confirmations.'
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
            ? '未確認交易'
            : 'Pending Confirmations'
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

    const pendingReceipts =
      await getAllPendingReceipts({
        db
      });


    // ------------------------------------------------
    // Empty
    // ------------------------------------------------

    if (
      pendingReceipts.length === 0
    ) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            ${
              lang === 'zh-TW'
                ? '未確認交易'
                : 'Pending Confirmations'
            }
          </h1>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '目前沒有尚未確認的交易。'
                : 'There are currently no pending confirmations.'
            }
          </p>

        </section>
      `;

      return;
    }


    const groups =
      groupPendingByUser(
        pendingReceipts
      );


    // ------------------------------------------------
    // Render
    // ------------------------------------------------

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '未確認交易'
              : 'Pending Confirmations'
          }
        </h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? `全部 ${pendingReceipts.length} 筆`
              : `${pendingReceipts.length} total`
          }
        </p>

      </section>


      ${groups
        .map(group =>
          pendingGroupHtml({
            group,
            lang
          })
        )
        .join('')}
    `;


    // ------------------------------------------------
    // Click receipt -> Receipt Detail
    // ------------------------------------------------

    page
      .querySelectorAll(
        '.pending-receipt'
      )
      .forEach(item => {

        item.onclick = () => {

          const receiptId =
            item.dataset.receiptId;

          location.hash =
            `#receipt-detail/${receiptId}`;
        };
      });


  } catch (error) {

    console.error(
      'Failed to load pending confirmations:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '未確認交易'
              : 'Pending Confirmations'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '無法載入未確認交易。'
              : 'Unable to load pending confirmations.'
          }
        </p>

      </section>
    `;
  }
}


// ======================================================
// Pending User Group
// ======================================================

function pendingGroupHtml({
  group,
  lang
}) {

  const receipts =
    group.receipts;


  const waitingValues =
    receipts
      .map(receipt =>
        receipt.daysWaiting
      )
      .filter(value =>
        Number.isFinite(value)
      );


  const oldestDays =
    waitingValues.length > 0
      ? Math.max(
          ...waitingValues
        )
      : null;


  return `
    <section class="panel pending-user-group">

      <div class="pending-user-header">

        <h2>
          ${escapeHtml(
            group.userName
          )}
        </h2>

        <span class="badge">
          ${
            lang === 'zh-TW'
              ? `${receipts.length} 筆`
              : `${receipts.length} pending`
          }
        </span>

      </div>


      ${
        oldestDays !== null
          ? `
              <p class="muted">
                ${
                  lang === 'zh-TW'
                    ? `最久已等待 ${oldestDays} 天`
                    : `Oldest waiting ${oldestDays} days`
                }
              </p>
            `
          : ''
      }


      ${receipts
        .map(receipt =>
          pendingReceiptHtml({
            receipt,
            lang
          })
        )
        .join('')}

    </section>
  `;
}


// ======================================================
// Individual Pending Receipt
// ======================================================

function pendingReceiptHtml({
  receipt,
  lang
}) {

  const currency =
    getExpectedCurrency(
      receipt
    );


  const waitingText =
    Number.isFinite(
      receipt.daysWaiting
    )
      ? (
          lang === 'zh-TW'
            ? `已等待 ${receipt.daysWaiting} 天`
            : `Waiting ${receipt.daysWaiting} days`
        )
      : (
          lang === 'zh-TW'
            ? '待確認'
            : 'Pending'
        );


  return `
    <div
      class="pending-receipt"
      data-receipt-id="${escapeHtml(
        receipt.id
      )}"
      role="button"
      tabindex="0"
    >

      <div class="pending-receipt-main">

        <span>
          ${escapeHtml(
            receipt.purchaseDate ||
            '—'
          )}
        </span>

        <span>
          ${escapeHtml(
            receipt.store ||
            '—'
          )}
        </span>

        <span>
          ${money(
            receipt.total,
            currency
          )}
        </span>

      </div>


      <div class="pending-receipt-status">

        <span class="muted">
          ${escapeHtml(
            waitingText
          )}
        </span>

        <span>
          ›
        </span>

      </div>

    </div>
  `;
}
