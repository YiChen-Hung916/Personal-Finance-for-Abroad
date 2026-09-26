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


// ======================================================
// Calendar Date Helpers
// ======================================================

function localDateString(date) {

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, '0'),
    String(
      date.getDate()
    ).padStart(2, '0')
  ].join('-');
}


function getSubmissionDate(receipt) {

  // New receipts:
  // exact local calendar date saved when submitted.
  if (receipt.submittedDate) {
    return receipt.submittedDate;
  }


  // Old receipts:
  // fallback to Firestore submittedAt timestamp.
  if (
    receipt.submittedAt &&
    typeof receipt.submittedAt.toDate === 'function'
  ) {

    return localDateString(
      receipt.submittedAt.toDate()
    );
  }


  return null;
}


// ======================================================
// Calendar-Day Difference
// ======================================================

function calendarDaysWaiting(
  submittedDate
) {

  if (!submittedDate) {
    return null;
  }


  const parts =
    submittedDate
      .split('-')
      .map(Number);


  if (
    parts.length !== 3 ||
    parts.some(
      value =>
        !Number.isFinite(value)
    )
  ) {
    return null;
  }


  const [
    year,
    month,
    day
  ] = parts;


  // Use UTC only for the date arithmetic itself.
  // This prevents daylight-saving changes from making
  // one calendar day equal 23 or 25 hours.
  const submittedDay =
    Date.UTC(
      year,
      month - 1,
      day
    );


  const today =
    new Date();


  const todayDay =
    Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );


  const difference =
    todayDay -
    submittedDay;


  return Math.max(
    0,
    Math.floor(
      difference /
      (1000 * 60 * 60 * 24)
    )
  );
}


// ======================================================
// Reminder Level
// ======================================================

export function getPendingReminderLevel(
  daysWaiting
) {

  if (
    !Number.isFinite(
      daysWaiting
    )
  ) {
    return 'normal';
  }


  if (daysWaiting >= 14) {
    return 'red';
  }


  if (daysWaiting >= 10) {
    return 'orange';
  }


  if (daysWaiting >= 5) {
    return 'yellow';
  }


  return 'normal';
}


export function getPendingReminderClass(
  daysWaiting
) {

  const level =
    getPendingReminderLevel(
      daysWaiting
    );


  return `pending-reminder-${level}`;
}


export function getPendingReminderText({
  daysWaiting,
  lang
}) {

  if (
    !Number.isFinite(
      daysWaiting
    )
  ) {

    return lang === 'zh-TW'
      ? '待確認'
      : 'Pending';
  }


  const level =
    getPendingReminderLevel(
      daysWaiting
    );


  if (level === 'red') {

    return lang === 'zh-TW'
      ? `已等待 ${daysWaiting} 天 · 14 天以上`
      : `Waiting ${daysWaiting} days · 14+ day reminder`;
  }


  if (level === 'orange') {

    return lang === 'zh-TW'
      ? `已等待 ${daysWaiting} 天 · 10 天提醒`
      : `Waiting ${daysWaiting} days · 10-day reminder`;
  }


  if (level === 'yellow') {

    return lang === 'zh-TW'
      ? `已等待 ${daysWaiting} 天 · 5 天提醒`
      : `Waiting ${daysWaiting} days · 5-day reminder`;
  }


  return lang === 'zh-TW'
    ? `已等待 ${daysWaiting} 天`
    : `Waiting ${daysWaiting} days`;
}


// ======================================================
// Attach Reminder Information
// ======================================================

