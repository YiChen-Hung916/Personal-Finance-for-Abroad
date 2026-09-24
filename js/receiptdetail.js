// ======================================================
// Receipt Detail
//
// Purpose:
// Display one receipt and all of its item details.
//
// Access:
// 1. Owner:
//    Can view every receipt.
//
// 2. Authorized User:
//    Can only view receipts where
//    receipt.confirmationUserId === currentUser.uid
//
// This module is shared by:
// - My Confirmations
// - Pending
// - History
// - Mismatch
// - Owner receipt views
// ======================================================


import {
  doc,
  getDoc,
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


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


function formatMoney(value, currency) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${escapeHtml(currency || '')} ${number.toFixed(2)}`;
}


function formatNumber(value) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return String(number);
}


function displayValue(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  return escapeHtml(value);
}


// ======================================================
// Main Page
// ======================================================

export async function receiptDetailPage({
  db,
  currentUser,
  currentRole,
  lang,
  page,
  receiptId
}) {

  // ----------------------------------------------------
  // Required dependencies
  // ----------------------------------------------------

  if (
    !db ||
    !currentUser ||
    !currentRole ||
    !page ||
    !receiptId
  ) {

    console.error(
      'receiptDetailPage: missing required dependency.'
    );

    return;
  }


  // ----------------------------------------------------
  // Loading
  // ----------------------------------------------------

  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? 'Receipt 明細'
            : 'Receipt Details'
        }
      </h1>

      <p class="muted">
        ${
          lang === 'zh-TW'
            ? '正在載入…'
            : 'Loading…'
        }
      </p>

    </section>
  `;


  try {

    // ==================================================
    // Load Receipt
    // ==================================================

    const receiptRef =
      doc(
        db,
        'receipts',
        receiptId
      );


    const receiptSnapshot =
      await getDoc(
        receiptRef
      );


    // --------------------------------------------------
    // Receipt does not exist
    // --------------------------------------------------

    if (!receiptSnapshot.exists()) {

      renderNotFound(
        page,
        lang
      );

      return;
    }


    const receipt = {
      id: receiptSnapshot.id,
      ...receiptSnapshot.data()
    };


    // ==================================================
    // Front-end Access Check
    // ==================================================

    const isOwner =
      currentRole === 'owner';


    const isAssignedUser =
      receipt.confirmationUserId ===
      currentUser.uid;


    if (
      !isOwner &&
      !isAssignedUser
    ) {

      renderAccessDenied(
        page,
        lang
      );

      return;
    }


    // ==================================================
    // Load Items
    // ==================================================

    const itemsSnapshot =
      await getDocs(
        collection(
          db,
          'receipts',
          receiptId,
          'items'
        )
      );


    const items =
      itemsSnapshot.docs.map(
        itemDoc => ({
          id: itemDoc.id,
          ...itemDoc.data()
        })
      );

    // ==================================================
    // Load Card / Confirmation User Display Data
    // ==================================================

    let cardDisplay = '—';
    let confirmationUserDisplay = '—';


    if (
      receipt.paymentMethod === 'card' &&
      receipt.cardId
    ) {

      try {

        const cardSnapshot =
          await getDoc(
            doc(
              db,
              'cards',
              receipt.cardId
            )
          );


        if (cardSnapshot.exists()) {

          const card =
            cardSnapshot.data();

          const cardParts = [
            card.issuer,
            card.network,
            card.last4
              ? `•••• ${card.last4}`
              : ''
          ]
            .filter(Boolean);


          if (cardParts.length > 0) {
            cardDisplay =
              cardParts.join(' · ');
          }

        }

      } catch (error) {

        console.error(
          'Failed to load card display data:',
          error
        );

      }

    }


    if (
      receipt.paymentMethod === 'card' &&
      receipt.confirmationUserId
    ) {

      try {

        const userSnapshot =
          await getDoc(
            doc(
              db,
              'users',
              receipt.confirmationUserId
            )
          );


        if (userSnapshot.exists()) {

          const user =
            userSnapshot.data();

          confirmationUserDisplay =
            user.displayAs ||
            user.displayName ||
            '—';

        }

      } catch (error) {

        console.error(
          'Failed to load confirmation user display data:',
          error
        );

      }

    }

    
    // ==================================================
    // Render
    // ==================================================

    renderReceiptDetail({
      page,
      receipt,
      items,
      cardDisplay,
      confirmationUserDisplay,
      lang
    });


  } catch (error) {

    console.error(
      'Failed to load receipt detail:',
      error
    );


    page.innerHTML = `
      <section class="panel">

        <h1>
          ${
            lang === 'zh-TW'
              ? 'Receipt 明細'
              : 'Receipt Details'
          }
        </h1>

        <p class="danger">
          ${
            lang === 'zh-TW'
              ? '無法載入 Receipt 明細。'
              : 'Unable to load receipt details.'
          }
        </p>

        <p class="muted">
          ${escapeHtml(error.message)}
        </p>

        <div class="actions">

          <button
            type="button"
            onclick="history.back()"
          >
            ${
              lang === 'zh-TW'
                ? '返回'
                : 'Back'
            }
          </button>

        </div>

      </section>
    `;
  }
}


