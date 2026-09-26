import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Receipt Module
// ======================================================
//
// This module handles:
//
// - Receipt form
// - Receipt items
// - Item calculations
// - Receipt calculations
// - Receipt validation
// - Receipt Firestore save
//
// Firebase itself is initialized in app.js.
// app.js passes db / user / role / language / page into here.
// ======================================================


// ======================================================
// Module State
// ======================================================

let db = null;
let currentUser = null;
let currentRole = null;
let lang = 'zh-TW';
let page = null;

let escapeHtml = null;
let normalizeNameKey = null;
let formatDisplayName = null;


// ======================================================
// Public Entry Point
// ======================================================

export async function receiptPage({
  db: firestoreDb,
  currentUser: user,
  currentRole: role,
  lang: currentLang,
  page: pageElement,
  escapeHtml: escapeHtmlHelper,
  normalizeNameKey: normalizeNameKeyHelper,
  formatDisplayName: formatDisplayNameHelper
}) {

  db = firestoreDb;
  currentUser = user;
  currentRole = role;
  lang = currentLang;
  page = pageElement;

  escapeHtml = escapeHtmlHelper;
  normalizeNameKey = normalizeNameKeyHelper;
  formatDisplayName = formatDisplayNameHelper;

  await receiptForm();
}


// ======================================================
// Receipt Form
// ======================================================

