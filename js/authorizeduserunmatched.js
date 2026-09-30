import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
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


function todayLocalDate() {

  const now =
    new Date();


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


// ======================================================
// Load Active Cards
// ======================================================

async function loadCards(db) {

  const snapshot =
    await getDocs(
      collection(
        db,
        'cards'
      )
    );


  return snapshot.docs
    .map(cardDoc => ({
      id:
        cardDoc.id,

      ...cardDoc.data()
    }))
    .filter(card =>
      card.active !== false
    )
    .sort(
      (a, b) => {

        const aLabel =
          `${
            a.issuer || ''
          } ${
            a.cardName ||
            a.name ||
            ''
          } ${
            a.last4 || ''
          }`;


        const bLabel =
          `${
            b.issuer || ''
          } ${
            b.cardName ||
            b.name ||
            ''
          } ${
            b.last4 || ''
          }`;


        return aLabel.localeCompare(
          bLabel,
          undefined,
          {
            sensitivity: 'base'
          }
        );
      }
    );
}


// ======================================================
// Card label
// ======================================================

function cardLabel(card) {

  const parts = [];


  if (card.issuer) {
    parts.push(
      clean(card.issuer)
    );
  }


  const name =
    clean(
      card.cardName ||
      card.name ||
      ''
    );


  if (name) {
    parts.push(name);
  }


  if (card.last4) {
    parts.push(
      `•••• ${clean(card.last4)}`
    );
  }


  return (
    parts.join(' · ') ||
    'Card'
  );
}


// ======================================================
// Load Master Data
//
// READ ONLY.
// This page never creates Store/Product master data.
// ======================================================

async function loadMasterSuggestions(db) {

  const [
    storesSnapshot,
    productsSnapshot
  ] =
    await Promise.all([
      getDocs(
        collection(
          db,
          'stores'
        )
      ),

      getDocs(
        collection(
          db,
          'products'
        )
      )
    ]);


  const stores =
    storesSnapshot.docs
      .map(storeDoc => ({
        id:
          storeDoc.id,

        ...storeDoc.data()
      }))
      .filter(store =>
        store.status !== 'merged' &&
        store.active !== false
      );


  const products =
    productsSnapshot.docs
      .map(productDoc => ({
        id:
          productDoc.id,

        ...productDoc.data()
      }))
      .filter(product =>
        product.status !== 'merged' &&
        product.active !== false
      );


  return {
    stores,
    products
  };
}


// ======================================================
// Simple datalist options
// ======================================================

function storeOptionsHtml(stores) {

  const names =
    new Set();


  stores.forEach(store => {

    const name =
      clean(store.name);


    if (name) {
      names.add(name);
    }


    (
      Array.isArray(store.aliases)
        ? store.aliases
        : []
    )
      .forEach(alias => {

        const cleanAlias =
          clean(alias);


        if (cleanAlias) {
          names.add(
            cleanAlias
          );
        }
      });
  });


  return [
    ...names
  ]
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          undefined,
          {
            sensitivity: 'base'
          }
        )
    )
    .map(name => `
      <option
        value="${escapeHtml(name)}"
      ></option>
    `)
    .join('');
}


function productOptionsHtml(products) {

  const names =
    new Set();


  products.forEach(product => {

    const name =
      clean(product.name);


    if (name) {
      names.add(name);
    }


    (
      Array.isArray(product.aliases)
        ? product.aliases
        : []
    )
      .forEach(alias => {

        const cleanAlias =
          clean(alias);


        if (cleanAlias) {
          names.add(
            cleanAlias
          );
        }
      });
  });


  return [
    ...names
  ]
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          undefined,
          {
            sensitivity: 'base'
          }
        )
    )
    .map(name => `
      <option
        value="${escapeHtml(name)}"
      ></option>
    `)
    .join('');
}


// ======================================================
// Page
// ======================================================

