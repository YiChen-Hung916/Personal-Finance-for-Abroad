import {
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
// Module State
// ======================================================

let db = null;
let currentUser = null;
let currentRole = null;
let lang = 'zh-TW';
let page = null;
let escapeHtml = null;


// ======================================================
// Entry
// ======================================================

export async function cardsPage(options) {

  db = options.db;
  currentUser = options.currentUser;
  currentRole = options.currentRole;
  lang = options.lang;
  page = options.page;
  escapeHtml = options.escapeHtml;


  if (currentRole !== 'owner') {

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

      <div class="actions card-page-header">

        <h1>
          ${
            lang === 'zh-TW'
              ? '信用卡'
              : 'Cards'
          }
        </h1>

        <button
          id="newCardBtn"
          class="primary compact-card-button"
        >
          ＋ ${
            lang === 'zh-TW'
              ? '新增信用卡'
              : 'Add Card'
          }
        </button>

      </div>


      <div id="cardList">

        <p class="muted">
          ${
            lang === 'zh-TW'
              ? '載入中…'
              : 'Loading…'
          }
        </p>

      </div>

    </section>
  `;


  document
    .querySelector('#newCardBtn')
    .onclick = showNewCardForm;


  await loadCards();
}


// ======================================================
// Load Cards
// ======================================================

async function loadCards() {

  const cardList =
    document.querySelector('#cardList');


  try {

    const q = query(
      collection(db, 'cards'),
      orderBy('createdAt', 'desc')
    );


    const snapshot =
      await getDocs(q);


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


    const cards =
      snapshot.docs.map(cardDoc => ({
        id: cardDoc.id,
        ...cardDoc.data()
      }));

    // ----------------------------------------------------
// Load user names for confirmation-user display
// ----------------------------------------------------

const eligibleUsers =
  await loadEligibleUsers();


const userNameMap =
  new Map(
    eligibleUsers.map(user => [
      user.id,

      user.displayAs ||
      user.displayName ||
      user.name ||
      user.email ||
      user.id
    ])
  );


    // 使用中的卡先顯示
    const activeCards =
      cards.filter(card =>
        card.active === true
      );


    // 未啟用 / 已封存的卡放後面
    const inactiveCards =
      cards.filter(card =>
        card.active !== true
      );


    function cardHtml(card) {

  const confirmationUserIds =
    getCardConfirmationUserIds(
      card
    );


  const confirmationUserNames =
    confirmationUserIds
      .map(userId =>
        userNameMap.get(userId) ||
        userId
      );


  const confirmerText =
    confirmationUserNames.length > 0
      ? confirmationUserNames.join('、')
      : (
          lang === 'zh-TW'
            ? '尚未設定'
            : 'Not assigned'
        );


  return `
    <div class="item card-list-item">

      <h3 class="card-list-nickname">
        ${escapeHtml(
          card.nickname || ''
        )}
      </h3>


      <div class="card-list-details">

        <span>
          ${escapeHtml(
            card.issuer || ''
          )}
          ·
          ${escapeHtml(
            card.network || ''
          )}
          ·
          ${escapeHtml(
            card.last4 || ''
          )}
        </span>

      </div>


      <div class="card-list-confirmers">

        <span class="muted">
          ${
            lang === 'zh-TW'
              ? '確認人：'
              : 'Confirmers: '
          }
        </span>

        <span>
          ${escapeHtml(
            confirmerText
          )}
        </span>

      </div>


      <div class="card-list-footer">

        <span
          class="
            card-status
            ${
              card.active === true
                ? 'card-status-active'
                : 'card-status-inactive'
            }
          "
        >
          ${
            card.active === true
              ? (
                  lang === 'zh-TW'
                    ? '使用中'
                    : 'Active'
                )
              : (
                  lang === 'zh-TW'
                    ? '未啟用'
                    : 'Inactive'
                )
          }
        </span>


        <button
          type="button"
          class="editCardBtn"
          data-id="${escapeHtml(card.id)}"
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
}

    const activeHtml =
      activeCards.length > 0

        ? activeCards
            .map(cardHtml)
            .join('')

        : `
            <p class="muted">
              ${
                lang === 'zh-TW'
                  ? '目前沒有使用中的信用卡。'
                  : 'There are no active cards.'
              }
            </p>
          `;


    const inactivePreviewHtml =
      inactiveCards.length > 0

        ? cardHtml(
            inactiveCards[0]
          )

        : `
            <p class="muted">
              ${
                lang === 'zh-TW'
                  ? '目前沒有未啟用的信用卡。'
                  : 'There are no inactive cards.'
              }
            </p>
          `;


    const inactiveRemainingHtml =
      inactiveCards
        .slice(1)
        .map(cardHtml)
        .join('');


    cardList.innerHTML = `

      <div class="card-list-section">

        <h2>
          ${
            lang === 'zh-TW'
              ? '使用中的信用卡'
              : 'Active Cards'
          }

          ${
            activeCards.length > 0
              ? `
                  <span class="badge">
                    ${activeCards.length}
                  </span>
                `
              : ''
          }
        </h2>


        ${activeHtml}

      </div>


      <div class="card-list-section inactive-card-section">

        <h2>
          ${
            lang === 'zh-TW'
              ? '未啟用的信用卡'
              : 'Inactive Cards'
          }

          ${
            inactiveCards.length > 0
              ? `
                  <span class="badge">
                    ${inactiveCards.length}
                  </span>
                `
              : ''
          }
        </h2>


        <div id="inactiveCardPreview">
          ${inactivePreviewHtml}
        </div>


        ${
          inactiveCards.length > 1
            ? `
                <div
                  id="inactiveCardRemaining"
                  hidden
                >
                  ${inactiveRemainingHtml}
                </div>


                <button
                  type="button"
                  id="toggleInactiveCards"
                  class="card-list-toggle-button"
                >
                  ${
                    lang === 'zh-TW'
                      ? '查看全部'
                      : 'View All'
                  }
                </button>
              `
            : ''
        }

      </div>
    `;


    // -----------------------------------------------
    // Edit buttons
    // -----------------------------------------------

    document
      .querySelectorAll(
        '.editCardBtn'
      )
      .forEach(button => {

        button.onclick = () => {

          editCard(
            button.dataset.id
          );
        };
      });


    // -----------------------------------------------
    // Inactive cards:
    // show one by default, expand all when requested.
    // -----------------------------------------------

    const toggleInactiveButton =
      document.querySelector(
        '#toggleInactiveCards'
      );


    const inactiveRemaining =
      document.querySelector(
        '#inactiveCardRemaining'
      );


    if (
      toggleInactiveButton &&
      inactiveRemaining
    ) {

      toggleInactiveButton.onclick =
        () => {

          const willShow =
            inactiveRemaining.hidden;


          inactiveRemaining.hidden =
            !willShow;


          toggleInactiveButton.textContent =
            willShow

              ? (
                  lang === 'zh-TW'
                    ? '收合'
                    : 'Show Less'
                )

              : (
                  lang === 'zh-TW'
                    ? '查看全部'
                    : 'View All'
                );
        };
    }


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
// User Helpers
// ======================================================

async function loadEligibleUsers() {

  const snapshot =
    await getDocs(
      collection(db, 'users')
    );


  return snapshot.docs
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
}


function buildConfirmerOptions(
  users,
  selectedUserId = ''
) {

  return `
    <option value="">
      ${
        lang === 'zh-TW'
          ? '請選擇…'
          : 'Select…'
      }
    </option>

    ${
      users
        .map(user => {

          const name =
            user.displayName ||
            user.id;


          return `
            <option
              value="${escapeHtml(user.id)}"
              ${
                user.id === selectedUserId
                  ? 'selected'
                  : ''
              }
            >
              ${escapeHtml(name)}
            </option>
          `;
        })
        .join('')
    }
  `;
}


// ======================================================
// Card Data Compatibility
// ======================================================

function getCardConfirmationUserIds(card) {

  if (
    Array.isArray(
      card.confirmationUserIds
    )
  ) {

    const ids =
      card.confirmationUserIds
        .filter(Boolean);


    if (ids.length > 0) {
      return ids;
    }
  }


  // Old Card schema.
  if (card.confirmationUserId) {

    return [
      card.confirmationUserId
    ];
  }


  return [];
}


// ======================================================
// Additional Confirmers
// ======================================================

function addAdditionalConfirmerRow({
  container,
  users,
  selectedUserId = ''
}) {

  const row =
    document.createElement('div');


  row.className =
    'additional-confirmer-row';


  row.innerHTML = `

    <select
      class="additionalConfirmationUser"
    >
      ${buildConfirmerOptions(
        users,
        selectedUserId
      )}
    </select>


    <button
      type="button"
      class="remove-confirmer-button"
    >
      ${
        lang === 'zh-TW'
          ? '移除'
          : 'Remove'
      }
    </button>
  `;


  row
    .querySelector(
      '.remove-confirmer-button'
    )
    .onclick = () => {

      row.remove();

      updateAdditionalConfirmerControls();
    };


  container.appendChild(row);


  updateAdditionalConfirmerControls();
}


function updateAdditionalConfirmerControls() {

  const multiToggle =
    document.querySelector(
      '#multipleConfirmers'
    );


  const section =
    document.querySelector(
      '#additionalConfirmersSection'
    );


  const rowsContainer =
    document.querySelector(
      '#additionalConfirmers'
    );


  const addButton =
    document.querySelector(
      '#addConfirmerButton'
    );


  if (
    !multiToggle ||
    !section ||
    !rowsContainer ||
    !addButton
  ) {
    return;
  }


  if (!multiToggle.checked) {

    section.hidden = true;

    return;
  }


  section.hidden = false;


  const rowCount =
    rowsContainer.querySelectorAll(
      '.additional-confirmer-row'
    ).length;


  // Maximum:
  // 1 primary + 2 additional = 3 users.
  addButton.hidden =
    rowCount >= 2;
}


function bindMultiConfirmerControls(
  users
) {

  const multiToggle =
    document.querySelector(
      '#multipleConfirmers'
    );


  const section =
    document.querySelector(
      '#additionalConfirmersSection'
    );


  const rowsContainer =
    document.querySelector(
      '#additionalConfirmers'
    );


  const addButton =
    document.querySelector(
      '#addConfirmerButton'
    );


  if (
    !multiToggle ||
    !section ||
    !rowsContainer ||
    !addButton
  ) {
    return;
  }


  multiToggle.onchange = () => {

    if (multiToggle.checked) {

      section.hidden = false;


      // First time multi-confirmation is enabled:
      // automatically create one additional user.
      if (
        rowsContainer.children.length === 0
      ) {

        addAdditionalConfirmerRow({
          container: rowsContainer,
          users
        });
      }

    } else {

      // Turning this off returns the card
      // to a single confirmation user.
      rowsContainer.innerHTML = '';

      section.hidden = true;
    }


    updateAdditionalConfirmerControls();
  };


  addButton.onclick = () => {

    const rowCount =
      rowsContainer.querySelectorAll(
        '.additional-confirmer-row'
      ).length;


    if (rowCount >= 2) {
      return;
    }


    addAdditionalConfirmerRow({
      container: rowsContainer,
      users
    });
  };


  updateAdditionalConfirmerControls();
}


// ======================================================
// Read / Validate Confirmation Users
// ======================================================

function getSelectedConfirmationUserIds() {

  const ids = [];


  const primaryUserId =
    document
      .querySelector('#confirmationUser')
      ?.value;


  if (primaryUserId) {

    ids.push(
      primaryUserId
    );
  }


  document
    .querySelectorAll(
      '.additionalConfirmationUser'
    )
    .forEach(select => {

      if (select.value) {

        ids.push(
          select.value
        );
      }
    });


  return ids;
}


function validateConfirmationUsers() {

  const ids =
    getSelectedConfirmationUserIds();


  if (ids.length === 0) {

    return {
      valid: false,

      message:
        lang === 'zh-TW'
          ? '請選擇交易確認人。'
          : 'Please select a confirmation user.'
    };
  }


  const uniqueIds =
    new Set(ids);


  if (
    uniqueIds.size !==
    ids.length
  ) {

    return {
      valid: false,

      message:
        lang === 'zh-TW'
          ? '同一位使用者不能重複設定為交易確認人。'
          : 'The same user cannot be selected more than once.'
    };
  }


  return {
    valid: true,
    ids
  };
}


// ======================================================
// Confirmation User UI
// ======================================================

function confirmationUserFieldsHtml({
  users,
  primaryUserId = '',
  hasMultipleConfirmers = false
}) {

  return `
    <div class="field">

      <div class="card-confirmer-heading">

        <span>
          ${
            lang === 'zh-TW'
              ? '交易確認人'
              : 'Confirmation user'
          }

          <sup class="required-mark">
            *
          </sup>
        </span>


        <label
          class="multi-confirmer-toggle"
        >

          <input
            type="checkbox"
            id="multipleConfirmers"
            ${
              hasMultipleConfirmers
                ? 'checked'
                : ''
            }
          >

          <span>
            ${
              lang === 'zh-TW'
                ? '多位確認人'
                : 'Multiple'
            }
          </span>

        </label>

      </div>


      <select id="confirmationUser">

        ${buildConfirmerOptions(
          users,
          primaryUserId
        )}

      </select>


      <div
        id="additionalConfirmersSection"
        class="additional-confirmers-section"
        ${
          hasMultipleConfirmers
            ? ''
            : 'hidden'
        }
      >

        <div id="additionalConfirmers">
        </div>


        <button
          type="button"
          id="addConfirmerButton"
          class="add-confirmer-button"
          title="${
            lang === 'zh-TW'
              ? '新增確認人'
              : 'Add confirmation user'
          }"
        >
          ＋
        </button>

      </div>

    </div>
  `;
}


// ======================================================
// New Card
// ======================================================

async function showNewCardForm() {

  let users = [];


  try {

    users =
      await loadEligibleUsers();


  } catch (error) {

    console.error(
      'Failed to load users:',
      error
    );
  }


  page.innerHTML = `
    <section class="panel">

      <h1>
        ${
          lang === 'zh-TW'
            ? '新增信用卡'
            : 'Add Card'
        }
      </h1>


      <div class="row">

        <label class="field">

        <span>
          ${
            lang === 'zh-TW'
              ? '卡片暱稱'
              : 'Card nickname'
          }
          
          <sup class="required-mark">*</sup>
        </span>

          <input
            id="cardNickname"
            placeholder="US Daily"
          >

        </label>


        <label class="field">

        <span>
          ${
            lang === 'zh-TW'
              ? '發卡銀行'
              : 'Issuer'
          }

          <sup class="required-mark">*</sup>
        </span>
        

          <input
            id="cardIssuer"
            placeholder="Chase"
          >

        </label>

      </div>


      <div class="row">

        <label class="field">

        <span>
          ${
            lang === 'zh-TW'
              ? '卡別'
              : 'Network'
          }

          <sup class="required-mark">*</sup>
        </span>

          <select id="cardNetwork">

            <option value="Visa">
              Visa
            </option>

            <option value="Mastercard">
              Mastercard
            </option>

            <option value="JCB">
              JCB
            </option>

            <option value="American Express">
              American Express
            </option>

            <option value="Other">
              Other
            </option>

          </select>

        </label>


        <label class="field">

        <span>
          ${
            lang === 'zh-TW'
              ? '卡號末四碼'
              : 'Last 4 digits'
          }

          <sup class="required-mark">*</sup>
        </span>

          <input
            id="cardLast4"
            inputmode="numeric"
            maxlength="4"
            placeholder="1234"
          >

        </label>

      </div>


      ${confirmationUserFieldsHtml({
        users
      })}


      <label class="card-active-toggle">

  <input
    type="checkbox"
    id="cardActive"
    checked
  >

  <span>
    ${
      lang === 'zh-TW'
        ? '使用中'
        : 'Active'
    }
  </span>

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
              ? '儲存'
              : 'Save'
          }

        </button>

      </div>

    </section>
  `;


  bindMultiConfirmerControls(
    users
  );


  document
    .querySelector('#cancelCard')
    .onclick = () => {

      cardsPage({
        db,
        currentUser,
        currentRole,
        lang,
        page,
        escapeHtml
      });
    };


  document
    .querySelector('#saveCard')
    .onclick = saveNewCard;
}


// ======================================================
// Save New Card
// ======================================================

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

  
  const active =
  document
    .querySelector('#cardActive')
    .checked;


  const message =
    document.querySelector(
      '#cardFormMessage'
    );


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


  if (!network) {

  message.textContent =
    lang === 'zh-TW'
      ? '請選擇卡別。'
      : 'Please select the card network.';

  return;
}


  if (!/^\d{4}$/.test(last4)) {

    message.textContent =
      lang === 'zh-TW'
        ? '末四碼必須是 4 位數字。'
        : 'Last 4 digits must contain exactly four numbers.';

    return;
  }


  const confirmerValidation =
    validateConfirmationUsers();


  if (!confirmerValidation.valid) {

    message.textContent =
      confirmerValidation.message;

    return;
  }


  const confirmationUserIds =
    confirmerValidation.ids;


  // Temporary compatibility field.
  //
  // Other modules still use the old single-user field.
  // We will remove this after Receipt / Confirmation /
  // Pending are migrated.
  const confirmationUserId =
    confirmationUserIds[0];


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

        confirmationUserIds,

        confirmationUserId,

        active: true,

        createdAt:
          serverTimestamp(),

        createdBy:
          currentUser.uid,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentUser.uid
      }
    );


    await cardsPage({
      db,
      currentUser,
      currentRole,
      lang,
      page,
      escapeHtml
    });


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
      doc(
        db,
        'cards',
        cardId
      );


    const snapshot =
      await getDoc(cardRef);


    if (!snapshot.exists()) {
      return;
    }


    const card =
      snapshot.data();


    const users =
      await loadEligibleUsers();


    const existingConfirmationUserIds =
      getCardConfirmationUserIds(
        card
      );


    const primaryUserId =
      existingConfirmationUserIds[0] ||
      '';


    const additionalUserIds =
      existingConfirmationUserIds
        .slice(1, 3);


    const hasMultipleConfirmers =
      additionalUserIds.length > 0;


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

          <span>
            ${
              lang === 'zh-TW'
                ? '卡片暱稱'
                : 'Card nickname'
            }

            <sup class="required-mark">*</sup>
        </span>

            <input
              id="cardNickname"
              value="${escapeHtml(
                card.nickname || ''
              )}"
            >

          </label>


          <label class="field">

          <span>
            ${
              lang === 'zh-TW'
                ? '發卡銀行'
                : 'Issuer'
            }

            <sup class="required-mark">*</sup>
        </span>

            <input
              id="cardIssuer"
              value="${escapeHtml(
                card.issuer || ''
              )}"
            >

          </label>

        </div>


        <div class="row">

          <label class="field">

          <span>
            ${
              lang === 'zh-TW'
                ? '卡別'
                : 'Network'
            }

            <sup class="required-mark">*</sup>
        </span>

            <select id="cardNetwork">

              ${
                [
                  'Visa',
                  'Mastercard',
                  'JCB',
                  'American Express',
                  'Other'
                ]
                  .map(network => `
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
                  `)
                  .join('')
              }

            </select>

          </label>


          <label class="field">

          <span>
            ${
              lang === 'zh-TW'
                ? '卡號末四碼'
                : 'Last 4 digits'
            }

            <sup class="required-mark">*</sup>
        </span>

            <input
              id="cardLast4"
              maxlength="4"
              inputmode="numeric"
              value="${escapeHtml(
                card.last4 || ''
              )}"
            >

          </label>

        </div>


        ${confirmationUserFieldsHtml({
          users,
          primaryUserId,
          hasMultipleConfirmers
        })}


        <label class="card-active-toggle">

          <input
            type="checkbox"
            id="cardActive"
            ${
              card.active === true
                ? 'checked'
                : ''
            }
          >

          <span>
          ${
            lang === 'zh-TW'
              ? '使用中'
              : 'Active'
          }
          </span>

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


    bindMultiConfirmerControls(
      users
    );


    const additionalContainer =
      document.querySelector(
        '#additionalConfirmers'
      );


    additionalUserIds.forEach(
      userId => {

        addAdditionalConfirmerRow({
          container:
            additionalContainer,

          users,

          selectedUserId:
            userId
        });
      }
    );


    updateAdditionalConfirmerControls();


    document
      .querySelector('#cancelCard')
      .onclick = () => {

        cardsPage({
          db,
          currentUser,
          currentRole,
          lang,
          page,
          escapeHtml
        });
      };


    document
      .querySelector('#saveCard')
      .onclick =
        async () => {

          const nickname =
            document
              .querySelector(
                '#cardNickname'
              )
              .value
              .trim();


          const issuer =
            document
              .querySelector(
                '#cardIssuer'
              )
              .value
              .trim();


          const network =
            document
              .querySelector(
                '#cardNetwork'
              )
              .value;


          const last4 =
            document
              .querySelector(
                '#cardLast4'
              )
              .value
              .trim();


          const active =
            document
              .querySelector(
                '#cardActive'
              )
              .checked;


          const message =
            document.querySelector(
              '#cardFormMessage'
            );


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


if (!network) {

  message.textContent =
    lang === 'zh-TW'
      ? '請選擇卡別。'
      : 'Please select the card network.';

  return;
}


          if (
            !/^\d{4}$/.test(last4)
          ) {

            message.textContent =
              lang === 'zh-TW'
                ? '末四碼必須是 4 位數字。'
                : 'Last 4 digits must contain exactly four numbers.';

            return;
          }


          const confirmerValidation =
            validateConfirmationUsers();


          if (!confirmerValidation.valid) {

            message.textContent =
              confirmerValidation.message;

            return;
          }


          const confirmationUserIds =
            confirmerValidation.ids;


          // Temporary compatibility field.
          const confirmationUserId =
            confirmationUserIds[0];


          try {

            message.textContent =
              lang === 'zh-TW'
                ? '正在儲存…'
                : 'Saving…';


            await updateDoc(
              cardRef,
              {
                nickname,
                issuer,
                network,
                last4,

                confirmationUserIds,

                confirmationUserId,

                active,

                updatedAt:
                  serverTimestamp(),

                updatedBy:
                  currentUser.uid
              }
            );


            await cardsPage({
              db,
              currentUser,
              currentRole,
              lang,
              page,
              escapeHtml
            });


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
