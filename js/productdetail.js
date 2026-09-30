import {
  collection,
  doc,
  getDoc,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import {
  getProducts,
  normalizeProductKey
} from './products.js';


// ======================================================
// Product Detail
// ======================================================
//
// Product Detail is derived from:
// - Product master data
// - Receipt documents
// - Receipt item subcollections
//
// We intentionally DO NOT create a separate priceHistory
// collection.
//
// Historical Receipt snapshots remain unchanged.
// ======================================================


// ======================================================
// Helpers
// ======================================================

function escapeHtml(value) {

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function formatMoney(
  value,
  currency = ''
) {

  const number =
    Number(value);


  if (!Number.isFinite(number)) {
    return '—';
  }


  return `${
    escapeHtml(
      String(currency || '')
        .trim()
        .toUpperCase()
    )
  } ${number.toFixed(2)}`.trim();
}


function formatDate(value) {

  const text =
    String(value || '').trim();


  if (!text) {
    return '—';
  }


  // Receipt purchaseDate is already YYYY-MM-DD.
  // Keep it stable instead of introducing timezone
  // conversion through new Date().
  return escapeHtml(text);
}


function numberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;
}


// ======================================================
// Effective Price Per Package
// ======================================================
//
// Receipt item currently stores:
//
// originalPricePerPackage
// quantity
// finalTotal
//
// finalTotal is the total actually paid for the item row.
//
// Therefore:
//
// actual price per package
// = finalTotal / quantity
//
// Example:
//
// Milk
// quantity = 2
// finalTotal = 8.00
//
// actual price/package = 4.00
//
// This is the value used for price-history comparison.
// ======================================================

function getEffectivePricePerPackage(
  item
) {

  const quantity =
    Number(item.quantity || 0);


  const finalTotal =
    numberOrNull(
      item.finalTotal
    );


  if (
    finalTotal !== null &&
    quantity > 0
  ) {

    return (
      finalTotal /
      quantity
    );
  }


  // Fallback for older Receipt data.
  return numberOrNull(
    item.originalPricePerPackage
  );
}


// ======================================================
// Product Matching
// ======================================================

function getProductMatchInfo({
  product,
  allProducts
}) {

  const acceptedIds =
    new Set([
      product.id
    ]);


  const acceptedNames =
    new Set();


  const addName =
    value => {

      const key =
        normalizeProductKey(
          value
        );


      if (key) {
        acceptedNames.add(key);
      }
    };


  // Current canonical name
  addName(
    product.name
  );


  // Current canonical aliases
  (
    Array.isArray(product.aliases)
      ? product.aliases
      : []
  )
    .forEach(addName);


  // ----------------------------------------------------
  // Include Products that were merged INTO this Product.
  //
  // Example:
  //
  // Whole Milk → Milk
  //
  // Old Receipt:
  // productId = Whole Milk ID
  //
  // Product Detail:
  // Milk
  //
  // The old Receipt should still appear.
  // ----------------------------------------------------

  allProducts
    .filter(item =>
      item.status === 'merged' &&
      item.mergedIntoId ===
        product.id
    )
    .forEach(item => {

      acceptedIds.add(
        item.id
      );


      addName(
        item.name
      );


      (
        Array.isArray(item.aliases)
          ? item.aliases
          : []
      )
        .forEach(addName);
    });


  return {
    acceptedIds,
    acceptedNames
  };
}


function itemMatchesProduct({
  item,
  acceptedIds,
  acceptedNames
}) {

  // ----------------------------------------------------
  // Preferred:
  // exact Product ID relationship
  // ----------------------------------------------------

  if (
    item.productId &&
    acceptedIds.has(
      item.productId
    )
  ) {
    return true;
  }


  // ----------------------------------------------------
  // Historical fallback:
  //
  // Older Receipts may predate productId.
  // Match their Product snapshot by canonical name/alias.
  // ----------------------------------------------------

  const productKey =
    normalizeProductKey(
      item.product ||
      item.productKey ||
      ''
    );


  return (
    productKey &&
    acceptedNames.has(
      productKey
    )
  );
}


// ======================================================
// Load Product Purchase History
// ======================================================

async function loadProductHistory({
  db,
  product,
  allProducts
}) {

  const {
    acceptedIds,
    acceptedNames
  } =
    getProductMatchInfo({
      product,
      allProducts
    });


  const receiptsSnapshot =
    await getDocs(
      collection(
        db,
        'receipts'
      )
    );


  const history = [];


  // ----------------------------------------------------
  // We intentionally read each Receipt's items.
  //
  // This avoids introducing a new collectionGroup query
  // and avoids changing Firestore Rules / indexes in this
  // phase.
  //
  // The app is a private family-finance app, so this is
  // acceptable for the current data scale.
  // ----------------------------------------------------

  for (
    const receiptDoc
    of receiptsSnapshot.docs
  ) {

    const receipt = {
      id:
        receiptDoc.id,

      ...receiptDoc.data()
    };


    // Drafts are not purchase history.
    if (
      receipt.status === 'draft'
    ) {
      continue;
    }


    const itemsSnapshot =
      await getDocs(
        collection(
          db,
          'receipts',
          receiptDoc.id,
          'items'
        )
      );


    itemsSnapshot.docs
      .forEach(itemDoc => {

        const item = {
          id:
            itemDoc.id,

          ...itemDoc.data()
        };


        if (
          !itemMatchesProduct({
            item,
            acceptedIds,
            acceptedNames
          })
        ) {
          return;
        }


        history.push({

          receiptId:
            receipt.id,

          receiptStatus:
            receipt.status || '',

          purchaseDate:
            receipt.purchaseDate || '',

          purchaseTime:
            receipt.purchaseTime || '',

          currency:
            String(
              receipt.currency || ''
            )
              .trim()
              .toUpperCase(),

          // Historical Store snapshot.
          // Do NOT replace this with current Store master.
          store:
            receipt.store || '—',

          product:
            item.product ||
            product.name ||
            '—',

          brand:
            item.brand || '—',

          category:
            item.category ||
            product.category ||
            'Other',

          quantity:
            Number(
              item.quantity || 0
            ),

          unitsPerPackage:
            Number(
              item.unitsPerPackage || 1
            ),

          capacity:
            item.capacity ?? null,

          unit:
            item.unit || '',

          originalPricePerPackage:
            numberOrNull(
              item.originalPricePerPackage
            ),

          finalTotal:
            numberOrNull(
              item.finalTotal
            ),

          effectivePricePerPackage:
            getEffectivePricePerPackage(
              item
            ),

          hasDiscount:
            item.hasDiscount === true,

          promotionNote:
            item.promotionNote || '',

          notes:
            item.notes || ''
        });
      });
  }


  // Newest first
  history.sort(
    (a, b) => {

      const aKey =
        `${
          a.purchaseDate || ''
        } ${
          a.purchaseTime || ''
        }`;


      const bKey =
        `${
          b.purchaseDate || ''
        } ${
          b.purchaseTime || ''
        }`;


      return bKey.localeCompare(
        aKey
      );
    }
  );


  return history;
}


// ======================================================
// Product History Filters
// ======================================================

function normalizeFilterValue(
  value = ''
) {

  return String(value)
    .trim()
    .toLowerCase();
}


function getUniqueHistoryValues(
  history,
  field
) {

  return [
    ...new Set(
      history
        .map(entry =>
          String(
            entry[field] || ''
          ).trim()
        )
        .filter(Boolean)
    )
  ]
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          undefined,
          {
            sensitivity: 'base'
          }
        )
    );
}


