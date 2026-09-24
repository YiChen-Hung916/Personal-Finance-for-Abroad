import { t } from './i18n.js';
import { firebaseConfig } from './firebase-config.js';

import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Firebase
// ======================================================

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();


// ======================================================
// App state
// ======================================================

let lang = localStorage.getItem('ff-lang') || 'zh-TW';

let currentUser = null;
let currentRole = null;
let currentProfile = null;


// ======================================================
// DOM
// ======================================================

const login = document.querySelector('#loginView');
const app = document.querySelector('#appView');
const page = document.querySelector('#page');
const drawer = document.querySelector('#drawer');

const authMessage = document.querySelector('#authMessage');
const googleLoginButton = document.querySelector('#googleLogin');


// ======================================================
// Helpers
// ======================================================

function money(v, c = 'USD') {
  return `${c} ${Number(v).toFixed(2)}`;
}

function resetLoginView() {
  login.querySelector('h1').textContent =
    'Personal Finance for Abroad';

  login.querySelector('p').textContent =
    lang === 'zh-TW'
      ? '私人家庭財務核對系統'
      : 'Private family finance reconciliation system';

  googleLoginButton.hidden = false;

  googleLoginButton.textContent =
    lang === 'zh-TW'
      ? '使用 Google 登入'
      : 'Sign in with Google';

  authMessage.innerHTML = '';
}

function showAccessDenied() {
  login.hidden = false;
  app.hidden = true;

  login.querySelector('h1').textContent =
    lang === 'zh-TW'
      ? '無權存取'
      : 'Access Denied';

  login.querySelector('p').textContent =
    lang === 'zh-TW'
      ? '此 Google 帳號尚未獲得 Personal Finance for Abroad 的使用權限。'
      : 'This Google account is not authorized to use Personal Finance for Abroad.';

  googleLoginButton.hidden = true;

  authMessage.innerHTML = `
    <button id="deniedSignOut" class="primary">
      ${
        lang === 'zh-TW'
          ? '登出並使用其他帳號'
          : 'Sign out and use another account'
      }
    </button>
  `;

  document.querySelector('#deniedSignOut').onclick = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };
}


// ======================================================
// Menu
// ======================================================

function menu(role) {
  const owner = role === 'owner';

  const roleMenu = owner
    ? `
      <a href="#new-receipt">
        ＋ ${t('newReceipt', lang)}
      </a>

      <a href="#pending">
        ${t('pendingAll', lang)}
      </a>

      <a href="#my-confirmations">
        ${t('myConfirm', lang)}
      </a>

      <a href="#history">
        ${t('history', lang)}
      </a>

      <a href="#promotions">
        ${t('promos', lang)}
      </a>

      <hr>

      <a href="#cards">
        Cards & Accounts
      </a>
      
      <a href="#management">
        Stores / Products / Users
      </a>
    `
    : `
      <a href="#my-confirmations">
        ${t('myConfirm', lang)}
      </a>

      <a href="#related">
        My Related Receipts
      </a>

      <a href="#transfer">
        ＋ Record Transfer
      </a>

      <a href="#unmatched">
        Report Unmatched Transaction
      </a>

      <a href="#history">
        ${t('history', lang)}
      </a>
    `;

  return `
    <a href="#dashboard">
      ${t('dashboard', lang)}
    </a>

    ${roleMenu}

    <hr>

    <button id="signOutBtn" class="menu-link">
      ${lang === 'zh-TW' ? '登出' : 'Sign Out'}
    </button>
  `;
}

function bindMenuEvents() {
  const signOutButton = document.querySelector('#signOutBtn');

  if (signOutButton) {
    signOutButton.onclick = async () => {
      try {
        await signOut(auth);
        drawer.hidden = true;
        location.hash = '';
      } catch (error) {
        console.error('Sign-out error:', error);
      }
    };
  }
}

function renderMenu() {
  if (!currentRole) {
    drawer.innerHTML = '';
    return;
  }

  drawer.innerHTML = menu(currentRole);
  bindMenuEvents();
}


// ======================================================
// Dashboard
// ======================================================