export function attachPendingReminderInfo(
  receipt
) {

  const submittedDate =
    getSubmissionDate(
      receipt
    );


  const daysWaiting =
    calendarDaysWaiting(
      submittedDate
    );


  const reminderLevel =
    getPendingReminderLevel(
      daysWaiting
    );


  return {
    ...receipt,

    submittedDate,

    daysWaiting,

    reminderLevel
  };
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


  // ====================================================
  // Candidate receipts
  // ====================================================

  const candidateReceipts =
    receiptSnapshot.docs
      .map(receiptDoc => ({
        id: receiptDoc.id,
        ...receiptDoc.data()
      }))
      .filter(receipt => {

        if (
          receipt.paymentMethod !== 'card' ||
          receipt.status !== 'pending'
        ) {
          return false;
        }


        // New structure
        if (
          Array.isArray(
            receipt.confirmationUserIds
          ) &&
          receipt.confirmationUserIds
            .filter(Boolean)
            .length > 0
        ) {
          return true;
        }


        // Legacy structure
        return Boolean(
          receipt.confirmationUserId
        );
      });


  // ====================================================
  // Check whether ANY assigned user already confirmed
  // ====================================================

  const pendingChecks =
    await Promise.all(

      candidateReceipts.map(
        async receipt => {

          const confirmationsSnapshot =
            await getDocs(
              collection(
                db,
                'receipts',
                receipt.id,
                'confirmations'
              )
            );


          // Any confirmation completes this Receipt.
          if (
            !confirmationsSnapshot.empty
          ) {
            return null;
          }


          // --------------------------------------------
          // Assigned users
          // --------------------------------------------

          let confirmationUserIds = [];


          if (
            Array.isArray(
              receipt.confirmationUserIds
            )
          ) {

            confirmationUserIds =
              receipt.confirmationUserIds
                .filter(Boolean);

          } else if (
            receipt.confirmationUserId
          ) {

            // Legacy Receipt
            confirmationUserIds = [
              receipt.confirmationUserId
            ];
          }


          confirmationUserIds =
            [
              ...new Set(
                confirmationUserIds
              )
            ];


          // --------------------------------------------
          // Load display names for every assigned user
          // --------------------------------------------

          const confirmationUsers =
            await Promise.all(

              confirmationUserIds.map(
                async userId => ({

                  userId,

                  userName:
                    await getUserDisplayName({
                      db,
                      userId
                    })
                })
              )
            );


          return attachPendingReminderInfo({
            ...receipt,

            confirmationUserIds,

            confirmationUsers
          });
        }
      )
    );


  // ====================================================
  // Remove completed receipts + sort
  // ====================================================

  return pendingChecks
    .filter(Boolean)
    .sort((a, b) => {

      const daysA =
        Number.isFinite(
          a.daysWaiting
        )
          ? a.daysWaiting
          : -1;


      const daysB =
        Number.isFinite(
          b.daysWaiting
        )
          ? b.daysWaiting
          : -1;


      // Longest waiting first.
      if (daysA !== daysB) {
        return daysB - daysA;
      }


      return String(
        b.purchaseDate || ''
      ).localeCompare(
        String(
          a.purchaseDate || ''
        )
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

    // ==================================================
    // New multi-confirmer structure
    // ==================================================

    let confirmationUsers =
      Array.isArray(
        receipt.confirmationUsers
      )
        ? receipt.confirmationUsers
        : [];


    // ==================================================
    // Legacy fallback
    // ==================================================

    if (
      confirmationUsers.length === 0 &&
      receipt.confirmationUserId
    ) {

      confirmationUsers = [
        {
          userId:
            receipt.confirmationUserId,

          userName:
            receipt.confirmationUserName ||
            '—'
        }
      ];
    }


    // ==================================================
    // The same Receipt belongs to every assigned user.
    //
    // Example:
    // Receipt assigned to A + B
    //
    // A group -> contains Receipt
    // B group -> contains Receipt
    //
    // This is intentional.
    // ==================================================

    confirmationUsers.forEach(user => {

      const userId =
        user.userId ||
        'unknown';


      const userName =
        user.userName ||
        '—';


      if (!groups.has(userId)) {

        groups.set(
          userId,
          {
            userId,
            userName,
            receipts: []
          }
        );
      }


      groups
        .get(userId)
        .receipts
        .push(receipt);
    });
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

        <div class="pending-reminder-legend">

          <span class="pending-legend-yellow">
            ${
              lang === 'zh-TW'
                ? '5 天'
                : '5 days'
            }
          </span>

          <span class="pending-legend-orange">
            ${
              lang === 'zh-TW'
                ? '10 天'
                : '10 days'
            }
          </span>

          <span class="pending-legend-red">
            ${
              lang === 'zh-TW'
                ? '14 天以上'
                : '14+ days'
            }
          </span>

        </div>

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


        item.onkeydown =
          event => {

            if (
              event.key === 'Enter' ||
              event.key === ' '
            ) {

              event.preventDefault();

              location.hash =
                `#receipt-detail/${item.dataset.receiptId}`;
            }
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
    <section
      class="panel pending-user-group"
    >

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
              <p class="pending-group-waiting">
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


  const reminderClass =
    getPendingReminderClass(
      receipt.daysWaiting
    );


  const waitingText =
    getPendingReminderText({
      daysWaiting:
        receipt.daysWaiting,

      lang
    });


  return `
    <div
      class="
        pending-receipt
        ${reminderClass}
      "
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

        <span>
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
