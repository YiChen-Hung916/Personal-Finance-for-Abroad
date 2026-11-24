import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getProducts, createProduct, normalizeProductKey, detectProductCategory, PRODUCT_CATEGORIES } from './products.js';
import { getBrands, createBrand, normalizeBrandKey } from './brands.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const numeric = (value, name, optional = false) => {
  if (optional && value === '') return null;
  if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${name} 必須是有效的非負數。`);
  return Number(value);
};
const match = (list, name, norm) => list.find(p => norm(p.name) === norm(name) || (p.aliases || []).some(a => norm(a) === norm(name)));

export async function openReceiptItemsEditor({db, currentUser, currentRole, receipt, items, lang = 'zh-TW', onSaved}) {
  if (currentRole !== 'owner' || !currentUser?.uid) throw new Error('Only owner may edit items.');
  const zh = lang === 'zh-TW';
  const [products, brands] = await Promise.all([getProducts(db, {includeMerged:false}), getBrands(db, {includeMerged:false})]);
  document.getElementById('receiptItemsEditor')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'receiptItemsEditor';
  Object.assign(overlay.style, {position:'fixed',inset:'0',background:'rgba(0,0,0,.6)',zIndex:'10000',display:'flex',justifyContent:'center',alignItems:'center',padding:'12px'});
  const panel = document.createElement('div');
  Object.assign(panel.style, {background:'#fff',color:'#222',width:'100%',maxWidth:'950px',maxHeight:'94vh',overflow:'auto',padding:'20px',borderRadius:'12px',boxSizing:'border-box'});
  overlay.append(panel); document.body.append(overlay);
  const initial = items.map(x => ({...x}));
  const rows = document.createElement('div');
  const title = document.createElement('h2'); title.textContent = zh ? '編輯商品明細' : 'Edit Receipt Items';
  const hint = document.createElement('p'); hint.textContent = zh ? '欄位預設為儲存值；修改數量或單價會自動重算原價小計，亦可直接修改小計。' : 'Saved values are prefilled. Changing quantity or unit price recalculates subtotal; subtotal can also be overridden.';
  const summary = document.createElement('p'); const error = document.createElement('p'); error.style.color='#b91c1c';
  const actions = document.createElement('div'); actions.className='actions';
  const add = document.createElement('button'); add.type='button'; add.textContent=zh?'＋ 新增品項':'+ Add Item';
  const cancel = document.createElement('button'); cancel.type='button'; cancel.textContent=zh?'取消':'Cancel';
  const save = document.createElement('button'); save.type='button'; save.className='primary'; save.textContent=zh?'儲存商品變更':'Save Item Changes';
  actions.append(add,cancel,save); panel.append(title,hint,rows,summary,error,actions);
  const currency = receipt.currency || 'USD';
  const input = (cls, label, value, attrs='') => `<label class="field">${label}<input class="${cls}" value="${esc(value ?? '')}" ${attrs}></label>`;
  const select = (cls, label, options, selected) => `<label class="field">${label}<select class="${cls}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const categories = [['','Auto / Select'],...PRODUCT_CATEGORIES.map(c=>[c,c])];
  const units = [['','—'],['mL','mL'],['L','L'],['fl_oz','fl oz'],['gal','gal'],['g','g'],['kg','kg'],['each','each']];
  const promos = [['sale','Sale'],['memberPrice','Member Price'],['coupon','Coupon'],['clearance','Clearance'],['multiBuy','Multi-buy'],['bogo','BOGO'],['other','Other']];
  let rowCounter = 0;
  function addRow(item = null) {
    const original = item || {};
    const row = document.createElement('section'); row.className='card receipt-edit-row'; row.style.marginBottom='14px';
    row.dataset.id = item?.id || ''; row.dataset.key = String(rowCounter++);
    const calculated = Number(original.quantity ?? 1) * Number(original.originalPricePerPackage ?? 0);
    const manual = original.manualOverride === true || (original.manualOverride == null && original.originalSubtotal != null && Math.abs(Number(original.originalSubtotal)-calculated)>0.001);
    row.dataset.manual = String(manual);
    row.dataset.categoryTouched = 'false'; row.dataset.originalCategory = original.category || '';
    row.dataset.productOriginal = original.product || '';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>${zh?'商品':'Item'}</h3><button type="button" class="remove-row danger">${zh?'刪除此商品':'Remove Item'}</button></div>
      <div class="row">
        ${select('itemCategory','Category',categories,original.category || '')}
        ${input('itemProduct receipt-master-input','Product *',original.product || '', 'list="edit-products" autocomplete="off"')}
        ${input('itemBrand receipt-master-input','Brand',original.brand || '', 'list="edit-brands" autocomplete="off"')}
      </div>
      <div class="row">
        ${input('itemUnitsPerPackage',zh?'內含數量（如：每包件數）':'Units per package',original.unitsPerPackage ?? 1,'type="number" min="1" step="1"')}
        ${input('itemCapacity',zh?'單件容量 / 重量':'Capacity',original.capacity ?? '','type="number" min="0" step="any"')}
        ${select('itemUnit','Unit',units,original.unit || '')}
      </div>
      <div class="row">
        ${input('itemQuantity',zh?'購買數量（如：包數）':'Purchase Quantity *',original.quantity ?? 1,'type="number" min="1" step="1"')}
        ${input('itemPrice',zh?'單位原價（如：每包原價）':'Original Price per Package *',original.originalPricePerPackage ?? '','type="number" min="0" step="0.01"')}
      </div>
      <div class="row"><label class="field"><span><input type="checkbox" class="itemHasDiscount" ${original.hasDiscount?'checked':''}> ${zh?'有優惠':'Discount / Promotion'}</span></label></div>
      <div class="itemDiscountSection" style="display:${original.hasDiscount?'block':'none'}">
        <div class="row">
          ${input('itemDiscountedTotal',zh?'此品項優惠後總額 *':'Discounted Total *',original.discountedTotal ?? '','type="number" min="0" step="0.01"')}
          ${select('itemPromotionType',zh?'優惠類型':'Promotion Type',promos,original.promotionType || 'sale')}
          ${input('itemPromotionRequiredQuantity',zh?'優惠所需數量':'Required Quantity',original.promotionRequiredQuantity ?? '','type="number" min="1" step="1"')}
          ${input('itemPromotionNote',zh?'優惠備註':'Promotion Note',original.promotionNote ?? '')}
        </div>
      </div>
      <div class="row">
        ${input('itemOriginalSubtotal',zh?'原價小計（可手動修改）':'Original Subtotal (editable)',original.originalSubtotal ?? calculated,'type="number" min="0" step="0.01"')}
        ${input('itemFinalPrice',zh?'品項實付':'Item Final Price',original.finalTotal ?? original.originalSubtotal ?? calculated,'readonly')}
        ${input('itemEffectiveDiscount',zh?'等效折數':'Effective Discount','—','readonly')}
      </div>
      <label class="field">${zh?'備註':'Notes'}<textarea class="itemNotes" rows="2">${esc(original.notes || '')}</textarea></label>`;
    const q = cls => row.querySelector('.'+cls);
    q('remove-row').onclick = () => { if (rows.children.length<=1) {error.textContent=zh?'至少保留一個商品。':'Keep at least one item.';return;} row.remove();refresh(); };
    q('itemCategory').addEventListener('change',()=>{row.dataset.categoryTouched='true';refresh();});
    q('itemProduct').addEventListener('change',()=>{const p=match(products,q('itemProduct').value,normalizeProductKey);q('itemCategory').value=p?.category || detectProductCategory(q('itemProduct').value) || 'Other';row.dataset.categoryTouched='false';refresh();});
    for (const cls of ['itemQuantity','itemPrice']) q(cls).addEventListener('input',()=>{row.dataset.manual='false';refresh();});
    q('itemOriginalSubtotal').addEventListener('input',()=>{row.dataset.manual='true';refresh();});
    q('itemHasDiscount').addEventListener('change',()=>{q('itemDiscountSection').style.display=q('itemHasDiscount').checked?'block':'none';refresh();});
    row.addEventListener('input',refresh); row.addEventListener('change',refresh);
    rows.append(row);refresh();
  }
  const productList = document.createElement('datalist');productList.id='edit-products';productList.innerHTML=products.map(p=>`<option value="${esc(p.name)}"></option>`).join('');
  const brandList = document.createElement('datalist');brandList.id='edit-brands';brandList.innerHTML=brands.map(b=>`<option value="${esc(b.name)}"></option>`).join('');panel.append(productList,brandList);
  function readRow(row) {
    const q=cls=>row.querySelector('.'+cls);
    const name=clean(q('itemProduct').value), brand=clean(q('itemBrand').value);
    if(!name)throw new Error('Product 不可空白。');
    const quantity=numeric(q('itemQuantity').value,'Quantity'),unitsPerPackage=numeric(q('itemUnitsPerPackage').value,'Units per Package');
    if(!Number.isInteger(quantity)||quantity<1||!Number.isInteger(unitsPerPackage)||unitsPerPackage<1)throw new Error('Quantity / Units per Package 必須是正整數。');
    const originalPricePerPackage=numeric(q('itemPrice').value,'Original Price');
    const originalSubtotal=round(row.dataset.manual==='true'?numeric(q('itemOriginalSubtotal').value,'Original Subtotal'):quantity*originalPricePerPackage);
    const hasDiscount=q('itemHasDiscount').checked;
    const discountedTotal=hasDiscount?numeric(q('itemDiscountedTotal').value,'Discounted Total'):null;
    const finalTotal=round(hasDiscount?discountedTotal:originalSubtotal);
    const promotionRequiredQuantity=hasDiscount?numeric(q('itemPromotionRequiredQuantity').value,'Required Quantity',true):null;
    if(promotionRequiredQuantity!==null&&(!Number.isInteger(promotionRequiredQuantity)||promotionRequiredQuantity<1))throw new Error('Required Quantity 必須是正整數。');
    const product=match(products,name,normalizeProductKey);
    const category=q('itemCategory').value || product?.category || detectProductCategory(name) || 'Other';
    const original=initial.find(i=>i.id===row.dataset.id);
    const sameProduct=original && normalizeProductKey(original.product)===normalizeProductKey(name);
    const categorySource=(row.dataset.categoryTouched==='true' && category!==(sameProduct?original.category:(product?.category||detectProductCategory(name)||'Other')))?'manual':(sameProduct?(original.categorySource||'default'):'default');
    return {id:row.dataset.id||null, product:name,brand,category,categorySource,quantity,unitsPerPackage,capacity:numeric(q('itemCapacity').value,'Capacity',true),unit:q('itemUnit').value,originalPricePerPackage,originalSubtotal,manualOverride:row.dataset.manual==='true',hasDiscount,discountedTotal,finalTotal,effectiveDiscountRate:originalSubtotal>0?finalTotal/originalSubtotal:1,promotionType:hasDiscount?q('itemPromotionType').value:'',promotionRequiredQuantity,promotionNote:hasDiscount?clean(q('itemPromotionNote').value):'',notes:q('itemNotes').value.trim()};
  }
  function compute(data) {
    const originalItemsSubtotal=round(data.reduce((a,i)=>a+i.originalSubtotal,0));
    const itemsSubtotal=round(data.reduce((a,i)=>a+i.finalTotal,0));
    const itemDiscountTotal=round(data.reduce((a,i)=>a+Math.max(0,i.originalSubtotal-i.finalTotal),0));
    const total=round(Math.max(0,itemsSubtotal-Number(receipt.receiptDiscount||0)+Number(receipt.tax||0)+Number(receipt.fees||0)));
    return {originalItemsSubtotal,itemsSubtotal,itemDiscountTotal,total,categories:[...new Set(data.map(i=>i.category))]};
  }
  function refresh(){
    try{
      const data=[...rows.children].map(row=>{
        const q=cls=>row.querySelector('.'+cls);
        if(row.dataset.manual!=='true'){
          const a=Number(q('itemQuantity').value),b=Number(q('itemPrice').value);
          if(Number.isFinite(a)&&Number.isFinite(b))q('itemOriginalSubtotal').value=round(a*b).toFixed(2);
        }
        const has=q('itemHasDiscount').checked;
        q('itemDiscountSection').style.display=has?'block':'none';
        const original=Number(q('itemOriginalSubtotal').value),discount=Number(q('itemDiscountedTotal').value);
        if(Number.isFinite(original)&&(!has||q('itemDiscountedTotal').value!=='')){
          const final=has?discount:original;q('itemFinalPrice').value=round(final).toFixed(2);
          q('itemEffectiveDiscount').value=original>0&&final<original?(zh?`${round(final/original*10)}折`:`${round(final/original*100)}%`):'—';
        }
        return readRow(row);
      });
      const t=compute(data);summary.textContent=`${zh?'商品折後小計':'Items Subtotal'}: ${currency} ${t.itemsSubtotal.toFixed(2)} · ${zh?'收據總額':'Receipt Total'}: ${currency} ${t.total.toFixed(2)}`;
      error.textContent='';save.disabled=false;
    }catch(e){error.textContent=e.message;save.disabled=true;}
  }
  initial.forEach(addRow);if(!initial.length)addRow();
  add.onclick=()=>addRow();cancel.onclick=()=>overlay.remove();
  save.onclick=async()=>{
    let data;try{data=[...rows.children].map(readRow);}catch(e){error.textContent=e.message;return;}
    save.disabled=true;cancel.disabled=true;error.textContent='';
    try{
      // Master Data creation happens before the transaction. New names do not overwrite existing Product defaults.
      let freshProducts=products, freshBrands=brands;
      for(const i of data){
        if(!match(freshProducts,i.product,normalizeProductKey)){
          const detected=detectProductCategory(i.product)||'Other';
          await createProduct({db,currentUser,name:i.product,category:i.category!==detected?i.category:''});
          freshProducts=await getProducts(db,{includeMerged:false});
        }
        if(i.brand&&!match(freshBrands,i.brand,normalizeBrandKey)){
          await createBrand({db,currentUser,name:i.brand});
          freshBrands=await getBrands(db,{includeMerged:false});
        }
      }
      const resolved=data.map(i=>{
        const p=match(freshProducts,i.product,normalizeProductKey),b=i.brand?match(freshBrands,i.brand,normalizeBrandKey):null;
        if(!p||(i.brand&&!b))throw new Error('Master Data 無法解析。');
        const {id,...rest}=i;
        return {...rest, id,productId:p.id,product:p.name,productKey:normalizeProductKey(p.name),brandId:b?.id||null,brand:b?.name||'',brandKey:b?normalizeBrandKey(b.name):'',categorySource:i.category!==p.category?'manual':(i.categorySource==='manual'?'manual':'default')};
      });
      const beforeIds=new Set(initial.map(i=>i.productId).filter(Boolean));
      const afterIds=new Set(resolved.map(i=>i.productId).filter(Boolean));
      const removed=[...beforeIds].filter(id=>!afterIds.has(id));
      const added=[...afterIds].filter(id=>!beforeIds.has(id));
      const receiptRef=doc(db,'receipts',receipt.id);
      const latestItems=await getDocs(collection(db,'receipts',receipt.id,'items'));
      if(latestItems.size!==initial.length||initial.some(i=>!latestItems.docs.some(s=>s.id===i.id)))throw new Error('商品列已改變，請重新載入。');
      await runTransaction(db,async tx=>{
        const r=await tx.get(receiptRef);if(!r.exists())throw new Error('Receipt 不存在。');
        const oldDocs=[];for(const i of initial)oldDocs.push(await tx.get(doc(db,'receipts',receipt.id,'items',i.id)));
        if(oldDocs.some(s=>!s.exists()))throw new Error('商品已改變，請重新載入。');
        // Check the complete original snapshots to prevent stale edits.
        for(let j=0;j<initial.length;j++){
          const current=oldDocs[j].data(),old=initial[j];
          for(const key of ['productId','brandId','category','quantity','originalSubtotal','finalTotal','discountedTotal','notes']){
            if(JSON.stringify(current[key]??null)!==JSON.stringify(old[key]??null))throw new Error('商品資料已被其他操作更新，請重新載入。');
          }
        }
        const usageSnapshots = new Map();
        if(r.data().status!=='draft'){
          for(const id of [...removed,...added]){
            const pref=doc(db,'products',id);
            usageSnapshots.set(id,{ref:pref,snap:await tx.get(pref)});
          }
        }
        const totals=compute(resolved);
        totals.total=round(Math.max(0,totals.itemsSubtotal-Number(r.data().receiptDiscount||0)+Number(r.data().tax||0)+Number(r.data().fees||0)));
        for(const i of resolved){const {id,...payload}=i;const ref=id?doc(db,'receipts',receipt.id,'items',id):doc(collection(db,'receipts',receipt.id,'items'));tx.set(ref,payload,{merge:!!id});}
        const kept=new Set(resolved.map(i=>i.id).filter(Boolean));
        for(const i of initial)if(!kept.has(i.id))tx.delete(doc(db,'receipts',receipt.id,'items',i.id));
        // Usage counters are updated in the same transaction as receipt changes.
        if(r.data().status!=='draft'){
          for(const id of [...removed,...added]){
            const {ref:pref,snap}=usageSnapshots.get(id);
            if(snap.exists()){
              const oldCount=Number(snap.data().usageCount||0);
              const nextCount=Math.max(0,oldCount+(added.includes(id)?1:-1));
              tx.update(pref,{usageCount:nextCount,isFrequent:nextCount>=5,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            }
          }
        }
        tx.update(receiptRef,{...totals,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
      });
      overlay.remove();if(onSaved)await onSaved();
    }catch(e){console.error('Edit items:',e);error.textContent=e.message;save.disabled=false;cancel.disabled=false;}
  };
}
