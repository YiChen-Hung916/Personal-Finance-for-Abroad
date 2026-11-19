import {
  collection, doc, getDocs, query, where, runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const equal = (a,b) => norm(a) === norm(b);
const sameId = (a,b) => String(a ?? '') === String(b ?? '');
const text = (isZh,zh,en) => isZh ? zh : en;

// Only exact immutable-field matches are eligible for overwrite.
function immutableMatches(old, next) {
  return equal(old.store, next.store) &&
    equal(old.branch, next.branch) &&
    equal(old.purchaseType, next.purchaseType) &&
    sameId(old.purchaseDate, next.purchaseDate) &&
    sameId(old.purchaseTime, next.purchaseTime) &&
    sameId(old.timezone, next.timezone) &&
    sameId(old.currency, next.currency) &&
    sameId(old.paymentMethod, next.paymentMethod) &&
    sameId(old.cardId, next.cardId) &&
    (!old.storeId || !next.storeId || sameId(old.storeId, next.storeId));
}

function showChoice(receipts, next, zh) {
  return new Promise(resolve => {
    const overlay=document.createElement('div');
    Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'30000',background:'rgba(0,0,0,.65)',display:'grid',placeItems:'center',padding:'16px'});
    const panel=document.createElement('section');
    Object.assign(panel.style,{background:'#fff',color:'#222',width:'min(640px,100%)',maxHeight:'90vh',overflow:'auto',padding:'20px',borderRadius:'12px',boxSizing:'border-box'});
    const h=document.createElement('h2');h.textContent=text(zh,'可能重複的收據','Possible Duplicate Receipts');panel.append(h);
    const intro=document.createElement('p');intro.textContent=text(zh,'請逐張確認。只有商店、日期時間、信用卡等重大欄位完全一致，才能覆蓋商品與金額。','Review each receipt. Overwrite is allowed only when all protected fields match.');panel.append(intro);
    let index=0;
    const body=document.createElement('div');panel.append(body);
    function finish(action,receipt=null){overlay.remove();resolve({action,receipt});}
    function render(){
      body.replaceChildren();
      if(index>=receipts.length){
        const p=document.createElement('p');p.textContent=text(zh,'已檢查所有候選收據。要將這次提交另存為新收據嗎？','All candidates reviewed. Create a new receipt?');body.append(p);
        button('Create as New Receipt',()=>finish('new'));
        button('Cancel',()=>finish('cancel'));
        return;
      }
      const old=receipts[index], eligible=immutableMatches(old,next) && old.status==='pending';
      const p=document.createElement('p');p.textContent=`${index+1} / ${receipts.length} · ${old.store||'—'} · ${old.purchaseDate||'—'} ${old.purchaseTime||''} · ${old.currency||''} ${Number(old.total||0).toFixed(2)} (${old.paymentMethod||'—'} ${old.cardId||''})`;
      body.append(p);
      const np=document.createElement('p');np.textContent=`New: ${next.store} · ${next.purchaseDate} ${next.purchaseTime||''} · ${next.currency||''} ${Number(next.total||0).toFixed(2)} (${next.paymentMethod||'—'} ${next.cardId||''})`;body.append(np);
      if(!eligible){const warning=document.createElement('p');warning.style.color='#b91c1c';warning.textContent=text(zh,'重大欄位不一致或不是待確認收據：不可覆蓋。','Protected fields differ or receipt is not pending: overwrite unavailable.');body.append(warning);}
      if(eligible)button('Overwrite Items & Amounts',()=>finish('overwrite',old));
      button('Skip This Receipt',()=>{index++;render();});
      button('Create as New Receipt',()=>finish('new'));
      button('Cancel',()=>finish('cancel'));
    }
    function button(label,click){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='display:block;width:100%;margin:8px 0;padding:10px;cursor:pointer';b.onclick=click;body.append(b);}
    overlay.append(panel);document.body.append(overlay);render();
  });
}

export async function chooseReceiptOverwrite({db,receiptData,lang='zh-TW'}) {
  const zh=lang==='zh-TW';
  const matches=await getDocs(query(collection(db,'receipts'),where('purchaseDate','==',receiptData.purchaseDate)));
  // Broad candidates by date: catches a changed store/card as a protected-field mismatch.
  const candidates=matches.docs.map(s=>({id:s.id,...s.data()}))
    .filter(r=>r.status!=='draft')
    .sort((a,b)=>Number(equal(b.store,receiptData.store))-Number(equal(a.store,receiptData.store)));
  if(!candidates.length)return {action:'new'};
  return showChoice(candidates,receiptData,zh);
}

