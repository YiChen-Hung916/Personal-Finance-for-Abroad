import {
  getProducts,
  createProduct,
  updateProduct,
  mergeProduct,
  undoProductMerge,
  PRODUCT_CATEGORIES
} from './products.js';

import {
  getStores,
  createStore,
  updateStore,
  mergeStore,
  undoStoreMerge
} from './stores.js';

import {
  getBrands,
  createBrand,
  updateBrand,
  mergeBrand,
  undoBrandMerge
} from './brands.js';


export async function managementPage({
  db,
  currentUser,
  currentRole,
  lang,
  page
}) {

  if (
    currentRole !== 'owner' ||
    !currentUser
  ) {

    page.innerHTML = `
      <section class="panel">
        <h1>Access Denied</h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以管理 Stores / Products / Brands。'
              : 'Only the Owner can manage Stores / Products / Brands.'
          }
        </p>
      </section>
    `;

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <div class="management-heading">

        <div>
          <h1>
            ${
              lang === 'zh-TW'
                ? '資料管理'
                : 'Data Management'
            }
          </h1>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '管理商店、產品、品牌與名稱合併。'
                : 'Manage stores, products, brands, and merged names.'
            }
          </p>
        </div>

      </div>


      <div class="management-tabs">

        <button
          type="button"
          class="management-tab active"
          data-management-tab="products"
        >
          Products
        </button>

        <button
          type="button"
          class="management-tab"
          data-management-tab="stores"
        >
          Stores
        </button>

        <button
          type="button"
          class="management-tab"
          data-management-tab="brands"
        >
          Brands
        </button>

        <button
          type="button"
          class="management-tab"
          data-management-tab="users"
        >
          Users
        </button>

      </div>


      <div id="managementContent"></div>

    </section>
  `;


  document
    .querySelectorAll(
      '[data-management-tab]'
    )
    .forEach(button => {

      button.onclick = async () => {

        document
          .querySelectorAll(
            '[data-management-tab]'
          )
          .forEach(tab =>
            tab.classList.remove('active')
          );


        button.classList.add('active');


        await renderTab(
          button.dataset.managementTab
        );
      };
    });


  await renderTab('products');


  async function renderTab(tab) {

    if (tab === 'products') {
      await renderProducts();
      return;
    }

    if (tab === 'stores') {
      await renderStores();
      return;
    }

    if (tab === 'brands') {
      await renderBrands();
      return;
    }


    renderUsersPlaceholder();
  }


  // ====================================================
  // Products
  // ====================================================

  async function renderProducts() {

    const content =
      document.querySelector(
        '#managementContent'
      );


    content.innerHTML =
      `<p class="muted">Loading...</p>`;


    try {

      const products =
        await getProducts(
          db,
          {
            includeMerged: true
          }
        );


      const activeProducts =
        products.filter(product =>
          product.status !== 'merged'
        );


      const mergedProducts =
        products.filter(product =>
          product.status === 'merged'
        );


      content.innerHTML = `

        <div class="management-toolbar">

          <div>
            <h2>Products</h2>

            <p class="muted">
              ${
                lang === 'zh-TW'
                  ? 'Category 可自動辨識，也可以手動修改。'
                  : 'Categories can be detected automatically or manually corrected.'
              }
            </p>
          </div>

          <button
            id="managementAddProduct"
            class="primary"
            type="button"
          >
            ＋ ${
              lang === 'zh-TW'
                ? '新增產品'
                : 'Add Product'
            }
          </button>

        </div>


        <div id="managementProductForm"></div>


        <div class="management-list">

          ${
            activeProducts.length
              ? activeProducts
                  .map(product => `

                    <div class="management-row">

                      <div class="management-row-main">

                        <strong>
                          ${escapeLocal(product.name)}
                        </strong>

                        <span class="muted">
                          ${
                            escapeLocal(
                              product.category || 'Other'
                            )
                          }
                        </span>

                        ${
                          product.isFrequent
                            ? `
                              <span class="badge">
                                常用
                              </span>
                            `
                            : ''
                        }

                      </div>


                      <div class="management-row-meta">

                        <span>
                          ${
                            Number(
                              product.usageCount || 0
                            )
                          } 次
                        </span>

                        <button
                          type="button"
                          data-edit-product="${product.id}"
                        >
                          編輯
                        </button>

                        <button
                          type="button"
                          data-merge-product="${product.id}"
                        >
                          Merge
                        </button>

                        <button
  type="button"
  data-undo-product-main="${product.id}"
  ${
    mergedProducts.some(
      merged =>
        merged.mergedIntoId === product.id
    )
      ? ''
      : 'disabled'
  }
>
  取消合併
</button>

                      </div>

                    </div>

                  `)
                  .join('')
              : `
                  <p class="muted">
                    尚未建立產品。
                  </p>
                `
          }

        </div>

      `;


      document.querySelector(
        '#managementAddProduct'
      ).onclick =
        () => showProductForm();


      document
        .querySelectorAll(
          '[data-edit-product]'
        )
        .forEach(button => {

          button.onclick = () => {

            const product =
              products.find(item =>
                item.id ===
                button.dataset.editProduct
              );


            if (product) {
              showProductForm(product);
            }
          };
        });


      document
        .querySelectorAll(
          '[data-merge-product]'
        )
        .forEach(button => {

          button.onclick =
            () =>
              showProductMerge(
                button.dataset.mergeProduct,
                activeProducts,
                mergedProducts
              );
        });

      document
  .querySelectorAll(
    '[data-undo-product-main]'
  )
  .forEach(button => {

    button.onclick = async () => {

      const mainProductId =
        button.dataset.undoProductMain;


      const mainProduct =
        activeProducts.find(
          product =>
            product.id === mainProductId
        );


      if (!mainProduct) {
        return;
      }


      const mergedIntoThisProduct =
        mergedProducts.filter(
          product =>
            product.mergedIntoId ===
            mainProductId
        );


      if (!mergedIntoThisProduct.length) {

        alert(
          '這個 Product 沒有可以取消的 Merge。'
        );

        return;
      }


      const answer =
        prompt(
          [
            `要取消「${mainProduct.name}」的哪一次 Merge？`,
            '',
            ...mergedIntoThisProduct.map(
              (product, index) =>
                `${index + 1}. ${mainProduct.name} ↔ ${product.name}`
            ),
            '',
            '請輸入編號：'
          ].join('\n')
        );


      if (!answer) {
        return;
      }


      const selected =
        mergedIntoThisProduct[
          Number(answer) - 1
        ];


      if (!selected) {

        alert('無效的選擇。');

        return;
      }


      if (
        !confirm(
          `確定取消「${mainProduct.name} ↔ ${selected.name}」的 Merge？`
        )
      ) {
        return;
      }


      try {

        await undoProductMerge({
          db,
          currentUser,

          // selected 是當初被 merge 掉的 source
          sourceId:
            selected.id
        });


        await renderProducts();

      } catch (error) {

        console.error(error);

        alert(error.message);
      }
    };
  });

    } catch (error) {

      console.error(
        'Failed to load products:',
        error
      );


      content.innerHTML = `
        <p class="danger">
          ${escapeLocal(error.message)}
        </p>
      `;
    }
  }


  function showProductForm(
    product = null
  ) {

    const holder =
      document.querySelector(
        '#managementProductForm'
      );


    const categoryOptions =
      PRODUCT_CATEGORIES
        .map(category => `

          <option
            value="${escapeLocal(category)}"
            ${
              product?.category === category
                ? 'selected'
                : ''
            }
          >
            ${escapeLocal(category)}
          </option>

        `)
        .join('');


    holder.innerHTML = `

      <div class="management-editor">

        <h3>
          ${
            product
              ? '編輯產品'
              : '新增產品'
          }
        </h3>


        <div class="row">

          <label class="field">

            產品名稱

            <input
              id="managementProductName"
              value="${
                escapeLocal(
                  product?.name || ''
                )
              }"
              placeholder="Milk"
            >

          </label>


          <label class="field">

            Category

            <select
              id="managementProductCategory"
            >

              <option value="">
                自動辨識
              </option>

              ${categoryOptions}

            </select>

          </label>

        </div>


        <div
          id="managementCategorySuggestion"
          class="muted"
        ></div>


        <div class="actions">

          <button
            id="managementSaveProduct"
            class="primary"
            type="button"
          >
            儲存
          </button>

          <button
            id="managementCancelProduct"
            type="button"
          >
            取消
          </button>

        </div>

      </div>
    `;


    document.querySelector(
      '#managementCancelProduct'
    ).onclick =
      () => {
        holder.innerHTML = '';
      };


    document.querySelector(
      '#managementSaveProduct'
    ).onclick = async () => {

      const name =
        document.querySelector(
          '#managementProductName'
        ).value;


      const category =
        document.querySelector(
          '#managementProductCategory'
        ).value;


      try {

        if (product) {

          await updateProduct({
            db,
            currentUser,
            productId:
              product.id,
            name,
            category:
              category ||
              product.category ||
              'Other'
          });

        } else {

          await createProduct({
            db,
            currentUser,
            name,
            category
          });
        }


        await renderProducts();

      } catch (error) {

        console.error(error);

        alert(error.message);
      }
    };
  }


  function showProductMerge(
  mainProductId,
  activeProducts,
  mergedProducts
) {

  const mainProduct =
    activeProducts.find(
      product =>
        product.id === mainProductId
    );


  if (!mainProduct) {
    return;
  }


  const candidates =
  activeProducts.filter(product => {

    if (product.id === mainProductId) {
      return false;
    }


    const productIsAlreadyMain =
      mergedProducts.some(
        merged =>
          merged.mergedIntoId ===
          product.id
      );


    return !productIsAlreadyMain;
  });


  if (!candidates.length) {

    alert(
      '至少需要另一個 Product 才能 Merge。'
    );

    return;
  }


  const answer =
    prompt(
      [
        `「${mainProduct.name}」會保留為主 Product。`,
        '',
        '要把哪個 Product 合併進來？',
        '',
        ...candidates.map(
          (product, index) =>
            `${index + 1}. ${product.name}`
        ),
        '',
        '請輸入編號：'
      ].join('\n')
    );


  if (!answer) {
    return;
  }


  const sourceProduct =
    candidates[
      Number(answer) - 1
    ];


  if (!sourceProduct) {

    alert('無效的選擇。');

    return;
  }


  if (
    !confirm(
      `確定將「${sourceProduct.name}」Merge 到「${mainProduct.name}」？\n\nMerge 後主畫面會保留「${mainProduct.name}」。`
    )
  ) {
    return;
  }


  mergeProduct({
    db,
    currentUser,

    // 被隱藏
    sourceId:
      sourceProduct.id,

    // 保留在主畫面
    targetId:
      mainProduct.id
  })
    .then(renderProducts)
    .catch(error => {

      console.error(error);

      alert(error.message);
    });
}

  // ====================================================
  // Stores
  // ====================================================

  async function renderStores() {

    const content =
      document.querySelector(
        '#managementContent'
      );


    const stores =
      await getStores(
        db,
        { includeMerged: true }
      );


    renderSimpleMaster({
      title:
        'Stores',

      items:
        stores,

      createLabel:
        '新增商店',

      placeholder:
        'Giant Eagle',

      createFunction:
        createStore,

      updateFunction:
        updateStore,

      mergeFunction:
        mergeStore,

      undoFunction:
        undoStoreMerge,

      rerender:
        renderStores
    });
  }


  // ====================================================
  // Brands
  // ====================================================

  async function renderBrands() {

    const brands =
      await getBrands(
        db,
        { includeMerged: true }
      );


    renderSimpleMaster({
      title:
        'Brands',

      items:
        brands,

      createLabel:
        '新增品牌',

      placeholder:
        'Chobani',

      createFunction:
        createBrand,
      
      updateFunction:
        updateBrand,


      mergeFunction:
        mergeBrand,

      undoFunction:
        undoBrandMerge,

      rerender:
        renderBrands
    });
  }


  // ====================================================
  // Generic Store / Brand UI
  // ====================================================

  function renderSimpleMaster({
  title,
  items,
  createLabel,
  placeholder,
  createFunction,
  updateFunction,
  mergeFunction,
  undoFunction,
  rerender
}) {

    const content =
      document.querySelector(
        '#managementContent'
      );


    const active =
      items.filter(item =>
        item.status !== 'merged'
      );


    const merged =
      items.filter(item =>
        item.status === 'merged'
      );


    content.innerHTML = `

      <div class="management-toolbar">

        <h2>${escapeLocal(title)}</h2>

        <button
          id="managementSimpleAdd"
          class="primary"
          type="button"
        >
          ＋ ${escapeLocal(createLabel)}
        </button>

      </div>


      <div
        id="managementSimpleForm"
      ></div>


      <div class="management-list">

        ${
          active.length
            ? active
                .map(item => `

                  <div class="management-row">

                    <div class="management-row-main">

                      <strong>
                        ${escapeLocal(item.name)}
                      </strong>

                      ${
                        Number(item.usageCount || 0)
                          ? `
                              <span class="muted">
                                ${
                                  Number(
                                    item.usageCount
                                  )
                                } 次
                              </span>
                            `
                          : ''
                      }

                    </div>


                    <div class="management-row-meta">

                    <button
    type="button"
    data-simple-edit="${item.id}"
  >
    編輯
  </button>

  <button
    type="button"
    data-simple-merge="${item.id}"
  >
    Merge
  </button>

  <button
    type="button"
    data-simple-undo-main="${item.id}"
    ${
      merged.some(
        mergedItem =>
          mergedItem.mergedIntoId ===
          item.id
      )
        ? ''
        : 'disabled'
    }
  >
    取消合併
  </button>

</div>

                  </div>

                `)
                .join('')
            : `
                <p class="muted">
                  尚無資料。
                </p>
              `
        }

      </div>


    `;


    document.querySelector(
      '#managementSimpleAdd'
    ).onclick = () => {

      document.querySelector(
        '#managementSimpleForm'
      ).innerHTML = `

        <div class="management-editor">

          <label class="field">

            名稱

            <input
              id="managementSimpleName"
              placeholder="${escapeLocal(placeholder)}"
            >

          </label>


          <div class="actions">

            <button
              id="managementSimpleSave"
              class="primary"
              type="button"
            >
              儲存
            </button>

            <button
              id="managementSimpleCancel"
              type="button"
            >
              取消
            </button>

          </div>

        </div>
      `;


      document.querySelector(
        '#managementSimpleCancel'
      ).onclick =
        () => {
          document.querySelector(
            '#managementSimpleForm'
          ).innerHTML = '';
        };


      document.querySelector(
        '#managementSimpleSave'
      ).onclick = async () => {

        const name =
          document.querySelector(
            '#managementSimpleName'
          ).value;


        try {

          await createFunction({
            db,
            currentUser,
            name
          });


          await rerender();

        } catch (error) {

          console.error(error);

          alert(error.message);
        }
      };
    };



    document
  .querySelectorAll(
    '[data-simple-edit]'
  )
  .forEach(button => {

    button.onclick = () => {

      const item =
        active.find(
          candidate =>
            candidate.id ===
            button.dataset.simpleEdit
        );


      if (!item) {
        return;
      }


      const holder =
        document.querySelector(
          '#managementSimpleForm'
        );


      holder.innerHTML = `

        <div class="management-editor">

          <h3>
            編輯${title === 'Stores' ? '商店' : '品牌'}
          </h3>

          <label class="field">

            名稱

            <input
              id="managementSimpleEditName"
              value="${escapeLocal(item.name)}"
            >

          </label>


          <div class="actions">

            <button
              id="managementSimpleEditSave"
              class="primary"
              type="button"
            >
              儲存
            </button>

            <button
              id="managementSimpleEditCancel"
              type="button"
            >
              取消
            </button>

          </div>

        </div>
      `;


      document.querySelector(
        '#managementSimpleEditCancel'
      ).onclick = () => {

        holder.innerHTML = '';
      };


      document.querySelector(
        '#managementSimpleEditSave'
      ).onclick = async () => {

        const name =
          document.querySelector(
            '#managementSimpleEditName'
          ).value;


        try {

          if (title === 'Stores') {

            await updateFunction({
              db,
              currentUser,
              storeId:
                item.id,
              name
            });

          } else {

            await updateFunction({
              db,
              currentUser,
              brandId:
                item.id,
              name
            });
          }


          await rerender();

        } catch (error) {

          console.error(error);

          alert(error.message);
        }
      };
    };
  });


    
    document
  .querySelectorAll(
    '[data-simple-merge]'
  )
  .forEach(button => {

    button.onclick = async () => {

      const mainItem =
        active.find(
          item =>
            item.id ===
            button.dataset.simpleMerge
        );


      if (!mainItem) {
        return;
      }


      const candidates =
        active.filter(item => {

          if (item.id === mainItem.id) {
            return false;
          }


          const itemIsAlreadyMain =
            merged.some(
              mergedItem =>
                mergedItem.mergedIntoId ===
                item.id
            );


          return !itemIsAlreadyMain;
        });


      if (!candidates.length) {

        alert(
          '沒有其他可合併的資料。'
        );

        return;
      }


      const answer =
        prompt(
          [
            `「${mainItem.name}」會保留為主項目。`,
            '',
            '要把哪一筆合併進來？',
            '',
            ...candidates.map(
              (item, index) =>
                `${index + 1}. ${item.name}`
            ),
            '',
            '請輸入編號：'
          ].join('\n')
        );


      if (!answer) {
        return;
      }


      const sourceItem =
        candidates[
          Number(answer) - 1
        ];


      if (!sourceItem) {

        alert('無效的選擇。');

        return;
      }


      if (
        !confirm(
          `確定將「${sourceItem.name}」Merge 到「${mainItem.name}」？\n\nMerge 後主畫面會保留「${mainItem.name}」。`
        )
      ) {
        return;
      }


      try {

        await mergeFunction({
          db,
          currentUser,

          // 消失
          sourceId:
            sourceItem.id,

          // 主項目
          targetId:
            mainItem.id
        });


        await rerender();

      } catch (error) {

        console.error(error);

        alert(error.message);
      }
    };
  });


    document
  .querySelectorAll(
    '[data-simple-undo-main]'
  )
  .forEach(button => {

    button.onclick = async () => {

      const mainId =
        button.dataset.simpleUndoMain;


      const mainItem =
        active.find(
          item =>
            item.id === mainId
        );


      if (!mainItem) {
        return;
      }


      const mergedIntoMain =
        merged.filter(
          item =>
            item.mergedIntoId ===
            mainId
        );


      if (!mergedIntoMain.length) {

        alert(
          '這個項目沒有可以取消的 Merge。'
        );

        return;
      }


      const answer =
        prompt(
          [
            `要取消「${mainItem.name}」的哪一次 Merge？`,
            '',
            ...mergedIntoMain.map(
              (item, index) =>
                `${index + 1}. ${mainItem.name} ↔ ${item.name}`
            ),
            '',
            '請輸入編號：'
          ].join('\n')
        );


      if (!answer) {
        return;
      }


      const selected =
        mergedIntoMain[
          Number(answer) - 1
        ];


      if (!selected) {

        alert('無效的選擇。');

        return;
      }


      if (
        !confirm(
          `確定取消「${mainItem.name} ↔ ${selected.name}」的 Merge？`
        )
      ) {
        return;
      }


      try {

        await undoFunction({
          db,
          currentUser,

          // undo function 本來就是收 sourceId
          sourceId:
            selected.id
        });


        await rerender();

      } catch (error) {

        console.error(error);

        alert(error.message);
      }
    };
  });
  }


  // ====================================================
  // Users
  // ====================================================

  function renderUsersPlaceholder() {

    document.querySelector(
      '#managementContent'
    ).innerHTML = `

      <div class="management-toolbar">

        <div>

          <h2>Users</h2>

          <p class="muted">
            Users 已經存在於目前的 Firestore。
            下一階段會把現有使用者管理功能接到這裡，
            不會建立第二套 users collection。
          </p>

        </div>

      </div>
    `;
  }
}


// ======================================================
// Local Escape
// ======================================================

function escapeLocal(value = '') {

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