function dashboard() {
  const isOwner = currentRole === 'owner';

  if (isOwner) {
    page.innerHTML = `
      <div class="actions">
        <button onclick="location.hash='#new-receipt'">
          ＋ ${t('newReceipt', lang)}
        </button>
      </div>

      <section class="panel">
        <h2>${t('myConfirm', lang)}</h2>

        <div class="activity">
          <span>Sep 17</span>
          <span>Target</span>
          <span>USD 42.87 · Pending</span>
        </div>

        <a href="#my-confirmations">
          ${t('viewAll', lang)}
        </a>
      </section>

      <section class="panel">
        <h2>${t('waiting', lang)}</h2>

        <p>
          <b>Mom</b> · 3 pending · oldest 10 days
        </p>

        <p>
          <b>Dad</b> · 1 pending · oldest 2 days
        </p>

        <a href="#pending">
          ${t('viewAll', lang)}
        </a>
      </section>

      <section class="panel">
        <h2>Refunds</h2>

        <div class="activity">
          <span>Sep 15</span>
          <span>Target</span>
          <span>USD 24.99 · Pending</span>
        </div>
      </section>

      <section class="panel">
        <h2>Transfers</h2>

        <div class="activity">
          <span>Sep 16</span>
          <span>Family → Checking</span>
          <span>USD 1,000 · Received</span>
        </div>
      </section>

      <section class="panel">
        <h2>${t('recent', lang)}</h2>

        ${
          [
            'Trader Joe’s',
            'Amazon',
            'Target',
            'Giant Eagle',
            'Costco'
          ]
            .map(
              (x, i) => `
                <div class="activity">
                  <span>Sep ${18 - i}</span>
                  <span>${x}</span>
                  <span>Confirmed</span>
                </div>
              `
            )
            .join('')
        }

        <a href="#history">
          ${t('viewAll', lang)}
        </a>
      </section>
    `;

    return;
  }

  // Authorized User dashboard
  page.innerHTML = `
    <section class="panel">
      <h2>
        ${
          lang === 'zh-TW'
            ? '需要你確認'
            : 'Need Your Confirmation'
        }
      </h2>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '這裡之後只會顯示指派給你的待確認交易。'
            : 'Only transactions assigned to you will appear here.'
        }
      </p>

      <a href="#my-confirmations">
        ${t('viewAll', lang)}
      </a>
    </section>

    <section class="panel">
      <h2>
        ${
          lang === 'zh-TW'
            ? '最近活動'
            : 'Recent Activity'
        }
      </h2>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '你可以查看所有收據，但只能回報指派給你的交易。'
            : 'You may view all receipts, but can only report on transactions assigned to you.'
        }
      </p>
    </section>
  `;
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
  // Render form FIRST
  // ------------------------------------------------------

  page.innerHTML = `

    <section class="panel">

      <h1>
        ${t('newReceipt', lang)}
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
      <!-- Currency + Receipt Total + Payment Method -->
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

    ${
      lang === 'zh-TW'
        ? '付款方式'
        : 'Payment Method'
    }

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

          <input
            id="receiptTotal"
            type="text"
            value="0.00"
            readonly
          >

        </label>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '付款方式'
              : 'Payment Method'
          }

          <select id="receiptPaymentMethod">

            <option value="card">

              ${
                lang === 'zh-TW'
                  ? '信用卡'
                  : 'Card'
              }
              <sup class="required-mark">*</sup>

            </option>


            <option value="cash">

              ${
                lang === 'zh-TW'
                  ? '付現'
                  : 'Cash'
              }
              <sup class="required-mark">*</sup>

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
      <!-- Foreign-currency settlement -->
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


          <small class="muted">

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
  // Bind events AFTER rendering HTML
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
    <!-- Package information -->
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
    <!-- Promotion checkbox -->
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
    <!-- Promotion details -->
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
    <!-- Calculated item amounts -->
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
    <!-- Photos -->
    <!-- ============================================== -->

    <label class="field">

      ${
        lang === 'zh-TW'
          ? '照片（選填）'
          : 'Photos (optional)'
      }

      <input
        class="itemPhotos"
        type="file"
        multiple
      >

    </label>
  `;


  document
    .querySelector('#items')
    .appendChild(d);


  // ------------------------------------------------------
  // Discount show/hide
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
  // Recalculate when item changes
  // ------------------------------------------------------

  d.querySelectorAll(
  'input:not([type="file"]):not(.itemOriginalSubtotal), select'
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
  // Use manual subtotal if Owner adjusted it
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
  // Final item total
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
  // Effective discount rate
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


  // Effective rate:
  //
  // $20 original → $10 actual
  // 10 / 20 = 0.5
  // Chinese display = 5折
  //
  // $20 original → $15 actual
  // 15 / 20 = 0.75
  // Chinese display = 7.5折

  let effectiveRate = 1;


  if (originalSubtotal > 0) {

    effectiveRate =
      finalTotal /
      originalSubtotal;
  }


  return {
    originalSubtotal,
    finalTotal,
    effectiveRate
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


    // ----------------------------------------------------
    // Original subtotal
    // ----------------------------------------------------
    //
    // Only auto-fill if Owner has NOT manually adjusted it.
    // ----------------------------------------------------

    if (
      originalSubtotalField &&
      result.manualOverride !== true
    ) {

      originalSubtotalField.value =
        result.calculatedOriginalSubtotal
          .toFixed(2);
    }


    // ----------------------------------------------------
    // Item final price
    // ----------------------------------------------------

    if (finalPriceField) {

      finalPriceField.value =
        result.finalTotal
          .toFixed(2);
    }


    // ----------------------------------------------------
    // Effective discount
    // ----------------------------------------------------

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


  // ------------------------------------------------------
  // Total receipt savings
  // ------------------------------------------------------

  const receiptDiscountField =
    document.querySelector(
      '#receiptDiscount'
    );


  if (receiptDiscountField) {

    receiptDiscountField.value =
      totalSavings.toFixed(2);
  }


  // ------------------------------------------------------
  // Tax
  // ------------------------------------------------------

  const tax =
    Number(
      document.querySelector(
        '#receiptTax'
      )?.value
    ) || 0;


  // ------------------------------------------------------
  // Tip / Other Fees
  // ------------------------------------------------------

  const fees =
    Number(
      document.querySelector(
        '#receiptFees'
      )?.value
    ) || 0;


  // ------------------------------------------------------
  // Receipt Total
  //
  // IMPORTANT:
  //
  // Item discounts have ALREADY been reflected in
  // itemsFinalTotal.
  //
  // Therefore totalSavings must NOT be deducted again.
  // ------------------------------------------------------

  const receiptTotal =
    Math.max(
      itemsFinalTotal +
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


    itemsTotal +=
      result.finalTotal;
  });


  // ------------------------------------------------------
  // Receipt-level discount
  // ------------------------------------------------------

  const receiptDiscount =
    Number(
      document.querySelector(
        '#receiptDiscount'
      )?.value
    ) || 0;


  // ------------------------------------------------------
  // Tax
  // ------------------------------------------------------

  const tax =
    Number(
      document.querySelector(
        '#receiptTax'
      )?.value
    ) || 0;


  // ------------------------------------------------------
  // Tip / fees
  // ------------------------------------------------------

  const fees =
    Number(
      document.querySelector(
        '#receiptFees'
      )?.value
    ) || 0;


  // ------------------------------------------------------
  // Final receipt total
  // ------------------------------------------------------

  const receiptTotal =
    Math.max(
      itemsTotal -
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
  // Basic receipt fields
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


  // This is the currency printed on the receipt
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


  // If checked:
  //
  // Merchant offered a currency choice
  // AND
  // user chose foreign-currency settlement.
  //
  // We do NOT ask for another currency because
  // the expected settlement currency is the receipt
  // currency.

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
  // Get card and snapshot confirmer
  // ------------------------------------------------------

  let confirmationUserId =
    null;


  if (paymentMethod === 'card') {

    const cardSnapshot =
      await getDoc(
        doc(
          db,
          'cards',
          cardId
        )
      );


    if (!cardSnapshot.exists()) {

      alert(
        lang === 'zh-TW'
          ? '找不到所選信用卡。'
          : 'Selected card could not be found.'
      );

      return;
    }


    const card =
      cardSnapshot.data();


    if (card.active !== true) {

      alert(
        lang === 'zh-TW'
          ? '這張信用卡目前已停用。'
          : 'This card is currently inactive.'
      );

      return;
    }


    confirmationUserId =
      card.confirmationUserId ||
      null;
  }


  // ------------------------------------------------------
  // Read items
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

      finalTotal:
        result.finalTotal

    });
  });


  // ------------------------------------------------------
  // Remove completely empty items
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
// Required item validation
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
  // If discount checked, discounted total is required
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
  // Receipt-level totals
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


  // IMPORTANT:
  // use finalTotal after item-level discounts

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