async function receiptForm() {

  // Only owner can create receipts
  if (currentRole !== 'owner') {

    page.innerHTML = `
      <section class="panel">

        <h1>Access Denied</h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以建立收據。'
              : 'Only owners can create receipts.'
          }
        </p>

      </section>
    `;

    return;
  }


  // ------------------------------------------------------
  // Load active cards
  // ------------------------------------------------------

  let cards = [];
  let cardLoadError = '';

  try {

    const cardsSnapshot =
      await getDocs(
        collection(db, 'cards')
      );

    cards = cardsSnapshot.docs
      .map(cardDoc => ({
        id: cardDoc.id,
        ...cardDoc.data()
      }))
      .filter(
        card => card.active === true
      );

  } catch (error) {

    console.error(
      'Failed to load cards for receipt:',
      error
    );

    cardLoadError = error.message;
  }


  // ------------------------------------------------------
  // Build card options
  // ------------------------------------------------------

  let cardOptions = '';

  for (const card of cards) {

    cardOptions += `
      <option value="${card.id}">
        ${escapeHtml(card.nickname || '')}
        · ${escapeHtml(card.issuer || '')}
        ${escapeHtml(card.network || '')}
        · •••• ${escapeHtml(card.last4 || '')}
      </option>
    `;
  }


  // ------------------------------------------------------
  // Render form
  // ------------------------------------------------------

  page.innerHTML = `

    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '新增收據'
            : 'New Receipt'
        }
      </h1>


      <!-- ============================================== -->
      <!-- Store -->
      <!-- ============================================== -->

      <div class="row">

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '商店'
                : 'Store'
            }

            <sup class="required-mark">*</sup>

          </span>

          <input
            id="receiptStore"
            placeholder="Target"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '分店'
              : 'Branch'
          }

          <input
            id="receiptBranch"
            placeholder="East Liberty"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '購買方式'
              : 'Purchase Type'
          }

          <select id="receiptPurchaseType">

            <option value="inStore">
              ${
                lang === 'zh-TW'
                  ? '實體店'
                  : 'In-store'
              }
            </option>

            <option value="online">
              ${
                lang === 'zh-TW'
                  ? '網路'
                  : 'Online'
              }
            </option>

          </select>

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Date / Time / Timezone -->
      <!-- ============================================== -->

      <div class="row">

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '日期'
                : 'Date'
            }

            <sup class="required-mark">*</sup>

          </span>

          <input
            id="receiptDate"
            type="date"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '時間'
              : 'Time'
          }

          <input
            id="receiptTime"
            type="time"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '時區'
              : 'Timezone'
          }

          <select id="receiptTimezone">

            <optgroup
              label="${
                lang === 'zh-TW'
                  ? '北美'
                  : 'North America'
              }"
            >

              <option
                value="America/New_York"
                selected
              >
                Eastern Time — New York / Pittsburgh
              </option>

              <option value="America/Chicago">
                Central Time — Chicago
              </option>

              <option value="America/Denver">
                Mountain Time — Denver
              </option>

              <option value="America/Los_Angeles">
                Pacific Time — Los Angeles
              </option>

            </optgroup>


            <optgroup
              label="${
                lang === 'zh-TW'
                  ? '亞洲'
                  : 'Asia'
              }"
            >

              <option value="Asia/Taipei">
                Taiwan — Taipei
              </option>

              <option value="Asia/Tokyo">
                Japan — Tokyo
              </option>

              <option value="Asia/Seoul">
                South Korea — Seoul
              </option>

              <option value="Asia/Hong_Kong">
                Hong Kong
              </option>

              <option value="Asia/Singapore">
                Singapore
              </option>

            </optgroup>


            <optgroup
              label="${
                lang === 'zh-TW'
                  ? '歐洲'
                  : 'Europe'
              }"
            >

              <option value="Europe/London">
                United Kingdom — London
              </option>

              <option value="Europe/Paris">
                Central Europe — Paris
              </option>

            </optgroup>

          </select>

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Items -->
      <!-- ============================================== -->

      <div id="items"></div>


      <button
        id="addItem"
        class="add-item-btn"
        type="button"
      >

        ＋ ${
          lang === 'zh-TW'
            ? '新增品項'
            : 'Add Item'
        }

      </button>


      <!-- ============================================== -->
      <!-- Receipt-level adjustments -->
      <!-- ============================================== -->

      <div class="row">

        <label class="field">

          ${
            lang === 'zh-TW'
              ? '整張收據優惠'
              : 'Total Savings'
          }

          <input
            id="receiptDiscount"
            type="number"
            min="0"
            step="0.01"
            value="0.00"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '稅'
              : 'Tax'
          }

          <input
            id="receiptTax"
            type="number"
            min="0"
            step="0.01"
            value="0"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '小費 / 其他費用'
              : 'Tip / Other Fees'
          }

          <input
            id="receiptFees"
            type="number"
            min="0"
            step="0.01"
            value="0"
          >

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Currency + Total + Payment Method -->
      <!-- ============================================== -->

      <div class="row receipt-payment-summary">

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '收據幣值'
                : 'Receipt Currency'
            }

            <sup class="required-mark">*</sup>

          </span>

          <select id="receiptCurrency">
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

          ${
            lang === 'zh-TW'
              ? '發票總額'
              : 'Receipt Total'
          }

          <input
            id="receiptTotal"
            type="text"
            value="0.00"
            readonly
          >

        </label>


        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '付款方式'
                : 'Payment Method'
            }

            <sup class="required-mark">*</sup>

          </span>

          <select id="receiptPaymentMethod">

            <option value="card">
              ${
                lang === 'zh-TW'
                  ? '信用卡'
                  : 'Card'
              }
            </option>

            <option value="cash">
              ${
                lang === 'zh-TW'
                  ? '付現'
                  : 'Cash'
              }
            </option>

          </select>

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Card -->
      <!-- ============================================== -->

      <div
        id="receiptCardSection"
        class="row"
      >

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '信用卡'
                : 'Card'
            }

            <sup class="required-mark">*</sup>

          </span>

          <select id="receiptCard">

            <option value="">

              ${
                cards.length
                  ? (
                      lang === 'zh-TW'
                        ? '請選擇信用卡…'
                        : 'Select card…'
                    )
                  : (
                      lang === 'zh-TW'
                        ? '目前沒有可用的信用卡'
                        : 'No active cards available'
                    )
              }

            </option>

            ${cardOptions}

          </select>


          ${
            cardLoadError
              ? `
                  <small class="muted">
                    ${
                      lang === 'zh-TW'
                        ? `信用卡載入失敗：${escapeHtml(cardLoadError)}`
                        : `Failed to load cards: ${escapeHtml(cardLoadError)}`
                    }
                  </small>
                `
              : ''
          }

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Foreign Currency Settlement -->
      <!-- ============================================== -->

      <div
        id="foreignSettlementSection"
        class="row"
      >

        <label class="field">

          <span class="checkbox-inline">

            <input
              id="foreignCurrencySettlementOffered"
              type="checkbox"
            >

            <span>

              ${
                lang === 'zh-TW'
                  ? '店員有提供外幣結帳選擇，且我選擇以外幣結帳'
                  : 'Merchant offered a currency choice and I chose foreign-currency settlement'
              }

            </span>

          </span>


          <small class="muted foreign-settlement-note">

            ${
              lang === 'zh-TW'
                ? '之後會另外核對信用卡通知中的結帳幣值是否符合。'
                : 'The settlement currency shown in the card notification will be verified separately.'
            }

          </small>

        </label>

      </div>


      <!-- ============================================== -->
      <!-- Buttons -->
      <!-- ============================================== -->

      <div class="actions">

        <button
          id="saveReceiptDraft"
          type="button"
        >

          ${
            lang === 'zh-TW'
              ? '儲存草稿'
              : 'Save Draft'
          }

        </button>


        <button
          id="submitReceipt"
          class="primary"
          type="button"
        >

          ${
            lang === 'zh-TW'
              ? '送出'
              : 'Submit'
          }

        </button>

      </div>

    </section>
  `;


  // ====================================================
  // Bind Events
  // ====================================================

  document.querySelector(
    '#addItem'
  ).onclick = addItem;


  document.querySelector(
    '#saveReceiptDraft'
  ).onclick =
    () => saveReceipt('draft');


  document.querySelector(
    '#submitReceipt'
  ).onclick =
    () => saveReceipt('pending');


  const paymentMethodSelect =
    document.querySelector(
      '#receiptPaymentMethod'
    );


  const cardSection =
    document.querySelector(
      '#receiptCardSection'
    );


  const foreignSettlementSection =
    document.querySelector(
      '#foreignSettlementSection'
    );


  function updatePaymentMethodUI() {

    const isCard =
      paymentMethodSelect.value === 'card';


    cardSection.style.display =
      isCard
        ? ''
        : 'none';


    foreignSettlementSection.style.display =
      isCard
        ? ''
        : 'none';


    if (!isCard) {

      document.querySelector(
        '#receiptCard'
      ).value = '';


      document.querySelector(
        '#foreignCurrencySettlementOffered'
      ).checked = false;
    }
  }


  paymentMethodSelect.addEventListener(
    'change',
    updatePaymentMethodUI
  );


  [
    '#receiptDiscount',
    '#receiptTax',
    '#receiptFees'
  ].forEach(selector => {

    const element =
      document.querySelector(selector);


    if (element) {

      element.addEventListener(
        'input',
        updateReceiptTotal
      );
    }
  });


  updatePaymentMethodUI();


  // Start with one item
  addItem();


  updateReceiptTotal();
}


