# Software Requirements Specification
## Smart Health & Diet Recommendation System

**Document version:** 1.0  
**Date:** 2026-09-20  
**Audience:** Backend developer, frontend developer, QA engineer, system administrator  
**Primary frontend:** `frontend/`  
**Database contract:** `database/schema.sql`

## 1. Purpose

The Smart Health & Diet Recommendation System is a role-based web application for:

- Patients/users who track meals, calories, water, sleep, weight, and goals.
- Dietitians who review patient information, accept guidance requests, communicate with patients, create meal plans, and publish recipes.
- Administrators who manage accounts, approve dietitians, maintain the food catalog, configure system defaults, review audit events, and generate reports.

This document defines the backend behavior, REST API, authorization rules, validation rules, persistence expectations, and acceptance criteria required to replace the current browser `localStorage` demo implementation with a real backend.

## 2. Scope

### 2.1 In scope

- Account registration, login, logout, token refresh, and current-user profile.
- Patient health profile and goal management.
- Meal, water, sleep, and weight tracking.
- Calorie and progress summaries.
- Approved dietitian directory and guidance requests.
- Patient-dietitian conversations and messages.
- Dietitian patient records and meal-plan assignment.
- Recipe publishing and public recipe browsing.
- Administrator account, dietitian, food catalog, settings, audit, and report operations.
- PostgreSQL persistence based on `database/schema.sql`.

### 2.2 Out of scope for version 1

- Payment, subscription, appointment scheduling, video consultation, and insurance.
- Medical diagnosis or emergency advice.
- Automated clinical recommendations that replace a licensed dietitian.
- Password-reset email delivery unless the backend team implements it as an extension.
- Native mobile applications.
- File storage for PDFs or images. Version 1 accepts image URLs and generates reports on demand.

## 3. Existing Frontend Inventory

| Area | Frontend pages | Backend capability required |
|---|---|---|
| Authentication | `auth/index.html`, `auth/login.html`, `auth/register.html` | Register, authenticate, authorize by role, maintain session |
| Patient portal | `user/dashboard.html`, `health-profile.html`, `meal-logger.html`, `water-tracker.html`, `sleep-tracker.html`, `weight-progress.html` | Profile CRUD and daily tracking CRUD |
| Patient services | `user/dietitian-plans.html`, `find-dietitian.html`, `recipes.html`, `calorie-reports.html`, `chat.html` | Plans, dietitian directory, requests, recipes, reports, messaging |
| Dietitian portal | `dietitian/dashboard.html`, `patients.html`, `meal-builder.html`, `guidance-requests.html`, `recipe-upload.html`, `chat.html` | Assigned-patient access, request actions, plans, recipes, messages |
| Admin portal | `admin/dashboard.html`, `users.html`, `dietitian-approvals.html`, `food-database.html`, `system-reports.html`, `settings.html` | Full administration, exports, audit, settings, reports |
| Shared assets | `assets/js/dummy-data.js`, `assets/js/admin.js`, `assets/js/main.js` | Replace local-storage reads/writes with API calls |

The current frontend contains seeded demo values and several static dashboard values. The backend must return authoritative values; the frontend must not use hard-coded user, dietitian, report, or message data after integration.

## 4. Actors and Authorization

### 4.1 Roles

- `user`: patient account. Can manage only their own health data, requests, messages, and view assigned plans.
- `dietitian`: professional account. Must be approved before accessing clinical operations. Can access patients connected through an accepted guidance request and can manage their own plans, recipes, and messages.
- `admin`: system administrator. Can manage accounts, approvals, food catalog, system settings, audit logs, and reports.

### 4.2 Authentication

- All protected API requests use `Authorization: Bearer <access_token>`.
- Passwords must be hashed with Argon2id or bcrypt. Plain-text passwords must never be stored or logged.
- Email addresses are case-insensitive and stored in lowercase.
- Access tokens should be short-lived. Refresh tokens should be stored server-side or as securely hashed records if persistent sessions are supported.
- `remember` / "Keep me signed in" controls refresh-token lifetime only. It must not change authorization.
- Inactive accounts cannot log in.
- A dietitian with status `pending`, `rejected`, or `suspended` cannot use dietitian clinical endpoints.

### 4.3 Authorization matrix

