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
  doc,
  getDoc
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

      <a href="#management">
        Stores / Products / Cards & Accounts / Users
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

function receiptForm() {
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

  page.innerHTML = `
    <section class="panel">
      <h1>${t('newReceipt', lang)}</h1>

      <div class="row">
        <label class="field">
          Store
          <input placeholder="Target">
        </label>

        <label class="field">
          Branch
          <input placeholder="East Liberty">
        </label>

        <label class="field">
          Purchase type
          <select>
            <option>In-store</option>
            <option>Online</option>
          </select>
        </label>
      </div>

      <div class="row">
        <label class="field">
          Date
          <input type="date">
        </label>

        <label class="field">
          Time
          <input type="time">
        </label>

        <label class="field">
          Timezone
          <input value="America/New_York">
        </label>
      </div>

      <div class="row">
        <label class="field">
          Currency
          <input value="USD">
        </label>

        <label class="field">
          Card
          <select>
            <option>Select card…</option>
          </select>
        </label>
      </div>

      <div id="items"></div>

      <button id="addItem">
        ＋ Add Item
      </button>

      <div class="row">
        <label class="field">
          Receipt discount
          <input type="number" step="0.01">
        </label>

        <label class="field">
          Tax
          <input type="number" step="0.01">
        </label>

        <label class="field">
          Tip / Other fees
          <input type="number" step="0.01">
        </label>
      </div>

      <div class="actions">
        <button>Save Draft</button>
        <button class="primary">Submit</button>
      </div>
    </section>
  `;

  document.querySelector('#addItem').onclick = addItem;

  addItem();
}

function addItem() {
  const d = document.createElement('div');

  d.className = 'item';

  d.innerHTML = `
    <div class="row">
      <label class="field">
        Product
        <input>
      </label>

      <label class="field">
        Brand
        <input>
      </label>

      <label class="field">
        Category
        <input>
      </label>
    </div>

    <div class="row">
      <label class="field">
        Units per package
        <input type="number" min="1" value="1">
      </label>

      <label class="field">
        Capacity (optional)
        <input type="number" step="any">
      </label>

      <label class="field">
        Unit
        <select>
          <option value="">—</option>
          <option>mL</option>
          <option>L</option>
          <option>g</option>
          <option>kg</option>
          <option>fl oz</option>
          <option>gal</option>
        </select>
      </label>
    </div>

    <div class="row">
      <label class="field">
        Purchase quantity (packages)
        <input type="number" min="1" value="1">
      </label>

      <label class="field">
        Price per package
        <input type="number" step="0.01">
      </label>

      <label class="field">
        Discount
        <select>
          <option>None</option>
          <option>Sale</option>
          <option>Coupon</option>
          <option>Member Price</option>
          <option>Clearance</option>
          <option>Other</option>
        </select>
      </label>
    </div>

    <label class="field">
      Photos (optional)
      <input type="file" multiple>
    </label>
  `;

  document.querySelector('#items').appendChild(d);
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
