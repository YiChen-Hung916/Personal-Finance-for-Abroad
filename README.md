# Family Finance V1
Private family receipt/reconciliation web app designed for GitHub Pages + Firebase.

## Important
The repository may be public, but **never put private financial data or an email allowlist in the source code**. Access is enforced by Firebase Authentication + Firestore Security Rules.

## Current starter
- Responsive Owner dashboard + role-aware menu structure
- New Receipt form with multi-item support
- ERP-style package model: units/package × optional capacity, then purchase quantity in packages
- Optional multiple item images in the UI
- zh-TW / English UI foundation
- Firestore security-rule starter
- Firebase config excluded from Git by `.gitignore`

The remaining modules (live Firebase auth, confirmations, mismatch uploads, reminders, refunds, transfers, unmatched transactions, price book, product merge, history filters) are represented in the V1 architecture and should be connected after Firebase setup.

## Firebase setup order
1. Create a Firebase project.
2. Add a Web App and copy its config.
3. Enable Authentication > Google provider.
4. Create Firestore Database.
5. Create your first `/users/{YOUR_GOOGLE_UID}` document manually:
   - `email`: your Google email
   - `role`: `owner`
   - `active`: `true`
   - `preferredLanguage`: `zh-TW` or `en`
6. Deploy `firestore.rules` before storing private data.
7. Copy `js/firebase-config.example.js` to `js/firebase-config.js` and paste your Firebase config. The real web config is not a password, but the file is excluded here to prevent accidental environment-specific commits.
8. Replace the starter demo login in `js/app.js` with Firebase Auth initialization once the Firebase project exists.
9. Add other authorized users from the Owner interface once that module is connected; do not hard-code their emails in GitHub.

## GitHub Pages
Upload the contents of this folder to a GitHub repository. GitHub Pages can serve this static frontend. Do not publish any real receipt/card/account/user data in the repository.

## Security model
- Unauthenticated: no Firestore access.
- Authenticated but inactive/unapproved: no private data access.
- Owner: management access.
- Authorized user: only workflows/data relevant to that user.
- Card numbers/account numbers: store last 4 digits only.
- Private images should be stored in protected object storage, never in GitHub.

## Reminder behavior
Purchase confirmations use `submittedAt`, with configurable defaults at 3 / 7 / 10 days. The confirmer receives the large in-app reminder; Owner receives an overview of who has overdue confirmations. Drafts, refunds, and transfers do not use the purchase reminder schedule.