| Capability | User | Approved dietitian | Admin |
|---|---:|---:|---:|
| Read/update own account and health profile | Yes | Own account only | Yes |
| Read own meals, water, sleep, weight | Yes | No, unless assigned patient access | Yes |
| Create own tracking records | Yes | No | Yes for support purposes |
| Browse approved dietitians | Yes | No | Yes |
| Create guidance request | Yes | No | Yes |
| Accept/reject request addressed to self | No | Yes | Yes |
| Read assigned patient health data | No | Yes | Yes |
| Create plans for connected patients | No | Yes | Yes |
| Publish own recipes | No | Yes | Yes |
| Read published recipes | Yes | Yes | Yes |
| Send/read conversation messages | Participant only | Participant only | Support/audit access only |
| Manage all users | No | No | Yes |
| Approve/suspend dietitians | No | No | Yes |
| Manage food catalog/settings/audit | No | No | Yes |
| Generate system reports | Own reports | Assigned-patient reports | Yes |

## 5. Technical Requirements

- REST API returning JSON.
- Base path: `/api/v1`.
- PostgreSQL 15 or newer using `database/schema.sql`.
- All timestamps are ISO 8601 UTC strings, for example `2026-09-20T10:15:00Z`.
- Dates are ISO dates, for example `2026-09-20`.
- Units are explicit: height in centimeters, weight in kilograms, water in liters, sleep in hours, calories in kcal, nutrients in grams.
- UUIDs are used for public resource identifiers.
- List endpoints support `page`, `pageSize`, `sort`, and relevant filters. Default `pageSize` is 20 and maximum is 100.
- API responses must never expose `password_hash`.
- All write operations must validate authorization and input on the server, even when the browser already validates it.

## 6. Standard API Contract

### 6.1 Successful response

Single resource:

```json
{
  "data": {
    "id": "8f5d3b9e-5a6d-4d15-bb8d-5b8a8c2ed5bc"
  }
}
```

Collection:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

