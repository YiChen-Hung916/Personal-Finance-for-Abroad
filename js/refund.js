// ======================================================
// Refund
//
// Firestore:
// refunds/{refundId}
//
// Workflow:
//
// Owner creates Refund
//        ↓
// Assigned user waits for refund
//        ↓
// User reports actual amount + currency
//        ↓
// match    -> received
// mismatch -> mismatch
//        ↓
// Owner may resolve mismatch
//
// Receipt itself is NEVER modified.
// ======================================================


import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Helpers
// ======================================================

function clean(value) {
  return String(value ?? '').trim();
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function normalizeCurrency(value) {
  return clean(value).toUpperCase();
}


function formatMoney(
  amount,
  currency
) {

  return `${
    escapeHtml(
      normalizeCurrency(currency)
    )
  } ${
    Number(amount || 0).toFixed(2)
  }`;
}


function getTodayString() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      now.getDate()
    ).padStart(2, '0');


  return `${year}-${month}-${day}`;
}


function displayUserName(user) {

  return (
    clean(user?.displayName) ||
    clean(user?.name) ||
    clean(user?.email) ||
    clean(user?.id) ||
    '—'
  );
}


function originalDestinationLabel(
  receipt
) {

  if (!receipt) {
    return '';
  }


  if (
    receipt.paymentMethod === 'card'
  ) {

    const snapshot =
      receipt.cardSnapshot || {};


    const cardName =
      clean(
        snapshot.nickname ||
        snapshot.name ||
        snapshot.cardName
      );


    const last4 =
      clean(
        snapshot.last4
      );


    if (
      cardName &&
      last4
    ) {
      return `${cardName} •••• ${last4}`;
    }


    if (cardName) {
      return cardName;
    }


    if (last4) {
      return `•••• ${last4}`;
    }


    return 'Card';
  }


  return (
    clean(
      receipt.paymentMethod
    ) ||
    'Original payment method'
  );
}


// ======================================================
// Load Users
// ======================================================

async function loadActiveUsers({
  db
}) {

  const snapshot =
    await getDocs(
      collection(
        db,
        'users'
      )
    );


  return snapshot.docs
    .map(userDoc => ({
      id: userDoc.id,
      ...userDoc.data()
    }))
    .filter(user =>
      user.active === true &&
      (
        user.role === 'owner' ||
        user.role === 'authorizedUser'
      )
    )
    .sort((a, b) => {

      const roleA =
        a.role === 'owner'
          ? 0
          : 1;

      const roleB =
        b.role === 'owner'
          ? 0
          : 1;


      if (roleA !== roleB) {
        return roleA - roleB;
      }


      return displayUserName(a)
        .localeCompare(
          displayUserName(b),
          'zh-TW'
        );
    });
}


// ======================================================
// Load Receipts
// ======================================================

async function loadReceipts({
  db
}) {

  const snapshot =
    await getDocs(
      collection(
        db,
        'receipts'
      )
    );


  return snapshot.docs
    .map(receiptDoc => ({
      id: receiptDoc.id,
      ...receiptDoc.data()
    }))
    .sort((a, b) =>
      String(
        b.purchaseDate || ''
      ).localeCompare(
        String(
          a.purchaseDate || ''
        )
      )
    );
}


// ======================================================
// Create Refund
// ======================================================

