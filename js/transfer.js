import {
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
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


// ======================================================
// Transfer Page
// ======================================================

export function transferPage({
  db,
  currentUser,
  currentRole,
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
            ? '記錄家庭成員之間或帳戶之間的資金轉移。'
            : 'Record money transferred between family members or accounts.'
        }
      </p>


      <form id="transferForm">


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
                ? '轉出方'
                : 'From'
            }

            <sup class="required-mark">*</sup>
          </span>

          <input
            id="transferFrom"
            type="text"
            autocomplete="off"
            placeholder="${
              lang === 'zh-TW'
                ? '例如：Yi-Chen'
                : 'e.g. Yi-Chen'
            }"
            required
          >

        </label>


        <label class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '轉入方'
                : 'To'
            }

            <sup class="required-mark">*</sup>
          </span>

          <input
            id="transferTo"
            type="text"
            autocomplete="off"
            placeholder="${
              lang === 'zh-TW'
                ? '例如：Checking'
                : 'e.g. Checking'
            }"
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
            <option value="USD">USD</option>
            <option value="TWD">TWD</option>
            <option value="JPY">JPY</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
            <option value="KRW">KRW</option>
            <option value="HKD">HKD</option>
            <option value="SGD">SGD</option>
          </select>

        </label>


        <label class="field">

          <span class="field-label">
            ${
              lang === 'zh-TW'
                ? '狀態'
                : 'Status'
            }

            <sup class="required-mark">*</sup>
          </span>

          <select
            id="transferStatus"
            required
          >
            <option value="sent">
              ${
                lang === 'zh-TW'
                  ? '已轉出'
                  : 'Sent'
              }
            </option>

            <option value="received">
              ${
                lang === 'zh-TW'
                  ? '已收到'
                  : 'Received'
              }
            </option>

            <option value="pending">
              ${
                lang === 'zh-TW'
                  ? '等待中'
                  : 'Pending'
              }
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
                ? '儲存轉帳'
                : 'Save Transfer'
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


      const transferDate =
        clean(
          page.querySelector(
            '#transferDate'
          ).value
        );


      const from =
        clean(
          page.querySelector(
            '#transferFrom'
          ).value
        );


      const to =
        clean(
          page.querySelector(
            '#transferTo'
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


      const status =
        clean(
          page.querySelector(
            '#transferStatus'
          ).value
        );


      const notes =
        clean(
          page.querySelector(
            '#transferNotes'
          ).value
        );


      if (!transferDate) {

        alert(
          lang === 'zh-TW'
            ? '請選擇轉帳日期。'
            : 'Please select a transfer date.'
        );

        return;
      }


      if (!from || !to) {

        alert(
          lang === 'zh-TW'
            ? '請填寫轉出方與轉入方。'
            : 'Please enter both From and To.'
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


      if (!currency) {

        alert(
          lang === 'zh-TW'
            ? '請選擇幣值。'
            : 'Please select a currency.'
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

              from,

              to,

              amount,

              currency,

              status,

              notes,

              createdBy:
                currentUser.uid,

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
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


        saveButton.disabled = false;

        saveButton.textContent =
          lang === 'zh-TW'
            ? '儲存轉帳'
            : 'Save Transfer';
      }
    }
  );
}


// ======================================================
// Transfer Detail
// ======================================================

export async function transferDetailPage({
  db,
  currentRole,
  lang,
  page,
  transferId,
  escapeHtml
}) {

  if (
    !db ||
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

    const transferRef =
      doc(
        db,
        'transfers',
        transferId
      );


    const transferSnapshot =
      await getDoc(
        transferRef
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


    const transfer =
      transferSnapshot.data();


    const statusLabels = {

      sent:
        lang === 'zh-TW'
          ? '已轉出'
          : 'Sent',

      received:
        lang === 'zh-TW'
          ? '已收到'
          : 'Received',

      pending:
        lang === 'zh-TW'
          ? '等待中'
          : 'Pending'
    };


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
                  ? '轉出方'
                  : 'From'
              }
            </span>

            <strong>
              ${escapeHtml(
                transfer.from || '—'
              )}
            </strong>

          </div>


          <div class="field">

            <span class="field-label">
              ${
                lang === 'zh-TW'
                  ? '轉入方'
                  : 'To'
              }
            </span>

            <strong>
              ${escapeHtml(
                transfer.to || '—'
              )}
            </strong>

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
              ${escapeHtml(
                statusLabels[
                  transfer.status
                ] ||
                transfer.status ||
                '—'
              )}
            </strong>

          </div>


          ${
            transfer.notes
              ? `
                  <div class="field">

                    <span class="field-label">
                      ${
                        lang === 'zh-TW'
                          ? '備註'
                          : 'Notes'
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

        </div>


        <div class="actions">

          <button
            type="button"
            onclick="location.hash='#transfer'"
          >
            ${
              lang === 'zh-TW'
                ? '＋ 再記錄一筆'
                : '+ Record Another'
            }
          </button>

          <button
            type="button"
            onclick="location.hash='#history'"
          >
            ${
              lang === 'zh-TW'
                ? '查看歷史'
                : 'View History'
            }
          </button>

        </div>

      </section>
    `;


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