// ======================================================
// Render Receipt
// ======================================================

function renderReceiptDetail({
  page,
  receipt,
  items,
  cardDisplay,
  confirmationUserDisplay,
  lang
}) {

  const currency =
    String(
      receipt.currency || ''
    )
      .trim()
      .toUpperCase();


  const expectedCurrency =
    String(
      receipt.expectedSettlementCurrency ||
      receipt.currency ||
      ''
    )
      .trim()
      .toUpperCase();


  const paymentMethodText =
    receipt.paymentMethod === 'cash'
      ? (
          lang === 'zh-TW'
            ? '現金'
            : 'Cash'
        )
      : (
          lang === 'zh-TW'
            ? '信用卡'
            : 'Card'
        );


  const statusText =
    getStatusText(
      receipt.status,
      lang
    );


  page.innerHTML = `

    <section class="panel">

      <!-- ============================================= -->
      <!-- Header                                        -->
      <!-- ============================================= -->

      <div
        class="actions"
        style="
          align-items: center;
        "
      >

        <div>

          <h1>
            ${
              lang === 'zh-TW'
                ? 'Receipt 明細'
                : 'Receipt Details'
            }
          </h1>

          <p class="muted">
            ${escapeHtml(receipt.id)}
          </p>

        </div>

        <button
          type="button"
          id="receiptDetailBack"
          style="
            width: auto;
            min-width: 0;
            padding: 6px 12px;
            margin-left: auto;
            align-self: center;
            font-size: 0.9rem;
            line-height: 1.2;
          "
        >
          ${
            lang === 'zh-TW'
              ? '返回'
              : 'Back'
          }
        </button>

      </div>


      <!-- ============================================= -->
      <!-- Store                                         -->
      <!-- ============================================= -->

      <div class="card">

        <h2>
          ${displayValue(receipt.store)}
        </h2>


        ${
          receipt.branch
            ? `
                <p class="muted">
                  ${escapeHtml(receipt.branch)}
                </p>
              `
            : ''
        }


        <div class="grid">

          ${detailField(
            lang === 'zh-TW'
              ? '購買日期'
              : 'Purchase Date',
            receipt.purchaseDate
          )}

          ${detailField(
            lang === 'zh-TW'
              ? '購買時間'
              : 'Purchase Time',
            receipt.purchaseTime
          )}

          ${detailField(
            lang === 'zh-TW'
              ? '狀態'
              : 'Status',
            statusText
          )}

          ${detailField(
            lang === 'zh-TW'
              ? '付款方式'
              : 'Payment Method',
            paymentMethodText
          )}

        </div>

      </div>


      <!-- ============================================= -->
      <!-- Items                                         -->
      <!-- ============================================= -->

      <div class="card">

        <h2>
          ${
            lang === 'zh-TW'
              ? '商品明細'
              : 'Items'
          }
        </h2>


        ${
          items.length === 0

            ? `
                <p class="muted">
                  ${
                    lang === 'zh-TW'
                      ? '此 Receipt 沒有商品資料。'
                      : 'No item data is available.'
                  }
                </p>
              `

            : items
                .map(
                  (item, index) =>
                    itemHtml({
                      item,
                      index,
                      currency,
                      lang
                    })
                )
                .join('')
        }

      </div>


      <!-- ============================================= -->
      <!-- Amount Summary                                -->
      <!-- ============================================= -->

      <div class="card">

        <h2>
          ${
            lang === 'zh-TW'
              ? '金額摘要'
              : 'Amount Summary'
          }
        </h2>


        <div class="grid">

          ${moneyField(
            lang === 'zh-TW'
              ? '商品原價小計'
              : 'Original Items Subtotal',
            receipt.originalItemsSubtotal,
            currency
          )}


          ${moneyField(
            lang === 'zh-TW'
              ? '商品折扣'
              : 'Item Discounts',
            receipt.itemDiscountTotal,
            currency
          )}


          ${moneyField(
            lang === 'zh-TW'
              ? '商品折後小計'
              : 'Items Subtotal',
            receipt.itemsSubtotal,
            currency
          )}


          ${moneyField(
            lang === 'zh-TW'
              ? '整筆 Receipt 折扣'
              : 'Receipt Discount',
            receipt.receiptDiscount,
            currency
          )}


          ${moneyField(
            lang === 'zh-TW'
              ? '稅'
              : 'Tax',
            receipt.tax,
            currency
          )}


          ${moneyField(
            lang === 'zh-TW'
              ? '其他費用'
              : 'Fees',
            receipt.fees,
            currency
          )}

        </div>


        <hr>


        <div class="my-confirmation-total">

          <div class="muted">

            ${
              lang === 'zh-TW'
                ? 'Receipt 總額'
                : 'Receipt Total'
            }

          </div>


          <strong>

            ${formatMoney(
              receipt.total,
              currency
            )}

          </strong>

        </div>

      </div>


      <!-- ============================================= -->
      <!-- Payment                                       -->
      <!-- ============================================= -->

      <div class="card">

        <h2>
          ${
            lang === 'zh-TW'
              ? '付款資訊'
              : 'Payment'
          }
        </h2>


        <div class="grid">

          ${detailField(
            lang === 'zh-TW'
              ? '付款方式'
              : 'Payment Method',
            paymentMethodText
          )}


          ${
            receipt.paymentMethod === 'card'

              ? detailField(
                  lang === 'zh-TW'
                    ? 'Card ID'
                    : 'Card ID',
                  cardDisplay
                )

              : ''
          }


          ${
            receipt.paymentMethod === 'card'

              ? detailField(
                  lang === 'zh-TW'
                    ? '交易確認人'
                    : 'Confirmation User',
                  confirmationUserDisplay
                )

              : ''
          }


          ${detailField(
            lang === 'zh-TW'
              ? 'Receipt 幣值'
              : 'Receipt Currency',
            currency
          )}


          ${
            receipt.paymentMethod === 'card'

              ? detailField(
                  lang === 'zh-TW'
                    ? '預期信用卡入帳幣值'
                    : 'Expected Settlement Currency',
                  expectedCurrency
                )

              : ''
          }

        </div>


        ${
          receipt.foreignCurrencySettlementOffered === true

            ? `
                <p class="muted">

                  ${
                    lang === 'zh-TW'
                      ? `此交易曾提供幣值選擇，並選擇以 Receipt 幣值 ${escapeHtml(currency)} 結帳。`
                      : `A currency choice was offered and the receipt currency ${escapeHtml(currency)} was selected.`
                  }

                </p>
              `

            : ''
        }

      </div>


      <!-- ============================================= -->
      <!-- Receipt Notes                                 -->
      <!-- ============================================= -->

      ${
        receipt.notes

          ? `
              <div class="card">

                <h2>
                  ${
                    lang === 'zh-TW'
                      ? 'Receipt 備註'
                      : 'Receipt Notes'
                  }
                </h2>

                <p>
                  ${formatMultilineText(
                    receipt.notes
                  )}
                </p>

              </div>
            `

          : ''
      }


    </section>
  `;


  // ====================================================
  // Back Button
  // ====================================================

  const backButton =
    page.querySelector(
      '#receiptDetailBack'
    );


  if (backButton) {

    backButton.addEventListener(
      'click',
      () => {

        history.back();

      }
    );
  }
}


