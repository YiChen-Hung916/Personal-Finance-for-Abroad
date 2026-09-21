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
  // Extra frontend protection.
  // Firestore Rules remain the real security boundary.
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

  let cards = [];
  let cardLoadError = '';

  try {
    const cardsSnapshot =
      await getDocs(collection(db, 'cards'));

    cards = cardsSnapshot.docs
      .map(cardDoc => ({
        id: cardDoc.id,
        ...cardDoc.data()
      }))
      .filter(card => card.active === true);

     console.log('Active cards loaded for receipt:', cards);

  } catch (error) {
    console.error(
      'Failed to load cards for receipt:',
      error
    );

    cardLoadError = error.message;
  }

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

  
  page.innerHTML = `
    <section class="panel">
      <h1>${t('newReceipt', lang)}</h1>

      <div class="row">
        <label class="field">
          Store
          <input id="receiptStore" placeholder="Target">
        </label>

        <label class="field">
          Branch
          <input id="receiptBranch" placeholder="East Liberty">
        </label>

        <label class="field">
          Purchase type
          <select id="receiptPurchaseType">
            <option value="inStore">In-store</option>
            <option value="online">Online</option>
          </select>
        </label>
      </div>

      <div class="row">
        <label class="field">
          Date
          <input id="receiptDate" type="date">
        </label>

        <label class="field">
          Time
          <input id="receiptTime" type="time">
        </label>

        <label class="field">
          ${lang === 'zh-TW' ? '時區' : 'Timezone'}

          <select id="receiptTimezone">
            <optgroup label="${lang === 'zh-TW' ? '北美' : 'North America'}">
              <option value="America/New_York" selected>
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

            <optgroup label="${lang === 'zh-TW' ? '亞洲' : 'Asia'}">
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

            <optgroup label="${lang === 'zh-TW' ? '歐洲' : 'Europe'}">
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

      <div class="row">
        <label class="field">
          Currency
          <input id="receiptCurrency" value="USD">
        </label>

        <label class="field">
  ${lang === 'zh-TW' ? '信用卡' : 'Card'}

  <select id="receiptCard">
    <option value="">
      ${
        cards.length
          ? (lang === 'zh-TW'
              ? '請選擇信用卡…'
              : 'Select card…')
          : (lang === 'zh-TW'
              ? '目前沒有可用的信用卡'
              : 'No active cards available')
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

      <div id="items"></div>

      <button id="addItem" class="add-item-btn">
        ＋ Add Item
      </button>

      <div class="row">
        <label class="field">
          Receipt discount
          <input
            id="receiptDiscount"
            type="number"
            step="0.01"
            value="0"
          >
        </label>

        <label class="field">
          Tax
          <input
            id="receiptTax"
            type="number"
            step="0.01"
            value="0"
          >
        </label>

        <label class="field">
          Tip / Other fees
          <input
            id="receiptFees"
            type="number"
            step="0.01"
            value="0"
          >
        </label>
      </div>

      <div class="actions">
        <button id="saveReceiptDraft">
          Save Draft
        </button>

        <button
          id="submitReceipt"
          class="primary"
        >
          Submit
        </button>
      </div>
    </section>
  `;

  document.querySelector('#addItem').onclick = addItem;
  
  document.querySelector('#saveReceiptDraft').onclick =
  () => saveReceipt('draft');

  document.querySelector('#submitReceipt').onclick =
  () => saveReceipt('pending');

  addItem();
}