function filterProductHistory({
  history,
  brand = '',
  store = '',
  currency = ''
}) {

  const brandKey =
    normalizeFilterValue(
      brand
    );


  const storeKey =
    normalizeFilterValue(
      store
    );


  const currencyKey =
    normalizeFilterValue(
      currency
    );


  return history.filter(entry => {

    if (
      brandKey &&
      normalizeFilterValue(
        entry.brand
      ) !== brandKey
    ) {
      return false;
    }


    if (
      storeKey &&
      normalizeFilterValue(
        entry.store
      ) !== storeKey
    ) {
      return false;
    }


    if (
      currencyKey &&
      normalizeFilterValue(
        entry.currency
      ) !== currencyKey
    ) {
      return false;
    }


    return true;
  });
}


// ======================================================
// Price Summary
// ======================================================

function buildPriceSummary(
  history
) {

  const byCurrency =
    new Map();


  history.forEach(entry => {

    const price =
      numberOrNull(
        entry.effectivePricePerPackage
      );


    const currency =
      String(
        entry.currency || ''
      )
        .trim()
        .toUpperCase();


    if (
      price === null ||
      !currency
    ) {
      return;
    }


    if (
      !byCurrency.has(currency)
    ) {

      byCurrency.set(
        currency,
        []
      );
    }


    byCurrency
      .get(currency)
      .push(entry);
  });


  return Array
    .from(
      byCurrency.entries()
    )
    .map(
      ([currency, entries]) => {

        const prices =
          entries
            .map(entry =>
              Number(
                entry.effectivePricePerPackage
              )
            )
            .filter(
              Number.isFinite
            );


        const latest =
          entries[0] || null;


        return {

          currency,

          count:
            prices.length,

          latest:
            latest
              ? Number(
                  latest.effectivePricePerPackage
                )
              : null,

          minimum:
            prices.length
              ? Math.min(
                  ...prices
                )
              : null,

          maximum:
            prices.length
              ? Math.max(
                  ...prices
                )
              : null
        };
      }
    );
}