// ======================================================
// Item HTML
// ======================================================

function itemHtml({
  item,
  index,
  currency,
  lang
}) {

  return `

    <div class="item">

      <h3>

        ${index + 1}.
        ${displayValue(item.product)}

      </h3>


      <div class="grid">

        ${
          item.brand

            ? detailField(
                lang === 'zh-TW'
                  ? '品牌'
                  : 'Brand',
                item.brand
              )

            : ''
        }


        ${
          item.category

            ? detailField(
                lang === 'zh-TW'
                  ? '分類'
                  : 'Category',
                item.category
              )

            : ''
        }


        ${detailField(
          lang === 'zh-TW'
            ? '數量'
            : 'Quantity',
          formatNumber(
            item.quantity
          )
        )}


        ${
          item.unitsPerPackage

            ? detailField(
                lang === 'zh-TW'
                  ? '每包數量'
                  : 'Units per Package',
                formatNumber(
                  item.unitsPerPackage
                )
              )

            : ''
        }


        ${
          item.capacity

            ? detailField(
                lang === 'zh-TW'
                  ? '容量 / 規格'
                  : 'Capacity',
                `${
                  formatNumber(
                    item.capacity
                  )
                } ${
                  escapeHtml(
                    item.unit || ''
                  )
                }`
              )

            : ''
        }


        ${moneyField(
          lang === 'zh-TW'
            ? '每包原價'
            : 'Original Price per Package',
          item.originalPricePerPackage,
          currency
        )}


        ${moneyField(
          lang === 'zh-TW'
            ? '原價小計'
            : 'Original Subtotal',
          item.originalSubtotal,
          currency
        )}


        ${
          item.hasDiscount === true

            ? moneyField(
                lang === 'zh-TW'
                  ? '折扣後金額'
                  : 'Discounted Total',
                item.discountedTotal,
                currency
              )

            : ''
        }


        ${moneyField(
          lang === 'zh-TW'
            ? '最終金額'
            : 'Final Total',
          item.finalTotal,
          currency
        )}

      </div>


      ${
        item.hasDiscount === true &&
        item.effectiveDiscountRate !==
          null &&
        item.effectiveDiscountRate !==
          undefined

          ? `
              <p class="muted">

                ${
                  lang === 'zh-TW'
                    ? '實際折扣率'
                    : 'Effective Discount Rate'
                }:
                
                ${formatDiscountRate(
                  item.effectiveDiscountRate
                )}

              </p>
            `

          : ''
      }


      ${
        item.promotionNote

          ? `
              <div>

                <strong>
                  ${
                    lang === 'zh-TW'
                      ? '促銷備註'
                      : 'Promotion Note'
                  }
                </strong>

                <p>
                  ${formatMultilineText(
                    item.promotionNote
                  )}
                </p>

              </div>
            `

          : ''
      }


      ${
        item.notes

          ? `
              <div>

                <strong>
                  ${
                    lang === 'zh-TW'
                      ? '商品備註'
                      : 'Item Notes'
                  }
                </strong>

                <p>
                  ${formatMultilineText(
                    item.notes
                  )}
                </p>

              </div>
            `

          : ''
      }

    </div>
  `;
}