// ======================================================
// Add Receipt Item
// ======================================================

function addItem() {

  const d =
    document.createElement('div');


  d.className = 'item';


  d.innerHTML = `

    <!-- ============================================== -->
    <!-- Category / Product / Brand -->
    <!-- ============================================== -->

    <div class="row">

      <label class="field">

        ${
          lang === 'zh-TW'
            ? '分類'
            : 'Category'
        }

        <select class="itemCategory">

          <option value="">
            ${
              lang === 'zh-TW'
                ? '請選擇分類…'
                : 'Select category...'
            }
          </option>

          <option value="Beverages">
            Beverages
          </option>

          <option value="Food">
            Food
          </option>

          <option value="Snacks">
            Snacks
          </option>

          <option value="Household">
            Household
          </option>

          <option value="Personal Care">
            Personal Care
          </option>

          <option value="Clothing">
            Clothing
          </option>

          <option value="Electronics">
            Electronics
          </option>

          <option value="Other">
            Other
          </option>

        </select>

      </label>


      <label class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '產品'
              : 'Product'
          }

          <sup class="required-mark">*</sup>

        </span>

        <input class="itemProduct">

      </label>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '品牌'
            : 'Brand'
        }

        <input class="itemBrand">

      </label>

    </div>


    <!-- ============================================== -->
    <!-- Package Information -->
    <!-- ============================================== -->

    <div class="row">

      <label class="field">

        ${
          lang === 'zh-TW'
            ? '每包件數'
            : 'Units per package'
        }

        <input
          class="itemUnitsPerPackage"
          type="number"
          min="1"
          value="1"
        >

      </label>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '單件容量 / 重量（選填）'
            : 'Capacity / Size (optional)'
        }

        <input
          class="itemCapacity"
          type="number"
          min="0"
          step="any"
        >

      </label>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '單位'
            : 'Unit'
        }

        <select class="itemUnit">

          <option value="">
            —
          </option>

          <optgroup label="Volume">

            <option value="mL">
              mL
            </option>

            <option value="L">
              L
            </option>

            <option value="fl_oz">
              fl oz
            </option>

            <option value="gal">
              gal
            </option>

          </optgroup>

          <optgroup label="Weight">

            <option value="g">
              g
            </option>

            <option value="kg">
              kg
            </option>

          </optgroup>

          <optgroup label="Count">

            <option value="each">
              each
            </option>

          </optgroup>

        </select>

      </label>

    </div>


    <!-- ============================================== -->
    <!-- Quantity + Original Price -->
    <!-- ============================================== -->

    <div class="row">

      <label class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '購買數量（包）'
              : 'Purchase Quantity (packages)'
          }

          <sup class="required-mark">*</sup>

        </span>

        <input
          class="itemQuantity"
          type="number"
          min="1"
          value="1"
        >

      </label>


      <label class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '每包原價'
              : 'Original Price per Package'
          }

          <sup class="required-mark">*</sup>

        </span>

        <input
          class="itemPrice"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
        >

      </label>

    </div>


    <!-- ============================================== -->
    <!-- Promotion Checkbox -->
    <!-- ============================================== -->

    <div class="row">

      <label class="field">

        <span>

          <input
            class="itemHasDiscount"
            type="checkbox"
          >

          ${
            lang === 'zh-TW'
              ? '有優惠'
              : 'Discount / Promotion'
          }

        </span>

      </label>

    </div>


    <!-- ============================================== -->
    <!-- Promotion Details -->
    <!-- ============================================== -->

    <div
      class="itemDiscountSection"
      style="display:none;"
    >

      <div class="row">

        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '此品項優惠後總額'
                : 'Discounted Total'
            }

            <sup
              class="required-mark itemDiscountRequiredMark"
              style="display:none;"
            >
              *
            </sup>

          </span>

          <input
            class="itemDiscountedTotal"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '優惠備註'
              : 'Promotion Note'
          }

          <input
            class="itemPromotionNote"
            type="text"
            placeholder="${
              lang === 'zh-TW'
                ? '例如：買一送一，需買 2 件'
                : 'e.g. Buy 1 get 1 free; requires 2'
            }"
          >

        </label>

      </div>

    </div>


    <!-- ============================================== -->
    <!-- Calculated Item Amounts -->
    <!-- ============================================== -->

    <div class="row">

      <label class="field">

        ${
          lang === 'zh-TW'
            ? '原價小計'
            : 'Original Subtotal'
        }

        <input
          class="itemOriginalSubtotal"
          type="number"
          min="0"
          step="0.01"
          value="0.00"
        >

      </label>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '品項實付'
            : 'Item Final Price'
        }

        <input
          class="itemFinalPrice"
          type="text"
          value="0.00"
          readonly
        >

      </label>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '等效折數'
            : 'Effective Discount'
        }

        <input
          class="itemEffectiveDiscount"
          type="text"
          value="—"
          readonly
        >

      </label>

    </div>


    <!-- ============================================== -->
    <!-- Notes -->
    <!-- ============================================== -->

    <label class="field">

      ${
        lang === 'zh-TW'
          ? '備註（選填）'
          : 'Notes (optional)'
      }

      <textarea
        class="itemNotes"
        rows="3"
        placeholder="${
          lang === 'zh-TW'
            ? '例如：商品外觀、特殊規格、購買原因等'
            : 'e.g. product details, special specifications, purchase notes'
        }"
      ></textarea>

    </label>
  `;


  document
    .querySelector('#items')
    .appendChild(d);


  // ------------------------------------------------------
  // Discount Show / Hide
  // ------------------------------------------------------

  const discountCheckbox =
    d.querySelector(
      '.itemHasDiscount'
    );


  const discountSection =
    d.querySelector(
      '.itemDiscountSection'
    );


  const discountRequiredMark =
    d.querySelector(
      '.itemDiscountRequiredMark'
    );


  const originalSubtotalInput =
    d.querySelector(
      '.itemOriginalSubtotal'
    );


  const quantityInput =
    d.querySelector(
      '.itemQuantity'
    );


  const priceInput =
    d.querySelector(
      '.itemPrice'
    );


  function resetOriginalSubtotalToAutomatic() {

    originalSubtotalInput.dataset.manualOverride =
      'false';

    updateReceiptTotal();
  }


  quantityInput.addEventListener(
    'input',
    resetOriginalSubtotalToAutomatic
  );


  priceInput.addEventListener(
    'input',
    resetOriginalSubtotalToAutomatic
  );


  originalSubtotalInput.dataset.manualOverride =
    'false';


  originalSubtotalInput.addEventListener(
    'input',
    () => {

      originalSubtotalInput.dataset.manualOverride =
        'true';

      updateReceiptTotal();
    }
  );


  discountCheckbox.addEventListener(
    'change',
    () => {

      discountSection.style.display =
        discountCheckbox.checked
          ? 'block'
          : 'none';


      discountRequiredMark.style.display =
        discountCheckbox.checked
          ? ''
          : 'none';


      if (!discountCheckbox.checked) {

        d.querySelector(
          '.itemDiscountedTotal'
        ).value = '';


        d.querySelector(
          '.itemPromotionNote'
        ).value = '';
      }


      updateReceiptTotal();
    }
  );


  // ------------------------------------------------------
  // Recalculate When Item Changes
  // ------------------------------------------------------

  d.querySelectorAll(
    'input:not(.itemOriginalSubtotal), select, textarea'
  )
    .forEach(element => {

      element.addEventListener(
        'input',
        updateReceiptTotal
      );


      element.addEventListener(
        'change',
        updateReceiptTotal
      );
    });


  updateReceiptTotal();
}


