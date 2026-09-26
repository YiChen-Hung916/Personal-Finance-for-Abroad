import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';


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
  amount,
  currency
) {
  const number =
    Number(amount || 0);

  const code =
    String(currency || '')
      .trim()
      .toUpperCase();

  return `${code || '—'} ${number.toFixed(2)}`;
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


function getMonthsAgoString(
  months
) {
  const today = new Date();

  const target =
    new Date(
      today.getFullYear(),
      today.getMonth() - months,
      today.getDate()
    );

  const year =
    target.getFullYear();

  const month =
    String(
      target.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      target.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


// ======================================================
// Normalize transactions
// ======================================================

function receiptToTransaction(
  receipt
) {
  return {
    id: receipt.id,

    type: 'receipt',

    transactionDate:
      String(
        receipt.purchaseDate || ''
      ),

    store:
      receipt.store || '—',

    amount:
      Number(
        receipt.total || 0
      ),

    currency:
      String(
        receipt.currency || ''
      )
        .trim()
        .toUpperCase(),

    paymentMethod:
      receipt.paymentMethod || '',

    source:
      receipt
  };
}


// ======================================================
// Date filtering
// ======================================================

function filterByPeriod(
  transactions,
  period,
  customStart,
  customEnd
) {
  if (period === 'all') {
    return transactions;
  }


  let startDate = '';
  let endDate =
    getTodayString();


  if (period === '3m') {
    startDate =
      getMonthsAgoString(3);
  }


  if (period === '6m') {
    startDate =
      getMonthsAgoString(6);
  }


  if (period === '12m') {
    startDate =
      getMonthsAgoString(12);
  }


  if (period === 'custom') {
    startDate =
      customStart || '';

    endDate =
      customEnd || '';
  }


  return transactions.filter(
    transaction => {

      const date =
        transaction.transactionDate;


      if (!date) {
        return false;
      }


      if (
        startDate &&
        date < startDate
      ) {
        return false;
      }


      if (
        endDate &&
        date > endDate
      ) {
        return false;
      }


      return true;
    }
  );
}


// ======================================================
// Type filtering
// ======================================================

function filterByType(
  transactions,
  type
) {
  if (type === 'all') {
    return transactions;
  }


  return transactions.filter(
    transaction =>
      transaction.type === type
  );
}


// ======================================================
// Transaction card
// ======================================================

function transactionCardHtml({
  transaction,
  lang
}) {
  const isRefund =
    transaction.type === 'refund';


  const typeText =
    isRefund
      ? (
          lang === 'zh-TW'
            ? '退款'
            : 'Refund'
        )
      : (
          lang === 'zh-TW'
            ? '消費'
            : 'Purchase'
        );


  const amountText =
    isRefund
      ? `-${formatMoney(
          transaction.amount,
          transaction.currency
        )}`
      : formatMoney(
          transaction.amount,
          transaction.currency
        );


  return `

    <div
      class="card history-transaction-card"
      data-transaction-id="${escapeHtml(
        transaction.id
      )}"
      data-transaction-type="${escapeHtml(
        transaction.type
      )}"
    >

      <div class="history-transaction-main">

        <div>

          <strong>
            ${escapeHtml(
              transaction.store
            )}
          </strong>

          <span class="muted">
            ${escapeHtml(
              transaction.transactionDate || '—'
            )}
          </span>

          <span class="muted">
            ${escapeHtml(typeText)}
          </span>

        </div>


        <strong>
          ${escapeHtml(amountText)}
        </strong>

      </div>

    </div>
  `;
}



// ======================================================
// Excel Export
// ======================================================

function exportTransactionsToExcel({
  transactions,
  period,
  type,
  customStart,
  customEnd,
  lang
}) {

  if (
    !transactions ||
    transactions.length === 0
  ) {
    alert(
      lang === 'zh-TW'
        ? '目前沒有可匯出的交易。'
        : 'There are no transactions to export.'
    );

    return;
  }


  // ==================================================
  // Transaction rows
  // ==================================================

  const rows =
    transactions.map(
      transaction => {

        const source =
          transaction.source || {};


        const transactionType =
          transaction.type === 'refund'
            ? (
                lang === 'zh-TW'
                  ? '退款'
                  : 'Refund'
              )
            : (
                lang === 'zh-TW'
                  ? '消費'
                  : 'Purchase'
              );


        const paymentMethod =
          source.paymentMethod ||
          transaction.paymentMethod ||
          '';


        return {

          '交易日期':
            transaction.transactionDate || '',

          '交易類型':
            transactionType,

          '商店':
            transaction.store || '',

          '幣別':
            transaction.currency || '',

          '最終金額':
            Number(
              transaction.amount || 0
            ),

          '付款方式':
            paymentMethod,

          '分類':
            source.category || '',

          '原商品小計':
            Number(
              source.originalItemsSubtotal || 0
            ),

          '商品折扣':
            Number(
              source.itemDiscountTotal || 0
            ),

          'Receipt 折扣':
            Number(
              source.receiptDiscount || 0
            ),

          '稅額':
            Number(
              source.tax || 0
            ),

          '其他費用':
            Number(
              source.fees || 0
            ),

          '備註':
            source.notes || ''

        };
      }
    );


  // ==================================================
  // Workbook
  // ==================================================

  const workbook =
    XLSX.utils.book_new();


  const worksheet =
    XLSX.utils.json_to_sheet(
      rows
    );


  // ==================================================
  // Column widths
  // ==================================================

  worksheet['!cols'] = [

    { wch: 14 }, // 日期
    { wch: 12 }, // 類型
    { wch: 24 }, // 商店
    { wch: 10 }, // 幣別
    { wch: 14 }, // 金額
    { wch: 14 }, // 付款方式
    { wch: 18 }, // 分類
    { wch: 16 }, // 原商品小計
    { wch: 14 }, // 商品折扣
    { wch: 16 }, // Receipt 折扣
    { wch: 12 }, // 稅額
    { wch: 12 }, // 其他費用
    { wch: 30 }  // 備註

  ];


  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    '交易歷史'
  );


  // ==================================================
  // Filter information sheet
  // ==================================================

  let periodText = '所有交易';


  if (period === '3m') {
    periodText = '最近 3 個月';
  }


  if (period === '6m') {
    periodText = '最近 6 個月';
  }


  if (period === '12m') {
    periodText = '最近 12 個月';
  }


  if (period === 'custom') {

    periodText =
      `${customStart || '不限'} ～ ${
        customEnd || '不限'
      }`;

  }


  let typeText = '全部';


  if (type === 'receipt') {
    typeText = '消費';
  }


  if (type === 'refund') {
    typeText = '退款';
  }


  const infoRows = [

    {
      '項目': '期間',
      '內容': periodText
    },

    {
      '項目': '交易類型',
      '內容': typeText
    },

    {
      '項目': '匯出筆數',
      '內容': transactions.length
    },

    {
      '項目': '匯出日期',
      '內容': getTodayString()
    }

  ];


  const infoSheet =
    XLSX.utils.json_to_sheet(
      infoRows
    );


  infoSheet['!cols'] = [
    { wch: 16 },
    { wch: 30 }
  ];


  XLSX.utils.book_append_sheet(
    workbook,
    infoSheet,
    '匯出資訊'
  );


  // ==================================================
  // Filename
  // ==================================================

  let filenamePeriod =
    period;


  if (period === 'all') {
    filenamePeriod =
      'all';
  }


  if (period === 'custom') {

    filenamePeriod =
      `${customStart || 'start'}_${customEnd || 'end'}`;

  }


  const filename =
    `transaction-history_${filenamePeriod}_${getTodayString()}.xlsx`;


  XLSX.writeFile(
    workbook,
    filename
  );
}



// ======================================================
// Main History page
// ======================================================

export async function historyPage({
  db,
  currentRole,
  lang,
  page
}) {

  page.innerHTML = `

    <section class="panel">

      <h2>
        ${
          lang === 'zh-TW'
            ? '交易紀錄'
            : 'History'
        }
      </h2>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入交易紀錄…'
            : 'Loading history…'
        }
      </p>

    </section>
  `;


  try {

    // ==================================================
    // Load receipts
    // ==================================================

    const receiptSnapshot =
      await getDocs(
        collection(
          db,
          'receipts'
        )
      );


    const receipts =
      receiptSnapshot.docs.map(
        receiptDoc => ({
          id: receiptDoc.id,
          ...receiptDoc.data()
        })
      );


    // ==================================================
    // Normalize
    // ==================================================

    const receiptTransactions =
      receipts.map(
        receipt =>
          receiptToTransaction(
            receipt
          )
      );


    /*
      Future:

      const refundTransactions =
        refunds.map(
          refund =>
            refundToTransaction(
              refund
            )
        );

      const allTransactions = [
        ...receiptTransactions,
        ...refundTransactions
      ];
    */


    const allTransactions = [
      ...receiptTransactions
    ];


    allTransactions.sort(
      (a, b) =>
        String(
          b.transactionDate || ''
        ).localeCompare(
          String(
            a.transactionDate || ''
          )
        )
    );


    // ==================================================
    // Page
    // ==================================================

    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '轉帳紀錄'
              : 'Transfers'
          }
        </h2>


        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '尚無轉帳紀錄。'
              : 'No transfer records yet.'
          }
        </p>

      </section>


      <section class="panel">

        <div class="history-heading-row">

          <h2>
            ${
              lang === 'zh-TW'
                ? '交易歷史'
                : 'Transaction History'
            }
          </h2>

          <button
  id="historyExportButton"
  type="button"
  class="secondary"
>
  ${
    lang === 'zh-TW'
      ? '匯出 Excel'
      : 'Export Excel'
  }
</button>

        </div>


        <div class="history-filters">

          <div class="field">

            <label
              for="historyPeriod"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '期間'
                  : 'Period'
              }
            </label>

            <select id="historyPeriod">

              <option value="all">
                ${
                  lang === 'zh-TW'
                    ? '所有交易'
                    : 'All transactions'
                }
              </option>

              <option value="3m">
                ${
                  lang === 'zh-TW'
                    ? '最近 3 個月'
                    : 'Last 3 months'
                }
              </option>

              <option value="6m">
                ${
                  lang === 'zh-TW'
                    ? '最近 6 個月'
                    : 'Last 6 months'
                }
              </option>

              <option value="12m">
                ${
                  lang === 'zh-TW'
                    ? '最近 12 個月'
                    : 'Last 12 months'
                }
              </option>

              <option value="custom">
                ${
                  lang === 'zh-TW'
                    ? '自訂區間'
                    : 'Custom range'
                }
              </option>

            </select>

          </div>


          <div class="field">

            <label
              for="historyType"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '類型'
                  : 'Type'
              }
            </label>

            <select id="historyType">

              <option value="all">
                ${
                  lang === 'zh-TW'
                    ? '全部'
                    : 'All'
                }
              </option>

              <option value="receipt">
                ${
                  lang === 'zh-TW'
                    ? '消費'
                    : 'Purchases'
                }
              </option>

              <option value="refund">
                ${
                  lang === 'zh-TW'
                    ? '退款'
                    : 'Refunds'
                }
              </option>

            </select>

          </div>

        </div>


        <div
          id="historyCustomRange"
          class="history-custom-range"
          hidden
        >

          <div class="field">

            <label
              for="historyStartDate"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '開始日期'
                  : 'Start date'
              }
            </label>

            <input
              id="historyStartDate"
              type="date"
            >

          </div>


          <div class="field">

            <label
              for="historyEndDate"
              class="field-label"
            >
              ${
                lang === 'zh-TW'
                  ? '結束日期'
                  : 'End date'
              }
            </label>

            <input
              id="historyEndDate"
              type="date"
            >

          </div>

        </div>


        <div
          id="historyFilterMessage"
          class="muted"
        ></div>


        <div
          id="historyTransactionList"
          class="history-transaction-list"
        ></div>

      </section>
    `;


    // ==================================================
    // DOM
    // ==================================================

    const periodSelect =
      page.querySelector(
        '#historyPeriod'
      );


    const typeSelect =
      page.querySelector(
        '#historyType'
      );


    const customRange =
      page.querySelector(
        '#historyCustomRange'
      );


    const startDateInput =
      page.querySelector(
        '#historyStartDate'
      );


    const endDateInput =
      page.querySelector(
        '#historyEndDate'
      );


    const list =
      page.querySelector(
        '#historyTransactionList'
      );


    const filterMessage =
      page.querySelector(
        '#historyFilterMessage'
      );

    
    const exportButton =
  page.querySelector(
    '#historyExportButton'
  );


    // ==================================================
    // Render filtered transactions
    // ==================================================

    let currentVisibleTransactions = [];

    function renderTransactions() {

      const period =
        periodSelect.value;


      const type =
        typeSelect.value;


      customRange.hidden =
        period !== 'custom';


      let visibleTransactions =
        filterByPeriod(
          allTransactions,
          period,
          startDateInput.value,
          endDateInput.value
        );


      visibleTransactions =
        filterByType(
          visibleTransactions,
          type
        );

      currentVisibleTransactions =
        [...visibleTransactions];

      visibleTransactions.sort(
        (a, b) =>
          String(
            b.transactionDate || ''
          ).localeCompare(
            String(
              a.transactionDate || ''
            )
          )
      );


      // Custom date validation
      if (
        period === 'custom' &&
        startDateInput.value &&
        endDateInput.value &&
        startDateInput.value >
          endDateInput.value
      ) {

        filterMessage.textContent =
          lang === 'zh-TW'
            ? '開始日期不能晚於結束日期。'
            : 'Start date cannot be later than end date.';


        list.innerHTML = '';

        return;
      }


      filterMessage.textContent =
        lang === 'zh-TW'
          ? `共 ${visibleTransactions.length} 筆交易`
          : `${visibleTransactions.length} transactions`;


      if (
        visibleTransactions.length === 0
      ) {

        list.innerHTML = `

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '這個篩選條件下沒有交易紀錄。'
                : 'No transactions match these filters.'
            }
          </p>
        `;

        return;
      }


      list.innerHTML =
        visibleTransactions
          .map(
            transaction =>
              transactionCardHtml({
                transaction,
                lang
              })
          )
          .join('');


      // Receipt cards open Receipt Detail
      list
        .querySelectorAll(
          '[data-transaction-type="receipt"]'
        )
        .forEach(card => {

          card.onclick = () => {

            const receiptId =
              card.dataset
                .transactionId;


            location.hash =
              `#receipt-detail/${receiptId}`;
          };

        });
    }


    // ==================================================
    // Events
    // ==================================================

    periodSelect.onchange =
      renderTransactions;


    typeSelect.onchange =
      renderTransactions;


    startDateInput.onchange =
      renderTransactions;


    endDateInput.onchange =
      renderTransactions;

    exportButton.onclick = () => {

  exportTransactionsToExcel({

    transactions:
      currentVisibleTransactions,

    period:
      periodSelect.value,

    type:
      typeSelect.value,

    customStart:
      startDateInput.value,

    customEnd:
      endDateInput.value,

    lang

  });

};


    // First render
    renderTransactions();


  } catch (error) {

    console.error(
      'History load error:',
      error
    );


    page.innerHTML = `

      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '交易紀錄'
              : 'History'
          }
        </h2>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '無法載入交易紀錄。'
              : 'Unable to load history.'
          }
        </p>

      </section>
    `;
  }
}
