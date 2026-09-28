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


function normalizeCurrency(value) {
  return clean(value).toUpperCase();
}


function formatAmount(value) {

  return Number(value || 0)
    .toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
}


function displayUserName(user) {

  return clean(
    user.displayName ||
    user.name ||
    user.email ||
    user.id ||
    'User'
  );
}


// ======================================================
// Load Active Family Users
// ======================================================

async function getActiveUsers(db) {

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
      user.active === true
    );
}


// ======================================================
// Record Transfer Page
// ======================================================

export async function transferPage({
  db,
  currentUser,
  currentRole,
  currentProfile,
  lang,
  page,
  escapeHtml
}) {

  if (
    !db ||
    !currentUser ||
    !currentRole ||
    !page
  ) {

    console.error(
      'transferPage: missing required dependency.'
    );

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '記錄轉帳'
            : 'Record Transfer'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入家庭成員…'
            : 'Loading family members…'
        }
      </p>

    </section>
  `;


  try {

    const users =
      await getActiveUsers(db);


    const receivers =
      users
        .filter(user =>
          user.id !== currentUser.uid
        )
        .sort((a, b) =>
          displayUserName(a)
            .localeCompare(
              displayUserName(b),
              lang === 'zh-TW'
                ? 'zh-TW'
                : 'en'
            )
        );


    const senderName =
      displayUserName({
        id: currentUser.uid,
        ...currentProfile,
        displayName:
          currentProfile?.displayName ||
          currentUser.displayName ||
          currentUser.email
      });


    if (receivers.length === 0) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            ${
              lang === 'zh-TW'
                ? '記錄轉帳'
                : 'Record Transfer'
            }
          </h1>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '目前沒有其他可選擇的家庭成員。'
                : 'There are no other active family members.'
            }
          </p>

        </section>
      `;

      return;
    }


    const receiverOptions =
      receivers
        .map(user => {

          const name =
            displayUserName(user);

          return `
            <option
              value="${escapeHtml(user.id)}"
            >
              ${escapeHtml(name)}
            </option>
          `;
        })
        .join('');


    const today =
      new Date()
        .toLocaleDateString(
          'en-CA'
        );


    page.innerHTML = `

      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '記錄轉帳'
              : 'Record Transfer'
          }
        </h1>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '記錄你已轉給家庭成員的款項。收款人之後需要確認是否收到正確金額。'
              : 'Record money you sent to a family member. The receiver will confirm whether the correct amount was received.'
          }
        </p>


        <form id="transferForm">


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '轉帳人'
                  : 'Sender'
              }
            </span>

            <strong>
              ${escapeHtml(senderName)}
            </strong>

          </div>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '轉給'
                  : 'Send To'
              }

              <sup class="required-mark">*</sup>

            </span>

            <select
              id="transferReceiver"
              required
            >

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '請選擇收款人'
                    : 'Select receiver'
                }
              </option>

              ${receiverOptions}

            </select>

          </label>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '轉帳日期'
                  : 'Transfer Date'
              }

              <sup class="required-mark">*</sup>

            </span>

            <input
              id="transferDate"
              type="date"
              value="${escapeHtml(today)}"
              required
            >

          </label>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '金額'
                  : 'Amount'
              }

              <sup class="required-mark">*</sup>

            </span>

            <input
              id="transferAmount"
              type="number"
              min="0.01"
              step="0.01"
              inputmode="decimal"
              required
            >

          </label>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '幣值'
                  : 'Currency'
              }

              <sup class="required-mark">*</sup>

            </span>

            <select
              id="transferCurrency"
              required
            >

              <option value="USD">
                USD
              </option>

              <option value="TWD">
                TWD
              </option>

              <option value="JPY">
                JPY
              </option>

              <option value="EUR">
                EUR
              </option>

              <option value="GBP">
                GBP
              </option>

              <option value="CAD">
                CAD
              </option>

              <option value="AUD">
                AUD
              </option>

              <option value="KRW">
                KRW
              </option>

              <option value="HKD">
                HKD
              </option>

              <option value="SGD">
                SGD
              </option>

            </select>

          </label>


          <label class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '備註'
                  : 'Notes'
              }
            </span>

            <textarea
              id="transferNotes"
              rows="3"
              placeholder="${
                lang === 'zh-TW'
                  ? '選填'
                  : 'Optional'
              }"
            ></textarea>

          </label>


          <div class="actions">

            <button
              id="saveTransferBtn"
              type="submit"
              class="primary"
            >
              ${
                lang === 'zh-TW'
                  ? '記錄轉帳'
                  : 'Record Transfer'
              }
            </button>

          </div>


          <p
            id="transferMessage"
            class="muted"
          ></p>


        </form>

      </section>
    `;


    const form =
      page.querySelector(
        '#transferForm'
      );


    const saveButton =
      page.querySelector(
        '#saveTransferBtn'
      );


    const message =
      page.querySelector(
        '#transferMessage'
      );


    form.addEventListener(
      'submit',
      async event => {

        event.preventDefault();


        const receiverId =
          clean(
            page.querySelector(
              '#transferReceiver'
            ).value
          );


        const receiver =
          receivers.find(user =>
            user.id === receiverId
          );


        const transferDate =
          clean(
            page.querySelector(
              '#transferDate'
            ).value
          );


        const amount =
          Number(
            page.querySelector(
              '#transferAmount'
            ).value
          );


        const currency =
          normalizeCurrency(
            page.querySelector(
              '#transferCurrency'
            ).value
          );


        const notes =
          clean(
            page.querySelector(
              '#transferNotes'
            ).value
          );


        if (!receiver) {

          alert(
            lang === 'zh-TW'
              ? '請選擇收款人。'
              : 'Please select a receiver.'
          );

          return;
        }


        if (!transferDate) {

          alert(
            lang === 'zh-TW'
              ? '請選擇轉帳日期。'
              : 'Please select a transfer date.'
          );

          return;
        }


        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          alert(
            lang === 'zh-TW'
              ? '請輸入有效的轉帳金額。'
              : 'Please enter a valid transfer amount.'
          );

          return;
        }


        saveButton.disabled = true;

        saveButton.textContent =
          lang === 'zh-TW'
            ? '正在儲存…'
            : 'Saving…';


        message.textContent = '';


        try {

          const transferRef =
            await addDoc(
              collection(
                db,
                'transfers'
              ),
              {

                transferDate,

                senderUserId:
                  currentUser.uid,

                senderName,

                receiverUserId:
                  receiver.id,

                receiverName:
                  displayUserName(
                    receiver
                  ),

                amount,

                currency,

                notes,

                status:
                  'pending',

                confirmationStatus:
                  'pending',

                reportedAmount:
                  null,

                receiverNotes:
                  '',

                createdBy:
                  currentUser.uid,

                createdAt:
                  serverTimestamp(),

                updatedAt:
                  serverTimestamp(),

                confirmedBy:
                  null,

                confirmedAt:
                  null
              }
            );


          location.hash =
            `#transfer-detail/${transferRef.id}`;


        } catch (error) {

          console.error(
            'Failed to save transfer:',
            error
          );


          message.textContent =
            `${
              lang === 'zh-TW'
                ? '儲存轉帳失敗'
                : 'Failed to save transfer'
            }: ${error.message}`;


          saveButton.disabled =
            false;


          saveButton.textContent =
            lang === 'zh-TW'
              ? '記錄轉帳'
              : 'Record Transfer';
        }
      }
    );


  } catch (error) {

    console.error(
      'Failed to load Transfer page:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '記錄轉帳'
              : 'Record Transfer'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '無法載入家庭成員。'
              : 'Unable to load family members.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(error.message)}
        </p>

      </section>
    `;
  }
}


// ======================================================
// Transfers Waiting For Current User
// ======================================================

export async function getMyPendingTransfers({
  db,
  currentUser
}) {

  if (!currentUser?.uid) {
    return [];
  }


  const transferQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'receiverUserId',
        '==',
        currentUser.uid
      )
    );


  const snapshot =
    await getDocs(
      transferQuery
    );


  return snapshot.docs
    .map(transferDoc => ({
      id: transferDoc.id,
      ...transferDoc.data()
    }))
    .filter(transfer =>
      transfer.status === 'pending'
    )
    .sort((a, b) =>
      String(
        a.transferDate || ''
      ).localeCompare(
        String(
          b.transferDate || ''
        )
      )
    );
}


// ======================================================
// Received Transfers Created By Current User
// ======================================================

export async function getMyReceivedTransferUpdates({
  db,
  currentUser
}) {

  if (!currentUser?.uid) {
    return [];
  }


  const transferQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'senderUserId',
        '==',
        currentUser.uid
      )
    );


  const snapshot =
    await getDocs(
      transferQuery
    );


  return snapshot.docs
    .map(transferDoc => ({
      id: transferDoc.id,
      ...transferDoc.data()
    }))
    .filter(transfer =>
      transfer.status === 'received' ||
      transfer.status === 'mismatch'
    )
    .sort((a, b) =>
      String(
        b.transferDate || ''
      ).localeCompare(
        String(
          a.transferDate || ''
        )
      )
    );
}


// ======================================================
// All Transfers Related To Current User
// ======================================================

export async function getMyTransferHistory({
  db,
  currentUser
}) {

  if (!currentUser?.uid) {
    return [];
  }


  // ----------------------------------------------------
  // Transfers sent by current user
  // ----------------------------------------------------

  const sentQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'senderUserId',
        '==',
        currentUser.uid
      )
    );


  // ----------------------------------------------------
  // Transfers received by current user
  // ----------------------------------------------------

  const receivedQuery =
    query(
      collection(
        db,
        'transfers'
      ),
      where(
        'receiverUserId',
        '==',
        currentUser.uid
      )
    );


  const [
    sentSnapshot,
    receivedSnapshot
  ] =
    await Promise.all([
      getDocs(sentQuery),
      getDocs(receivedQuery)
    ]);


  // ----------------------------------------------------
  // Merge + mark direction
  // ----------------------------------------------------

  const transferMap =
    new Map();


  sentSnapshot.docs.forEach(
    transferDoc => {

      transferMap.set(
        transferDoc.id,
        {
          id:
            transferDoc.id,

          ...transferDoc.data(),

          direction:
            'outgoing'
        }
      );
    }
  );


  receivedSnapshot.docs.forEach(
    transferDoc => {

      transferMap.set(
        transferDoc.id,
        {
          id:
            transferDoc.id,

          ...transferDoc.data(),

          direction:
            'incoming'
        }
      );
    }
  );


  // ----------------------------------------------------
  // Newest first
  // ----------------------------------------------------

  return Array.from(
    transferMap.values()
  )
    .sort((a, b) => {

      const dateA =
        String(
          a.transferDate || ''
        );

      const dateB =
        String(
          b.transferDate || ''
        );


      if (dateA !== dateB) {
        return dateB.localeCompare(
          dateA
        );
      }


      const createdA =
        a.createdAt?.seconds || 0;

      const createdB =
        b.createdAt?.seconds || 0;


      return createdB - createdA;
    });
}


// ======================================================
// Confirm Transfer
// ======================================================

export async function confirmTransfer({
  db,
  currentUser,
  transfer,
  amountStatus,
  reportedAmount = null,
  receiverNotes = ''
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !transfer?.id
  ) {

    throw new Error(
      'Missing transfer confirmation data.'
    );
  }


  if (
    transfer.receiverUserId !==
    currentUser.uid
  ) {

    throw new Error(
      'Only the receiver can confirm this transfer.'
    );
  }


  if (
    transfer.status !== 'pending'
  ) {

    throw new Error(
      'This transfer is no longer pending.'
    );
  }


  if (
    amountStatus !== 'match' &&
    amountStatus !== 'mismatch'
  ) {

    throw new Error(
      'Invalid amount status.'
    );
  }


  let normalizedReportedAmount =
    null;


  if (amountStatus === 'mismatch') {

    normalizedReportedAmount =
      Number(reportedAmount);


    if (
      !Number.isFinite(
        normalizedReportedAmount
      ) ||
      normalizedReportedAmount < 0
    ) {

      throw new Error(
        'Please enter a valid received amount.'
      );
    }
  }


  const transferRef =
    doc(
      db,
      'transfers',
      transfer.id
    );


  await updateDoc(
    transferRef,
    {

      status:
        amountStatus === 'match'
          ? 'received'
          : 'mismatch',

      confirmationStatus:
        amountStatus,

      reportedAmount:
        amountStatus === 'mismatch'
          ? normalizedReportedAmount
          : transfer.amount,

      receiverNotes:
        clean(receiverNotes),

      confirmedBy:
        currentUser.uid,

      confirmedAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    }
  );
}


// ======================================================
// Transfer Detail Page
// ======================================================

export async function transferDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  transferId,
  escapeHtml
}) {

  if (
    !db ||
    !currentUser ||
    !currentRole ||
    !page ||
    !transferId
  ) {

    console.error(
      'transferDetailPage: missing required dependency.'
    );

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '轉帳明細'
            : 'Transfer Detail'
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

    const transferSnapshot =
      await getDoc(
        doc(
          db,
          'transfers',
          transferId
        )
      );


    if (!transferSnapshot.exists()) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            ${
              lang === 'zh-TW'
                ? '找不到轉帳'
                : 'Transfer Not Found'
            }
          </h1>

        </section>
      `;

      return;
    }


    const transfer = {
      id:
        transferSnapshot.id,

      ...transferSnapshot.data()
    };


    const isSender =
      transfer.senderUserId ===
      currentUser.uid;


    const isReceiver =
      transfer.receiverUserId ===
      currentUser.uid;


    if (
      !isSender &&
      !isReceiver &&
      currentRole !== 'owner'
    ) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            ${
              lang === 'zh-TW'
                ? '無權查看'
                : 'Access Denied'
            }
          </h1>

        </section>
      `;

      return;
    }


    let statusText = '—';


    if (transfer.status === 'pending') {

      statusText =
        lang === 'zh-TW'
          ? '等待收款人確認'
          : 'Waiting for receiver confirmation';

    } else if (
      transfer.status === 'received'
    ) {

      statusText =
        lang === 'zh-TW'
          ? '轉帳已接收'
          : 'Transfer received';

    } else if (
      transfer.status === 'mismatch'
    ) {

      statusText =
        lang === 'zh-TW'
          ? '收到金額不符'
          : 'Received amount mismatch';
    }


    const canConfirm =
      isReceiver &&
      transfer.status === 'pending';


    page.innerHTML = `

      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '轉帳明細'
              : 'Transfer Detail'
          }
        </h1>


        <div class="card">

          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '日期'
                  : 'Date'
              }
            </span>

            <strong>
              ${escapeHtml(
                transfer.transferDate || '—'
              )}
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '轉帳人'
                  : 'Sender'
              }
            </span>

            <strong>
              ${escapeHtml(
                transfer.senderName || '—'
              )}
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '收款人'
                  : 'Receiver'
              }
            </span>

            <strong>
              ${escapeHtml(
                transfer.receiverName || '—'
              )}
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '轉帳金額'
                  : 'Transfer Amount'
              }
            </span>

            <strong>
              ${escapeHtml(
                formatAmount(
                  transfer.amount
                )
              )}
              ${escapeHtml(
                transfer.currency || ''
              )}
            </strong>

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
              ${escapeHtml(statusText)}
            </strong>

          </div>


          ${
            transfer.notes
              ? `
                  <div class="field">

                    <span class="field-label">
                      ${
                        lang === 'zh-TW'
                          ? '轉帳備註'
                          : 'Transfer Notes'
                      }
                    </span>

                    <div>
                      ${escapeHtml(
                        transfer.notes
                      )}
                    </div>

                  </div>
                `
              : ''
          }


          ${
            transfer.status === 'mismatch'
              ? `
                  <div class="field">

                    <span class="field-label">
                      ${
                        lang === 'zh-TW'
                          ? '實際收到金額'
                          : 'Actual Amount Received'
                      }
                    </span>

                    <strong>
                      ${escapeHtml(
                        formatAmount(
                          transfer.reportedAmount
                        )
                      )}
                      ${escapeHtml(
                        transfer.currency || ''
                      )}
                    </strong>

                  </div>


                  ${
                    transfer.receiverNotes
                      ? `
                          <div class="field">

                            <span class="field-label">
                              ${
                                lang === 'zh-TW'
                                  ? '收款人備註'
                                  : 'Receiver Notes'
                              }
                            </span>

                            <div>
                              ${escapeHtml(
                                transfer.receiverNotes
                              )}
                            </div>

                          </div>
                        `
                      : ''
                  }
                `
              : ''
          }

        </div>


        ${
          canConfirm
            ? `

                <section class="panel">

                  <h2>
                    ${
                      lang === 'zh-TW'
                        ? '確認收款'
                        : 'Confirm Receipt'
                    }
                  </h2>


                  <div class="field">

                    <span class="field-label">

                      ${
                        lang === 'zh-TW'
                          ? '收到的金額是否相符？'
                          : 'Does the received amount match?'
                      }

                      <sup class="required-mark">*</sup>

                    </span>


                    <label class="confirmation-choice">

                      <input
                        type="radio"
                        name="transferAmountStatus"
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
                        name="transferAmountStatus"
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
                    id="transferMismatchFields"
                    hidden
                  >

                    <label class="field">

                      <span class="field-label">

                        ${
                          lang === 'zh-TW'
                            ? '實際收到金額'
                            : 'Actual Amount Received'
                        }

                        <sup class="required-mark">*</sup>

                      </span>

                      <input
                        id="transferReportedAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                      >

                    </label>


                    <label class="field">

                      <span class="field-label">
                        ${
                          lang === 'zh-TW'
                            ? '備註'
                            : 'Notes'
                        }
                      </span>

                      <textarea
                        id="transferReceiverNotes"
                        rows="3"
                        placeholder="${
                          lang === 'zh-TW'
                            ? '例如：實際收到金額不同、幣值或其他異常'
                            : 'For example: different amount received, currency issue, or another discrepancy'
                        }"
                      ></textarea>

                    </label>

                  </div>


                  <div class="actions">

                    <button
                      id="confirmTransferBtn"
                      type="button"
                      class="primary"
                      hidden
                    >
                      ${
                        lang === 'zh-TW'
                          ? '送出確認'
                          : 'Submit Confirmation'
                      }
                    </button>

                  </div>


                  <p
                    id="transferConfirmationMessage"
                    class="muted"
                  ></p>

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

      </section>
    `;


    if (canConfirm) {

      bindTransferConfirmation({
        db,
        currentUser,
        transfer,
        lang,
        page
      });
    }


  } catch (error) {

    console.error(
      'Failed to load transfer:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '轉帳明細'
              : 'Transfer Detail'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '載入轉帳失敗。'
              : 'Failed to load transfer.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(error.message)}
        </p>

      </section>
    `;
  }
}


// ======================================================
// Transfer Confirmation Events
// ======================================================

function bindTransferConfirmation({
  db,
  currentUser,
  transfer,
  lang,
  page
}) {

  const amountChoices =
    page.querySelectorAll(
      'input[name="transferAmountStatus"]'
    );


  const mismatchFields =
    page.querySelector(
      '#transferMismatchFields'
    );


  const confirmButton =
    page.querySelector(
      '#confirmTransferBtn'
    );


  const message =
    page.querySelector(
      '#transferConfirmationMessage'
    );


  amountChoices.forEach(
    radio => {

      radio.addEventListener(
        'change',
        () => {

          const isMismatch =
            radio.value === 'mismatch';


          mismatchFields.hidden =
            !isMismatch;


          confirmButton.hidden =
            false;
        }
      );
    }
  );


  confirmButton.onclick =
    async () => {

      const selected =
        page.querySelector(
          'input[name="transferAmountStatus"]:checked'
        );


      if (!selected) {

        alert(
          lang === 'zh-TW'
            ? '請先確認收到的金額是否相符。'
            : 'Please confirm whether the received amount matches.'
        );

        return;
      }


      let reportedAmount =
        null;


      let receiverNotes = '';


      if (
        selected.value === 'mismatch'
      ) {

        reportedAmount =
          Number(
            page.querySelector(
              '#transferReportedAmount'
            ).value
          );


        receiverNotes =
          clean(
            page.querySelector(
              '#transferReceiverNotes'
            ).value
          );


        if (
          !Number.isFinite(
            reportedAmount
          ) ||
          reportedAmount < 0
        ) {

          alert(
            lang === 'zh-TW'
              ? '請輸入實際收到的金額。'
              : 'Please enter the actual amount received.'
          );

          return;
        }
      }


      confirmButton.disabled =
        true;


      confirmButton.textContent =
        lang === 'zh-TW'
          ? '正在送出…'
          : 'Submitting…';


      message.textContent = '';


      try {

        await confirmTransfer({
          db,
          currentUser,
          transfer,
          amountStatus:
            selected.value,
          reportedAmount,
          receiverNotes
        });


        location.hash =
          '#dashboard';


      } catch (error) {

        console.error(
          'Transfer confirmation failed:',
          error
        );


        message.textContent =
          `${
            lang === 'zh-TW'
              ? '送出確認失敗'
              : 'Failed to submit confirmation'
          }: ${error.message}`;


        confirmButton.disabled =
          false;


        confirmButton.textContent =
          lang === 'zh-TW'
            ? '送出確認'
            : 'Submit Confirmation';
      }
    };
}
