# Casha API: Onboarding & Account Guide (Frontend)

This guide covers sign-up/login, the onboarding flows for **personal** (consumer) and **merchant** accounts, and the single response shape that every onboarding and profile endpoint returns.

The live, always-current reference is Swagger at **`/api-docs`** on any running server. Use this doc to understand the flow and the rules. Use Swagger to check field-level details.

---

## 1. Basics

| | |
|---|---|
| Base URL | `{host}/api/v1` |
| Auth | `Authorization: Bearer <accessToken>` on every route except phone initiate/verify, `/auth/refresh` and security questions |
| JSON bodies | `Content-Type: application/json` |
| File uploads | `multipart/form-data`, max **5 MB** per file, **JPG / PNG / WEBP / PDF** only |
| Uploaded file URLs | Returned as relative paths like `/uploads/171234-abc.png`. Prefix with `{host}` (no `/api/v1`) to display them |
| Money | Integers in **kobo** (₦1 = 100 kobo). `wallet.balance` comes back as a **string** (bigint); parse it before doing maths |
| Rate limit | 300 requests per 15 minutes per IP across `/api` |

### Envelope

Every success response:

```json
{
  "success": true,
  "message": "Business info saved",
  "data": { ... }
}
```

Every error response:

```json
{
  "success": false,
  "message": "Human-readable reason",
  "details": { ... }          // only on some errors, see §7
}
```

`message` is safe to show to the user for 4xx errors.

---

## 2. The account response (read this first)

Every onboarding and profile endpoint returns the **same `data` shape** for both personal and merchant accounts. Write one parser/store for it and reuse it everywhere.

```jsonc
{
  "user": {
    "id": "6b0e…",
    "displayName": "Ada's Kitchen",      // business name for merchants, full name otherwise, "Casha user" if neither yet
    "firstName": "Ada",                   // null until personal/owner details are saved
    "lastName": "Obi",
    "otherName": null,
    "dob": "1985-02-10",
    "phone": "+2348012345678",
    "isPhoneVerified": true,
    "email": null,
    "isEmailVerified": false,
    "role": "merchant",                   // "consumer" | "merchant"
    "businessName": "Ada's Kitchen",      // merchants only, else null
    "bvnVerified": true,
    "bvnLast4": "7890",
    "kycTier": 1,
    "isActive": true,
    "isPoliticallyExposed": false,        // merchant owner details, else null
    "hasWallet": true,
    "createdAt": "2026-10-01T09:12:00.000Z",
    "updatedAt": "2026-10-01T09:40:00.000Z"
  },

  "business": {                           // ALWAYS null for consumers; null for merchants until step "business info"
    "id": "a91c…",
    "businessName": "Ada's Kitchen",
    "industry": "Food & Beverage",
    "isRegistered": true,
    "rcNumber": "RC1234567",
    "addressLine1": "12 Admiralty Way",
    "addressLine2": null,
    "city": "Lekki",
    "state": "Lagos",
    "country": "Nigeria",
    "logoUrl": "/uploads/171234-abc.png",
    "verificationStatus": "pending",      // "pending" | "verified" | "rejected"
    "documents": [
      { "documentType": "cac_certificate", "fileUrl": "/uploads/1712-1.pdf" }
    ],
    "createdAt": "…",
    "updatedAt": "…"
  },

  "onboarding": {
    "currentStep": "create_wallet",       // last step the user COMPLETED
    "nextStep": "set_pin",                // the step to do next, or null when done
    "nextAction": "POST /auth/pin",       // the endpoint to call next (dev hint, not for display)
    "isCompleted": false
  },

  // Only on endpoints that change the onboarding step (see §3):
  "accessToken": "eyJ…",
  "refreshToken": "eyJ…"
}
```

Notes:
- **Owner details** (merchant) live on `user`: `firstName`, `lastName`, `otherName`, `dob`, `isPoliticallyExposed`.
- Use **`onboarding.nextStep`** (or `currentStep`) to decide which screen to show. Don't infer it from other fields.
- `onboarding.isCompleted === true` means the user has full access.