// ======================================================
// Price Summary HTML
// ======================================================

function buildPriceSummaryHtml({
  history,
  lang
}) {

  const priceSummary =
    buildPriceSummary(
      history
    );


  if (!priceSummary.length) {

    return `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '目前沒有符合篩選條件的價格紀錄。'
            : 'No price records match the current filters.'
        }
      </p>
    `;
  }


  return priceSummary
    .map(summary => `

      <div class="card">

        <strong>
          ${escapeHtml(
            summary.currency
          )}
        </strong>


        <div
          class="row"
          style="
            margin-top: 10px;
          "
        >

          <div>

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '最近'
                  : 'Latest'
              }
            </div>

            <strong>
              ${formatMoney(
                summary.latest,
                summary.currency
              )}
            </strong>

          </div>


          <div>

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '最低'
                  : 'Lowest'
              }
            </div>

            <strong>
              ${formatMoney(
                summary.minimum,
                summary.currency
              )}
            </strong>

          </div>


          <div>

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '最高'
                  : 'Highest'
              }
            </div>

            <strong>
              ${formatMoney(
                summary.maximum,
                summary.currency
              )}
            </strong>

          </div>


          <div>

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '紀錄數'
                  : 'Records'
              }
            </div>

            <strong>
              ${summary.count}
            </strong>

          </div>

        </div>

      </div>

    `)
    .join('');
}


// ======================================================
// Product History HTML
// ======================================================

