import { t } from './i18n.js';
import { firebaseConfig } from './firebase-config.js';

import { initializeApp } from
  'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';

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
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(firebaseApp);
let lang=localStorage.getItem('ff-lang')||'zh-TW';
const login=document.querySelector('#loginView'),app=document.querySelector('#appView'),page=document.querySelector('#page'),drawer=document.querySelector('#drawer');
let currentUser = null;
let currentRole = null;
let currentProfile = null;
function money(v,c='USD'){return `${c} ${Number(v).toFixed(2)}`}
function menu(role){const owner=role==='owner'; return `<a href="#dashboard">${t('dashboard',lang)}</a>${owner?`<a href="#new-receipt">＋ ${t('newReceipt',lang)}</a><a href="#pending">${t('pendingAll',lang)}</a><a href="#my-confirmations">${t('myConfirm',lang)}</a><a href="#history">${t('history',lang)}</a><a href="#promotions">${t('promos',lang)}</a><hr><a href="#management">Stores / Products / Cards & Accounts / Users</a>`:`<a href="#my-confirmations">${t('myConfirm',lang)}</a><a href="#related">My Related Receipts</a><a href="#transfer">＋ Record Transfer</a><a href="#unmatched">Report Unmatched Transaction</a><a href="#history">${t('history',lang)}</a>`}`}
function dashboard(){page.innerHTML=`<div class="actions"><button onclick="location.hash='#new-receipt'">＋ ${t('newReceipt',lang)}</button></div><section class="panel"><h2>${t('myConfirm',lang)}</h2><div class="activity"><span>Sep 17</span><span>Target</span><span>USD 42.87 · Pending</span></div><a href="#my-confirmations">${t('viewAll',lang)}</a></section><section class="panel"><h2>${t('waiting',lang)}</h2><p><b>Mom</b> · 3 pending · oldest 10 days</p><p><b>Dad</b> · 1 pending · oldest 2 days</p><a href="#pending">${t('viewAll',lang)}</a></section><section class="panel"><h2>Refunds</h2><div class="activity"><span>Sep 15</span><span>Target</span><span>USD 24.99 · Pending</span></div></section><section class="panel"><h2>Transfers</h2><div class="activity"><span>Sep 16</span><span>Family → Checking</span><span>USD 1,000 · Received</span></div></section><section class="panel"><h2>${t('recent',lang)}</h2>${['Trader Joe’s','Amazon','Target','Giant Eagle','Costco'].map((x,i)=>`<div class="activity"><span>Sep ${18-i}</span><span>${x}</span><span>Confirmed</span></div>`).join('')}<a href="#history">${t('viewAll',lang)}</a></section>`}
function receiptForm(){page.innerHTML=`<section class="panel"><h1>${t('newReceipt',lang)}</h1><div class="row"><label class="field">Store<input placeholder="Target"></label><label class="field">Branch<input placeholder="East Liberty"></label><label class="field">Purchase type<select><option>In-store</option><option>Online</option></select></label></div><div class="row"><label class="field">Date<input type="date"></label><label class="field">Time<input type="time"></label><label class="field">Timezone<input value="America/New_York"></label></div><div class="row"><label class="field">Currency<input value="USD"></label><label class="field">Card<select><option>Select card…</option></select></label></div><div id="items"></div><button id="addItem">＋ Add Item</button><div class="row"><label class="field">Receipt discount<input type="number" step="0.01"></label><label class="field">Tax<input type="number" step="0.01"></label><label class="field">Tip / Other fees<input type="number" step="0.01"></label></div><div class="actions"><button>Save Draft</button><button class="primary">Submit</button></div></section>`;document.querySelector('#addItem').onclick=addItem;addItem()}
function addItem(){const d=document.createElement('div');d.className='item';d.innerHTML=`<div class="row"><label class="field">Product<input></label><label class="field">Brand<input></label><label class="field">Category<input></label></div><div class="row"><label class="field">Units per package<input type="number" min="1" value="1"></label><label class="field">Capacity (optional)<input type="number" step="any"></label><label class="field">Unit<select><option value="">—</option><option>mL</option><option>L</option><option>g</option><option>kg</option><option>fl oz</option><option>gal</option></select></label></div><div class="row"><label class="field">Purchase quantity (packages)<input type="number" min="1" value="1"></label><label class="field">Price per package<input type="number" step="0.01"></label><label class="field">Discount<select><option>None</option><option>Sale</option><option>Coupon</option><option>Member Price</option><option>Clearance</option><option>Other</option></select></label></div><label class="field">Photos (optional)<input type="file" multiple></label>`;document.querySelector('#items').appendChild(d)}
function placeholder(title){page.innerHTML=`<section class="panel"><h1>${title}</h1><p class="muted">This module is wired into the V1 project structure and will use Firestore data after Firebase setup.</p></section>`}
function route(){const r=location.hash.slice(1)||'dashboard'; if(r==='dashboard')dashboard();else if(r==='new-receipt')receiptForm();else placeholder(r.replaceAll('-',' '));drawer.hidden=true}
const authMessage = document.querySelector('#authMessage');
const googleLoginButton = document.querySelector('#googleLogin');

googleLoginButton.onclick = async () => {
  authMessage.textContent = '正在登入…';

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error(error);
    authMessage.textContent = `登入失敗：${error.message}`;
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;

    console.log('Firebase user:', user);
    console.log('UID:', user.uid);

    login.hidden = true;
    app.hidden = false;

    drawer.innerHTML = menu(currentRole);
    route();
  } else {
    currentUser = null;

    login.hidden = false;
    app.hidden = true;

    authMessage.textContent = '';
  }
});

document.querySelector('#menuBtn').onclick = () => {
  drawer.hidden = !drawer.hidden;
};

document.querySelector('#langBtn').onclick = () => {
  lang = lang === 'zh-TW' ? 'en' : 'zh-TW';

  localStorage.setItem('ff-lang', lang);

  document.querySelector('#langBtn').textContent =
    lang === 'zh-TW' ? 'EN' : '中文';

  drawer.innerHTML = menu(currentRole);
  route();
};

addEventListener('hashchange', route);