// ======================================================
// Calculate One Item
// ======================================================

function calculateItemTotal(item) {

  const quantity =
    Number(
      item.querySelector(
        '.itemQuantity'
      )?.value
    ) || 0;


  const price =
    Number(
      item.querySelector(
        '.itemPrice'
      )?.value
    ) || 0;


  const originalSubtotalInput =
    item.querySelector(
      '.itemOriginalSubtotal'
    );


  const manualOverride =
    originalSubtotalInput
      ?.dataset
      ?.manualOverride === 'true';


  // ------------------------------------------------------
  // Automatic subtotal
  // ------------------------------------------------------

  const calculatedOriginalSubtotal =
    quantity * price;


  // ------------------------------------------------------
  // Manual subtotal
  // ------------------------------------------------------

  let originalSubtotal;


  if (manualOverride) {

    originalSubtotal =
      Number(
        originalSubtotalInput.value
      ) || 0;

  } else {

    originalSubtotal =
      calculatedOriginalSubtotal;
  }


  // ------------------------------------------------------
  // Discount
  // ------------------------------------------------------

  const hasDiscount =
    item.querySelector(
      '.itemHasDiscount'
    )?.checked === true;


  const discountedTotalInput =
    item.querySelector(
      '.itemDiscountedTotal'
    )?.value;


  const hasDiscountedTotal =
    discountedTotalInput !== '' &&
    discountedTotalInput != null &&
    Number.isFinite(
      Number(
        discountedTotalInput
      )
    );


  const discountedTotal =
    hasDiscountedTotal
      ? Number(
          discountedTotalInput
        )
      : null;


  // ------------------------------------------------------
  // Final Item Total
  // ------------------------------------------------------

  let finalTotal =
    originalSubtotal;


  if (
    hasDiscount &&
    hasDiscountedTotal
  ) {

    finalTotal =
      Math.max(
        discountedTotal,
        0
      );
  }


  // ------------------------------------------------------
  // Effective Discount Rate
  // ------------------------------------------------------

  let effectiveRate =
    1;


  if (originalSubtotal > 0) {

    effectiveRate =
      finalTotal /
      originalSubtotal;
  }


  // ------------------------------------------------------
  // Savings
  // ------------------------------------------------------

  const savings =
    Math.max(
      originalSubtotal -
      finalTotal,
      0
    );


  return {

    calculatedOriginalSubtotal,

    originalSubtotal,

    finalTotal,

    effectiveRate,

    savings,

    manualOverride
  };
}


