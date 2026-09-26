import { t } from './i18n.js';
import { firebaseConfig } from './firebase-config.js';

import {
  myConfirmationPage,
  getMyPendingConfirmations,
  saveMyConfirmation
} from './myconfirmation.js';

import {
  receiptPage
} from './receipt.js';

import {
  receiptDetailPage
} from './receiptdetail.js';

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

async function dashboard() {

  const isOwner =
    currentRole === 'owner';


  let myPendingConfirmations = [];


  try {

    myPendingConfirmations =
      await getMyPendingConfirmations({
        db,
        currentUser
      });

  } catch (error) {

    console.error(
      'Failed to load dashboard confirmations:',
      error
    );
  }


  // ==================================================
  // Shared "My Confirmation" panel
  // ==================================================

  const confirmationPanel = `
    <section class="panel">

      <h2>

        ${
          isOwner
            ? t('myConfirm', lang)
            : (
                lang === 'zh-TW'
                  ? '需要你確認'
                  : 'Need Your Confirmation'
              )
        }

        ${
          myPendingConfirmations.length > 0
            ? `
              <span class="badge">
                ${myPendingConfirmations.length}
              </span>
            `
            : ''
        }

      </h2>


      ${
        myPendingConfirmations.length === 0

          ? `
            <p class="muted">
              ${
                lang === 'zh-TW'
                  ? '目前沒有需要你確認的交易。'
                  : 'You have no transactions requiring confirmation.'
              }
            </p>
          `

          : myPendingConfirmations
              .slice(0, 3)
              .map(receipt =>
                dashboardConfirmationCardHtml(
                  receipt
                )
              )
              .join('')
      }


      ${
        myPendingConfirmations.length > 0
          ? `
            <a href="#my-confirmations">
              ${t('viewAll', lang)}
            </a>
          `
          : ''
      }

    </section>
  `;


  // ==================================================
  // Owner Dashboard
  // ==================================================

  if (isOwner) {

    page.innerHTML = `

      <div class="actions">

        <button
          onclick="location.hash='#new-receipt'"
        >
          ＋ ${t('newReceipt', lang)}
        </button>

      </div>


      ${confirmationPanel}


      <section class="panel">

        <h2>
          ${t('waiting', lang)}
        </h2>

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

        <h2>
          Refunds
        </h2>

        <div class="activity">
          <span>Sep 15</span>
          <span>Target</span>
          <span>USD 24.99 · Pending</span>
        </div>

      </section>


      <section class="panel">

        <h2>
          Transfers
        </h2>

        <div class="activity">
          <span>Sep 16</span>
          <span>Family → Checking</span>
          <span>USD 1,000 · Received</span>
        </div>

      </section>


      <section class="panel">

        <h2>
          ${t('recent', lang)}
        </h2>

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

  }


  // ==================================================
  // Authorized User Dashboard
  // ==================================================

  else {

    page.innerHTML = `

      ${confirmationPanel}


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
              ? '你可以查看指派給你的收據並回報信用卡通知。'
              : 'You can review receipts assigned to you and report the card notification.'
          }
        </p>

      </section>
    `;
  }


  // ==================================================
  // Bind Dashboard Confirmation Events
  // ==================================================

  bindDashboardConfirmationEvents(
    myPendingConfirmations
  );
}


// ======================================================
// Dashboard Confirmation Card
// ======================================================

function dashboardConfirmationCardHtml(
  receipt
) {

  const receiptId =
    escapeHtml(
      receipt.id
    );


  const expectedCurrency =
    String(
      receipt.expectedSettlementCurrency ||
      receipt.currency ||
      ''
    )
      .trim()
      .toUpperCase();


  const currencies = [
    'USD',
    'TWD',
    'JPY',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'KRW',
    'HKD',
    'SGD'
  ];


  if (
    expectedCurrency &&
    !currencies.includes(
      expectedCurrency
    )
  ) {
    currencies.unshift(
      expectedCurrency
    );
  }


  const currencyOptions =
    currencies
      .map(code => `
        <option
          value="${escapeHtml(code)}"
          ${
            code === expectedCurrency
              ? 'selected'
              : ''
          }
        >
          ${escapeHtml(code)}
        </option>
      `)
      .join('');


  return `

    <div
      class="card dashboard-confirmation-card"
      data-receipt-id="${receiptId}"
    >

      <div
        class="dashboard-confirmation-open"
        data-receipt-id="${receiptId}"
        style="cursor: pointer;"
      >

        <div
  style="
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 6px 12px;
    text-align: left;
  "
>

  <span
    style="
      white-space: nowrap;
      flex: 0 0 auto;
    "
  >
    ${escapeHtml(
      receipt.purchaseDate || '—'
    )}
  </span>

  <span
    style="
      white-space: nowrap;
      flex: 0 1 auto;
    "
  >
    ${escapeHtml(
      receipt.store || '—'
    )}
  </span>

  <span
    style="
      white-space: nowrap;
      flex: 0 0 auto;
    "
  >
    ${money(
      receipt.total || 0,
      expectedCurrency
    )}
    ·
    ${
      lang === 'zh-TW'
        ? '待確認'
        : 'Pending'
    }
  </span>

</div>

      </div>


      <div class="field">

        <span class="field-label">

          ${
            lang === 'zh-TW'
              ? '信用卡通知顯示的請款幣值？'
              : 'Card notification currency type?'
          }

          <sup class="required-mark">*</sup>

        </span>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="dashboard-currency-type"
            name="dashboard-currency-${receiptId}"
            value="local"
          >

          ${
            lang === 'zh-TW'
              ? '台幣'
              : 'TWD'
          }

        </label>


        <label class="confirmation-choice">

          <input
            type="radio"
            class="dashboard-currency-type"
            name="dashboard-currency-${receiptId}"
            value="foreign"
          >

          ${
            lang === 'zh-TW'
              ? '外幣'
              : 'Foreign'
          }

        </label>

      </div>


      <div class="actions">

        <button
          type="button"
          class="dashboard-match-btn primary"
          data-receipt-id="${receiptId}"
        >
          ${
            lang === 'zh-TW'
              ? '相符'
              : 'Match'
          }
        </button>


        <button
          type="button"
          class="dashboard-mismatch-btn"
          data-receipt-id="${receiptId}"
        >
          ${
            lang === 'zh-TW'
              ? '不符'
              : 'Mismatch'
          }
        </button>

      </div>


      <div
        class="dashboard-mismatch-fields"
        hidden
      >

        <hr>


        <p class="muted">

          ${
            lang === 'zh-TW'
              ? '請輸入信用卡通知中實際顯示的金額與幣值。'
              : 'Enter the amount and currency shown in the card notification.'
          }

        </p>


        <div class="grid">

          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '信用卡通知金額'
                  : 'Card Notification Amount'
              }

              <sup class="required-mark">*</sup>

            </span>

            <input
              type="number"
              class="dashboard-reported-amount"
              min="0"
              step="0.01"
              inputmode="decimal"
              placeholder="0.00"
            >

          </label>


          <label class="field">

            <span class="field-label">

              ${
                lang === 'zh-TW'
                  ? '信用卡通知幣值'
                  : 'Card Notification Currency'
              }

              <sup class="required-mark">*</sup>

            </span>

            <select
              class="dashboard-reported-currency"
            >
              ${currencyOptions}
            </select>

          </label>

        </div>


        <label class="field">

          <span class="field-label">

            ${
              lang === 'zh-TW'
                ? '備註（選填）'
                : 'Notes (optional)'
            }

          </span>

          <textarea
            class="dashboard-confirmation-notes"
            rows="2"
          ></textarea>

        </label>


        <div class="actions">

          <button
            type="button"
            class="dashboard-submit-mismatch-btn primary"
            data-receipt-id="${receiptId}"
          >

            ${
              lang === 'zh-TW'
                ? '送出回報'
                : 'Submit'
            }

          </button>

        </div>

      </div>

    </div>
  `;
}


// ======================================================
// Dashboard Confirmation Events
// ======================================================

function bindDashboardConfirmationEvents(
  receipts
) {

  page
    .querySelectorAll(
      '.dashboard-confirmation-card'
    )
    .forEach(card => {

      const receiptId =
        card.dataset.receiptId;


      const receipt =
        receipts.find(
          item =>
            item.id === receiptId
        );


      if (!receipt) {
        return;
      }


      // ------------------------------------------------
      // Click transaction -> full confirmation page
      // ------------------------------------------------

      const openArea =
        card.querySelector(
          '.dashboard-confirmation-open'
        );


      openArea.onclick =
        () => {

          location.hash =
            `#my-confirmations/${receipt.id}`;
        };


      // ------------------------------------------------
      // Quick Match
      // ------------------------------------------------

      const matchButton =
        card.querySelector(
          '.dashboard-match-btn'
        );


      matchButton.onclick =
        async () => {

          const currencyChoice =
            card.querySelector(
              '.dashboard-currency-type:checked'
            );


          if (!currencyChoice) {

            alert(
              lang === 'zh-TW'
                ? '請先選擇信用卡通知顯示的是台幣或外幣。'
                : 'Please select TWD or foreign currency first.'
            );

            return;
          }


          matchButton.disabled =
            true;


          matchButton.textContent =
            lang === 'zh-TW'
              ? '正在送出…'
              : 'Submitting…';


          try {

            await saveMyConfirmation({
              db,
              currentUser,
              receipt,

              notificationCurrencyType:
                currencyChoice.value,

              amountMatchStatus:
                'match'
            });


            // Refresh Dashboard.
            await dashboard();


          } catch (error) {

            console.error(
              'Dashboard quick confirmation failed:',
              error
            );


            alert(
              `${
                lang === 'zh-TW'
                  ? '送出確認失敗'
                  : 'Failed to submit confirmation'
              }: ${error.message}`
            );


            matchButton.disabled =
              false;


            matchButton.textContent =
              lang === 'zh-TW'
                ? '相符'
                : 'Match';
          }
        };


      // ------------------------------------------------
      // Show mismatch fields
      // ------------------------------------------------

      const mismatchButton =
        card.querySelector(
          '.dashboard-mismatch-btn'
        );


      const mismatchFields =
        card.querySelector(
          '.dashboard-mismatch-fields'
        );


      mismatchButton.onclick =
        () => {

          mismatchFields.hidden =
            !mismatchFields.hidden;
        };


      // ------------------------------------------------
      // Submit mismatch
      // ------------------------------------------------

      const submitMismatchButton =
        card.querySelector(
          '.dashboard-submit-mismatch-btn'
        );


      submitMismatchButton.onclick =
        async () => {

          const currencyChoice =
            card.querySelector(
              '.dashboard-currency-type:checked'
            );


          if (!currencyChoice) {

            alert(
              lang === 'zh-TW'
                ? '請先選擇信用卡通知顯示的是台幣或外幣。'
                : 'Please select TWD or foreign currency first.'
            );

            return;
          }


          const amountInput =
            card.querySelector(
              '.dashboard-reported-amount'
            );


          const rawAmount =
            amountInput.value.trim();


          if (rawAmount === '') {

            alert(
              lang === 'zh-TW'
                ? '請輸入信用卡通知金額。'
                : 'Please enter the card notification amount.'
            );


            amountInput.focus();

            return;
          }


          const reportedAmount =
            Number(rawAmount);


          if (
            !Number.isFinite(
              reportedAmount
            ) ||
            reportedAmount < 0
          ) {

            alert(
              lang === 'zh-TW'
                ? '信用卡通知金額格式不正確。'
                : 'Invalid card notification amount.'
            );


            amountInput.focus();

            return;
          }


          const reportedCurrency =
            card
              .querySelector(
                '.dashboard-reported-currency'
              )
              .value;


          const notes =
            card
              .querySelector(
                '.dashboard-confirmation-notes'
              )
              .value
              .trim();


          submitMismatchButton.disabled =
            true;


          submitMismatchButton.textContent =
            lang === 'zh-TW'
              ? '正在送出…'
              : 'Submitting…';


          try {

            await saveMyConfirmation({
              db,
              currentUser,
              receipt,

              notificationCurrencyType:
                currencyChoice.value,

              amountMatchStatus:
                'mismatch',

              reportedAmount,

              reportedCurrency,

              notes
            });


            // Refresh Dashboard.
            await dashboard();


          } catch (error) {

            console.error(
              'Dashboard mismatch submission failed:',
              error
            );


            alert(
              `${
                lang === 'zh-TW'
                  ? '送出回報失敗'
                  : 'Failed to submit report'
              }: ${error.message}`
            );


            submitMismatchButton.disabled =
              false;


            submitMismatchButton.textContent =
              lang === 'zh-TW'
                ? '送出回報'
                : 'Submit';
          }
        };
    });
}


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

  receiptPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  escapeHtml,
  normalizeNameKey,
  formatDisplayName
});

} else if (
  r === 'my-confirmations' ||
  r.startsWith('my-confirmations/')
) {
  
  const receiptId =
    r.startsWith('my-confirmations/')
      ? r.substring(
          'my-confirmations/'.length
        )
      : null;

  myConfirmationPage({
    db,
    currentUser,
    lang,
    page,
    receiptId
  });

} else if (r.startsWith('receipt-detail/')) {

  const receiptId =
    r.substring(
      'receipt-detail/'.length
    );

  receiptDetailPage({
    db,
    currentUser,
    currentRole,
    lang,
    page,
    receiptId
  });
} else if (r === 'cards') {

  cardsPage();

} else {

  placeholder(
    r.replaceAll('-', ' ')
  );
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