---

## 3. Tokens: the one rule you must follow

> **Every time a response contains `accessToken`, replace the stored token with it.**

Each onboarding endpoint only accepts a token issued at the step before it. The server reads the user's current step **from the token**. If you keep using an old token, the next step returns **403** with a message like:

```
You're currently at the "phone_verification" step. Next: PATCH /merchants/business-info
```

Endpoints that return a new token pair (all with the full account response):

| Endpoint | |
|---|---|
| `POST /auth/phone/verify` | login & sign-up |
| `POST /auth/refresh` | when the access token expires |
| `PATCH /auth/onboarding/personal-details` | personal |
| `PATCH /merchants/business-info` | merchant |
| `POST /merchants/documents` | merchant |
| `PATCH /merchants/address` | merchant |
| `POST /merchants/logo` | merchant |
| `PATCH /merchants/owner-details` | merchant |
| `POST /kyc/bvn/verify` | both |
| `POST /wallets` | both |
| `POST /auth/pin` | both: the token returned here is the full-access token |

### Expiry and refresh

Access tokens last **15 minutes** by default. Refresh tokens last **30 days**.

When any call returns **`401 Invalid or expired token`**:

1. Call `POST /auth/refresh` with the stored refresh token:
   ```json
   { "refreshToken": "eyJ…" }
   ```
2. **200** `"Session refreshed"` → full account response with a **new token pair**. Save both tokens, then retry the original request once.
3. **401** `"Invalid or expired refresh token"` → send the user through phone OTP login (§4). They resume at the step they had reached; nothing is lost.
4. **403** → account deactivated.

The refreshed access token carries the user's **current** onboarding step. If your stored token is out of date (e.g. a step response was lost), refreshing also fixes the "wrong step" 403.

Run only one refresh at a time. If several requests fail with 401 together, queue them behind a single refresh call.

---

## 4. Login & sign-up (same flow)

There is no separate login. Phone + OTP both creates new accounts and logs existing ones in.

### 4.1 `POST /auth/phone/initiate`. Send OTP

```json
{ "phone": "08012345678" }
```
Accepts `0801…`, `234801…`, or `+234801…` (10–14 chars). It's normalised to `+234…`.

Response `data`:
```json
{
  "phone": "+2348012345678",
  "purpose": "login",             // "login" if the number already has an account, else "verification"
  "message": "OTP sent. Use the OTP to login."
}
```
The OTP itself is never returned in the response. It's only sent by SMS.
Use `purpose` to decide whether to show the "choose account type" screen (only for `"verification"`).

OTP is **6 digits**, valid for **10 minutes**, and allows **5 wrong attempts** before you must request a new one.

> **Testing (development environment):** every OTP is **`000000`**, for any phone number. Still call `/auth/phone/initiate` first; verify fails if no OTP was requested. Production always sends a real random OTP by SMS, so don't hard-code `000000` in the app.

### 4.2 `POST /auth/phone/verify`. Verify OTP

```json
{
  "phone": "08012345678",
  "otp": "123456",
  "accountType": "merchant"       // "consumer" (default) | "merchant"; only used when creating a NEW account
}
```

- **201** `"Phone verified, account created"` → new account at step `phone_verification`.
- **200** `"Phone verified, login successful"` → existing account. `accountType` is ignored and the user keeps their role.
- **403** → account deactivated.

`data` = full account response **with tokens**. Route the user using `onboarding.nextStep`.

---

## 5. Onboarding flows

`currentStep` is the last step **completed**. Each endpoint requires a specific `currentStep` (in the token) and moves it forward.

### 5.1 Personal (consumer)

| # | Screen | Call | Requires `currentStep` | Sets `currentStep` to |
|---|---|---|---|---|
| 1 | Phone + OTP | `POST /auth/phone/verify` | – | `phone_verification` |
| 2 | Personal details | `PATCH /auth/onboarding/personal-details` | `phone_verification` | `profile` |
| 3 | BVN | `POST /kyc/bvn/verify` | `profile` | `kyc` |
| 4 | Create wallet | `POST /wallets` | `kyc` | `create_wallet` |
| 5 | PIN + security question | `POST /auth/pin` | `create_wallet` | `completed` ✅ |