async function createRefund({
  db,
  currentUser,
  receipt,
  refundDate,
  amount,
  currency,
  destinationType,
  destinationLabel,
  confirmationUser,
  notes
}) {

  if (
    !db ||
    !currentUser?.uid
  ) {

    throw new Error(
      'Missing Refund dependency.'
    );
  }


  if (!receipt?.id) {

    throw new Error(
      'Please select a Receipt.'
    );
  }


  if (!refundDate) {

    throw new Error(
      'Please select a refund date.'
    );
  }


  const normalizedAmount =
    Number(amount);


  if (
    !Number.isFinite(
      normalizedAmount
    ) ||
    normalizedAmount <= 0
  ) {

    throw new Error(
      'Refund amount must be greater than 0.'
    );
  }


  const normalizedCurrency =
    normalizeCurrency(
      currency
    );


  if (!normalizedCurrency) {

    throw new Error(
      'Refund currency is required.'
    );
  }


  if (
    ![
      'original',
      'giftCard',
      'manual'
    ].includes(
      destinationType
    )
  ) {

    throw new Error(
      'Invalid refund destination.'
    );
  }


  if (!confirmationUser?.id) {

    throw new Error(
      'Please select a confirmation user.'
    );
  }


  const finalDestinationLabel =
    clean(destinationLabel);


  if (!finalDestinationLabel) {

    throw new Error(
      'Refund destination is required.'
    );
  }


  const useOriginalCard =
    destinationType === 'original' &&
    receipt.paymentMethod === 'card';


  await addDoc(
    collection(
      db,
      'refunds'
    ),
    {

      // ----------------------------------------------
      // Original Receipt reference
      // ----------------------------------------------

      receiptId:
        receipt.id,

      purchaseDate:
        clean(
          receipt.purchaseDate
        ),

      store:
        clean(
          receipt.store
        ),


      // ----------------------------------------------
      // Refund
      // ----------------------------------------------

      refundDate,

      amount:
        normalizedAmount,

      currency:
        normalizedCurrency,


      // ----------------------------------------------
      // Destination
      // ----------------------------------------------

      destinationType,

      destinationLabel:
        finalDestinationLabel,

      cardId:
        useOriginalCard
          ? (
              receipt.cardId ||
              null
            )
          : null,

      cardSnapshot:
        useOriginalCard
          ? (
              receipt.cardSnapshot ||
              null
            )
          : null,


      // ----------------------------------------------
      // Confirmation assignment
      // ----------------------------------------------

      confirmationUserId:
        confirmationUser.id,

      confirmationUserName:
        displayUserName(
          confirmationUser
        ),


      // ----------------------------------------------
      // Lifecycle
      // ----------------------------------------------

      status:
        'pending',

      confirmationStatus:
        'pending',

      reportedAmount:
        null,

      reportedCurrency:
        null,

      receiverNotes:
        '',

      confirmedBy:
        null,

      confirmedAt:
        null,


      // ----------------------------------------------
      // Owner mismatch resolution
      // ----------------------------------------------

      refundMismatchResolved:
        false,

      refundMismatchResolvedAt:
        null,

      refundMismatchResolvedBy:
        null,


      // ----------------------------------------------
      // Metadata
      // ----------------------------------------------

      notes:
        clean(notes),

      createdBy:
        currentUser.uid,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    }
  );
}


// ======================================================
// Pending Refunds Assigned To Current User
// ======================================================

export async function getMyPendingRefunds({
  db,
  currentUser
}) {

  if (
    !db ||
    !currentUser?.uid
  ) {
    return [];
  }


  const refundQuery =
    query(
      collection(
        db,
        'refunds'
      ),
      where(
        'confirmationUserId',
        '==',
        currentUser.uid
      )
    );


  const snapshot =
    await getDocs(
      refundQuery
    );


  return snapshot.docs
    .map(refundDoc => ({
      id: refundDoc.id,
      ...refundDoc.data()
    }))
    .filter(refund =>
      refund.status === 'pending'
    )
    .sort((a, b) =>
      String(
        a.refundDate || ''
      ).localeCompare(
        String(
          b.refundDate || ''
        )
      )
    );
}


// ======================================================
// Owner Refund Updates
// ======================================================

export async function getOwnerRefundUpdates({
  db
}) {

  if (!db) {
    return [];
  }


  const snapshot =
    await getDocs(
      collection(
        db,
        'refunds'
      )
    );


  return snapshot.docs
    .map(refundDoc => ({
      id: refundDoc.id,
      ...refundDoc.data()
    }))
    .filter(refund =>
      refund.status !== 'pending'
    )
    .sort((a, b) =>
      String(
        b.refundDate || ''
      ).localeCompare(
        String(
          a.refundDate || ''
        )
      )
    );
}


// ======================================================
// All Refunds
// Used by History
// ======================================================