function buildProductHistoryHtml({
  history,
  lang
}) {

  if (!history.length) {

    return `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '目前沒有符合篩選條件的購買紀錄。'
            : 'No purchases match the current filters.'
        }
      </p>
    `;
  }


  return history
    .map(entry => {

      const finalPrice =
        formatMoney(
          entry.effectivePricePerPackage,
          entry.currency
        );


      const originalPrice =
        formatMoney(
          entry.originalPricePerPackage,
          entry.currency
        );


      const discountBadge =
        entry.hasDiscount
          ? `
              <span class="badge">
                ${
                  lang === 'zh-TW'
                    ? '折扣'
                    : 'Discount'
                }
              </span>
            `
          : '';


      return `

        <div
          class="card product-history-entry"
        >

          <div
            style="
              display: flex;
              justify-content: space-between;
              gap: 12px;
              align-items: flex-start;
              flex-wrap: wrap;
            "
          >

            <div>

              <strong>
                ${formatDate(
                  entry.purchaseDate
                )}
              </strong>

              <div class="muted">
                ${escapeHtml(
                  entry.store
                )}
              </div>

            </div>


            <div
              style="
                text-align: right;
              "
            >

              <strong>
                ${finalPrice}
              </strong>

              <div class="muted">
                ${
                  lang === 'zh-TW'
                    ? '實付 / 包'
                    : 'Paid / package'
                }
              </div>

            </div>

          </div>


          <div
            class="row"
            style="
              margin-top: 10px;
            "
          >

            <div>

              <span class="muted">
                Brand
              </span>

              <div>
                ${escapeHtml(
                  entry.brand
                )}
              </div>

            </div>


            <div>

              <span class="muted">
                ${
                  lang === 'zh-TW'
                    ? '原價 / 包'
                    : 'Original / package'
                }
              </span>

              <div>
                ${originalPrice}
              </div>

            </div>


            <div>

              <span class="muted">
                ${
                  lang === 'zh-TW'
                    ? '數量'
                    : 'Quantity'
                }
              </span>

              <div>
                ${escapeHtml(
                  entry.quantity
                )}
              </div>

            </div>

          </div>


          ${
            entry.capacity ||
            entry.unit
              ? `
                  <div
                    class="muted"
                    style="
                      margin-top: 8px;
                    "
                  >

                    ${
                      entry.capacity
                        ? escapeHtml(
                            entry.capacity
                          )
                        : ''
                    }

                    ${
                      entry.unit
                        ? escapeHtml(
                            entry.unit
                          )
                        : ''
                    }

                    ${
                      entry.unitsPerPackage > 1
                        ? ` × ${
                            escapeHtml(
                              entry.unitsPerPackage
                            )
                          } / ${
                            lang === 'zh-TW'
                              ? '包'
                              : 'package'
                          }`
                        : ''
                    }

                  </div>
                `
              : ''
          }


          ${
            discountBadge
              ? `
                  <div
                    style="
                      margin-top: 8px;
                    "
                  >

                    ${discountBadge}

                    ${
                      entry.promotionNote
                        ? `
                            <span class="muted">
                              ${escapeHtml(
                                entry.promotionNote
                              )}
                            </span>
                          `
                        : ''
                    }

                  </div>
                `
              : ''
          }


          <div
            class="actions"
            style="
              margin-top: 10px;
            "
          >

            <button
              type="button"
              data-open-product-receipt="${
                escapeHtml(
                  entry.receiptId
                )
              }"
            >
              ${
                lang === 'zh-TW'
                  ? '查看 Receipt'
                  : 'View Receipt'
              }
            </button>

          </div>

        </div>
      `;
    })
    .join('');
}


// ======================================================
// Price Trend Chart
// ======================================================