### 6.2 Error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "fields": {
      "email": "A valid email address is required."
    },
    "requestId": "req_01J..."
  }
}
```

Required HTTP behavior:

| Status | Meaning |
|---:|---|
| 400 | Malformed request or invalid query parameter |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource does not exist or is not visible to the caller |
| 409 | Duplicate or invalid state transition |
| 422 | Semantically invalid field values |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error; do not expose stack traces |

### 6.3 Common error codes

`VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE`, `DIETITIAN_NOT_APPROVED`, `FORBIDDEN`, `NOT_FOUND`, `DUPLICATE_EMAIL`, `PENDING_REQUEST_EXISTS`, `INVALID_STATUS_TRANSITION`, `MAINTENANCE_MODE`, and `RATE_LIMITED`.

## 7. API Declaration

### 7.1 Authentication and account endpoints

#### `POST /auth/register`

Creates a patient or dietitian account. Admin registration is disabled through the public API.

Patient request:

```json
{
  "role": "user",
  "fullName": "Fatema Rifa",
  "email": "user@example.com",
  "password": "password123",
  "profile": {
    "age": 24,
    "heightCm": 165,
    "currentWeightKg": 64.5,
    "primaryGoal": "Weight Loss & Fat Burn"
  }
}
```

Dietitian request:

```json
{
  "role": "dietitian",
  "fullName": "Dr. Emily Vance",
  "email": "emily@example.com",
  "password": "password123",
  "dietitianProfile": {
    "specialty": "Diabetic & Renal Diets",
    "qualification": "Registered Dietitian",
    "yearsExperience": 5
  }
}
```

Rules:

- Email must be unique, normalized to lowercase, and valid.
- Password length must be at least 6 characters at the frontend boundary and stronger policy may be enforced by the backend.
- Patient profile is created for role `user`.
- Dietitian profile starts as `pending`, unless `auto_approve_dietitians` is enabled.
- Return `201 Created` with a safe account summary. Do not automatically grant an approved dietitian session.

#### `POST /auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "user",
  "remember": true
}
```

The optional role must match the account role. Return `401` for invalid credentials and `403` with `DIETITIAN_NOT_APPROVED` for an unapproved dietitian.

Response:

```json
{
  "data": {
    "accessToken": "jwt-or-opaque-token",
    "expiresIn": 900,
    "refreshToken": "returned-only-if-session-policy-allows",
    "user": {
      "id": "uuid",
      "fullName": "Fatema Rifa",
      "email": "user@example.com",
      "role": "user",
      "status": "active"
    }
  }
}
```

#### `POST /auth/refresh`

Rotates a valid refresh token and returns a new access token.

#### `POST /auth/logout`

Revokes the current refresh token/session. Return `204 No Content`.

#### `GET /me`

Returns the authenticated account, role-specific profile, and current permissions.

#### `PATCH /me`

Updates the authenticated account's display name. Email changes require a dedicated verification flow or may be disabled in version 1.

### 7.2 Patient profile and dashboard endpoints

#### `GET /me/health-profile`

Returns age, gender, height, current weight, target weight, primary goal, calorie target, water target, sleep target, and calculated BMI.

BMI is calculated as:

```text
BMI = weightKg / (heightMeters * heightMeters)
```

The API returns `bmi` and `bmiCategory` but does not persist BMI.

#### `PUT /me/health-profile`

Accepts the profile fields shown in `user/health-profile.html`. Validate positive measurements, age 1-130, calorie target greater than zero, and supported gender values. Updating current weight must not delete weight history; the backend should also create or update today's `weight_entries` record when the product policy treats profile weight as a measurement.

#### `GET /me/dashboard?date=YYYY-MM-DD`

Returns the data required by the user dashboard:

```json
{
  "data": {
    "date": "2026-09-20",
    "calories": { "consumed": 1010, "target": 2000, "percentage": 50.5, "warning": false },
    "water": { "amountLiters": 1.8, "targetLiters": 2.5, "percentage": 72 },
    "sleep": { "durationHours": 7.5, "qualityScore": 88 },
    "meals": []
  }
}
```

Calorie warning is true when consumed calories are greater than or equal to `daily_calorie_target * warning_percentage / 100`.

### 7.3 Meal logging endpoints

#### `GET /me/meals?from=YYYY-MM-DD&to=YYYY-MM-DD&category=breakfast`

Returns the caller's meal logs ordered by `loggedAt DESC`. Default date range is today.

#### `POST /me/meals`

Request:

```json
{
  "loggedFor": "2026-09-20",
  "category": "breakfast",
  "mealName": "Berry Oatmeal",
  "calories": 350,
  "foodItemId": "uuid-or-null",
  "recipeId": "uuid-or-null"
}
```

`mealName` and `calories` are required. If a catalog item or recipe is selected, the backend may prefill values, but the logged record must retain the calorie snapshot so catalog edits do not rewrite history.

#### `PATCH /me/meals/{mealId}`

Updates an owned meal log using the same validation rules.

#### `DELETE /me/meals/{mealId}`

Deletes an owned meal log. Return `204`.

### 7.4 Water tracking endpoints

#### `GET /me/water?date=YYYY-MM-DD`

Returns the single daily aggregate record. If no row exists, return zero amount and the user's configured target without creating a row.

#### `PUT /me/water/{date}`

Request:

```json
{
  "amountLiters": 1.8,
  "targetLiters": 2.5
}
```

Use an upsert on `(user_id, log_date)`. Amount cannot be negative. Target defaults from profile or system settings.

### 7.5 Sleep tracking endpoints

#### `GET /me/sleep?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns daily sleep records ordered by date descending.

#### `PUT /me/sleep/{date}`

Request:

```json
{
  "durationHours": 7.5,
  "qualityScore": 88,
  "bedtime": "2026-09-19T23:00:00Z",
  "wakeTime": "2026-09-20T06:30:00Z",
  "notes": "Slept well"
}
```

Use an upsert on `(user_id, sleep_date)`. Duration must be between 0 and 24 and quality must be 0-100.

### 7.6 Weight endpoints

#### `GET /me/weights?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns date and weight history. Dates must be real ISO dates; display labels such as `TODAY` and `1 MAY` are frontend formatting only.

#### `POST /me/weights`

```json
{
  "measuredOn": "2026-09-20",
  "weightKg": 64.5
}
```

Only one entry per user per date is allowed. A repeated date should return `409` or be treated as an update according to the selected product convention; the recommended behavior is `409` for `POST` and `PUT /me/weights/{date}` for replacement.

#### `PUT /me/weights/{date}`

Replaces the caller's weight for the specified date.

#### `DELETE /me/weights/{date}`

Deletes an owned measurement if deletion is permitted by retention policy.

### 7.7 Dietitian directory and guidance requests

#### `GET /dietitians?search=&specialty=&page=&pageSize=`

Returns only dietitians whose profile status is `approved`. Search matches name and specialty. Response fields include id, name, specialty, years experience, rating, and avatar URL.

