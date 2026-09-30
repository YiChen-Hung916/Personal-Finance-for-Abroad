import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';


// ======================================================
// Constants
// ======================================================

export const USER_ROLES = [
  'owner',
  'authorizedUser'
];


// ======================================================
// Helpers
// ======================================================

export function getUserDisplayName(
  user = {}
) {

  return String(
    user.displayName ||
    user.name ||
    user.email ||
    user.id ||
    'User'
  ).trim();
}


export function getUserRoleLabel(
  role,
  lang = 'zh-TW'
) {

  if (role === 'owner') {
    return 'Owner';
  }


  if (role === 'authorizedUser') {

    return lang === 'zh-TW'
      ? '家庭成員'
      : 'Authorized User';
  }


  return role || 'Unknown';
}


// ======================================================
// Get Users
// ======================================================

export async function getUsers(db) {

  const snapshot =
    await getDocs(
      collection(
        db,
        'users'
      )
    );


  return snapshot.docs
    .map(userDoc => ({
      id:
        userDoc.id,

      ...userDoc.data()
    }))
    .sort((a, b) => {

      // Active users first.
      if (
        a.active === true &&
        b.active !== true
      ) {
        return -1;
      }


      if (
        a.active !== true &&
        b.active === true
      ) {
        return 1;
      }


      // Owners first within same status.
      if (
        a.role === 'owner' &&
        b.role !== 'owner'
      ) {
        return -1;
      }


      if (
        a.role !== 'owner' &&
        b.role === 'owner'
      ) {
        return 1;
      }


      return getUserDisplayName(a)
        .localeCompare(
          getUserDisplayName(b),
          undefined,
          {
            sensitivity: 'base'
          }
        );
    });
}


// ======================================================
// Update User
// ======================================================

export async function updateManagedUser({
  db,
  currentUser,
  userId,
  displayName,
  role,
  active
}) {

  if (
    !db ||
    !currentUser?.uid ||
    !userId
  ) {
    throw new Error(
      'Missing user information.'
    );
  }


  const cleanDisplayName =
    String(
      displayName || ''
    )
      .trim()
      .replace(
        /\s+/g,
        ' '
      );


  if (!cleanDisplayName) {
    throw new Error(
      'Display Name is required.'
    );
  }


  if (
    !USER_ROLES.includes(
      role
    )
  ) {
    throw new Error(
      'Invalid user role.'
    );
  }


  const users =
    await getUsers(db);


  const target =
    users.find(
      user =>
        user.id === userId
    );


  if (!target) {
    throw new Error(
      'User could not be found.'
    );
  }


  const activeOwners =
    users.filter(
      user =>
        user.active === true &&
        user.role === 'owner'
    );


  const targetIsActiveOwner =
    target.active === true &&
    target.role === 'owner';


  const removingOwnerAccess =
    active !== true ||
    role !== 'owner';


  // --------------------------------------------------
  // Never remove the last active Owner.
  // --------------------------------------------------

  if (
    targetIsActiveOwner &&
    removingOwnerAccess &&
    activeOwners.length <= 1
  ) {

    throw new Error(
      '至少必須保留一個啟用中的 Owner。'
    );
  }


  // --------------------------------------------------
  // Do not let the signed-in Owner disable themselves.
  // --------------------------------------------------

  if (
    userId === currentUser.uid &&
    active !== true
  ) {

    throw new Error(
      '你不能停用目前登入中的自己的帳號。'
    );
  }


  // --------------------------------------------------
  // Do not let the signed-in Owner demote themselves.
  // --------------------------------------------------

  if (
    userId === currentUser.uid &&
    role !== 'owner'
  ) {

    throw new Error(
      '你不能把目前登入中的自己從 Owner 降級。'
    );
  }


  await updateDoc(
    doc(
      db,
      'users',
      userId
    ),
    {
      displayName:
        cleanDisplayName,

      role,

      active:
        active === true,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser.uid
    }
  );
}


// ======================================================
// Read One User
// ======================================================

export async function getManagedUser({
  db,
  userId
}) {

  if (
    !db ||
    !userId
  ) {
    return null;
  }


  const snapshot =
    await getDoc(
      doc(
        db,
        'users',
        userId
      )
    );


  if (!snapshot.exists()) {
    return null;
  }


  return {
    id:
      snapshot.id,

    ...snapshot.data()
  };
}