function buildPriceTrendHtml({
  history,
  lang
}) {

  const validEntries =
    history
      .filter(entry => {

        const price =
          numberOrNull(
            entry.effectivePricePerPackage
          );


        return (
          price !== null &&
          entry.currency &&
          entry.purchaseDate
        );
      });


  if (!validEntries.length) {

    return `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '目前沒有足夠的價格資料可以繪製趨勢。'
            : 'There is not enough price data to draw a trend.'
        }
      </p>
    `;
  }


  const currencies =
    [
      ...new Set(
        validEntries.map(
          entry =>
            String(
              entry.currency
            )
              .trim()
              .toUpperCase()
        )
      )
    ];


  // Never mix currencies on one chart.
  if (currencies.length > 1) {

    return `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '請先選擇單一幣別，才能查看價格趨勢。'
            : 'Select one currency to view the price trend.'
        }
      </p>
    `;
  }


  const currency =
    currencies[0];


  const entries =
    [...validEntries]
      .sort((a, b) => {

        const aKey =
          `${
            a.purchaseDate || ''
          } ${
            a.purchaseTime || ''
          }`;


        const bKey =
          `${
            b.purchaseDate || ''
          } ${
            b.purchaseTime || ''
          }`;


        return aKey.localeCompare(
          bKey
        );
      });


  const width = 720;
  const height = 300;

  const left = 70;
  const right = 24;
  const top = 30;
  const bottom = 55;

  const plotWidth =
    width - left - right;

  const plotHeight =
    height - top - bottom;


  const prices =
    entries.map(entry =>
      Number(
        entry.effectivePricePerPackage
      )
    );


  let minPrice =
    Math.min(
      ...prices
    );


  let maxPrice =
    Math.max(
      ...prices
    );


  // If every price is identical,
  // create a small visible Y range.
  if (minPrice === maxPrice) {

    const padding =
      Math.max(
        Math.abs(minPrice) * 0.05,
        0.5
      );


    minPrice -= padding;
    maxPrice += padding;
  }


  const range =
    maxPrice - minPrice;


  const xForIndex =
    index => {

      if (entries.length === 1) {
        return left + plotWidth / 2;
      }


      return (
        left +
        (
          index /
          (entries.length - 1)
        ) *
        plotWidth
      );
    };


  const yForPrice =
    price =>
      top +
      (
        (
          maxPrice - price
        ) /
        range
      ) *
      plotHeight;


  const points =
    entries.map(
      (entry, index) => ({

        entry,

        x:
          xForIndex(index),

        y:
          yForPrice(
            Number(
              entry.effectivePricePerPackage
            )
          )
      })
    );


  const polylinePoints =
    points
      .map(point =>
        `${
          point.x.toFixed(1)
        },${
          point.y.toFixed(1)
        }`
      )
      .join(' ');


  const yTicks =
    [0, 0.25, 0.5, 0.75, 1]
      .map(position => {

        const value =
          maxPrice -
          range * position;


        const y =
          top +
          plotHeight * position;


        return `
          <line
            x1="${left}"
            y1="${y}"
            x2="${width - right}"
            y2="${y}"
            stroke="currentColor"
            opacity="0.10"
          ></line>

          <text
            x="${left - 10}"
            y="${y + 4}"
            text-anchor="end"
            font-size="12"
            fill="currentColor"
            opacity="0.75"
          >
            ${value.toFixed(2)}
          </text>
        `;
      })
      .join('');


  const circles =
    points
      .map(point => `

        <circle
          cx="${point.x}"
          cy="${point.y}"
          r="5"
          fill="currentColor"
        >

          <title>
            ${escapeHtml(
              point.entry.purchaseDate
            )}
            ·
            ${escapeHtml(
              point.entry.store
            )}
            ·
            ${escapeHtml(
              point.entry.brand
            )}
            ·
            ${escapeHtml(currency)}
            ${Number(
              point.entry
                .effectivePricePerPackage
            ).toFixed(2)}
          </title>

        </circle>

      `)
      .join('');


  // Do not print every date when there are many records.
  const maxDateLabels = 6;


  const labelIndexes =
    new Set();


  if (entries.length <= maxDateLabels) {

    entries.forEach(
      (_, index) =>
        labelIndexes.add(index)
    );

  } else {

    for (
      let i = 0;
      i < maxDateLabels;
      i += 1
    ) {

      labelIndexes.add(
        Math.round(
          i *
          (entries.length - 1) /
          (maxDateLabels - 1)
        )
      );
    }
  }


  const dateLabels =
    points
      .map((point, index) => {

        if (
          !labelIndexes.has(index)
        ) {
          return '';
        }


        return `
          <text
            x="${point.x}"
            y="${height - 20}"
            text-anchor="middle"
            font-size="11"
            fill="currentColor"
            opacity="0.75"
          >
            ${escapeHtml(
              point.entry.purchaseDate
            )}
          </text>
        `;
      })
      .join('');


  return `

    <div
      style="
        overflow-x: auto;
        width: 100%;
      "
    >

      <svg
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="${
          lang === 'zh-TW'
            ? '價格趨勢圖'
            : 'Price trend chart'
        }"
        style="
          display: block;
          width: 100%;
          min-width: 560px;
          height: auto;
        "
      >

        ${yTicks}


        <line
          x1="${left}"
          y1="${top}"
          x2="${left}"
          y2="${height - bottom}"
          stroke="currentColor"
          opacity="0.35"
        ></line>


        <line
          x1="${left}"
          y1="${height - bottom}"
          x2="${width - right}"
          y2="${height - bottom}"
          stroke="currentColor"
          opacity="0.35"
        ></line>


        ${
          points.length > 1
            ? `
                <polyline
                  points="${polylinePoints}"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                ></polyline>
              `
            : ''
        }


        ${circles}

        ${dateLabels}


        <text
          x="${left}"
          y="18"
          font-size="12"
          font-weight="600"
          fill="currentColor"
        >
          ${escapeHtml(currency)} / ${
            lang === 'zh-TW'
              ? '包'
              : 'package'
          }
        </text>

      </svg>

    </div>


    <p class="muted">
      ${
        lang === 'zh-TW'
          ? `共 ${entries.length} 筆符合條件的價格紀錄。將滑鼠移到資料點可查看日期、Store、Brand 與價格。`
          : `${entries.length} matching price records. Hover over a point to see its date, store, brand, and price.`
      }
    </p>
  `;
}