#### `GET /dietitians/{dietitianId}`

Returns a public approved dietitian profile. Do not expose private credentials or audit notes.

#### `POST /me/guidance-requests`

Request:

```json
{
  "dietitianId": "uuid",
  "goal": "Weight Loss & Healthy Living"
}
```

Rules:

- Caller must have role `user`.
- Target must be an approved dietitian.
- A pending request for the same patient and dietitian is rejected with `409 PENDING_REQUEST_EXISTS`.
- Status starts as `pending`.

#### `GET /me/guidance-requests`

Returns requests created by the caller, including dietitian summary and current status.

#### `GET /dietitian/guidance-requests?status=pending`

Approved dietitian sees requests addressed to their account. Admin may access all requests.

#### `PATCH /dietitian/guidance-requests/{requestId}`

Request:

```json
{
  "status": "accepted"
}
```

Only `pending -> accepted` or `pending -> rejected` is allowed. On acceptance, create or reuse the patient-dietitian conversation. Record an audit event.

### 7.8 Patient access for dietitians

#### `GET /dietitian/patients`

Returns patients with an accepted guidance request or another explicit active relationship. Include summary fields needed by `dietitian/dashboard.html` and `dietitian/patients.html`: name, email, age, gender, current weight, height, goal, calorie target, latest weight, and latest activity.

#### `GET /dietitian/patients/{patientId}/health-profile`

Allowed only for the assigned dietitian or admin. Return the same profile structure as `/me/health-profile` plus relevant tracking summaries.

#### `GET /dietitian/patients/{patientId}/meals?from=&to=`

Allowed only for the assigned dietitian or admin.

#### `GET /dietitian/patients/{patientId}/progress`

Returns weight, calorie, water, and sleep summaries for the requested date range.

### 7.9 Meal plan endpoints

#### `POST /dietitian/meal-plans`

Request:

```json
{
  "patientId": "uuid",
  "title": "Low-Carb High-Protein Weight Loss Plan",
  "targetCalories": 1800,
  "status": "active",
  "startDate": "2026-09-20",
  "endDate": null,
  "items": [
    { "category": "breakfast", "recommendation": "Berry Oatmeal & Chia Seeds" },
    { "category": "lunch", "recommendation": "Grilled Chicken & Quinoa Salad" },
    { "category": "dinner", "recommendation": "Steamed Salmon & Veggies" }
  ]
}
```

Rules:

- Caller must be an approved dietitian or admin.
- Patient must be an eligible patient and, for a dietitian, have an accepted relationship.
- At least one plan item is required. The current form requires breakfast, lunch, and dinner.
- `status=active` makes the plan visible to the patient.
- Publish/send is one transaction: create plan, items, and audit event together.

#### `GET /me/meal-plans?status=active`

Returns plans assigned to the authenticated patient. Include dietitian summary and plan items.

#### `GET /dietitian/meal-plans?patientId=&status=`

Returns plans authored by the authenticated dietitian, optionally filtered by patient and status.

#### `GET /meal-plans/{planId}`

Returns a plan only to its patient, authoring dietitian, or admin.

#### `PATCH /dietitian/meal-plans/{planId}`

Updates a draft or active plan owned by the dietitian. Archive instead of hard-delete after patient visibility has begun.

### 7.10 Recipe endpoints

#### `GET /recipes?category=&search=&page=&pageSize=`

Publicly authenticated users can browse published recipes. Return title, category, calories, prep time, author summary, image URL, serving size, instructions, and ingredients.

#### `GET /recipes/{recipeId}`

Returns the full published recipe. The author can view an unpublished own recipe; admins can view all.

#### `POST /dietitian/recipes`

Request:

```json
{
  "title": "High-Protein Avocado Chicken Bowl",
  "category": "lunch",
  "calories": 450,
  "prepTimeMinutes": 20,
  "imageUrl": "https://example.com/image.jpg",
  "servingSize": "1 bowl",
  "instructions": "...",
  "ingredients": [
    { "ingredientName": "Chicken breast", "quantity": "150 g", "foodItemId": null }
  ]
}
```

The existing frontend only captures title, category, calories, text prep time, and image URL. The extra fields are supported but optional for backward compatibility.

#### `PATCH /dietitian/recipes/{recipeId}`

Updates an own recipe. Replacing ingredients must be transactional.