// ======================================================
// Detail Field
// ======================================================

function detailField(
  label,
  value
) {

  return `
    <div>

      <div class="muted">
        ${escapeHtml(label)}
      </div>

      <div>
        ${displayValue(value)}
      </div>

    </div>
  `;
}


// ======================================================
// Money Field
// ======================================================

function moneyField(
  label,
  value,
  currency
) {

  const number =
    Number(value);


  if (!Number.isFinite(number)) {

    return `
      <div>

        <div class="muted">
          ${escapeHtml(label)}
        </div>

        <div>
          —
        </div>

      </div>
    `;
  }


  return `
    <div>

      <div class="muted">
        ${escapeHtml(label)}
      </div>

      <div>
        ${formatMoney(
          number,
          currency
        )}
      </div>

    </div>
  `;
}


// ======================================================
// Discount Rate
// ======================================================

function formatDiscountRate(value) {

  const rate =
    Number(value);


  if (!Number.isFinite(rate)) {
    return '—';
  }


  return `${(rate * 10).toFixed(2)} 折`;
}


// ======================================================
// Multiline Text
// ======================================================

function formatMultilineText(value) {

  return escapeHtml(value)
    .replaceAll(
      '\n',
      '<br>'
    );
}


// ======================================================
// Status
// ======================================================

function getStatusText(
  status,
  lang
) {

  const statusMapZh = {
    draft: '草稿',
    pending: '待確認',
    confirmed: '已確認',
    mismatch: '資料不符',
    resolved: '已處理'
  };


  const statusMapEn = {
    draft: 'Draft',
    pending: 'Pending',
    confirmed: 'Confirmed',
    mismatch: 'Mismatch',
    resolved: 'Resolved'
  };


  const map =
    lang === 'zh-TW'
      ? statusMapZh
      : statusMapEn;


  return (
    map[status] ||
    status ||
    '—'
  );
}


// ======================================================
// Access Denied
// ======================================================

function renderAccessDenied(
  page,
  lang
) {

  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '無權檢視'
            : 'Access Denied'
        }
      </h1>


      <p class="muted">

        ${
          lang === 'zh-TW'
            ? '你沒有權限檢視這筆 Receipt。'
            : 'You do not have permission to view this receipt.'
        }

      </p>


      <div class="actions">

        <button
          type="button"
          id="receiptDetailBack"
        >
          ${
            lang === 'zh-TW'
              ? '返回'
              : 'Back'
          }
        </button>

      </div>

    </section>
  `;


  const button =
    page.querySelector(
      '#receiptDetailBack'
    );


  if (button) {

    button.onclick = () =>
      history.back();
  }
}


// ======================================================
// Not Found
// ======================================================

function renderNotFound(
  page,
  lang
) {

  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '找不到 Receipt'
            : 'Receipt Not Found'
        }
      </h1>


      <p class="muted">

        ${
          lang === 'zh-TW'
            ? '這筆 Receipt 不存在或已被刪除。'
            : 'This receipt does not exist or has been deleted.'
        }

      </p>


      <div class="actions">

        <button
          type="button"
          id="receiptDetailBack"
        >
          ${
            lang === 'zh-TW'
              ? '返回'
              : 'Back'
          }
        </button>

      </div>

    </section>
  `;


  const button =
    page.querySelector(
      '#receiptDetailBack'
    );


  if (button) {

    button.onclick = () =>
      history.back();
  }
}