export async function getAllRefunds({
  db
}) {

  if (!db) {
    return [];
  }


  const snapshot =
    await getDocs(
      collection(
        db,
        'refunds'
      )
    );


  return snapshot.docs
    .map(refundDoc => ({
      id: refundDoc.id,
      ...refundDoc.data()
    }));
}


// ======================================================
// Confirm Refund
// ======================================================

export async function confirmRefund({
  db,
  currentUser,
  refund,
  reportedAmount,
  reportedCurrency,
  receiverNotes = ''
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !refund?.id
  ) {

    throw new Error(
      'Missing Refund confirmation data.'
    );
  }


  if (
    refund.confirmationUserId !==
    currentUser.uid
  ) {

    throw new Error(
      'You are not assigned to confirm this Refund.'
    );
  }


  if (
    refund.status !== 'pending'
  ) {

    throw new Error(
      'This Refund has already been confirmed.'
    );
  }


  const normalizedAmount =
    Number(
      reportedAmount
    );


  if (
    !Number.isFinite(
      normalizedAmount
    ) ||
    normalizedAmount < 0
  ) {

    throw new Error(
      'Please enter the actual refund amount.'
    );
  }


  const normalizedCurrency =
    normalizeCurrency(
      reportedCurrency
    );


  if (!normalizedCurrency) {

    throw new Error(
      'Please enter the actual refund currency.'
    );
  }


  const expectedCurrency =
    normalizeCurrency(
      refund.currency
    );


  const amountMatches =
    normalizedAmount ===
    Number(
      refund.amount
    );


  const currencyMatches =
    normalizedCurrency ===
    expectedCurrency;


  const isMatch =
    amountMatches &&
    currencyMatches;


  const refundRef =
    doc(
      db,
      'refunds',
      refund.id
    );


  await updateDoc(
    refundRef,
    {

      status:
        isMatch
          ? 'received'
          : 'mismatch',

      confirmationStatus:
        isMatch
          ? 'match'
          : 'mismatch',

      reportedAmount:
        normalizedAmount,

      reportedCurrency:
        normalizedCurrency,

      receiverNotes:
        clean(
          receiverNotes
        ),

      confirmedBy:
        currentUser.uid,

      confirmedAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    }
  );


  return {
    isMatch,
    amountMatches,
    currencyMatches
  };
}


// ======================================================
// Resolve Refund Mismatch
// ======================================================

export async function resolveRefundMismatch({
  db,
  currentUser,
  refund
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !refund?.id
  ) {

    throw new Error(
      'Missing Refund mismatch resolution data.'
    );
  }


  if (
    refund.status !== 'mismatch' ||
    refund.confirmationStatus !== 'mismatch'
  ) {

    throw new Error(
      'This Refund does not contain a mismatch.'
    );
  }


  if (
    refund.refundMismatchResolved === true
  ) {

    throw new Error(
      'This Refund mismatch has already been resolved.'
    );
  }


  await updateDoc(
    doc(
      db,
      'refunds',
      refund.id
    ),
    {

      refundMismatchResolved:
        true,

      refundMismatchResolvedAt:
        serverTimestamp(),

      refundMismatchResolvedBy:
        currentUser.uid,

      updatedAt:
        serverTimestamp()
    }
  );
}


// ======================================================
// Owner New Refund Page
// ======================================================