export async function overwriteReceiptItemsAndAmounts({db,currentUser,oldReceipt,receiptData,items}) {
  if(!currentUser?.uid||!oldReceipt?.id)throw new Error('Missing overwrite authorization.');
  if(!Array.isArray(items)||!items.length)throw new Error('At least one item is required.');
  if(!immutableMatches(oldReceipt,receiptData))throw new Error('Protected receipt fields do not match. Delete and recreate the receipt instead.');
  const receiptRef=doc(db,'receipts',oldReceipt.id);
  const [itemDocs,refundDocs]=await Promise.all([
    getDocs(collection(db,'receipts',oldReceipt.id,'items')),
    getDocs(query(collection(db,'refunds'),where('receiptId','==',oldReceipt.id)))
  ]);
  if(!refundDocs.empty)throw new Error('This receipt has a linked refund. Overwrite is blocked to protect accounting history.');
  if(itemDocs.size+items.length+4>450)throw new Error('Too many item rows for one safe transaction.');
  const beforeIds=new Set(itemDocs.docs.map(s=>s.data().productId).filter(Boolean));
  const afterIds=new Set(items.map(i=>i.productId).filter(Boolean));
  const removed=[...beforeIds].filter(id=>!afterIds.has(id));
  const added=[...afterIds].filter(id=>!beforeIds.has(id));
  const totalFields=['originalItemsSubtotal','itemsSubtotal','itemDiscountTotal','receiptDiscount','tax','fees','total','categories'];
  const patch=Object.fromEntries(totalFields.map(key=>[key,receiptData[key]]));
  for(const key of totalFields)if(patch[key]===undefined)throw new Error(`Missing ${key}.`);
  const latestRefunds=await getDocs(query(collection(db,'refunds'),where('receiptId','==',oldReceipt.id)));
  if(!latestRefunds.empty)throw new Error('A linked refund was created. Overwrite is blocked.');
  await runTransaction(db,async tx=>{
    const receiptSnap=await tx.get(receiptRef);
    if(!receiptSnap.exists())throw new Error('Original receipt no longer exists.');
    const existing=receiptSnap.data();
    if(existing.status!=='pending')throw new Error('Only pending, unconfirmed receipts can be overwritten.');
    if(existing.confirmedAt||existing.confirmedBy||existing.amountMatchStatus||existing.reportedAmount!=null)
      throw new Error('This receipt has confirmation data. Overwrite is blocked.');
    if(!immutableMatches(existing,receiptData))throw new Error('Protected receipt fields changed. Reload and try again.');
    if(oldReceipt.updatedAt?.toMillis && existing.updatedAt?.toMillis && oldReceipt.updatedAt.toMillis()!==existing.updatedAt.toMillis())
      throw new Error('Receipt changed since duplicate detection. Retry submission.');
    const oldSnapshots=[];
    for(const s of itemDocs.docs)oldSnapshots.push(await tx.get(s.ref));
    if(oldSnapshots.some(s=>!s.exists()))throw new Error('Receipt items changed. Retry submission.');
    const productRefs=new Map();
    for(const id of [...removed,...added]){
      const pref=doc(db,'products',id);
      productRefs.set(id,{ref:pref,snapshot:await tx.get(pref)});
    }
    for(const s of itemDocs.docs)tx.delete(s.ref);
    for(const item of items){
      const ref=doc(collection(db,'receipts',oldReceipt.id,'items'));
      tx.set(ref,{...item,createdAt:serverTimestamp(),createdBy:currentUser.uid});
    }
    for(const id of [...removed,...added]){
      const {ref,snapshot}=productRefs.get(id);
      if(!snapshot.exists())throw new Error(`Product ${id} no longer exists.`);
      const count=Math.max(0,Number(snapshot.data().usageCount||0)+(added.includes(id)?1:-1));
      tx.update(ref,{usageCount:count,isFrequent:count>=5,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
    }
    tx.update(receiptRef,{...patch,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
  });
  return oldReceipt.id;
}