// ======================================================
// Update Receipt Total
// ======================================================

function updateReceiptTotal() {

  const itemElements =
    document.querySelectorAll(
      '#items .item'
    );


  let originalItemsTotal =
    0;


  let itemsFinalTotal =
    0;


  let totalSavings =
    0;


  itemElements.forEach(item => {

    const result =
      calculateItemTotal(item);


    const originalSubtotalField =
      item.querySelector(
        '.itemOriginalSubtotal'
      );


    const finalPriceField =
      item.querySelector(
        '.itemFinalPrice'
      );


    const discountField =
      item.querySelector(
        '.itemEffectiveDiscount'
      );


    if (
      originalSubtotalField &&
      result.manualOverride !== true
    ) {

      originalSubtotalField.value =
        result.calculatedOriginalSubtotal
          .toFixed(2);
    }


    if (finalPriceField) {

      finalPriceField.value =
        result.finalTotal
          .toFixed(2);
    }


    if (discountField) {

      if (
        result.originalSubtotal <= 0 ||
        result.effectiveRate >= 0.9999
      ) {

        discountField.value =
          '—';

      } else {

        const zhe =
          result.effectiveRate * 10;


        if (lang === 'zh-TW') {

          discountField.value =
            `${
              Number(
                zhe.toFixed(2)
              )
            }折`;

        } else {

          const percent =
            result.effectiveRate *
            100;


          discountField.value =
            `${
              Number(
                percent.toFixed(2)
              )
            }% of original`;
        }
      }
    }


    originalItemsTotal +=
      result.originalSubtotal;


    itemsFinalTotal +=
      result.finalTotal;


    totalSavings +=
      result.savings;
  });


  const receiptDiscount =
    Number(
      document.querySelector(
        '#receiptDiscount'
      )?.value
    ) || 0;


  const tax =
    Number(
      document.querySelector(
        '#receiptTax'
      )?.value
    ) || 0;


  const fees =
    Number(
      document.querySelector(
        '#receiptFees'
      )?.value
    ) || 0;


  const receiptTotal =
    Math.max(
      itemsFinalTotal -
      receiptDiscount +
      tax +
      fees,
      0
    );


  const receiptTotalField =
    document.querySelector(
      '#receiptTotal'
    );


  if (receiptTotalField) {

    receiptTotalField.value =
      receiptTotal.toFixed(2);
  }
}


// ======================================================
// Save Receipt
// ======================================================