const receiptDiscount =
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
    itemsSubtotal +
    tax +
    fees,
    0
  );


  // ------------------------------------------------------
  // Collect categories
  // Used later for merchant settlement-currency history
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

          // Currency shown on the receipt
          currency,

          paymentMethod,

          cardId,

          // Snapshot of the assigned confirmer
          confirmationUserId,
          originalItemsSubtotal,
          itemsSubtotal,
          receiptDiscount,
          tax,
          fees,
          total,


          // ============================================
          // Foreign currency settlement
          // ============================================

          foreignCurrencySettlementOffered,


          // This makes future confirmation logic clearer:
          //
          // if true, the expected currency shown in the
          // bank/card notification should match the
          // receipt currency.

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
              : null
        }
      );


    // ----------------------------------------------------
    // Save items
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
    // Merchant currency-choice history
    // ----------------------------------------------------
    //
    // Only create this record when:
    //
    // 1. receipt is actually submitted
    // 2. merchant offered foreign-currency settlement
    //
    // Drafts DO NOT create this observation.
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

          // Branch is only context.
          // It does NOT define merchant identity.
          branch:
            branch || '',


          // The receipt currency is also the currency
          // chosen for settlement.

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


// ======================================================
// END OF RECEIPT MODULE
// ======================================================


// ======================================================
// Cards
// ======================================================