function addItem() {
  const d = document.createElement('div');

  d.className = 'item';

  d.innerHTML = `
    <div class="row">
      <label class="field">
        Category
        <select class="itemCategory">
          <option value="">Select category...</option>
          <option value="Beverages">Beverages</option>
          <option value="Food">Food</option>
          <option value="Snacks">Snacks</option>
          <option value="Household">Household</option>
          <option value="Personal Care">Personal Care</option>
          <option value="Clothing">Clothing</option>
          <option value="Electronics">Electronics</option>
          <option value="Other">Other</option>
        </select>
      </label>
    </div>
    
      <label class="field">
        Product
        <input class="itemProduct">
      </label>

      <label class="field">
        Brand
        <input class="itemBrand">
      </label>
      
    <div class="row">
      <label class="field">
        Units per package
        <input
          class="itemUnitsPerPackage"
          type="number"
          min="1"
          value="1"
        >
      </label>

      <label class="field">
        Capacity (optional)
        <input 
          class="itemCapacity"
          type="number"
          step="any"
        >
      </label>

      <label class="field">
        Unit
        <select class="itemUnit">
          <option value="">—</option>
          <optgroup label="Volume">
            <option value="mL">mL</option>
            <option value="L">L</option>
            <option value="fl_oz">fl oz</option>
            <option value="gal">gal</option>
          </optgroup>

          <optgroup label="Weight">
            <option value="g">g</option>
            <option value="kg">kg</option>
          </optgroup>

          <optgroup label="Count">
            <option value="each">each</option>
          </optgroup>
        </select>
      </label>
    </div>

    <div class="row">
      <label class="field">
        Purchase quantity (packages)
        <input
          class="itemQuantity"
          type="number"
          min="1"
          value="1"
        >
      </label>

      <label class="field">
        Original price per package
        <input
          class="itemPrice"
           type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
        >

      </label>
    </div>

    <div class="row">

  <label class="field">
    <input
      class="itemHasDiscount"
      type="checkbox"
    >
    Discount / Promotion
  </label>

</div>

 <div
  class="itemDiscountSection"
  style="display:none;"
>

  <div class="row">

    <label class="field">
      Discounted Total
      <input
        class="itemDiscountedTotal"
        type="number"
        min="0"
        step="0.01"
        placeholder="Actual total paid for this item"
      >
    </label>

    <label class="field">
      Promotion Note
      <input
        class="itemPromotionNote"
        type="text"
        placeholder="e.g. Buy 1 get 1 free"
      >
    </label>

  </div>

</div>

<div class="row">

  <label class="field">
    Original Subtotal
    <input
      class="itemOriginalSubtotal"
      type="text"
      value="0.00"
      readonly
    >
  </label>

  <label class="field">
    Item Final Price
    <input
      class="itemFinalPrice"
      type="text"
      value="0.00"
      readonly
    >
  </label>

  <label class="field">
    Effective Discount
    <input
      class="itemEffectiveDiscount"
      type="text"
      value="—"
      readonly
    >
  </label>

</div>

    <label class="field">
      Photos (optional)
      <input type="file" multiple>
    </label>
  `;

  document.querySelector('#items').appendChild(d);
  const discountCheckbox =
  d.querySelector('.itemHasDiscount');

const discountSection =
  d.querySelector('.itemDiscountSection');

discountCheckbox.addEventListener(
  'change',
  () => {

    discountSection.style.display =
      discountCheckbox.checked
        ? 'block'
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
  d.querySelectorAll('input, select')
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


async function saveReceipt(status) {
  if (currentRole !== 'owner' || !currentUser) {
    return;
  }

  const store =
    document.querySelector('#receiptStore').value.trim();

  const branch =
    document.querySelector('#receiptBranch').value.trim();

  const purchaseType =
    document.querySelector('#receiptPurchaseType').value;

  const purchaseDate =
    document.querySelector('#receiptDate').value;

  const purchaseTime =
    document.querySelector('#receiptTime').value;

  const timezone =
    document.querySelector('#receiptTimezone').value;

  const currency =
    document.querySelector('#receiptCurrency')
      .value
      .trim()
      .toUpperCase();

  const cardId =
    document.querySelector('#receiptCard').value;

  if (!store || !purchaseDate || !cardId) {
    alert(
      lang === 'zh-TW'
        ? '請至少填寫商店、日期並選擇信用卡。'
        : 'Please enter a store, date, and card.'
    );

    return;
  }

  // Get the selected card again from Firestore.
  const cardSnapshot =
    await getDoc(doc(db, 'cards', cardId));

  if (!cardSnapshot.exists()) {
    alert(
      lang === 'zh-TW'
        ? '找不到所選信用卡。'
        : 'Selected card could not be found.'
    );

    return;
  }

  const card = cardSnapshot.data();

  if (card.active !== true) {
    alert(
      lang === 'zh-TW'
        ? '這張信用卡目前已停用。'
        : 'This card is currently inactive.'
    );

    return;
  }

  const itemElements =
    document.querySelectorAll('#items .item');

  const items = [];

  itemElements.forEach(item => {
    const product =
      item.querySelector('.itemProduct')
        .value
        .trim();

    const brand =
      item.querySelector('.itemBrand')
        .value
        .trim();

    const category =
      item.querySelector('.itemCategory')
        .value
        .trim();

    const unitsPerPackage =
      Number(
        item.querySelector('.itemUnitsPerPackage').value
      ) || 1;

    const capacity =
      Number(
        item.querySelector('.itemCapacity').value
      ) || null;

    const unit =
      item.querySelector('.itemUnit').value;

    const quantity =
      Number(
        item.querySelector('.itemQuantity').value
      ) || 1;

    const pricePerPackage =
      Number(
        item.querySelector('.itemPrice').value
      ) || 0;

    const discountType =
      item.querySelector('.itemDiscountType').value;

    items.push({
      product,
      brand,
      category,
      unitsPerPackage,
      capacity,
      unit,
      quantity,
      pricePerPackage,
      discountType
    });
  });

  const receiptDiscount =
    Number(
      document.querySelector('#receiptDiscount').value
    ) || 0;

  const tax =
    Number(
      document.querySelector('#receiptTax').value
    ) || 0;

  const fees =
    Number(
      document.querySelector('#receiptFees').value
    ) || 0;

  const itemsSubtotal =
    items.reduce(
      (sum, item) =>
        sum +
        item.quantity * item.pricePerPackage,
      0
    );

  const total =
    itemsSubtotal -
    receiptDiscount +
    tax +
    fees;

  try {
    const receiptRef =
      await addDoc(
        collection(db, 'receipts'),
        {
          store,
          branch,
          purchaseType,

          purchaseDate,
          purchaseTime,
          timezone,

          currency,

          cardId,

          // Snapshot the confirmer at creation time.
          confirmationUserId:
            card.confirmationUserId,

          itemsSubtotal,
          receiptDiscount,
          tax,
          fees,
          total,

          status,

          createdAt: serverTimestamp(),
          createdBy: currentUser.uid,

          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid,

          submittedAt:
            status === 'pending'
              ? serverTimestamp()
              : null
        }
      );

    for (const item of items) {
      await addDoc(
        collection(
          db,
          'receipts',
          receiptRef.id,
          'items'
        ),
        {
          ...item,

          createdAt: serverTimestamp(),
          createdBy: currentUser.uid
        }
      );
    }

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

    location.hash = '#dashboard';

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