#### `DELETE /dietitian/recipes/{recipeId}`

Unpublishes or archives the recipe. Hard deletion is discouraged when it is referenced by meal logs.

### 7.11 Chat endpoints

#### `GET /me/conversations`

Returns conversations for the caller. A user sees assigned dietitians; a dietitian sees connected patients.

#### `GET /conversations/{conversationId}/messages?before=&limit=`

Returns messages in ascending display order or with a documented cursor. Only participants and admins may access.

#### `POST /conversations/{conversationId}/messages`

Request:

```json
{
  "text": "I logged my oatmeal today."
}
```

Rules:

- Sender must be a conversation participant.
- Trim whitespace and reject empty messages.
- Set `sentAt` on the server.
- Mark messages as read with a separate endpoint or when the recipient opens the conversation.
- The backend must not generate automatic clinical advice. The current delayed demo reply is frontend-only and must be removed or replaced by a real dietitian message.

#### `POST /conversations/{conversationId}/read`

Marks messages from the other participant as read. Return `204`.

### 7.12 Admin endpoints

All endpoints in this section require role `admin`.

#### User management

- `GET /admin/users?search=&status=&role=&page=&pageSize=`
- `POST /admin/users`
- `GET /admin/users/{userId}`
- `PATCH /admin/users/{userId}`
- `POST /admin/users/{userId}/activate`
- `POST /admin/users/{userId}/deactivate`
- `DELETE /admin/users/{userId}`

Admin-created patient request fields match the user modal: full name, email, age, gender, height, current weight, target weight, goal, and daily calorie target. Deactivation is preferred to deletion because health records and audit history may need retention.

#### Dietitian administration

- `GET /admin/dietitians?search=&status=&page=&pageSize=`
- `POST /admin/dietitians`
- `GET /admin/dietitians/{dietitianId}`
- `PATCH /admin/dietitians/{dietitianId}/status`
- `DELETE /admin/dietitians/{dietitianId}`

Status request:

```json
{
  "status": "approved",
  "reviewNote": "Credentials verified."
}
```

Allowed transitions: `pending -> approved`, `pending -> rejected`, `approved -> suspended`, `suspended -> approved`, and `rejected -> pending` when re-review is explicitly supported. Every transition creates an audit log.

#### Food catalog

- `GET /admin/food-items?search=&category=&page=&pageSize=`
- `POST /admin/food-items`
- `GET /admin/food-items/{foodItemId}`
- `PATCH /admin/food-items/{foodItemId}`
- `DELETE /admin/food-items/{foodItemId}`
- `GET /admin/food-items/export.csv`

Food item fields are name, category, calories, protein grams, carbohydrate grams, fat grams, and portion description. Numeric nutrient values cannot be negative.

#### Settings and audit

- `GET /admin/settings`
- `PUT /admin/settings`
- `GET /admin/audit-logs?eventType=&status=&from=&to=&page=&pageSize=`
- `DELETE /admin/audit-logs` only if retention policy allows it

Settings fields:

```json
{
  "warningPercentage": 80,
  "defaultWaterLiters": 2.5,
  "defaultSleepHours": 8,
  "maintenanceMode": false,
  "autoApproveDietitians": false
}
```

`maintenanceMode` must not block administrators. For users, write endpoints should return `503` or `403 MAINTENANCE_MODE` with a clear error. Read-only pages may remain available.

### 7.13 Reports and exports

#### Patient reports

- `GET /me/reports/calories?from=&to=`
- `GET /me/reports/progress?from=&to=`
- `GET /me/reports/progress.pdf?from=&to=`

The calorie report must calculate average daily intake, target comparison, warning days, and hydration consistency from stored records. It must not return the current hard-coded values in `user/calorie-reports.html`.

#### Admin reports

- `GET /admin/reports/overview`
- `GET /admin/reports/weekly-calories?from=&to=`
- `GET /admin/reports/weight-trends?from=&to=`
- `GET /admin/reports/dietitian-activity?from=&to=`
- `GET /admin/reports/food-catalog.csv`
- `GET /admin/reports/system.pdf?from=&to=`

The overview must include total active patients, approved dietitians, pending approvals, food catalog count, recent audit activity, and report generation time. Randomly generated values are not acceptable in production.

## 8. Data Model Mapping

The authoritative relational model is in `database/schema.sql`.