// ======================================================
// Main Page
// ======================================================

export async function productDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  productId
}) {

  if (
    !db ||
    !currentUser ||
    !page ||
    !productId
  ) {
    return;
  }


  // Product management is currently Owner-only.
  if (
    currentRole !== 'owner'
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '無權存取'
              : 'Access Denied'
          }
        </h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以查看 Product Detail。'
              : 'Only the Owner can view Product Detail.'
          }
        </p>

      </section>
    `;

    return;
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? 'Product Detail'
            : 'Product Detail'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入產品與購買紀錄…'
            : 'Loading product and purchase history…'
        }
      </p>

    </section>
  `;


  try {

    // ==================================================
    // Load Product
    // ==================================================

    const productSnapshot =
      await getDoc(
        doc(
          db,
          'products',
          productId
        )
      );


    if (
      !productSnapshot.exists()
    ) {

      page.innerHTML = `
        <section class="panel">

          <h1>
            Product Detail
          </h1>

          <p class="danger">
            ${
              lang === 'zh-TW'
                ? '找不到這個 Product。'
                : 'Product could not be found.'
            }
          </p>

          <button
            type="button"
            onclick="location.hash='#management'"
          >
            ${
              lang === 'zh-TW'
                ? '返回資料管理'
                : 'Back to Data Management'
            }
          </button>

        </section>
      `;

      return;
    }


    const product = {
      id:
        productSnapshot.id,

      ...productSnapshot.data()
    };


    // If somebody manually opens the URL of a merged
    // Product, redirect to its canonical Product.
    if (
      product.status === 'merged' &&
      product.mergedIntoId
    ) {

      location.hash =
        `#product-detail/${
          product.mergedIntoId
        }`;

      return;
    }


    // Need merged Products too, because old Receipt
    // productIds may point to them.
    const allProducts =
      await getProducts(
        db,
        {
          includeMerged: true
        }
      );


    // ==================================================
    // Purchase History
    // ==================================================

    const history =
      await loadProductHistory({
        db,
        product,
        allProducts
      });


    


    // ==================================================
    // Aliases
    // ==================================================

    const aliases =
      [
        ...new Set(
          (
            Array.isArray(
              product.aliases
            )
              ? product.aliases
              : []
          )
            .filter(Boolean)
        )
      ];


    // ==================================================
// Filter Options
// ==================================================

const brands =
  getUniqueHistoryValues(
    history,
    'brand'
  );


const stores =
  getUniqueHistoryValues(
    history,
    'store'
  );


const currencies =
  getUniqueHistoryValues(
    history,
    'currency'
  );


const brandOptions =
  brands
    .map(brand => `
      <option value="${escapeHtml(brand)}">
        ${escapeHtml(brand)}
      </option>
    `)
    .join('');


const storeOptions =
  stores
    .map(store => `
      <option value="${escapeHtml(store)}">
        ${escapeHtml(store)}
      </option>
    `)
    .join('');


const currencyOptions =
  currencies
    .map(currency => `
      <option value="${escapeHtml(currency)}">
        ${escapeHtml(currency)}
      </option>
    `)
    .join('');

    
    // ==================================================
// Initial Price Summary
// ==================================================

const summaryHtml =
  buildPriceSummaryHtml({
    history,
    lang
  });

    // ==================================================
// Initial History
// ==================================================

const historyHtml =
  buildProductHistoryHtml({
    history,
    lang
  });


const trendHtml =
  buildPriceTrendHtml({
    history,
    lang
  });

    
    // ==================================================
    // Render Page
    // ==================================================

    page.innerHTML = `

      <section class="panel">

        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            flex-wrap: wrap;
          "
        >

          <div>

            <h1
              style="
                margin-bottom: 4px;
              "
            >
              ${escapeHtml(
                product.name
              )}
            </h1>

            <div class="muted">
              ${escapeHtml(
                product.category ||
                'Other'
              )}
            </div>

          </div>


          <button
            id="productDetailBack"
            type="button"
          >
            ${
              lang === 'zh-TW'
                ? '返回 Products'
                : 'Back to Products'
            }
          </button>

        </div>


        <div
          class="row"
          style="
            margin-top: 18px;
          "
        >

          <div class="card">

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '購買次數'
                  : 'Usage Count'
              }
            </div>

            <strong>
              ${Number(
                product.usageCount || 0
              )}
            </strong>

          </div>


          <div class="card">

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '常用'
                  : 'Frequent'
              }
            </div>

            <strong>
              ${
                product.isFrequent
                  ? (
                      lang === 'zh-TW'
                        ? '是'
                        : 'Yes'
                    )
                  : (
                      lang === 'zh-TW'
                        ? '否'
                        : 'No'
                    )
              }
            </strong>

          </div>


          <div class="card">

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '價格紀錄'
                  : 'Price Records'
              }
            </div>

            <strong>
              ${history.length}
            </strong>

          </div>

        </div>

      </section>


      <section class="panel">

        <h2>
          Aliases
        </h2>

        ${
          aliases.length
            ? `
                <div
                  style="
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                  "
                >
                  ${
                    aliases
                      .map(alias => `
                        <span class="badge">
                          ${escapeHtml(alias)}
                        </span>
                      `)
                      .join('')
                  }
                </div>
              `
            : `
                <p class="muted">
                  ${
                    lang === 'zh-TW'
                      ? '沒有 Alias。'
                      : 'No aliases.'
                  }
                </p>
              `
        }

      </section>


<section class="panel">

  <h2>
    ${
      lang === 'zh-TW'
        ? '篩選'
        : 'Filters'
    }
  </h2>


  <div class="row">

    <label class="field">

      ${
        lang === 'zh-TW'
          ? 'Brand'
          : 'Brand'
      }

      <select id="productHistoryBrandFilter">

        <option value="">
          ${
            lang === 'zh-TW'
              ? '全部 Brand'
              : 'All Brands'
          }
        </option>

        ${brandOptions}

      </select>

    </label>


    <label class="field">

      ${
        lang === 'zh-TW'
          ? 'Store'
          : 'Store'
      }

      <select id="productHistoryStoreFilter">

        <option value="">
          ${
            lang === 'zh-TW'
              ? '全部 Store'
              : 'All Stores'
          }
        </option>

        ${storeOptions}

      </select>

    </label>


    <label class="field">

      ${
        lang === 'zh-TW'
          ? '幣別'
          : 'Currency'
      }

      <select id="productHistoryCurrencyFilter">

        <option value="">
          ${
            lang === 'zh-TW'
              ? '全部幣別'
              : 'All Currencies'
          }
        </option>

        ${currencyOptions}

      </select>

    </label>

  </div>


  <div class="actions">

    <button
      id="clearProductHistoryFilters"
      type="button"
    >
      ${
        lang === 'zh-TW'
          ? '清除篩選'
          : 'Clear Filters'
      }
    </button>

  </div>

</section>


      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '價格摘要'
              : 'Price Summary'
          }
        </h2>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '以每包實際支付金額比較；不同幣別分開計算。'
              : 'Prices are compared by effective paid amount per package. Currencies are summarized separately.'
          }
        </p>

        <div id="productPriceSummary">
  ${summaryHtml}
</div>

      </section>


      <section class="panel">

  <h2>
    ${
      lang === 'zh-TW'
        ? '價格趨勢'
        : 'Price Trend'
    }
  </h2>


  <p class="muted">
    ${
      lang === 'zh-TW'
        ? '以每包實際支付金額顯示；不同幣別不會混在同一張圖。'
        : 'Based on effective paid amount per package. Different currencies are never mixed on one chart.'
    }
  </p>


  <div id="productPriceTrend">
    ${trendHtml}
  </div>

</section>


      <section class="panel">

        <h2>
          ${
            lang === 'zh-TW'
              ? '價格歷史'
              : 'Price History'
          }
        </h2>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? 'Store 與 Brand 使用購買當時的 Receipt snapshot。'
              : 'Store and Brand use the historical Receipt snapshots.'
          }
        </p>

        <div id="productPriceHistory">
  ${historyHtml}
</div>

      </section>
    `;


    // ==================================================
    // Events
    // ==================================================

    document
      .querySelector(
        '#productDetailBack'
      )
      .onclick = () => {

        location.hash =
          '#management';
      };


    function bindProductReceiptButtons() {

  document
    .querySelectorAll(
      '[data-open-product-receipt]'
    )
    .forEach(button => {

      button.onclick = () => {

        const receiptId =
          button.dataset
            .openProductReceipt;


        if (!receiptId) {
          return;
        }


        location.hash =
          `#receipt-detail/${
            receiptId
          }`;
      };
    });
}


bindProductReceiptButtons();

// ==================================================
// Product History Filters
// ==================================================

const brandFilter =
  document.querySelector(
    '#productHistoryBrandFilter'
  );


const storeFilter =
  document.querySelector(
    '#productHistoryStoreFilter'
  );


const currencyFilter =
  document.querySelector(
    '#productHistoryCurrencyFilter'
  );


const clearFiltersButton =
  document.querySelector(
    '#clearProductHistoryFilters'
  );


const summaryContainer =
  document.querySelector(
    '#productPriceSummary'
  );


const trendContainer =
  document.querySelector(
    '#productPriceTrend'
  );


const historyContainer =
  document.querySelector(
    '#productPriceHistory'
  );


function updateProductHistoryView() {

  const filteredHistory =
    filterProductHistory({

      history,

      brand:
        brandFilter?.value || '',

      store:
        storeFilter?.value || '',

      currency:
        currencyFilter?.value || ''
    });


  if (summaryContainer) {

    summaryContainer.innerHTML =
      buildPriceSummaryHtml({
        history:
          filteredHistory,
        lang
      });
  }


  if (trendContainer) {

    trendContainer.innerHTML =
      buildPriceTrendHtml({
        history:
          filteredHistory,
        lang
      });
  }


  if (historyContainer) {

    historyContainer.innerHTML =
      buildProductHistoryHtml({
        history:
          filteredHistory,
        lang
      });
  }


  // History buttons were recreated.
  bindProductReceiptButtons();
}


[
  brandFilter,
  storeFilter,
  currencyFilter
]
  .filter(Boolean)
  .forEach(select => {

    select.addEventListener(
      'change',
      updateProductHistoryView
    );
  });


if (clearFiltersButton) {

  clearFiltersButton.onclick =
    () => {

      if (brandFilter) {
        brandFilter.value = '';
      }


      if (storeFilter) {
        storeFilter.value = '';
      }


      if (currencyFilter) {
        currencyFilter.value = '';
      }


      updateProductHistoryView();
    };
}

  
  } catch (error) {

    console.error(
      'Failed to load Product Detail:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          Product Detail
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '無法載入 Product Detail。'
              : 'Unable to load Product Detail.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(
            error.message
          )}
        </p>

        <button
          type="button"
          onclick="location.hash='#management'"
        >
          ${
            lang === 'zh-TW'
              ? '返回資料管理'
              : 'Back to Data Management'
          }
        </button>

      </section>
    `;
  }
}
