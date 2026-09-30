import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Promotion / Price Observation Page
// ======================================================
//
// Source of truth:
//
// receipts/{receiptId}
//   /items/{itemId}
//
// We intentionally DO NOT create a promotions collection.
//
// Historical Receipt snapshots remain unchanged.
// ======================================================


// ======================================================
// Helpers
// ======================================================

function escapeHtml(value = '') {

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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


function formatMoney(
  value,
  currency = ''
) {

  const number =
    numberOrNull(value);


  if (number === null) {
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


  return text
    ? escapeHtml(text)
    : '—';
}


function normalizeText(value = '') {

  return String(value)
    .trim()
    .toLowerCase();
}


// ======================================================
// Dates
// ======================================================

function dateOnlyToUtcMs(value) {

  const match =
    String(value || '')
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );


  if (!match) {
    return null;
  }


  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
}


function getLatestObservationDate(
  observations
) {

  return observations
    .map(item =>
      String(
        item.purchaseDate || ''
      )
    )
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}


function getRecentObservations(
  observations,
  days = 30
) {

  const latestDate =
    getLatestObservationDate(
      observations
    );


  const latestMs =
    dateOnlyToUtcMs(
      latestDate
    );


  if (latestMs === null) {
    return observations;
  }


  const cutoff =
    latestMs -
    (
      Math.max(
        Number(days) - 1,
        0
      ) *
      24 *
      60 *
      60 *
      1000
    );


  return observations.filter(item => {

    const itemMs =
      dateOnlyToUtcMs(
        item.purchaseDate
      );


    return (
      itemMs !== null &&
      itemMs >= cutoff &&
      itemMs <= latestMs
    );
  });
}


// ======================================================
// Promotion Labels
// ======================================================

function promotionTypeLabel(
  type,
  lang
) {

  const labels = {

    sale:
      lang === 'zh-TW'
        ? '特價'
        : 'Sale',

    memberPrice:
      lang === 'zh-TW'
        ? '會員價'
        : 'Member Price',

    coupon:
      'Coupon',

    clearance:
      lang === 'zh-TW'
        ? '出清'
        : 'Clearance',

    multiBuy:
      lang === 'zh-TW'
        ? '多件優惠'
        : 'Multi-buy',

    bogo:
      'BOGO',

    other:
      lang === 'zh-TW'
        ? '其他'
        : 'Other'
  };


  return labels[type] || (
    lang === 'zh-TW'
      ? '優惠'
      : 'Promotion'
  );
}


// ======================================================
// Effective Price
// ======================================================

function getEffectivePricePerPackage(
  item
) {

  const quantity =
    Number(
      item.quantity || 0
    );


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


  return numberOrNull(
    item.originalPricePerPackage
  );
}


// ======================================================
// Unit Conversion
// ======================================================
//
// Capacity describes ONE unit inside a package.
//
// total package capacity:
//
// capacity × unitsPerPackage
//
// Example:
//
// 6 bottles
// × 500 mL
// = 3000 mL / package
//
// normalized price:
//
// effective price per package
// / normalized package capacity
// ======================================================

const VOLUME_TO_ML = {

  mL: 1,

  L: 1000,

  fl_oz:
    29.5735295625,

  gal:
    3785.411784
};


function isVolumeUnit(unit) {

  return Object.prototype
    .hasOwnProperty.call(
      VOLUME_TO_ML,
      unit
    );
}


function getPackageVolumeMl(
  observation
) {

  const capacity =
    numberOrNull(
      observation.capacity
    );


  const unitsPerPackage =
    Number(
      observation.unitsPerPackage || 1
    );


  if (
    capacity === null ||
    capacity <= 0 ||
    unitsPerPackage <= 0 ||
    !isVolumeUnit(
      observation.unit
    )
  ) {
    return null;
  }


  return (
    capacity *
    unitsPerPackage *
    VOLUME_TO_ML[
      observation.unit
    ]
  );
}


function getComparisonPrice({
  observation,
  comparisonUnit
}) {

  const packagePrice =
    numberOrNull(
      observation.effectivePricePerPackage
    );


  if (packagePrice === null) {
    return null;
  }


  if (
    !comparisonUnit ||
    comparisonUnit === 'package'
  ) {

    return {
      price:
        packagePrice,

      label:
        'package'
    };
  }


  const packageMl =
    getPackageVolumeMl(
      observation
    );


  if (
    packageMl === null ||
    !isVolumeUnit(
      comparisonUnit
    )
  ) {
    return null;
  }


  const selectedUnitMl =
    VOLUME_TO_ML[
      comparisonUnit
    ];


  return {

    price:
      packagePrice *
      (
        selectedUnitMl /
        packageMl
      ),

    label:
      comparisonUnit
  };
}


function comparisonUnitLabel(
  unit
) {

  if (unit === 'mL') {
    return 'mL';
  }


  if (unit === 'L') {
    return 'L';
  }


  if (unit === 'fl_oz') {
    return 'fl oz';
  }


  return 'package';
}


// ======================================================
// Load Observations
// ======================================================

async function loadPromotionObservations(
  db
) {

  const receiptsSnapshot =
    await getDocs(
      collection(
        db,
        'receipts'
      )
    );


  const observations = [];


  for (
    const receiptDoc
    of receiptsSnapshot.docs
  ) {

    const receipt = {
      id:
        receiptDoc.id,

      ...receiptDoc.data()
    };


    // Draft is not an observed completed purchase.
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
          item.hasDiscount !== true
        ) {
          return;
        }


        observations.push({

          receiptId:
            receipt.id,

          itemId:
            item.id,

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

          store:
            receipt.store || '—',

          productId:
            item.productId || null,

          product:
            item.product || '—',

          brand:
            item.brand || '—',

          category:
            item.category || 'Other',

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

          discountedTotal:
            numberOrNull(
              item.discountedTotal
            ),

          finalTotal:
            numberOrNull(
              item.finalTotal
            ),

          effectivePricePerPackage:
            getEffectivePricePerPackage(
              item
            ),

          effectiveDiscountRate:
            numberOrNull(
              item.effectiveDiscountRate
            ),

          promotionType:
            item.promotionType ||
            'sale',

          promotionRequiredQuantity:
            numberOrNull(
              item.promotionRequiredQuantity
            ),

          promotionNote:
            item.promotionNote || '',

          notes:
            item.notes || ''
        });
      });
  }


  observations.sort(
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


  return observations;
}