export async function authorizedUserUnmatchedPage({
  db,
  currentUser,
  currentRole,
  currentProfile,
  lang,
  page
}) {

  // --------------------------------------------------
  // Authorized User only
  // --------------------------------------------------

  if (
    currentRole !==
    'authorizedUser'
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
              ? '此功能僅供 Authorized User 使用。'
              : 'This feature is only available to Authorized Users.'
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
            ? '回報未找到的交易'
            : 'Report Unmatched Transaction'
        }
      </h2>

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

    const [
      cards,
      masterData
    ] =
      await Promise.all([
        loadCards(db),
        loadMasterSuggestions(db)
      ]);


    // ------------------------------------------------
    // Form
    // ------------------------------------------------

    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '回報未找到的交易'
              : 'Report Unmatched Transaction'
          }
        </h2>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '如果信用卡通知出現一筆交易，但系統裡完全找不到對應的 Receipt，可以在這裡回報給 Owner。'
              : 'Use this form when a card notification shows a transaction but no matching Receipt can be found in the system.'
          }
        </p>


        <form
          id="unmatchedTransactionForm"
          class="unmatched-transaction-form"
        >

          <!-- Card -->

          <label>

            ${
              lang === 'zh-TW'
                ? '信用卡 *'
                : 'Card *'
            }

            <select
              id="unmatchedCard"
              required
            >

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '請選擇信用卡'
                    : 'Select Card'
                }
              </option>

              ${
                cards
                  .map(card => `
                    <option
                      value="${
                        escapeHtml(
                          card.id
                        )
                      }"
                    >
                      ${
                        escapeHtml(
                          cardLabel(card)
                        )
                      }
                    </option>
                  `)
                  .join('')
              }

            </select>

          </label>


          <!-- Transaction Date -->

          <label>

            ${
              lang === 'zh-TW'
                ? '交易日期 *'
                : 'Transaction Date *'
            }

            <input
              id="unmatchedDate"
              type="date"
              value="${
                escapeHtml(
                  todayLocalDate()
                )
              }"
              required
            >

          </label>


          <!-- Merchant / Store -->

          <label>

            ${
              lang === 'zh-TW'
                ? '商家 / 店家 *'
                : 'Merchant / Store *'
            }

            <input
              id="unmatchedStore"
              type="text"
              list="unmatchedStoreSuggestions"
              autocomplete="off"
              required
            >

            <datalist
              id="unmatchedStoreSuggestions"
            >
              ${
                storeOptionsHtml(
                  masterData.stores
                )
              }
            </datalist>

          </label>


          <!-- Product -->

          <label>

            ${
              lang === 'zh-TW'
                ? '商品'
                : 'Product'
            }

            <input
              id="unmatchedProduct"
              type="text"
              list="unmatchedProductSuggestions"
              autocomplete="off"
            >

            <datalist
              id="unmatchedProductSuggestions"
            >
              ${
                productOptionsHtml(
                  masterData.products
                )
              }
            </datalist>

          </label>


          <!-- Amount + Currency -->

          <div
            class="unmatched-amount-row"
          >

            <label>

              ${
                lang === 'zh-TW'
                  ? '金額 *'
                  : 'Amount *'
              }

              <input
                id="unmatchedAmount"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                required
              >

            </label>


            <label>

              ${
                lang === 'zh-TW'
                  ? '幣別 *'
                  : 'Currency *'
              }

              <input
                id="unmatchedCurrency"
                type="text"
                maxlength="3"
                value="USD"
                autocomplete="off"
                required
              >

            </label>

          </div>


          <!-- Notes -->

          <label>

            ${
              lang === 'zh-TW'
                ? '備註'
                : 'Note'
            }

            <textarea
              id="unmatchedNotes"
              rows="3"
              placeholder="${
                lang === 'zh-TW'
                  ? '可填寫信用卡通知內容或其他資訊'
                  : 'Optional card notification details or other information'
              }"
            ></textarea>

          </label>


          <div
            id="unmatchedMessage"
            class="muted"
          ></div>


          <div
            class="unmatched-actions"
          >

            <button
              type="submit"
              class="primary"
              id="submitUnmatchedTransaction"
            >
              ${
                lang === 'zh-TW'
                  ? '送出回報'
                  : 'Submit Report'
              }
            </button>

          </div>

        </form>

      </section>
    `;


    const form =
      page.querySelector(
        '#unmatchedTransactionForm'
      );


    const cardInput =
      page.querySelector(
        '#unmatchedCard'
      );


    const dateInput =
      page.querySelector(
        '#unmatchedDate'
      );


    const storeInput =
      page.querySelector(
        '#unmatchedStore'
      );


    const productInput =
      page.querySelector(
        '#unmatchedProduct'
      );


    const amountInput =
      page.querySelector(
        '#unmatchedAmount'
      );


    const currencyInput =
      page.querySelector(
        '#unmatchedCurrency'
      );


    const notesInput =
      page.querySelector(
        '#unmatchedNotes'
      );


    const message =
      page.querySelector(
        '#unmatchedMessage'
      );


    const submitButton =
      page.querySelector(
        '#submitUnmatchedTransaction'
      );


    // ------------------------------------------------
    // Currency normalization
    // ------------------------------------------------

    currencyInput.oninput = () => {

      currencyInput.value =
        currencyInput.value
          .replace(
            /[^a-zA-Z]/g,
            ''
          )
          .toUpperCase()
          .slice(0, 3);
    };


    // ------------------------------------------------
    // Submit
    // ------------------------------------------------

    form.onsubmit =
      async event => {

        event.preventDefault();


        message.textContent = '';


        const cardId =
          clean(
            cardInput.value
          );


        const transactionDate =
          clean(
            dateInput.value
          );


        const merchant =
          clean(
            storeInput.value
          );


        const product =
          clean(
            productInput.value
          );


        const amount =
          Number(
            amountInput.value
          );


        const currency =
          clean(
            currencyInput.value
          ).toUpperCase();


        const notes =
          clean(
            notesInput.value
          );


        // --------------------------------------------
        // Validation
        // --------------------------------------------

        if (!cardId) {

          message.textContent =
            lang === 'zh-TW'
              ? '請選擇信用卡。'
              : 'Please select a Card.';

          cardInput.focus();

          return;
        }


        if (!transactionDate) {

          message.textContent =
            lang === 'zh-TW'
              ? '請填寫交易日期。'
              : 'Please enter the transaction date.';

          dateInput.focus();

          return;
        }


        if (!merchant) {

          message.textContent =
            lang === 'zh-TW'
              ? '請填寫商家 / 店家。'
              : 'Please enter the Merchant / Store.';

          storeInput.focus();

          return;
        }


        if (
          !Number.isFinite(amount) ||
          amount < 0
        ) {

          message.textContent =
            lang === 'zh-TW'
              ? '請填寫正確的金額。'
              : 'Please enter a valid amount.';

          amountInput.focus();

          return;
        }


        if (
          !/^[A-Z]{3}$/.test(
            currency
          )
        ) {

          message.textContent =
            lang === 'zh-TW'
              ? '幣別請輸入 3 碼代碼，例如 USD、TWD。'
              : 'Currency must be a 3-letter code such as USD or TWD.';

          currencyInput.focus();

          return;
        }


        const selectedCard =
          cards.find(
            card =>
              card.id === cardId
          );


        if (!selectedCard) {

          message.textContent =
            lang === 'zh-TW'
              ? '找不到所選的信用卡，請重新選擇。'
              : 'The selected Card could not be found.';

          return;
        }


        // --------------------------------------------
        // Save
        // --------------------------------------------

        submitButton.disabled =
          true;


        submitButton.textContent =
          lang === 'zh-TW'
            ? '送出中…'
            : 'Submitting…';


        try {

          await addDoc(
            collection(
              db,
              'unmatchedTransactions'
            ),
            {

              // Reporter
              reporterUserId:
                currentUser.uid,

              reporterUserName:
                clean(
                  currentProfile?.displayName ||
                  currentUser.displayName ||
                  currentUser.email ||
                  ''
                ),


              // Card
              cardId:
                selectedCard.id,

              cardSnapshot: {

                issuer:
                  clean(
                    selectedCard.issuer
                  ),

                cardName:
                  clean(
                    selectedCard.cardName ||
                    selectedCard.name
                  ),

                last4:
                  clean(
                    selectedCard.last4
                  )
              },


              // Transaction
              transactionDate,

              merchant,

              product,

              amount,

              currency,

              notes,


              // Workflow
              status:
                'open',

              resolutionType:
                null,

              resolutionNotes:
                '',

              linkedReceiptId:
                null,

              resolvedBy:
                null,

              resolvedAt:
                null,


              // Audit
              createdBy:
                currentUser.uid,

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );


          // ------------------------------------------
          // Success
          // ------------------------------------------

          page.innerHTML = `

            <section class="panel">

              <h2>
                ${
                  lang === 'zh-TW'
                    ? '回報已送出'
                    : 'Report Submitted'
                }
              </h2>


              <p>
                ${
                  lang === 'zh-TW'
                    ? '這筆未找到的交易已回報給 Owner。'
                    : 'This unmatched transaction has been reported to the Owner.'
                }
              </p>


              <p class="muted">

                ${escapeHtml(
                  transactionDate
                )}

                ·

                ${escapeHtml(
                  merchant
                )}

                ·

                ${escapeHtml(
                  currency
                )}

                ${escapeHtml(
                  amount.toFixed(2)
                )}

              </p>


              <button
                type="button"
                class="primary"
                id="unmatchedDone"
              >
                ${
                  lang === 'zh-TW'
                    ? '完成'
                    : 'Done'
                }
              </button>

            </section>
          `;


          page.querySelector(
            '#unmatchedDone'
          ).onclick = () => {

            location.hash =
              '#related';
          };


        } catch (error) {

          console.error(
            'Failed to report unmatched transaction:',
            error
          );


          message.textContent =
            lang === 'zh-TW'
              ? '回報失敗，請稍後再試。'
              : 'Unable to submit the report. Please try again.';


          submitButton.disabled =
            false;


          submitButton.textContent =
            lang === 'zh-TW'
              ? '送出回報'
              : 'Submit Report';
        }
      };


  } catch (error) {

    console.error(
      'Failed to load unmatched transaction page:',
      error
    );


    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '回報未找到的交易'
              : 'Report Unmatched Transaction'
          }
        </h2>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '目前無法載入此頁面。'
              : 'Unable to load this page.'
          }
        </p>

      </section>
    `;
  }
}
