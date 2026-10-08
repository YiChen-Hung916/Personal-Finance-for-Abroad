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

import {
  getUsers,
  updateManagedUser,
  getUserDisplayName,
  getUserRoleLabel
} from './users.js';

import {
  renderForeignCurrencyStores
} from './foreign-currency-available.js';

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
              ? '只有 Owner 可以管理 Products / Stores / Brands / Users。'
              : 'Only the Owner can manage Products / Stores / Brands / Users.'
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
                ? '管理產品、商店、品牌與家庭成員。'
                : 'Manage products, stores, brands, and family members.'
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

        <button
  type="button"
  class="management-tab"
  data-management-tab="foreign-currency"
>
  可用外幣的店家
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


if (tab === 'users') {
  await renderUsers();
  return;
}

    if (tab === 'foreign-currency') {
  await renderForeignCurrencyStores({
    db,
    container: document.querySelector('#managementContent'),
    lang
  });
  return;
}
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
  data-view-product="${product.id}"
>
  查看
</button>

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
    '[data-view-product]'
  )
  .forEach(button => {

    button.onclick = () => {

      const productId =
        button.dataset.viewProduct;


      if (!productId) {
        return;
      }


      location.hash =
        `#product-detail/${
          productId
        }`;
    };
  });

      
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
  sourceProductId,
  activeProducts,
  mergedProducts
) {

  const sourceProduct =
    activeProducts.find(
      product =>
        product.id === sourceProductId
    );


  if (!sourceProduct) {
    return;
  }


  // 如果這個 Product 自己已經是其他 Merge 的主項，
  // 先要求取消底下的 Merge，避免形成 chain。
  const sourceHasMergedChildren =
    mergedProducts.some(
      merged =>
        merged.mergedIntoId ===
        sourceProduct.id
    );


  if (sourceHasMergedChildren) {

    alert(
      `「${sourceProduct.name}」目前是其他 Merge 的主 Product。\n\n請先取消它現有的 Merge，再把它合併到其他 Product。`
    );

    return;
  }


  const candidates =
    activeProducts.filter(product => {

      if (product.id === sourceProduct.id) {
        return false;
      }


      // 可以選一般 active Product，
      // 也可以選已經是主項的 Product 作為 target。
      return true;
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
        `要把「${sourceProduct.name}」Merge 到哪個 Product？`,
        '',
        '選擇後，被選的 Product 會保留在主畫面。',
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


  const targetProduct =
    candidates[
      Number(answer) - 1
    ];


  if (!targetProduct) {

    alert('無效的選擇。');

    return;
  }


  if (
    !confirm(
      `確定將「${sourceProduct.name}」Merge 到「${targetProduct.name}」？\n\nMerge 後「${sourceProduct.name}」會從主畫面隱藏，只保留「${targetProduct.name}」。`
    )
  ) {
    return;
  }


  mergeProduct({
    db,
    currentUser,

    // 按 Merge 的 Product → 消失
    sourceId:
      sourceProduct.id,

    // 選擇的 Product → 保留
    targetId:
      targetProduct.id
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


    // ====================================================
    // Store / Brand Merge
    // ====================================================

    document
      .querySelectorAll(
        '[data-simple-merge]'
      )
      .forEach(button => {

        button.onclick = async () => {

          // 按 Merge 的這一筆 = source = 要消失
          const sourceItem =
            active.find(
              item =>
                item.id ===
                button.dataset.simpleMerge
            );


          if (!sourceItem) {
            return;
          }


          // 如果這一筆本身已經是其他 Merge 的主項，
          // 先取消底下的 Merge，避免形成 chain。
          const sourceHasMergedChildren =
            merged.some(
              mergedItem =>
                mergedItem.mergedIntoId ===
                sourceItem.id
            );


          if (sourceHasMergedChildren) {

            alert(
              `「${sourceItem.name}」目前是其他 Merge 的主項目。\n\n請先取消它現有的 Merge，再把它合併到其他項目。`
            );

            return;
          }


          // 可以 Merge 到任何其他 active 項目。
          // target 即使已經有其他 source merge 進去，
          // 仍然可以繼續作為主項。
          const candidates =
            active.filter(
              item =>
                item.id !== sourceItem.id
            );


          if (!candidates.length) {

            alert(
              '沒有其他可合併的資料。'
            );

            return;
          }


          const answer =
            prompt(
              [
                `要把「${sourceItem.name}」Merge 到哪一筆？`,
                '',
                '選擇後，被選的項目會保留在主畫面。',
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


          const targetItem =
            candidates[
              Number(answer) - 1
            ];


          if (!targetItem) {

            alert('無效的選擇。');

            return;
          }


          if (
            !confirm(
              `確定將「${sourceItem.name}」Merge 到「${targetItem.name}」？\n\nMerge 後「${sourceItem.name}」會從主畫面隱藏，只保留「${targetItem.name}」。`
            )
          ) {
            return;
          }


          try {

            await mergeFunction({
              db,
              currentUser,

              // 按 Merge 的項目 → 消失
              sourceId:
                sourceItem.id,

              // 選擇的項目 → 保留
              targetId:
                targetItem.id
            });


            await rerender();

          } catch (error) {

            console.error(error);

            alert(error.message);
          }
        };
      });


    // ====================================================
    // Store / Brand Undo Merge
    // ====================================================

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

              // 被 merge 掉的 source
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

async function renderUsers() {

  const content =
    document.querySelector(
      '#managementContent'
    );


  content.innerHTML = `
    <p class="muted">
      ${
        lang === 'zh-TW'
          ? '正在載入 Users…'
          : 'Loading users…'
      }
    </p>
  `;


  try {

    const users =
      await getUsers(db);


    const activeCount =
      users.filter(
        user =>
          user.active === true
      ).length;


    const ownerCount =
      users.filter(
        user =>
          user.active === true &&
          user.role === 'owner'
      ).length;


    const userRows =
      users.length
        ? users
            .map(user => {

              const displayName =
                getUserDisplayName(
                  user
                );


              const roleLabel =
                getUserRoleLabel(
                  user.role,
                  lang
                );


              const isCurrentUser =
                user.id ===
                currentUser.uid;


              const active =
                user.active === true;


              return `

                <div
                  class="management-row"
                >

                  <div
                    class="management-row-main"
                  >

                    <div>

                      <strong>
                        ${escapeLocal(
                          displayName
                        )}
                      </strong>

                      ${
                        isCurrentUser
                          ? `
                              <span class="badge">
                                ${
                                  lang === 'zh-TW'
                                    ? '你'
                                    : 'You'
                                }
                              </span>
                            `
                          : ''
                      }

                    </div>


                    ${
                      user.email
                        ? `
                            <span class="muted">
                              ${escapeLocal(
                                user.email
                              )}
                            </span>
                          `
                        : ''
                    }


                    <span class="muted">
                      UID:
                      ${escapeLocal(
                        user.id
                      )}
                    </span>

                  </div>


                  <div
                    class="management-row-meta"
                  >

                    <span class="badge">
                      ${escapeLocal(
                        roleLabel
                      )}
                    </span>


                    <span
                      class="${
                        active
                          ? 'badge'
                          : 'muted'
                      }"
                    >
                      ${
                        active
                          ? (
                              lang === 'zh-TW'
                                ? '使用中'
                                : 'Active'
                            )
                          : (
                              lang === 'zh-TW'
                                ? '已停用'
                                : 'Inactive'
                            )
                      }
                    </span>


                    <button
                      type="button"
                      data-edit-user="${
                        escapeLocal(
                          user.id
                        )
                      }"
                    >
                      ${
                        lang === 'zh-TW'
                          ? '編輯'
                          : 'Edit'
                      }
                    </button>

                  </div>

                </div>
              `;
            })
            .join('')

        : `
            <p class="muted">
              ${
                lang === 'zh-TW'
                  ? '目前沒有 User。'
                  : 'No users found.'
              }
            </p>
          `;


    content.innerHTML = `

      <div class="management-toolbar">

        <div>

          <h2>Users</h2>

          <p class="muted">
            ${
              lang === 'zh-TW'
                ? '管理家庭成員的顯示名稱、角色與使用狀態。'
                : 'Manage family member display names, roles, and access status.'
            }
          </p>

        </div>

      </div>


      <div
        class="row"
        style="
          margin-bottom: 16px;
        "
      >

        <div class="card">

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '總 Users'
                : 'Total Users'
            }
          </div>

          <strong>
            ${users.length}
          </strong>

        </div>


        <div class="card">

          <div class="muted">
            ${
              lang === 'zh-TW'
                ? '使用中'
                : 'Active'
            }
          </div>

          <strong>
            ${activeCount}
          </strong>

        </div>


        <div class="card">

          <div class="muted">
            Active Owners
          </div>

          <strong>
            ${ownerCount}
          </strong>

        </div>

      </div>


      <div
        id="managementUserForm"
      ></div>


      <div class="management-list">

        ${userRows}

      </div>

    `;


    document
      .querySelectorAll(
        '[data-edit-user]'
      )
      .forEach(button => {

        button.onclick =
          () => {

            const user =
              users.find(
                item =>
                  item.id ===
                  button.dataset.editUser
              );


            if (user) {
              showUserForm(
                user
              );
            }
          };
      });


  } catch (error) {

    console.error(
      'Failed to load users:',
      error
    );


    content.innerHTML = `
      <p class="danger">
        ${escapeLocal(
          error.message
        )}
      </p>
    `;
  }
}


// ====================================================
// User Editor
// ====================================================

function showUserForm(user) {

  const holder =
    document.querySelector(
      '#managementUserForm'
    );


  if (
    !holder ||
    !user
  ) {
    return;
  }


  const displayName =
    String(
      user.displayName ||
      user.name ||
      ''
    ).trim();


  const isCurrentUser =
    user.id ===
    currentUser.uid;


  holder.innerHTML = `

    <div class="management-editor">

      <h3>
        ${
          lang === 'zh-TW'
            ? '編輯 User'
            : 'Edit User'
        }
      </h3>


      <div class="row">

        <label class="field">

          ${
            lang === 'zh-TW'
              ? '顯示名稱'
              : 'Display Name'
          }

          <input
            id="managementUserDisplayName"
            value="${
              escapeLocal(
                displayName
              )
            }"
            placeholder="Yi-Chen"
          >

        </label>


        <label class="field">

          Role

          <select
            id="managementUserRole"
            ${
              isCurrentUser
                ? 'disabled'
                : ''
            }
          >

            <option
              value="owner"
              ${
                user.role === 'owner'
                  ? 'selected'
                  : ''
              }
            >
              Owner
            </option>


            <option
              value="authorizedUser"
              ${
                user.role ===
                'authorizedUser'
                  ? 'selected'
                  : ''
              }
            >
              ${
                lang === 'zh-TW'
                  ? '家庭成員'
                  : 'Authorized User'
              }
            </option>

          </select>

        </label>

      </div>


      <div
        style="
          margin-top: 12px;
        "
      >

        <label
          style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
          "
        >

          <span>
            ${
              lang === 'zh-TW'
                ? '使用中'
                : 'Active'
            }
          </span>

          <input
            id="managementUserActive"
            type="checkbox"
            ${
              user.active === true
                ? 'checked'
                : ''
            }
            ${
              isCurrentUser
                ? 'disabled'
                : ''
            }
          >

        </label>

      </div>


      ${
        user.email
          ? `
              <p
                class="muted"
                style="
                  margin-top: 12px;
                "
              >
                Email:
                ${escapeLocal(
                  user.email
                )}
              </p>
            `
          : ''
      }


      <p class="muted">
        UID:
        ${escapeLocal(
          user.id
        )}
      </p>


      ${
        isCurrentUser
          ? `
              <p class="muted">
                ${
                  lang === 'zh-TW'
                    ? '目前登入中的 Owner 不能在這裡停用自己或把自己的 Role 降級。'
                    : 'The currently signed-in Owner cannot disable or demote themselves here.'
                }
              </p>
            `
          : ''
      }


      <div class="actions">

        <button
          id="managementSaveUser"
          class="primary"
          type="button"
        >
          ${
            lang === 'zh-TW'
              ? '儲存'
              : 'Save'
          }
        </button>


        <button
          id="managementCancelUser"
          type="button"
        >
          ${
            lang === 'zh-TW'
              ? '取消'
              : 'Cancel'
          }
        </button>

      </div>

    </div>
  `;


  document.querySelector(
    '#managementCancelUser'
  ).onclick =
    () => {

      holder.innerHTML = '';
    };


  document.querySelector(
    '#managementSaveUser'
  ).onclick =
    async () => {

      const saveButton =
        document.querySelector(
          '#managementSaveUser'
        );


      const displayNameInput =
        document.querySelector(
          '#managementUserDisplayName'
        );


      const roleInput =
        document.querySelector(
          '#managementUserRole'
        );


      const activeInput =
        document.querySelector(
          '#managementUserActive'
        );


      const displayName =
        displayNameInput.value;


      // Disabled controls still keep
      // the existing value explicitly.
      const role =
        isCurrentUser
          ? user.role
          : roleInput.value;


      const active =
        isCurrentUser
          ? user.active === true
          : activeInput.checked;


      try {

        saveButton.disabled =
          true;


        await updateManagedUser({
          db,
          currentUser,
          userId:
            user.id,
          displayName,
          role,
          active
        });


        await renderUsers();


      } catch (error) {

        console.error(
          'Failed to update user:',
          error
        );


        alert(
          error.message
        );


        saveButton.disabled =
          false;
      }
    };
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