// ======================================================
// Filter Options
// ======================================================

function uniqueValues(
  observations,
  field
) {

  return [
    ...new Set(
      observations
        .map(item =>
          String(
            item[field] || ''
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
            sensitivity:
              'base'
          }
        )
    );
}


function optionHtml(
  values
) {

  return values
    .map(value => `
      <option value="${
        escapeHtml(value)
      }">
        ${escapeHtml(value)}
      </option>
    `)
    .join('');
}


// ======================================================
// Filtering
// ======================================================

function filterObservations({
  observations,
  category = '',
  product = '',
  store = '',
  brand = '',
  currency = ''
}) {

  const filters = {
    category:
      normalizeText(category),

    product:
      normalizeText(product),

    store:
      normalizeText(store),

    brand:
      normalizeText(brand),

    currency:
      normalizeText(currency)
  };


  return observations.filter(
    observation => {

      for (
        const [
          field,
          expected
        ]
        of Object.entries(filters)
      ) {

        if (
          expected &&
          normalizeText(
            observation[field]
          ) !== expected
        ) {
          return false;
        }
      }


      return true;
    }
  );
}


// ======================================================
// Historical Low
// ======================================================
//
// Historical low means:
// lowest OBSERVED price in this family's Receipt history.
//
// Never compare different currencies.
//
// When a normalized volume unit is selected,
// compare normalized prices instead of package prices.
// ======================================================

function buildHistoricalLowMap({
  observations,
  comparisonUnit
}) {

  const map =
    new Map();


  observations.forEach(
    observation => {

      const comparison =
        getComparisonPrice({
          observation,
          comparisonUnit
        });


      if (!comparison) {
        return;
      }


      const key = [
        normalizeText(
          observation.product
        ),
        String(
          observation.currency || ''
        ).toUpperCase()
      ].join('||');


      const existing =
        map.get(key);


      if (
        !existing ||
        comparison.price <
          existing.price
      ) {

        map.set(
          key,
          {
            price:
              comparison.price,

            receiptId:
              observation.receiptId,

            itemId:
              observation.itemId
          }
        );
      }
    }
  );


  return map;
}


function isHistoricalLow({
  observation,
  lowMap,
  comparisonUnit
}) {

  const comparison =
    getComparisonPrice({
      observation,
      comparisonUnit
    });


  if (!comparison) {
    return false;
  }


  const key = [
    normalizeText(
      observation.product
    ),
    String(
      observation.currency || ''
    ).toUpperCase()
  ].join('||');


  const low =
    lowMap.get(key);


  if (!low) {
    return false;
  }


  return (
    Math.abs(
      comparison.price -
      low.price
    ) <
    0.000001
  );
}


// ======================================================
// Dense Observation Row
// ======================================================

function buildObservationHtml({
  observation,
  comparisonUnit,
  historicalLow,
  lang
}) {

  const effectivePrice =
    formatMoney(
      observation
        .effectivePricePerPackage,
      observation.currency
    );


  const originalPrice =
    formatMoney(
      observation
        .originalPricePerPackage,
      observation.currency
    );


  const comparison =
    getComparisonPrice({
      observation,
      comparisonUnit
    });


  const comparisonText =
    comparison &&
    comparisonUnit !== 'package'

      ? `${
          formatMoney(
            comparison.price,
            observation.currency
          )
        } / ${
          comparisonUnitLabel(
            comparisonUnit
          )
        }`

      : '';


  const requiredQuantity =
    observation
      .promotionRequiredQuantity;


  const packageDescription =
    (
      observation.capacity &&
      observation.unit
    )

      ? `${
          observation.capacity
        } ${
          comparisonUnitLabel(
            observation.unit
          )
        }${
          observation.unitsPerPackage > 1
            ? ` × ${
                observation
                  .unitsPerPackage
              }`
            : ''
        }`

      : '';


  return `
  <div
    class="
      card
      promotion-observation-card
    "
  >

    <div
      class="promotion-observation-grid"
    >

      <!-- =========================
           Product
           ========================= -->

      <div
        class="promotion-product-column"
      >

        <strong
          class="promotion-product-name"
          title="${
            escapeHtml(
              observation.product
            )
          }"
        >
          ${escapeHtml(
            observation.product
          )}
        </strong>

        <div
          class="
            muted
            promotion-product-meta
          "
        >
          ${escapeHtml(
            observation.category
          )}

          ·

          ${escapeHtml(
            observation.brand
          )}
        </div>

      </div>


      <!-- =========================
           Price
           ========================= -->

      <div
        class="promotion-price-column"
      >

        <strong
          class="promotion-price-main"
        >
          ${effectivePrice}
        </strong>

        <div
          class="
            muted
            promotion-price-label
          "
        >
          ${
            lang === 'zh-TW'
              ? '優惠實付 / 包'
              : 'Promo paid / package'
          }
        </div>


        ${
          comparisonText
            ? `
                <div
                  class="
                    promotion-normalized-price
                  "
                >
                  ${comparisonText}
                </div>
              `
            : ''
        }

      </div>


      <!-- =========================
           Promotion
           ========================= -->

      <div
        class="promotion-detail-column"
      >

        <div
          class="promotion-badges"
        >

          <span
            class="promotion-type-badge"
          >
            ${escapeHtml(
              promotionTypeLabel(
                observation
                  .promotionType,
                lang
              )
            )}
          </span>


          ${
            historicalLow
              ? `
                  <span
                    class="promotion-low-badge"
                  >
                    ${
                      lang === 'zh-TW'
                        ? '歷史新低'
                        : 'Historical Low'
                    }
                  </span>
                `
              : ''
          }

        </div>


        <div
          class="promotion-condition"
        >

          ${
            requiredQuantity
              ? `
                  <div>
                    <strong>
                      ${
                        lang === 'zh-TW'
                          ? `需買 ${
                              escapeHtml(
                                requiredQuantity
                              )
                            } 件`
                          : `Buy ${
                              escapeHtml(
                                requiredQuantity
                              )
                            } required`
                      }
                    </strong>
                  </div>
                `
              : ''
          }


          ${
            observation.promotionNote
              ? `
                  <div
                    class="
                      promotion-condition-note
                    "
                  >
                    ${escapeHtml(
                      observation
                        .promotionNote
                    )}
                  </div>
                `
              : ''
          }


          ${
            packageDescription
              ? `
                  <div
                    class="
                      muted
                      promotion-package-size
                    "
                  >
                    ${escapeHtml(
                      packageDescription
                    )}
                  </div>
                `
              : ''
          }

        </div>

      </div>


      <!-- =========================
           Store / Last observed
           ========================= -->

      <div
        class="promotion-store-column"
      >

        <strong
          class="promotion-store-name"
          title="${
            escapeHtml(
              observation.store
            )
          }"
        >
          ${escapeHtml(
            observation.store
          )}
        </strong>


        <div
          class="
            muted
            promotion-last-observed
          "
        >
          Last observed
          ·
          ${formatDate(
            observation.purchaseDate
          )}
        </div>


        <button
          type="button"
          class="promotion-receipt-button"
          data-open-promotion-receipt="${
            escapeHtml(
              observation.receiptId
            )
          }"
        >
          Receipt
        </button>

      </div>

    </div>

  </div>
`;
}


// ======================================================
// Observation List
// ======================================================

function buildObservationListHtml({
  observations,
  allHistoricalObservations,
  comparisonUnit,
  lang
}) {

  if (!observations.length) {

    return `
      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '目前沒有符合條件的優惠紀錄。'
            : 'No promotion observations match these filters.'
        }
      </p>
    `;
  }


  const lowMap =
    buildHistoricalLowMap({
      observations:
        allHistoricalObservations,
      comparisonUnit
    });


  return observations
    .map(observation =>
      buildObservationHtml({

        observation,

        comparisonUnit,

        historicalLow:
          isHistoricalLow({
            observation,
            lowMap,
            comparisonUnit
          }),

        lang
      })
    )
    .join('');
}


// ======================================================
// Page
// ======================================================

export async function promotionsPage({
  db,
  currentUser,
  currentRole,
  lang,
  page
}) {

  if (
    !db ||
    !currentUser ||
    !page
  ) {
    return;
  }


  if (
    currentRole !== 'owner'
  ) {

    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '優惠紀錄'
              : 'Promotions'
          }
        </h1>

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '只有 Owner 可以查看完整價格與優惠紀錄。'
              : 'Only the Owner can view the full price and promotion history.'
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
            ? '優惠紀錄'
            : 'Promotions'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在整理 Receipt 中的優惠價格…'
            : 'Loading promotion observations from Receipts…'
        }
      </p>

    </section>
  `;


  try {

    const allObservations =
      await loadPromotionObservations(
        db
      );


    const categories =
      uniqueValues(
        allObservations,
        'category'
      );


    const products =
      uniqueValues(
        allObservations,
        'product'
      );


    const stores =
      uniqueValues(
        allObservations,
        'store'
      );


    const brands =
      uniqueValues(
        allObservations,
        'brand'
      );


    const currencies =
      uniqueValues(
        allObservations,
        'currency'
      );


    const recentObservations =
      getRecentObservations(
        allObservations,
        30
      );


    page.innerHTML = `

      <section
        class="panel"
        style="
          padding-bottom: 12px;
        "
      >

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
              ${
                lang === 'zh-TW'
                  ? '優惠紀錄'
                  : 'Promotions'
              }
            </h1>

            <div class="muted">
              ${
                lang === 'zh-TW'
                  ? '最近 30 天的所有優惠價格；資料來自實際 Receipt observation。'
                  : 'All promotional prices observed in the latest 30-day window from actual Receipts.'
              }
            </div>

          </div>


          <div>

            <strong>
              ${recentObservations.length}
            </strong>

            <span class="muted">
              ${
                lang === 'zh-TW'
                  ? '筆近期優惠'
                  : 'recent promotions'
              }
            </span>

          </div>

        </div>

      </section>


      <section
        class="panel"
        style="
          padding-top: 12px;
          padding-bottom: 12px;
        "
      >

        <div
          style="
            display: grid;
            grid-template-columns:
              repeat(
                auto-fit,
                minmax(135px, 1fr)
              );
            gap: 8px;
          "
        >

          <label class="field">

            Category

            <select id="promotionCategoryFilter">

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '全部 Category'
                    : 'All Categories'
                }
              </option>

              ${optionHtml(
                categories
              )}

            </select>

          </label>


          <label class="field">

            Product

            <select id="promotionProductFilter">

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '全部 Product'
                    : 'All Products'
                }
              </option>

              ${optionHtml(
                products
              )}

            </select>

          </label>


          <label class="field">

            Store

            <select id="promotionStoreFilter">

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '全部 Store'
                    : 'All Stores'
                }
              </option>

              ${optionHtml(
                stores
              )}

            </select>

          </label>


          <label class="field">

            Brand

            <select id="promotionBrandFilter">

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '全部 Brand'
                    : 'All Brands'
                }
              </option>

              ${optionHtml(
                brands
              )}

            </select>

          </label>


          <label class="field">

            ${
              lang === 'zh-TW'
                ? '幣別'
                : 'Currency'
            }

            <select id="promotionCurrencyFilter">

              <option value="">
                ${
                  lang === 'zh-TW'
                    ? '全部幣別'
                    : 'All Currencies'
                }
              </option>

              ${optionHtml(
                currencies
              )}

            </select>

          </label>


          <label class="field">

            ${
              lang === 'zh-TW'
                ? '比較單位'
                : 'Comparison Unit'
            }

            <select id="promotionUnitFilter">

              <option value="package">
                ${
                  lang === 'zh-TW'
                    ? '每包'
                    : 'Per package'
                }
              </option>

              <option value="mL">
                / mL
              </option>

              <option value="L">
                / L
              </option>

              <option value="fl_oz">
                / fl oz
              </option>

            </select>

          </label>

        </div>


        <div
          class="actions"
          style="
            margin-top: 8px;
          "
        >

          <button
            id="clearPromotionFilters"
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


      <section
        class="panel"
        style="
          padding-top: 12px;
        "
      >

        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 8px;
          "
        >

          <h2
            style="
              margin: 0;
            "
          >
            ${
              lang === 'zh-TW'
                ? '最近 30 天優惠'
                : 'Promotions — Latest 30 Days'
            }
          </h2>


          <span
            id="promotionResultCount"
            class="muted"
          ></span>

        </div>


        <div
          id="promotionObservationList"
        ></div>

      </section>


      <section
        class="panel"
        style="
          padding-top: 12px;
        "
      >

        <details>

          <summary>
            <strong>
              ${
                lang === 'zh-TW'
                  ? `全部歷史優惠（${allObservations.length}）`
                  : `All Historical Promotions (${allObservations.length})`
              }
            </strong>
          </summary>

          <div
            id="promotionHistoricalList"
            style="
              margin-top: 10px;
            "
          ></div>

        </details>

      </section>
    `;


    const categoryFilter =
      document.querySelector(
        '#promotionCategoryFilter'
      );


    const productFilter =
      document.querySelector(
        '#promotionProductFilter'
      );


    const storeFilter =
      document.querySelector(
        '#promotionStoreFilter'
      );


    const brandFilter =
      document.querySelector(
        '#promotionBrandFilter'
      );


    const currencyFilter =
      document.querySelector(
        '#promotionCurrencyFilter'
      );


    const unitFilter =
      document.querySelector(
        '#promotionUnitFilter'
      );


    const clearButton =
      document.querySelector(
        '#clearPromotionFilters'
      );


    const recentContainer =
      document.querySelector(
        '#promotionObservationList'
      );


    const historicalContainer =
      document.querySelector(
        '#promotionHistoricalList'
      );


    const resultCount =
      document.querySelector(
        '#promotionResultCount'
      );


    function bindReceiptButtons() {

      document
        .querySelectorAll(
          '[data-open-promotion-receipt]'
        )
        .forEach(button => {

          button.onclick = () => {

            const receiptId =
              button.dataset
                .openPromotionReceipt;


            if (receiptId) {

              location.hash =
                `#receipt-detail/${
                  receiptId
                }`;
            }
          };
        });
    }


    function currentFilters() {

      return {

        category:
          categoryFilter?.value || '',

        product:
          productFilter?.value || '',

        store:
          storeFilter?.value || '',

        brand:
          brandFilter?.value || '',

        currency:
          currencyFilter?.value || ''
      };
    }


    function updateView() {

      const filters =
        currentFilters();


      const filteredAll =
        filterObservations({
          observations:
            allObservations,
          ...filters
        });


      const filteredRecent =
        filterObservations({
          observations:
            recentObservations,
          ...filters
        });


      const comparisonUnit =
        unitFilter?.value ||
        'package';


      recentContainer.innerHTML =
        buildObservationListHtml({

          observations:
            filteredRecent,

          allHistoricalObservations:
            filteredAll,

          comparisonUnit,

          lang
        });


      historicalContainer.innerHTML =
        buildObservationListHtml({

          observations:
            filteredAll,

          allHistoricalObservations:
            filteredAll,

          comparisonUnit,

          lang
        });


      resultCount.textContent =
        lang === 'zh-TW'
          ? `${
              filteredRecent.length
            } 筆`
          : `${
              filteredRecent.length
            } records`;


      bindReceiptButtons();
    }


    [
      categoryFilter,
      productFilter,
      storeFilter,
      brandFilter,
      currencyFilter,
      unitFilter
    ]
      .filter(Boolean)
      .forEach(select => {

        select.addEventListener(
          'change',
          updateView
        );
      });


    clearButton.onclick =
      () => {

        categoryFilter.value = '';
        productFilter.value = '';
        storeFilter.value = '';
        brandFilter.value = '';
        currencyFilter.value = '';
        unitFilter.value =
          'package';

        updateView();
      };


    updateView();


  } catch (error) {

    console.error(
      'Failed to load Promotions:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? '優惠紀錄'
              : 'Promotions'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '無法載入優惠紀錄。'
              : 'Unable to load promotion observations.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(
            error.message
          )}
        </p>

      </section>
    `;
  }
}