async function cardsPage() {

  if (currentRole !== 'owner') {
    page.innerHTML = `
      <section class="panel">
        <h1>Access Denied</h1>
        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以管理信用卡。'
              : 'Only owners can manage cards.'
          }
        </p>
      </section>
    `;
    return;
  }

  page.innerHTML = `
    <section class="panel">

      <div class="actions">
        <h1>
          ${lang === 'zh-TW' ? '信用卡' : 'Cards'}
        </h1>

        <button id="newCardBtn" class="primary">
          ＋ ${lang === 'zh-TW' ? '新增信用卡' : 'Add Card'}
        </button>
      </div>

      <div id="cardList">
        <p class="muted">
          ${lang === 'zh-TW' ? '載入中…' : 'Loading…'}
        </p>
      </div>

    </section>
  `;

  document.querySelector('#newCardBtn').onclick =
    showNewCardForm;

  await loadCards();
}


async function loadCards() {

  const cardList =
    document.querySelector('#cardList');

  try {

    const q = query(
      collection(db, 'cards'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      cardList.innerHTML = `
        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '目前尚未新增信用卡。'
              : 'No cards have been added yet.'
          }
        </p>
      `;

      return;
    }

    cardList.innerHTML = snapshot.docs
      .map(cardDoc => {

        const card = cardDoc.data();

        return `
          <div class="item">

            <h3>
              ${escapeHtml(card.nickname || '')}
            </h3>

            <p>
              ${escapeHtml(card.issuer || '')}
              ·
              ${escapeHtml(card.network || '')}
            </p>

            <p>
              •••• ${escapeHtml(card.last4 || '')}
            </p>

            <p class="muted">
              ${
                card.active === true
                  ? (lang === 'zh-TW' ? '使用中' : 'Active')
                  : (lang === 'zh-TW' ? '已封存' : 'Archived')
              }
            </p>

            <button
              class="editCardBtn"
              data-id="${cardDoc.id}"
            >
              ${lang === 'zh-TW' ? '編輯' : 'Edit'}
            </button>

          </div>
        `;
      })
      .join('');

    document
      .querySelectorAll('.editCardBtn')
      .forEach(button => {

        button.onclick = () => {
          editCard(button.dataset.id);
        };

      });

  } catch (error) {

    console.error(
      'Failed to load cards:',
      error
    );

    cardList.innerHTML = `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '無法載入信用卡資料。'
            : 'Unable to load cards.'
        }
      </p>
    `;
  }
}


// ======================================================
// New Card
// ======================================================

async function showNewCardForm() {

  let users = [];

  try {

    const snapshot =
      await getDocs(collection(db, 'users'));

    users = snapshot.docs
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
      );

  } catch (error) {

    console.error(
      'Failed to load users:',
      error
    );

  }

  const confirmerOptions = users
    .map(user => {

      const name =
        user.displayName ||
        user.id;

      return `
        <option value="${user.id}">
          ${escapeHtml(name)}
        </option>
      `;
    })
    .join('');

  page.innerHTML = `
    <section class="panel">

      <h1>
        ${lang === 'zh-TW'
          ? '新增信用卡'
          : 'Add Card'}
      </h1>

      <div class="row">

        <label class="field">
          ${lang === 'zh-TW'
            ? '卡片暱稱'
            : 'Card nickname'}

          <input
            id="cardNickname"
            placeholder="US Daily"
          >
        </label>

        <label class="field">
          ${lang === 'zh-TW'
            ? '發卡銀行'
            : 'Issuer'}

          <input
            id="cardIssuer"
            placeholder="Chase"
          >
        </label>

      </div>


      <div class="row">

        <label class="field">
          ${lang === 'zh-TW'
            ? '卡別'
            : 'Network'}

          <select id="cardNetwork">
            <option value="Visa">Visa</option>
            <option value="Mastercard">Mastercard</option>
            <option value="JCB">JCB</option>
            <option value="American Express">
              American Express
            </option>
            <option value="Other">Other</option>
          </select>
        </label>


        <label class="field">
          ${lang === 'zh-TW'
            ? '卡號末四碼'
            : 'Last 4 digits'}

          <input
            id="cardLast4"
            inputmode="numeric"
            maxlength="4"
            placeholder="1234"
          >
        </label>

      </div>


      <label class="field">

        ${
          lang === 'zh-TW'
            ? '交易確認人'
            : 'Confirmation user'
        }

        <select id="confirmationUser">
          <option value="">
            ${
              lang === 'zh-TW'
                ? '請選擇…'
                : 'Select…'
            }
          </option>

          ${confirmerOptions}

        </select>

      </label>


      <p id="cardFormMessage" class="muted"></p>


      <div class="actions">

        <button id="cancelCard">
          ${
            lang === 'zh-TW'
              ? '取消'
              : 'Cancel'
          }
        </button>

        <button
          id="saveCard"
          class="primary"
        >
          ${
            lang === 'zh-TW'
              ? '儲存'
              : 'Save'
          }
        </button>

      </div>

    </section>
  `;


  document.querySelector('#cancelCard').onclick =
    cardsPage;

  document.querySelector('#saveCard').onclick =
    saveNewCard;
}