| Domain object | PostgreSQL table(s) |
|---|---|
| Account and authentication | `accounts` |
| Patient health profile | `user_profiles` |
| Dietitian credentials and approval | `dietitian_profiles` |
| Food catalog | `food_items` |
| Published recipes | `recipes`, `recipe_ingredients` |
| Assigned meal plans | `meal_plans`, `meal_plan_items` |
| Meal logs | `meal_logs` |
| Daily water | `water_logs` |
| Daily sleep | `sleep_logs` |
| Weight history | `weight_entries` |
| Guidance requests | `guidance_requests` |
| Chat | `conversations`, `messages` |
| System configuration | `system_settings` |
| Auditing | `audit_logs` |
| Calorie report base | `user_daily_calorie_summary` view |
| Weight report base | `user_weight_progress` view |

Important persistence rules:

- Account role and profile table must agree. The backend should reject a dietitian profile for a patient account and vice versa.
- Foreign keys and database constraints are mandatory; application validation alone is insufficient.
- Tracking records belong to the account identified by the access token, not a user ID supplied by the browser.
- Meal log calories are historical snapshots.
- Current profile weight and weight history are separate concepts, but profile updates should define the product's synchronization behavior consistently.
- Reports are derived data. Do not store dashboard totals unless a later performance requirement justifies a cache.

## 9. Workflow Requirements

### 9.1 Patient registration and onboarding

1. Patient submits registration form.
2. Backend validates email uniqueness and password policy.
3. Backend creates `accounts` and `user_profiles` in one transaction.
4. Backend applies system defaults for water and sleep targets.
5. Backend creates an audit event for registration.
6. Backend returns account summary and login guidance.

### 9.2 Dietitian approval

1. Dietitian registers with professional specialty and qualification.
2. Backend creates account with `role=dietitian` and profile status `pending` unless auto-approval is enabled.
3. Pending dietitian is excluded from the public directory.
4. Admin approves, rejects, or suspends the profile.
5. Backend records reviewer, review time, note, and audit event.
6. Approved dietitian becomes visible in `GET /dietitians` and can use clinical endpoints.

### 9.3 Guidance and relationship creation

1. Patient browses approved dietitians.
2. Patient submits a guidance request.
3. Backend prevents duplicate pending requests transactionally.
4. Dietitian accepts or rejects the request.
5. Acceptance creates or reuses a conversation and makes the patient available in the dietitian's patient list.
6. Rejection does not create a clinical relationship.

### 9.4 Meal-plan publication

1. Approved dietitian selects an eligible patient.
2. Backend validates patient relationship.
3. Backend stores plan header and plan items in one transaction.
4. Active plan appears to the patient.
5. Backend emits audit event and optional in-app notification.

### 9.5 Tracking and reporting

1. Patient writes daily records through authenticated endpoints.
2. Backend stores UTC timestamps and explicit local calendar dates.
3. Dashboard totals are calculated for the requested date.
4. Report endpoints calculate averages and percentages from records and targets.
5. PDF/CSV exports use the same report query results as JSON endpoints.

## 10. Validation Rules

- `fullName`: required, trimmed, 1-150 characters.
- `email`: required, valid format, lowercase, unique.
- `password`: required at registration, minimum 6 characters per current UI; backend may enforce a stronger policy.
- `age`: integer 1-130.
- `heightCm`: greater than 0 and less than 300.
- `weightKg`: greater than 0 and less than 1000.
- `targetWeightKg`: greater than 0 and less than 1000.
- `dailyCalorieTarget`: positive integer below 10,000.
- `waterLiters`: non-negative; target positive.
- `sleepHours`: 0-24; quality 0-100.
- `calories`: non-negative integer.
- `rating`: 0-5.
- `warningPercentage`: 0-100.
- `messageText`: trimmed and non-empty.
- Enum values are case-normalized at the API boundary. JSON may use lowercase canonical values.
- All create/update endpoints reject unknown or silently ignored security-sensitive fields such as `role`, `status`, `actorId`, or ownership IDs unless the endpoint explicitly allows them.

## 11. Security and Privacy Requirements