export async function refundPage({
  db,
  currentUser,
  currentRole,
  lang,
  page
}) {

  if (
    !db ||
    !page
  ) {
    return;
  }


  if (
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


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '記錄退款'
            : 'Record Refund'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '退款會建立獨立紀錄，不會修改原本的消費 Receipt。'
            : 'A Refund creates a separate record and does not modify the original Receipt.'
        }
      </p>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入資料…'
            : 'Loading data…'
        }
      </p>

    </section>
  `;


  try {

    const [
      receipts,
      users
    ] =
      await Promise.all([
        loadReceipts({
          db
        }),

        loadActiveUsers({
          db
        })
      ]);


    const receiptOptions =
      receipts
        .map(receipt => `

          <option
            value="${escapeHtml(
              receipt.id
            )}"
          >
            ${escapeHtml(
              receipt.purchaseDate || '—'
            )}
            ·
            ${escapeHtml(
              receipt.store || '—'
            )}
            ·
            ${formatMoney(
              receipt.total || 0,
              receipt.currency || ''
            )}
          </option>

        `)
        .join('');


    const userOptions =
      users
        .map(user => `

          <option
            value="${escapeHtml(
              user.id
            )}"
          >
            ${escapeHtml(
              displayUserName(
                user
              )
            )}
            ${
              user.role === 'owner'
                ? (
                    lang === 'zh-TW'
                      ? '（Owner）'
                      : ' (Owner)'
                  )
                : ''
            }
          </option>

        `)
        .join('');


    page.innerHTML = `

      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '記錄退款'
              : 'Record Refund'
          }
        </h1>


        <div class="field">

          <label
            for="refundReceipt"
            class="field-label"
          >
            ${
              lang === 'zh-TW'
                ? '原消費'
                : 'Original Receipt'
            }

            <sup class="required-mark">*</sup>
          </label>

          <select id="refundReceipt">

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


        <div
          id="refundReceiptPreview"
          class="refund-source-preview"
          hidden
        ></div>


        <div class="row">

          <div class="field">

            <label
              for="refundDate"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '退款日期'
                  : 'Refund Date'
              }

              <sup class="required-mark">*</sup>
            </label>

            <input
              id="refundDate"
              type="date"
              value="${escapeHtml(
                getTodayString()
              )}"
            >

          </div>


          <div class="field">

            <label
              for="refundAmount"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '預期退款金額'
                  : 'Expected Refund Amount'
              }

              <sup class="required-mark">*</sup>
            </label>

            <input
              id="refundAmount"
              type="number"
              min="0"
              step="0.01"
            >

          </div>


          <div class="field">

            <label
              for="refundCurrency"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '預期退款幣值'
                  : 'Expected Refund Currency'
              }

              <sup class="required-mark">*</sup>
            </label>

            <input
              id="refundCurrency"
              type="text"
              maxlength="8"
              placeholder="USD"
            >

          </div>

        </div>


        <div class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '退款方式'
                : 'Refund Destination'
            }

            <sup class="required-mark">*</sup>

          </span>


          <label class="confirmation-choice">

            <input
              type="radio"
              name="refundDestinationType"
              value="original"
              checked
            >

            ${
              lang === 'zh-TW'
                ? '原付款方式'
                : 'Original payment method'
            }

          </label>


          <label class="confirmation-choice">

            <input
              type="radio"
              name="refundDestinationType"
              value="giftCard"
            >

            Gift Card

          </label>


          <label class="confirmation-choice">

            <input
              type="radio"
              name="refundDestinationType"
              value="manual"
            >

            ${
              lang === 'zh-TW'
                ? '手動設定'
                : 'Manual'
            }

          </label>

        </div>


        <div class="field">

          <label
            for="refundDestinationLabel"
            class="field-label"
          >
            ${
              lang === 'zh-TW'
                ? '退款目的地'
                : 'Refund Destination'
            }

            <sup class="required-mark">*</sup>
          </label>

          <input
            id="refundDestinationLabel"
            type="text"
          >

        </div>


        <div class="field">

          <label
            for="refundConfirmationUser"
            class="field-label"
          >
            ${
              lang === 'zh-TW'
                ? '退款確認人'
                : 'Refund Confirmation User'
            }

            <sup class="required-mark">*</sup>
          </label>

          <select id="refundConfirmationUser">

            <option value="">
              ${
                lang === 'zh-TW'
                  ? '請選擇確認人'
                  : 'Select User'
              }
            </option>

            ${userOptions}

          </select>

        </div>


        <div class="field">

          <label
            for="refundNotes"
            class="field-label"
          >
            ${
              lang === 'zh-TW'
                ? '備註'
                : 'Notes'
            }
          </label>

          <textarea
            id="refundNotes"
            rows="3"
          ></textarea>

        </div>


        <div class="actions">

          <button
            type="button"
            id="saveRefundButton"
            class="primary"
          >
            ${
              lang === 'zh-TW'
                ? '建立退款紀錄'
                : 'Create Refund'
            }
          </button>

          <button
            type="button"
            onclick="location.hash='#dashboard'"
          >
            ${
              lang === 'zh-TW'
                ? '取消'
                : 'Cancel'
            }
          </button>

        </div>


        <p
          id="refundMessage"
          class="muted"
        ></p>

      </section>
    `;


    const receiptSelect =
      page.querySelector(
        '#refundReceipt'
      );

    const receiptPreview =
      page.querySelector(
        '#refundReceiptPreview'
      );

    const amountInput =
      page.querySelector(
        '#refundAmount'
      );

    const currencyInput =
      page.querySelector(
        '#refundCurrency'
      );

    const destinationInput =
      page.querySelector(
        '#refundDestinationLabel'
      );

    const confirmationUserSelect =
      page.querySelector(
        '#refundConfirmationUser'
      );

    const saveButton =
      page.querySelector(
        '#saveRefundButton'
      );

    const message =
      page.querySelector(
        '#refundMessage'
      );


    let selectedReceipt =
      null;


    function selectedDestinationType() {

      return page
        .querySelector(
          'input[name="refundDestinationType"]:checked'
        )
        ?.value ||
        'original';
    }


    function syncDestination() {

      if (!selectedReceipt) {
        return;
      }


      const type =
        selectedDestinationType();


      if (
        type === 'original'
      ) {

        destinationInput.value =
          originalDestinationLabel(
            selectedReceipt
          );

        currencyInput.value =
          normalizeCurrency(
            selectedReceipt.currency
          );

        return;
      }


      if (
        type === 'giftCard'
      ) {

        destinationInput.value =
          selectedReceipt.store
            ? `${selectedReceipt.store} Gift Card`
            : 'Gift Card';

        return;
      }


      if (
        type === 'manual'
      ) {

        destinationInput.value = '';
      }
    }


    receiptSelect.onchange =
      () => {

        selectedReceipt =
          receipts.find(
            receipt =>
              receipt.id ===
              receiptSelect.value
          ) ||
          null;


        if (!selectedReceipt) {

          receiptPreview.hidden =
            true;

          receiptPreview.innerHTML =
            '';

          amountInput.value =
            '';

          currencyInput.value =
            '';

          destinationInput.value =
            '';

          return;
        }


        amountInput.value =
          Number(
            selectedReceipt.total || 0
          ).toFixed(2);


        currencyInput.value =
          normalizeCurrency(
            selectedReceipt.currency
          );


        receiptPreview.hidden =
          false;


        receiptPreview.innerHTML = `

          <div>
            <strong>
              ${escapeHtml(
                selectedReceipt.store || '—'
              )}
            </strong>
          </div>

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '原消費日期'
                : 'Purchase date'
            }:
            ${escapeHtml(
              selectedReceipt.purchaseDate || '—'
            )}
          </div>

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '原消費金額'
                : 'Original amount'
            }:
            ${formatMoney(
              selectedReceipt.total || 0,
              selectedReceipt.currency || ''
            )}
          </div>

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '原付款方式'
                : 'Original payment'
            }:
            ${escapeHtml(
              originalDestinationLabel(
                selectedReceipt
              )
            )}
          </div>

        `;


        syncDestination();
      };


    page
      .querySelectorAll(
        'input[name="refundDestinationType"]'
      )
      .forEach(radio => {

        radio.onchange =
          syncDestination;
      });


    saveButton.onclick =
      async () => {

        if (!selectedReceipt) {

          alert(
            lang === 'zh-TW'
              ? '請先選擇原消費 Receipt。'
              : 'Please select the original Receipt.'
          );

          return;
        }


        const confirmationUser =
          users.find(
            user =>
              user.id ===
              confirmationUserSelect.value
          );


        if (!confirmationUser) {

          alert(
            lang === 'zh-TW'
              ? '請選擇退款確認人。'
              : 'Please select a confirmation user.'
          );

          return;
        }


        saveButton.disabled =
          true;


        saveButton.textContent =
          lang === 'zh-TW'
            ? '建立中…'
            : 'Creating…';


        message.textContent =
          '';


        try {

          await createRefund({

            db,

            currentUser,

            receipt:
              selectedReceipt,

            refundDate:
              page.querySelector(
                '#refundDate'
              ).value,

            amount:
              amountInput.value,

            currency:
              currencyInput.value,

            destinationType:
              selectedDestinationType(),

            destinationLabel:
              destinationInput.value,

            confirmationUser,

            notes:
              page.querySelector(
                '#refundNotes'
              ).value
          });


          location.hash =
            '#dashboard';


        } catch (error) {

          console.error(
            'Failed to create Refund:',
            error
          );


          message.textContent =
            `${
              lang === 'zh-TW'
                ? '建立退款失敗'
                : 'Failed to create Refund'
            }: ${error.message}`;


          saveButton.disabled =
            false;


          saveButton.textContent =
            lang === 'zh-TW'
              ? '建立退款紀錄'
              : 'Create Refund';
        }
      };


  } catch (error) {

    console.error(
      'Failed to load Refund page:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '記錄退款'
              : 'Record Refund'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入退款頁面失敗。'
              : 'Failed to load Refund page.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(
            error.message
          )}
        </p>

      </section>
    `;
  }
}