async function saveNewCard() {

  const nickname =
    document
      .querySelector('#cardNickname')
      .value
      .trim();

  const issuer =
    document
      .querySelector('#cardIssuer')
      .value
      .trim();

  const network =
    document
      .querySelector('#cardNetwork')
      .value;

  const last4 =
    document
      .querySelector('#cardLast4')
      .value
      .trim();

  const confirmationUserId =
    document
      .querySelector('#confirmationUser')
      .value;

  const message =
    document.querySelector('#cardFormMessage');


  if (!nickname) {
    message.textContent =
      lang === 'zh-TW'
        ? '請輸入卡片暱稱。'
        : 'Please enter a card nickname.';

    return;
  }


  if (!issuer) {
    message.textContent =
      lang === 'zh-TW'
        ? '請輸入發卡銀行。'
        : 'Please enter the issuer.';

    return;
  }


  if (!/^\d{4}$/.test(last4)) {
    message.textContent =
      lang === 'zh-TW'
        ? '末四碼必須是 4 位數字。'
        : 'Last 4 digits must contain exactly four numbers.';

    return;
  }


  if (!confirmationUserId) {
    message.textContent =
      lang === 'zh-TW'
        ? '請選擇交易確認人。'
        : 'Please select a confirmation user.';

    return;
  }


  message.textContent =
    lang === 'zh-TW'
      ? '正在儲存…'
      : 'Saving…';


  try {

    await addDoc(
      collection(db, 'cards'),
      {
        nickname,
        issuer,
        network,
        last4,
        confirmationUserId,

        active: true,

        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,

        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      }
    );


    await cardsPage();

  } catch (error) {

    console.error(
      'Failed to save card:',
      error
    );

    message.textContent =
      lang === 'zh-TW'
        ? '儲存失敗。'
        : 'Unable to save card.';
  }
}