- Enforce object-level authorization on every resource endpoint.
- Never trust `userId`, `patientId`, `dietitianId`, `senderId`, or `actorId` from the client for ownership decisions.
- Use parameterized SQL or a safe ORM/query builder.
- Rate-limit login, registration, message creation, and report generation.
- Apply CORS only to the deployed frontend origin.
- Use secure, HttpOnly, SameSite cookies if refresh tokens are cookie-based.
- Do not include health records in general-purpose logs.
- Audit administrator changes, approvals, account status changes, food changes, settings changes, plan publication, and request decisions.
- Escape or sanitize user-generated text before rendering in the frontend.
- Restrict image URLs to accepted schemes and apply appropriate content security policy.
- Use HTTPS outside local development.
- Define a retention and deletion policy before enabling permanent account deletion.

## 12. Non-Functional Requirements

- P95 response time below 500 ms for normal list/detail endpoints under expected development load.
- Paginate all potentially unbounded collections.
- Use database indexes defined in `database/schema.sql` and inspect query plans for reports.
- Use transactions for registration, approval changes, guidance acceptance, plan publication, and recipe ingredient replacement.
- Store timestamps in UTC and document the server timezone.
- Return deterministic ordering for all lists, normally newest first.
- Provide structured server logs with request ID, status code, latency, and authenticated account ID where appropriate.
- Provide health checks for API and database connectivity.
- Back up PostgreSQL and test restoration before production use.

## 13. Frontend Integration Notes

The current frontend is a static prototype and must be changed during integration:

- Replace `SHD_Data.get*` and `localStorage` writes with authenticated API calls.
- Replace the shared demo chat collection with a conversation-specific API.
- Remove hard-coded names, IDs, calorie totals, static patient lists, and report values.
- `meal-builder.html` currently displays an alert instead of persisting a plan; call `POST /dietitian/meal-plans`.
- `recipe-upload.html` currently writes to local storage; call `POST /dietitian/recipes`.
- `find-dietitian.html` must use the authenticated patient identity and server-side duplicate prevention.
- `guidance-requests.html` currently assumes dietitian `d1`; use the logged-in dietitian identity.
- `user/chat.html` currently creates an artificial delayed dietitian reply; remove this behavior.
- The UI uses title-case labels while the API uses lowercase canonical enum values. Add a presentation mapping in the frontend.
- The existing browser IDs such as `u1`, `d1`, and `f1` are demo identifiers only. Production API IDs are UUIDs.
- Browser-calculated BMI may remain for immediate display, but the API should return the authoritative calculated value for consistency.

## 14. Acceptance Criteria

### Authentication

- A new patient can register, log in, refresh a session, and retrieve `/me`.
- A new dietitian is pending by default and cannot access clinical endpoints before approval.
- Duplicate email registration is rejected.
- Inactive accounts cannot authenticate.

### Patient portal

- A patient can read and update their profile.
- A patient can create, update, list, and delete their own meal logs.
- Water and sleep updates are idempotent per date.
- Weight history is ordered correctly and does not use display strings as dates.
- Dashboard totals match database records for the requested date.

### Dietitian portal

- Only approved dietitians appear in the directory.
- A dietitian can see only accepted patients.
- A dietitian can accept/reject only requests addressed to them.
- A dietitian can publish an active plan for an eligible patient.
- A dietitian can publish and update recipes.
- Chat messages are visible only to conversation participants and authorized admins.

### Admin portal

- Admin can filter/search users and change active status.
- Admin can approve, reject, suspend, and review dietitian profiles.
- Admin can CRUD food catalog items and export CSV.
- Admin can update settings and see audit logs.
- Admin reports use calculated database data and do not contain random or hard-coded metrics.

### Quality and security

- Unauthorized ownership changes return `403` or `404` without leaking resource existence.
- Invalid fields return structured validation errors.
- Critical multi-row writes are atomic.
- Password hashes, tokens, and private credentials never appear in API responses or logs.

## 15. Backend Delivery Checklist

- [ ] Apply `database/schema.sql` to PostgreSQL.
- [ ] Create initial admin account through a secure deployment script, not public registration.
- [ ] Implement authentication and role middleware.
- [ ] Implement request validation and standard error envelope.
- [ ] Implement patient profile and tracking endpoints.
- [ ] Implement dietitian approval and relationship rules.
- [ ] Implement plans, recipes, chat, and reports.
- [ ] Implement admin CRUD, settings, exports, and audit logging.
- [ ] Add automated unit tests for validation and status transitions.
- [ ] Add integration tests for authorization and ownership isolation.
- [ ] Add API documentation generation from the endpoint contract.
- [ ] Connect frontend pages to the API and remove demo local-storage behavior.
- [ ] Verify migrations, backup, restore, and production environment variables.