### 5.2 Merchant

| # | Screen | Call | Requires `currentStep` | Sets `currentStep` to |
|---|---|---|---|---|
| 1 | Phone + OTP (`accountType: "merchant"`) | `POST /auth/phone/verify` | – | `phone_verification` |
| 2 | About your business | `PATCH /merchants/business-info` | `phone_verification` | `business_info` |
| 3 | RC number + documents | `POST /merchants/documents` | `business_info` | `business_documents` |
| 4 | Business address | `PATCH /merchants/address` | `business_documents` | `business_address` |
| 5 | Business logo | `POST /merchants/logo` | `business_address` | `business_logo` |
| 6 | Owner details | `PATCH /merchants/owner-details` | `business_logo` | `owner_details` |
| 7 | BVN (owner's) | `POST /kyc/bvn/verify` | `owner_details` | `kyc` |
| 8 | Create wallet | `POST /wallets` | `kyc` | `create_wallet` |
| 9 | PIN + security question | `POST /auth/pin` | `create_wallet` | `completed` ✅ |

All `/merchants/*` routes return **403** for consumer accounts.

### 5.3 Screen routing table

Map `onboarding.nextStep` → screen:

| `nextStep` | Consumer screen | Merchant screen |
|---|---|---|
| `profile` | Personal details | – |
| `business_info` | – | About your business |
| `business_documents` | – | RC number + documents |
| `business_address` | – | Business address |
| `business_logo` | – | Business logo |
| `owner_details` | – | Owner details |
| `kyc` | BVN | BVN |
| `create_wallet` | Create wallet | Create wallet |
| `set_pin` | PIN + security question | PIN + security question |
| `null` | Home | Home |

> Treat `onboarding.isCompleted` as the source of truth for "go to Home". When it's `true`, `nextStep` is `null`.

---

## 6. Endpoint reference

All responses below are wrapped in the envelope from §1. "Account response" means the shape in §2.

### `PATCH /auth/onboarding/personal-details`  (consumer)
```json
{ "firstName": "Ada", "lastName": "Obi", "otherName": "Chioma", "dob": "1998-04-12" }
```
- `firstName`, `lastName`: 2–60 chars. `otherName`: optional, max 60.
- `dob`: `YYYY-MM-DD`; user must be **18+**.
- These names are later matched against the BVN record, so ask for names exactly as they appear on the BVN.

**200** `"Personal details saved"` → account response + tokens.

### `PATCH /merchants/business-info`
```json
{ "businessName": "Ada's Kitchen", "industry": "Food & Beverage", "isRegistered": true }
```
- `businessName`: 2–150 chars. `industry`: 2–100 chars. `isRegistered`: boolean (CAC-registered?).
- `isRegistered` decides what the next step needs.

**200** `"Business info saved"` → account response + tokens.

### `POST /merchants/documents`  (multipart/form-data)

| Field | Type | Required when `isRegistered = true` |
|---|---|---|
| `rcNumber` | text, 4–20 chars | ✅ |
| `cac_certificate` | file | ✅ |
| `cac_status_report` | file | ✅ |
| `proof_of_address` | file | ✅ |
| `owner_valid_id` | file | ✅ |

- **Registered business:** all five fields are required. Otherwise you get a **400** naming what's missing (e.g. `Missing required document(s): proof_of_address`).
- **Unregistered business:** skip the documents screen in the UI, but **still call this endpoint with an empty body** to move to the next step.

**200** `"Business documents saved"` → account response + tokens. Uploaded files appear in `business.documents`.

### `PATCH /merchants/address`
```json
{ "addressLine1": "12 Admiralty Way", "addressLine2": "Suite 4B", "city": "Lekki", "state": "Lagos", "country": "Nigeria" }
```
- `addressLine1`: 5–200. `addressLine2`: optional, max 200. `city`, `state`: 2–100. `country`: optional, defaults to `Nigeria`.

**200** `"Business address saved"` → account response + tokens.

### `POST /merchants/logo`  (multipart/form-data)
Single file field **`logo`** (required).

**200** `"Business logo uploaded"` → account response + tokens. URL is in `business.logoUrl`.

### `PATCH /merchants/owner-details`
```json
{ "firstName": "Ada", "lastName": "Obi", "otherName": "Chioma", "dob": "1985-02-10", "isPoliticallyExposed": false }
```
- Same name/dob rules as personal details (18+). These are matched against the owner's BVN.
- `isPoliticallyExposed`: boolean, required.

**200** `"Owner details saved"` → account response + tokens. Values appear on `user`.

### `POST /kyc/bvn/verify`  (both)
```json
{ "bvn": "22222222222" }
```
- Exactly 11 digits.
- The BVN holder's first and last names must closely match the names on file. Otherwise you get a **400**: *"The name on this BVN does not closely match the details you provided…"*. Let the user go back and correct their name or BVN.
- **409** if BVN is already verified. **503** if the verification provider is down; show a retry option.

**200** `"BVN verified successfully"` → account response + tokens. `user.bvnVerified = true`, `user.kycTier ≥ 1`.

### `POST /wallets`  (both, no body)
- **201** `"Wallet created"` / **200** `"Wallet already exists"`.
- Safe to retry. It never creates a second wallet.
- `data` = account response + tokens **plus** a `wallet` field:

```jsonc
{
  "user": { ... }, "business": ..., "onboarding": { ... },
  "accessToken": "…", "refreshToken": "…",
  "wallet": { "id": "…", "userId": "…", "balance": "0", "currency": "NGN", "status": "active", "createdAt": "…", "updatedAt": "…" }
}
```

### `GET /auth/security-questions`  (no auth)
`data` is an array:
```json
[
  { "id": "first_pet", "question": "What was the name of your first pet?" },
  { "id": "mother_maiden_name", "question": "What is your mother's maiden name?" },
  { "id": "birth_city", "question": "In what city were you born?" },
  { "id": "first_school", "question": "What was the name of your first school?" },
  { "id": "favorite_teacher", "question": "What was the name of your favorite teacher?" },
  { "id": "childhood_nickname", "question": "What was your childhood nickname?" }
]
```

### `POST /auth/pin`  (both, final onboarding step)
```json
{ "pin": "5170", "confirmPin": "5170", "securityQuestionId": "first_pet", "securityAnswer": "Max" }
```
- PIN: exactly 4 digits; `pin` must equal `confirmPin`.
- Rejected PINs: 4 repeated digits (`1111`), `1234`, `4321`, `0000`.
- `securityAnswer`: 2–100 chars, **not case-sensitive** and trimmed.

**200** `"PIN and security question set"` → account response + tokens, with `onboarding.isCompleted = true`. **Store this token.** It has full access.

### `GET /users/me`  (both, any step)
Account response **without** tokens. Call it on app start or resume to decide which screen to show.

### `GET /merchants/me`  (merchant only, any step)
Same as `/users/me`. Returns the identical account response.

### After onboarding (requires `isCompleted`)

| Endpoint | Notes |
|---|---|
| `PATCH /auth/pin` | Body `{ currentPin, newPin, confirmNewPin }`. Same PIN rules. New PIN must differ from current. Returns `data: { message }` |
| `GET /wallets/me` | Wallet with nested `user` |
| `POST /wallets/mock-fund` | **Dev only.** Body `{ amount }` in kobo |

**PIN lockout:** 5 wrong PIN attempts (shared between change-PIN and payments) lock the PIN for **15 minutes** → **429**.

---

## 7. Errors

| Status | When | What to do |
|---|---|---|
| 400 | Validation failed, wrong OTP, BVN mismatch, missing documents, bad upload | Show `message`; for validation and uploads see below |
| 401 | Missing/invalid/expired token, wrong current PIN | Expired → `POST /auth/refresh` (§3), then OTP login if that fails |
| 403 | Wrong onboarding step (stale token), wrong account type, onboarding not finished, deactivated account | Usually means you didn't swap in the new token. Re-fetch `/users/me` and route by `onboarding.nextStep` |
| 404 | User/wallet not found | |
| 409 | BVN already verified | Fetch `/users/me` and continue |
| 429 | PIN locked (`"Too many attempts…"`), or rate limit hit (`"Too many requests…"`) | Show `message`; the rate-limit response also has a `RateLimit-Reset` header (seconds until reset) |
| 503 | BVN provider unavailable | Offer retry |

### Validation errors (400 `"Validation failed"`)

`details` contains per-field messages:

```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "body": ["…"]
    }
  }
}
```
Because the server validates the whole request object, field messages are currently nested under `body`. Show `details.fieldErrors.body` entries, or fall back to `message`. Validate the rules in §6 on the client too, so most of these never happen.

### Upload errors (400)

| `message` | `details.code` | Cause |
|---|---|---|
| `Unsupported file type. Allowed: JPG, PNG, WEBP, PDF` | – | Wrong file type |
| `File is too large. Maximum size is 5MB` | `LIMIT_FILE_SIZE` | File over 5 MB (`details.field` names the field) |
| `Unexpected file field: <name>` | `LIMIT_UNEXPECTED_FILE` | Wrong form field name |

Check type and size on the client before uploading so the user finds out immediately.

Every error, including 429, uses the JSON envelope from §1.

---

## 8. Recommended client logic

```ts
// After ANY response
function handleAccountResponse(data) {
  if (data.accessToken) saveTokens(data.accessToken, data.refreshToken);
  store.account = { user: data.user, business: data.business, onboarding: data.onboarding };
  routeTo(screenFor(data.user.role, data.onboarding));
}

function screenFor(role, onboarding) {
  if (onboarding.isCompleted) return 'Home';
  return SCREENS[role][onboarding.nextStep];   // table in §5.3
}

// On app launch / resume
const token = loadAccessToken();
if (!token) routeTo('PhoneEntry');
else api.get('/users/me')
  .then(r => handleAccountResponse(r.data))
  .catch(showError);

// HTTP interceptor: refresh once on 401, then fall back to OTP login
async function onUnauthorized(failedRequest) {
  try {
    const r = await refreshOnce();               // single shared POST /auth/refresh
    handleAccountResponse(r.data);               // saves the new tokens
    return retry(failedRequest);
  } catch {
    clearTokens();
    routeTo('PhoneEntry');
  }
}
```

---

## 9. Changes from the previous API

If you built against an earlier version:

| Before | Now |
|---|---|
| `data.user.onboardingStep` / `data.user.nextStep` | `data.onboarding.currentStep` / `data.onboarding.nextStep` |
| Merchant step responses: `{ message, onboardingStep, ... }`, no tokens | Full account response **with new tokens** |
| `POST /kyc/bvn/verify`: `{ message, kycTier, onboardingStep, nextStep }`, no tokens | Full account response with new tokens |
| `POST /wallets`: `data` was the wallet | `data.wallet` + account response + tokens |
| `POST /auth/pin`: `{ message, onboardingStep, nextStep }`, step became `set_pin` | Full account response + tokens, step becomes `completed` |
| PIN could be set right after BVN | Wallet must be created first (`kyc → create_wallet → set_pin`) |
| Merchants ended at `kyc` | Merchants also create a wallet and set a PIN |
| `GET /merchants/me`: `{ onboardingStep, nextStep, business, documents }` | Account response; documents are in `business.documents` |
| `GET /users/me`: flat profile | Account response (`user`, `business`, `onboarding`) |
| `/auth/phone/initiate` returned the OTP in `data.code` | Removed. Use `000000` in development |
| No way to refresh tokens | `POST /auth/refresh` |
| Bad uploads returned 500 | 400 with a clear `message` |
| Rate-limit 429 was plain text | JSON envelope |