// ======================================================
// Refund Detail Page
// ======================================================

export async function refundDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  refundId
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !page ||
    !refundId
  ) {
    return;
  }


  page.innerHTML = `
    <section class="panel">
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入退款明細…'
            : 'Loading Refund…'
        }
      </p>
    </section>
  `;


  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          'refunds',
          refundId
        )
      );


    if (!snapshot.exists()) {

      throw new Error(
        'Refund not found.'
      );
    }


    const refund = {
      id: snapshot.id,
      ...snapshot.data()
    };


    const isAssignedUser =
      refund.confirmationUserId ===
      currentUser.uid;


    const canConfirm =
      isAssignedUser &&
      refund.status === 'pending';


    const isMismatch =
      refund.status === 'mismatch' &&
      refund.confirmationStatus ===
        'mismatch';


    const mismatchResolved =
      refund.refundMismatchResolved ===
      true;


    const canResolveMismatch =
      currentRole === 'owner' &&
      isMismatch &&
      !mismatchResolved;


    let statusText =
      lang === 'zh-TW'
        ? '等待確認'
        : 'Pending';


    if (
      refund.status === 'received'
    ) {

      statusText =
        lang === 'zh-TW'
          ? '已完成'
          : 'Completed';
    }


    if (
      refund.status === 'mismatch'
    ) {

      statusText =
        mismatchResolved
          ? (
              lang === 'zh-TW'
                ? '金額／幣值不符 · 已處理'
                : 'Mismatch · Resolved'
            )
          : (
              lang === 'zh-TW'
                ? '金額／幣值不符 · 待處理'
                : 'Mismatch · Needs Attention'
            );
    }


    const destinationTypeText =
      refund.destinationType ===
        'giftCard'
        ? 'Gift Card'
        : (
            refund.destinationType ===
              'manual'
              ? (
                  lang === 'zh-TW'
                    ? '手動設定'
                    : 'Manual'
                )
              : (
                  lang === 'zh-TW'
                    ? '原付款方式'
                    : 'Original Payment'
                )
          );


    page.innerHTML = `

      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '退款明細'
              : 'Refund Detail'
          }
        </h1>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '商店'
                : 'Store'
            }
          </span>

          <strong>
            ${escapeHtml(
              refund.store || '—'
            )}
          </strong>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '退款日期'
                : 'Refund Date'
            }
          </span>

          <span>
            ${escapeHtml(
              refund.refundDate || '—'
            )}
          </span>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '預期退款'
                : 'Expected Refund'
            }
          </span>

          <strong>
            ${formatMoney(
              refund.amount,
              refund.currency
            )}
          </strong>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '退款方式'
                : 'Destination Type'
            }
          </span>

          <span>
            ${escapeHtml(
              destinationTypeText
            )}
          </span>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '退款目的地'
                : 'Destination'
            }
          </span>

          <span>
            ${escapeHtml(
              refund.destinationLabel || '—'
            )}
          </span>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '退款確認人'
                : 'Confirmation User'
            }
          </span>

          <span>
            ${escapeHtml(
              refund.confirmationUserName || '—'
            )}
          </span>

        </div>


        <div class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '狀態'
                : 'Status'
            }
          </span>

          <strong>
            ${escapeHtml(
              statusText
            )}
          </strong>

        </div>


        ${
          refund.status !== 'pending'
            ? `

                <hr>

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
                      refund.reportedAmount,
                      refund.reportedCurrency
                    )}
                  </strong>

                </div>

                ${
                  refund.receiverNotes
                    ? `

                        <div class="field">

                          <span class="field-label">
                            ${
                              lang === 'zh-TW'
                                ? '確認人備註'
                                : 'Confirmation Notes'
                            }
                          </span>

                          <span>
                            ${escapeHtml(
                              refund.receiverNotes
                            )}
                          </span>

                        </div>

                      `
                    : ''
                }

              `
            : ''
        }


        ${
          refund.notes
            ? `

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
                      refund.notes
                    )}
                  </span>

                </div>

              `
            : ''
        }

      </section>


      ${
        canConfirm
          ? `

              <section
                class="panel refund-pending-panel"
              >

                <h2>
                  ${
                    lang === 'zh-TW'
                      ? '確認退款'
                      : 'Confirm Refund'
                  }
                </h2>

                <p class="muted">
                  ${
                    lang === 'zh-TW'
                      ? '請等信用卡、Gift Card 或其他退款目的地實際入帳後，再回報實際收到的金額與幣值。'
                      : 'Confirm only after the refund actually appears in the destination account.'
                  }
                </p>


                <div class="row">

                  <div class="field">

                    <label
                      for="refundReportedAmount"
                      class="field-label"
                    >
                      ${
                        lang === 'zh-TW'
                          ? '實際收到金額'
                          : 'Actual Amount'
                      }

                      <sup class="required-mark">*</sup>
                    </label>

                    <input
                      id="refundReportedAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value="${escapeHtml(
                        refund.amount
                      )}"
                    >

                  </div>


                  <div class="field">

                    <label
                      for="refundReportedCurrency"
                      class="field-label"
                    >
                      ${
                        lang === 'zh-TW'
                          ? '實際收到幣值'
                          : 'Actual Currency'
                      }

                      <sup class="required-mark">*</sup>
                    </label>

                    <input
                      id="refundReportedCurrency"
                      type="text"
                      maxlength="8"
                      value="${escapeHtml(
                        refund.currency
                      )}"
                    >

                  </div>

                </div>


                <div class="field">

                  <label
                    for="refundReceiverNotes"
                    class="field-label"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '備註'
                        : 'Notes'
                    }
                  </label>

                  <textarea
                    id="refundReceiverNotes"
                    rows="3"
                  ></textarea>

                </div>


                <div class="actions">

                  <button
                    type="button"
                    id="confirmRefundButton"
                    class="primary"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '確認已收到退款'
                        : 'Confirm Refund Received'
                    }
                  </button>

                </div>


                <p
                  id="confirmRefundMessage"
                  class="muted"
                ></p>

              </section>

            `
          : ''
      }


      ${
        currentRole === 'owner' &&
        isMismatch
          ? `

              <section class="panel">

                <h2>
                  ${
                    lang === 'zh-TW'
                      ? '不符項目處理'
                      : 'Mismatch Resolution'
                  }
                </h2>


                ${
                  mismatchResolved
                    ? `

                        <p>
                          <strong>
                            ${
                              lang === 'zh-TW'
                                ? '此退款不符項目已處理。'
                                : 'This Refund mismatch has been resolved.'
                            }
                          </strong>
                        </p>

                      `
                    : `

                        <p>
                          ${
                            lang === 'zh-TW'
                              ? '確認退款金額／幣值差異已處理後，可將此項目標記為已處理。'
                              : 'Mark this mismatch as resolved after the issue has been handled.'
                          }
                        </p>

                        <div class="actions">

                          <button
                            type="button"
                            id="resolveRefundMismatchButton"
                            class="primary"
                          >
                            ${
                              lang === 'zh-TW'
                                ? '標記已處理'
                                : 'Mark as Resolved'
                            }
                          </button>

                        </div>

                        <p
                          id="resolveRefundMismatchMessage"
                          class="muted"
                        ></p>

                      `
                }

              </section>

            `
          : ''
      }


      <div class="actions">

        <button
          type="button"
          onclick="location.hash='#dashboard'"
        >
          ${
            lang === 'zh-TW'
              ? '返回首頁'
              : 'Back to Dashboard'
          }
        </button>

      </div>
    `;


    // --------------------------------------------------
    // User confirmation
    // --------------------------------------------------

    if (canConfirm) {

      const confirmButton =
        page.querySelector(
          '#confirmRefundButton'
        );


      const message =
        page.querySelector(
          '#confirmRefundMessage'
        );


      confirmButton.onclick =
        async () => {

          confirmButton.disabled =
            true;


          confirmButton.textContent =
            lang === 'zh-TW'
              ? '確認中…'
              : 'Confirming…';


          try {

            const result =
              await confirmRefund({

                db,

                currentUser,

                refund,

                reportedAmount:
                  page.querySelector(
                    '#refundReportedAmount'
                  ).value,

                reportedCurrency:
                  page.querySelector(
                    '#refundReportedCurrency'
                  ).value,

                receiverNotes:
                  page.querySelector(
                    '#refundReceiverNotes'
                  ).value
              });


            if (
              result.isMatch
            ) {

              alert(
                lang === 'zh-TW'
                  ? '退款確認完成。'
                  : 'Refund confirmed.'
              );

            } else {

              alert(
                lang === 'zh-TW'
                  ? '已回報退款金額／幣值不符，Owner 會在不符項目中看到這筆紀錄。'
                  : 'Refund mismatch reported.'
              );
            }


            location.hash =
              '#dashboard';


          } catch (error) {

            console.error(
              'Failed to confirm Refund:',
              error
            );


            message.textContent =
              `${
                lang === 'zh-TW'
                  ? '確認退款失敗'
                  : 'Failed to confirm Refund'
              }: ${error.message}`;


            confirmButton.disabled =
              false;


            confirmButton.textContent =
              lang === 'zh-TW'
                ? '確認已收到退款'
                : 'Confirm Refund Received';
          }
        };
    }


    // --------------------------------------------------
    // Owner mismatch resolution
    // --------------------------------------------------

    if (canResolveMismatch) {

      const resolveButton =
        page.querySelector(
          '#resolveRefundMismatchButton'
        );


      const message =
        page.querySelector(
          '#resolveRefundMismatchMessage'
        );


      resolveButton.onclick =
        async () => {

          const confirmed =
            window.confirm(
              lang === 'zh-TW'
                ? '確定要將這筆退款不符項目標記為已處理嗎？'
                : 'Mark this Refund mismatch as resolved?'
            );


          if (!confirmed) {
            return;
          }


          resolveButton.disabled =
            true;


          resolveButton.textContent =
            lang === 'zh-TW'
              ? '處理中…'
              : 'Resolving…';


          try {

            await resolveRefundMismatch({
              db,
              currentUser,
              refund
            });


            sessionStorage.setItem(
              'mismatchActiveTab',
              'resolved'
            );


            location.hash =
              '#mismatches';


          } catch (error) {

            console.error(
              'Failed to resolve Refund mismatch:',
              error
            );


            message.textContent =
              `${
                lang === 'zh-TW'
                  ? '標記已處理失敗'
                  : 'Failed to resolve mismatch'
              }: ${error.message}`;


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
      'Failed to load Refund:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入退款明細失敗。'
              : 'Failed to load Refund.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(
            error.message
          )}
        </p>

      </section>
    `;
  }
}