async function saveReceipt(status) {

  if (
    currentRole !== 'owner' ||
    !currentUser
  ) {

    return;
  }

// ------------------------------------------------------
  // Submission calendar date
  // ------------------------------------------------------

  const now = new Date();

  const localSubmittedDate =
    [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

  
  // ------------------------------------------------------
  // Basic Receipt Fields
  // ------------------------------------------------------

  const storeInput =
    document.querySelector(
      '#receiptStore'
    ).value;


  const storeKey =
    normalizeNameKey(
      storeInput
    );


  const store =
    formatDisplayName(
      storeInput
    );


  const branch =
    document.querySelector(
      '#receiptBranch'
    ).value
      .trim()
      .replace(/\s+/g, ' ');


  const purchaseType =
    document.querySelector(
      '#receiptPurchaseType'
    ).value;


  const purchaseDate =
    document.querySelector(
      '#receiptDate'
    ).value;


  const purchaseTime =
    document.querySelector(
      '#receiptTime'
    ).value;


  const timezone =
    document.querySelector(
      '#receiptTimezone'
    ).value;


  const currency =
    document.querySelector(
      '#receiptCurrency'
    ).value;


  // ------------------------------------------------------
  // Payment
  // ------------------------------------------------------

  const paymentMethod =
    document.querySelector(
      '#receiptPaymentMethod'
    ).value;


  const cardId =
    paymentMethod === 'card'
      ? document.querySelector(
          '#receiptCard'
        ).value
      : null;


  const foreignCurrencySettlementOffered =
    paymentMethod === 'card' &&
    document.querySelector(
      '#foreignCurrencySettlementOffered'
    ).checked === true;


  // ------------------------------------------------------
  // Validation
  // ------------------------------------------------------

  if (
    !store ||
    !purchaseDate
  ) {

    alert(
      lang === 'zh-TW'
        ? '請至少填寫商店與日期。'
        : 'Please enter a store and date.'
    );

    return;
  }


  if (
    paymentMethod === 'card' &&
    !cardId
  ) {

    alert(
      lang === 'zh-TW'
        ? '請選擇信用卡。'
        : 'Please select a card.'
    );

    return;
  }


  // ------------------------------------------------------
  // Card + Confirmation User Snapshot
  
  // Receipt keeps its own snapshot of:
  // 1. confirmation users
  // 2. card display information
  //
  // Therefore, later changes to the Card document
  // DO NOT change an existing Receipt.
  // ------------------------------------------------------

  let confirmationUserIds = [];


// Temporary backward-compatible primary confirmer.
// Older modules still read confirmationUserId.
// We will remove this only after My Confirmation /
// Pending / Rules are migrated to confirmationUserIds.
let confirmationUserId =
  null;


// Snapshot of the card information at the moment
// this receipt is created.
let cardSnapshotData =
  null;


if (paymentMethod === 'card') {

  const cardDocument =
    await getDoc(
      doc(
        db,
        'cards',
        cardId
      )
    );


  if (!cardDocument.exists()) {

    alert(
      lang === 'zh-TW'
        ? '找不到所選信用卡。'
        : 'Selected card could not be found.'
    );

    return;
  }


  const card =
    cardDocument.data();


  // A new Receipt may only use an active card.
  //
  // This check affects NEW receipts only.
  // If the card is disabled later, existing receipts
  // are NOT changed.
  if (card.active !== true) {

    alert(
      lang === 'zh-TW'
        ? '這張信用卡目前已停用。'
        : 'This card is currently inactive.'
    );

    return;
  }


  // ----------------------------------------------------
  // Confirmation-user snapshot
  // ----------------------------------------------------
  //
  // New Card structure:
  // confirmationUserIds: ["uid_A", "uid_B", ...]
  //
  // Legacy fallback:
  // confirmationUserId: "uid_A"
  // ----------------------------------------------------

  if (
    Array.isArray(
      card.confirmationUserIds
    )
  ) {

    confirmationUserIds =
      card.confirmationUserIds
        .filter(Boolean);

  } else if (
    card.confirmationUserId
  ) {

    confirmationUserIds =
      [
        card.confirmationUserId
      ];
  }


  // Remove accidental duplicates.
  confirmationUserIds =
    [
      ...new Set(
        confirmationUserIds
      )
    ];


  if (
    confirmationUserIds.length === 0
  ) {

    alert(
      lang === 'zh-TW'
        ? '這張信用卡尚未設定交易確認人。'
        : 'This card does not have a confirmation user.'
    );

    return;
  }


  // Temporary legacy field.
  //
  // Existing My Confirmation / Pending modules
  // can continue working before their migration.
  confirmationUserId =
    confirmationUserIds[0];


  // ----------------------------------------------------
  // Card display snapshot
  // ----------------------------------------------------
  //
  // This preserves historical information.
  //
  // Example:
  // Receipt created while nickname = "HSBC Travel"
  // Card later renamed to "Family HSBC"
  //
  // This Receipt still records "HSBC Travel".
  // ----------------------------------------------------

  cardSnapshotData = {

    nickname:
      card.nickname || '',

    issuer:
      card.issuer || '',

    network:
      card.network || '',

    last4:
      card.last4 || ''
  };
}

  

  // ------------------------------------------------------
  // Read Items
  // ------------------------------------------------------

  const itemElements =
    document.querySelectorAll(
      '#items .item'
    );


  const items = [];


  itemElements.forEach(item => {

    const productInput =
      item.querySelector(
        '.itemProduct'
      ).value;


    const product =
      formatDisplayName(
        productInput
      );


    const productKey =
      normalizeNameKey(
        productInput
      );


    const brandInput =
      item.querySelector(
        '.itemBrand'
      ).value;


    const brand =
      brandInput
        ? formatDisplayName(
            brandInput
          )
        : '';


    const brandKey =
      brandInput
        ? normalizeNameKey(
            brandInput
          )
        : '';


    const category =
      item.querySelector(
        '.itemCategory'
      ).value;


    const unitsPerPackage =
      Number(
        item.querySelector(
          '.itemUnitsPerPackage'
        ).value
      ) || 1;


    const capacityInput =
      item.querySelector(
        '.itemCapacity'
      ).value;


    const capacity =
      capacityInput === ''
        ? null
        : Number(
            capacityInput
          );


    const unit =
      item.querySelector(
        '.itemUnit'
      ).value;


    const quantity =
      Number(
        item.querySelector(
          '.itemQuantity'
        ).value
      ) || 1;


    const originalPricePerPackage =
      Number(
        item.querySelector(
          '.itemPrice'
        ).value
      ) || 0;


    const hasDiscount =
      item.querySelector(
        '.itemHasDiscount'
      ).checked === true;


    const discountedTotalInput =
      item.querySelector(
        '.itemDiscountedTotal'
      ).value;


    const discountedTotal =
      hasDiscount &&
      discountedTotalInput !== ''
        ? Number(
            discountedTotalInput
          )
        : null;


    const promotionNote =
      hasDiscount
        ? item.querySelector(
            '.itemPromotionNote'
          ).value.trim()
        : '';


    const notes =
      item.querySelector(
        '.itemNotes'
      )?.value.trim() || '';


    const result =
      calculateItemTotal(item);


    items.push({

      product,
      productKey,

      brand,
      brandKey,

      category,

      unitsPerPackage,
      capacity,
      unit,

      quantity,

      originalPricePerPackage,

      originalSubtotal:
        result.originalSubtotal,

      hasDiscount,

      discountedTotal,

      effectiveDiscountRate:
        result.effectiveRate,

      promotionNote,

      notes,

      finalTotal:
        result.finalTotal

    });
  });


  // ------------------------------------------------------
  // Remove Empty Items
  // ------------------------------------------------------

  const meaningfulItems =
    items.filter(item =>

      item.product ||
      item.brand ||
      item.category ||
      item.originalPricePerPackage > 0

    );


  if (meaningfulItems.length === 0) {

    alert(
      lang === 'zh-TW'
        ? '請至少輸入一個品項。'
        : 'Please enter at least one item.'
    );

    return;
  }


  // ------------------------------------------------------
  // Required Item Validation
  // ------------------------------------------------------

  const invalidItem =
    meaningfulItems.some(item =>

      !item.product ||
      item.quantity <= 0 ||
      item.originalPricePerPackage < 0

    );


  if (invalidItem) {

    alert(
      lang === 'zh-TW'
        ? '每個品項都必須填寫產品名稱、購買數量與每包原價。'
        : 'Each item requires a product name, purchase quantity, and original price.'
    );

    return;
  }


  // ------------------------------------------------------
  // Discount Validation
  // ------------------------------------------------------

  const incompleteDiscount =
    Array.from(
      itemElements
    )
      .some(item => {

        const hasDiscount =
          item.querySelector(
            '.itemHasDiscount'
          ).checked === true;


        const discountedTotal =
          item.querySelector(
            '.itemDiscountedTotal'
          ).value;


        return (
          hasDiscount &&
          discountedTotal === ''
        );
      });


  if (incompleteDiscount) {

    alert(
      lang === 'zh-TW'
        ? '有勾選優惠的品項，請填寫「優惠後總額」。'
        : 'Please enter the discounted total for every item marked as a promotion.'
    );

    return;
  }


  // ------------------------------------------------------
  // Receipt-Level Totals
  // ------------------------------------------------------

  const receiptDiscount =
    Number(
      document.querySelector(
        '#receiptDiscount'
      ).value
    ) || 0;


  const tax =
    Number(
      document.querySelector(
        '#receiptTax'
      ).value
    ) || 0;


  const fees =
    Number(
      document.querySelector(
        '#receiptFees'
      ).value
    ) || 0;


  const originalItemsSubtotal =
    meaningfulItems.reduce(
      (sum, item) =>
        sum +
        item.originalSubtotal,
      0
    );


  const itemsSubtotal =
    meaningfulItems.reduce(
      (sum, item) =>
        sum +
        item.finalTotal,
      0
    );


  const itemDiscountTotal =
    meaningfulItems.reduce(
      (sum, item) =>
        sum +
        Math.max(
          item.originalSubtotal -
          item.finalTotal,
          0
        ),
      0
    );


  const total =
    Math.max(
      itemsSubtotal -
      receiptDiscount +
      tax +
      fees,
      0
    );


  // ------------------------------------------------------
  // Categories
  // ------------------------------------------------------

  const categories =
    [
      ...new Set(

        meaningfulItems
          .map(
            item =>
              item.category
          )
          .filter(Boolean)

      )
    ];


  // ------------------------------------------------------
  // Save to Firestore
  // ------------------------------------------------------

  try {

    const receiptRef =
      await addDoc(

        collection(
          db,
          'receipts'
        ),

        {

          store,
          storeKey,

          branch,
          purchaseType,

          purchaseDate,
          purchaseTime,
          timezone,

          currency,

          paymentMethod,

          // ============================================
          // Card Snapshot
          // ============================================
          //
          // cardId keeps the relationship to the current
          // Card document.
          //
          // cardSnapshot preserves what the card looked
          // like when THIS Receipt was created.
          // ============================================

          cardId,
          cardSnapshot:
            cardSnapshotData,

          // ============================================
          // Confirmation Assignment Snapshot
          // ============================================
          //
          // This array belongs to the Receipt itself.
          //
          // Future changes to the Card's confirmation users
          // must NOT modify this Receipt.
          // ============================================

          confirmationUserIds,

          // Temporary backward compatibility.
          //
          // Existing confirmation modules still use this
          // field until they are migrated.

          confirmationUserId,

          originalItemsSubtotal,

          itemsSubtotal,

          itemDiscountTotal,

          receiptDiscount,

          tax,

          fees,

          total,


          // ============================================
          // Foreign Currency Settlement
          // ============================================

          foreignCurrencySettlementOffered,


          expectedSettlementCurrency:
            foreignCurrencySettlementOffered
              ? currency
              : null,


          categories,

          status,


          createdAt:
            serverTimestamp(),


          createdBy:
            currentUser.uid,


          updatedAt:
            serverTimestamp(),


          updatedBy:
            currentUser.uid,


          submittedAt:
            status === 'pending'
              ? serverTimestamp()
              : null,
          submittedDate:
            status === 'pending'
              ? localSubmittedDate
              : null
        }
      );


    // ----------------------------------------------------
    // Save Items
    // ----------------------------------------------------

    for (
      const item of meaningfulItems
    ) {

      await addDoc(

        collection(
          db,
          'receipts',
          receiptRef.id,
          'items'
        ),

        {

          ...item,


          createdAt:
            serverTimestamp(),


          createdBy:
            currentUser.uid
        }
      );
    }


    // ----------------------------------------------------
    // Merchant Currency-Choice History
    // ----------------------------------------------------

    if (
      status === 'pending' &&
      foreignCurrencySettlementOffered
    ) {

      await addDoc(

        collection(
          db,
          'merchantCurrencyOptions'
        ),

        {

          storeName:
            store,

          storeKey:
            storeKey,

          branch:
            branch || '',

          settlementCurrency:
            currency,

          categories,

          sourceReceiptId:
            receiptRef.id,

          observedPurchaseDate:
            purchaseDate,

          observedAt:
            serverTimestamp(),

          createdAt:
            serverTimestamp(),

          createdBy:
            currentUser.uid
        }
      );
    }


    // ----------------------------------------------------
    // Success
    // ----------------------------------------------------

    alert(

      status === 'draft'

        ? (

            lang === 'zh-TW'
              ? '草稿已儲存。'
              : 'Draft saved.'

          )

        : (

            lang === 'zh-TW'
              ? '收據已送出等待確認。'
              : 'Receipt submitted for confirmation.'

          )
    );


    location.hash =
      '#dashboard';


  } catch (error) {

    console.error(
      'Failed to save receipt:',
      error
    );


    alert(

      `${
        lang === 'zh-TW'
          ? '儲存收據失敗'
          : 'Failed to save receipt'
      }: ${error.message}`

    );
  }
}