// ======================================================
// Edit Card
// ======================================================

async function editCard(cardId) {

  try {

    const cardRef =
      doc(db, 'cards', cardId);

    const snapshot =
      await getDoc(cardRef);

    if (!snapshot.exists()) {
      return;
    }

    const card = snapshot.data();


    const usersSnapshot =
      await getDocs(collection(db, 'users'));

    const users =
      usersSnapshot.docs
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
        );


    const confirmerOptions =
      users.map(user => {

        const name =
          user.displayName ||
          user.id;

        const selected =
          user.id === card.confirmationUserId
            ? 'selected'
            : '';

        return `
          <option
            value="${user.id}"
            ${selected}
          >
            ${escapeHtml(name)}
          </option>
        `;
      })
      .join('');


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '編輯信用卡'
              : 'Edit Card'
          }
        </h1>


        <div class="row">

          <label class="field">

            ${
              lang === 'zh-TW'
                ? '卡片暱稱'
                : 'Card nickname'
            }

            <input
              id="cardNickname"
              value="${escapeHtml(card.nickname || '')}"
            >

          </label>


          <label class="field">

            ${
              lang === 'zh-TW'
                ? '發卡銀行'
                : 'Issuer'
            }

            <input
              id="cardIssuer"
              value="${escapeHtml(card.issuer || '')}"
            >

          </label>

        </div>


        <div class="row">

          <label class="field">

            ${
              lang === 'zh-TW'
                ? '卡別'
                : 'Network'
            }

            <select id="cardNetwork">

              ${[
                'Visa',
                'Mastercard',
                'JCB',
                'American Express',
                'Other'
              ].map(network => `
                <option
                  value="${network}"
                  ${
                    card.network === network
                      ? 'selected'
                      : ''
                  }
                >
                  ${network}
                </option>
              `).join('')}

            </select>

          </label>


          <label class="field">

            ${
              lang === 'zh-TW'
                ? '卡號末四碼'
                : 'Last 4 digits'
            }

            <input
              id="cardLast4"
              maxlength="4"
              inputmode="numeric"
              value="${escapeHtml(card.last4 || '')}"
            >

          </label>

        </div>


        <label class="field">

          ${
            lang === 'zh-TW'
              ? '交易確認人'
              : 'Confirmation user'
          }

          <select id="confirmationUser">
            ${confirmerOptions}
          </select>

        </label>


        <label class="field">

          <input
            type="checkbox"
            id="cardActive"
            ${card.active === true ? 'checked' : ''}
          >

          ${
            lang === 'zh-TW'
              ? '使用中'
              : 'Active'
          }

        </label>


        <p
          id="cardFormMessage"
          class="muted"
        ></p>


        <div class="actions">

          <button id="cancelCard">
            ${
              lang === 'zh-TW'
                ? '取消'
                : 'Cancel'
            }
          </button>

          <button
            id="saveCard"
            class="primary"
          >
            ${
              lang === 'zh-TW'
                ? '儲存變更'
                : 'Save Changes'
            }
          </button>

        </div>

      </section>
    `;


    document.querySelector('#cancelCard').onclick =
      cardsPage;


    document.querySelector('#saveCard').onclick =
      async () => {

        const nickname =
          document
            .querySelector('#cardNickname')
            .value
            .trim();

        const issuer =
          document
            .querySelector('#cardIssuer')
            .value
            .trim();

        const network =
          document
            .querySelector('#cardNetwork')
            .value;

        const last4 =
          document
            .querySelector('#cardLast4')
            .value
            .trim();

        const confirmationUserId =
          document
            .querySelector('#confirmationUser')
            .value;

        const active =
          document
            .querySelector('#cardActive')
            .checked;

        const message =
          document
            .querySelector('#cardFormMessage');


        if (!nickname || !issuer) {
          message.textContent =
            lang === 'zh-TW'
              ? '請填寫卡片暱稱與發卡銀行。'
              : 'Please enter nickname and issuer.';

          return;
        }


        if (!/^\d{4}$/.test(last4)) {
          message.textContent =
            lang === 'zh-TW'
              ? '末四碼必須是 4 位數字。'
              : 'Last 4 digits must contain exactly four numbers.';

          return;
        }


        if (!confirmationUserId) {
          message.textContent =
            lang === 'zh-TW'
              ? '請選擇交易確認人。'
              : 'Please select a confirmation user.';

          return;
        }


        try {

          await updateDoc(
            cardRef,
            {
              nickname,
              issuer,
              network,
              last4,
              confirmationUserId,
              active,

              updatedAt: serverTimestamp(),
              updatedBy: currentUser.uid
            }
          );

          await cardsPage();

        } catch (error) {

          console.error(
            'Failed to update card:',
            error
          );

          message.textContent =
            lang === 'zh-TW'
              ? '更新失敗。'
              : 'Unable to update card.';
        }
      };

  } catch (error) {

    console.error(
      'Failed to open card:',
      error
    );
  }
}


// ======================================================
// HTML escaping
// ======================================================

function escapeHtml(value) {

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// ======================================================
// Placeholder
// ======================================================

function placeholder(title) {
  page.innerHTML = `
    <section class="panel">
      <h1>${title}</h1>

      <p class="muted">
        This module is wired into the V1 project structure
        and will use Firestore data after Firebase setup.
      </p>
    </section>
  `;
}


// ======================================================
// Name Normalization Helpers
// ======================================================

// Used for matching/searching.
//
// Examples:
// " Target "       -> "target"
// "GIANT   EAGLE"  -> "giant eagle"
// "Macy's"         -> "macy's"
//
// IMPORTANT:
// We do NOT remove apostrophes or other punctuation.
// "Macy's" and "Macys" remain different until Owner merges them.

function normalizeNameKey(value) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}


// ------------------------------------------------------
// Default display name
//
// target       -> Target
// giant eagle  -> Giant Eagle
// macy's       -> Macy's
//
// This is only the DEFAULT display.
// Later Owner can manually change the canonical display name.
// ------------------------------------------------------

function formatDisplayName(value) {

  const cleaned =
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();


  return cleaned.replace(
    /(^|[\s-])([a-z])/g,
    (match, separator, letter) =>
      separator + letter.toUpperCase()
  );
}


// ======================================================
// Routing
// ======================================================

function route() {
  // Never render application pages without authorization.
  if (!currentUser || !currentRole) {
    return;
  }

  const r = location.hash.slice(1) || 'dashboard';

  if (r === 'dashboard') {
    dashboard();
  } else if (r === 'new-receipt') {
    receiptForm();
  } else if (r === 'cards') {
    cardsPage();
  } else {
    placeholder(r.replaceAll('-', ' '));
  }

  drawer.hidden = true;
}


// ======================================================
// Google Login
// ======================================================

googleLoginButton.onclick = async () => {
  authMessage.textContent =
    lang === 'zh-TW'
      ? '正在登入…'
      : 'Signing in…';

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error('Google sign-in error:', error);

    authMessage.textContent =
      `${
        lang === 'zh-TW'
          ? '登入失敗'
          : 'Sign-in failed'
      }: ${error.message}`;
  }
};


// ======================================================
// Authentication + Firestore authorization
// ======================================================

onAuthStateChanged(auth, async (user) => {

  // --------------------------------------------------
  // Signed out
  // --------------------------------------------------

  if (!user) {
    currentUser = null;
    currentRole = null;
    currentProfile = null;

    drawer.innerHTML = '';

    app.hidden = true;
    login.hidden = false;

    resetLoginView();

    return;
  }


  // --------------------------------------------------
  // Firebase Authentication succeeded
  // --------------------------------------------------

  currentUser = user;

  console.log('Firebase user:', user);
  console.log('UID:', user.uid);

  authMessage.textContent =
    lang === 'zh-TW'
      ? '正在驗證使用權限…'
      : 'Checking access…';


  // Keep the application hidden until authorization
  // has been verified.
  app.hidden = true;


  try {

    // users/{Firebase UID}
    const profileRef = doc(
      db,
      'users',
      user.uid
    );

    const profileSnap = await getDoc(profileRef);


    // ------------------------------------------------
    // No Firestore authorization profile
    // ------------------------------------------------

    if (!profileSnap.exists()) {
      console.warn(
        'No authorized user profile for UID:',
        user.uid
      );

      currentRole = null;
      currentProfile = null;

      showAccessDenied();

      return;
    }


    const profile = profileSnap.data();


    // ------------------------------------------------
    // Account disabled
    // ------------------------------------------------

    if (profile.active !== true) {
      console.warn(
        'User account is inactive:',
        user.uid
      );

      currentRole = null;
      currentProfile = null;

      showAccessDenied();

      return;
    }


    // ------------------------------------------------
    // Validate role
    // ------------------------------------------------

    if (
      profile.role !== 'owner' &&
      profile.role !== 'authorizedUser'
    ) {
      console.warn(
        'Invalid user role:',
        profile.role
      );

      currentRole = null;
      currentProfile = null;

      showAccessDenied();

      return;
    }


    // ------------------------------------------------
    // Authorized
    // ------------------------------------------------

    currentProfile = profile;
    currentRole = profile.role;

    console.log(
      'Authorized role:',
      currentRole
    );

    authMessage.textContent = '';

    login.hidden = true;
    app.hidden = false;

    renderMenu();
    route();

  } catch (error) {

    console.error(
      'Authorization check failed:',
      error
    );

    currentRole = null;
    currentProfile = null;

    login.hidden = false;
    app.hidden = true;

    login.querySelector('h1').textContent =
      lang === 'zh-TW'
        ? '權限驗證失敗'
        : 'Authorization Error';

    login.querySelector('p').textContent =
      lang === 'zh-TW'
        ? '目前無法驗證此帳號的使用權限。'
        : 'Unable to verify access for this account.';

    googleLoginButton.hidden = true;

    authMessage.innerHTML = `
      <button id="authErrorSignOut" class="primary">
        ${
          lang === 'zh-TW'
            ? '登出並重試'
            : 'Sign out and try again'
        }
      </button>
    `;

    document.querySelector(
      '#authErrorSignOut'
    ).onclick = async () => {
      await signOut(auth);
    };
  }
});


// ======================================================
// Hamburger Menu
// ======================================================

document.querySelector('#menuBtn').onclick = () => {
  drawer.hidden = !drawer.hidden;
};


// ======================================================
// Language
// ======================================================

document.querySelector('#langBtn').onclick = () => {

  lang =
    lang === 'zh-TW'
      ? 'en'
      : 'zh-TW';

  localStorage.setItem(
    'ff-lang',
    lang
  );

  document.querySelector('#langBtn').textContent =
    lang === 'zh-TW'
      ? 'EN'
      : '中文';

  renderMenu();
  route();
};


// ======================================================
// Hash routing
// ======================================================

addEventListener(
  'hashchange',
  route
);
