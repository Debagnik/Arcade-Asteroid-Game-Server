# AsteroidServer API

A Node.js & Express based REST API for securely handling Asteroid game submissions and storing them in Google Sheets. It leverages rigorous cryptography (XOR, Base64 stripping, UUID v3 integrity generation) and verification filters.

## Project Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env` (or configure your `.env`):
   ```
   PORT=3000
   JWT_SECRET=super_secret_jwt_key_here
   JWT_EXPIRES_IN=3600
   XOR_KEY=change_me_xor_key
   SALT=change_me_salt
   GOOGLE_SHEET_ID=your_google_sheet_id_here
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account.json
   ```

3. **Start the server**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

---

## Setting up Google Sheets Integration

To allow the server to securely read and append data to Google Sheets, you must generate Google Service Account credentials.

### Step 1: Create a Service Account
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Search for **Google Sheets API** and **Enable** it for your project.
4. Navigate to **IAM & Admin -> Service Accounts**.
5. Click **Create Service Account**, give it a name like `asteroid-server`, and click **Create and Continue**.
6. (Optional) Grant it roles if necessary, but skipping is fine since we invite it directly to the spreadsheet.
7. Click **Done**.

### Step 2: Generate JSON Credentials Key
1. From the Service Accounts list, click the 3 dots next to your newly created Service Account and select **Manage keys**.
2. Click **Add Key -> Create new key**.
3. Choose **JSON** and click **Create**.
4. A `{your-project}-xxxxxx.json` file will download to your machine. **Keep this secure!**
5. Place the file somewhere safe and link its absolute path in your `.env` file under `GOOGLE_APPLICATION_CREDENTIALS`.

### Step 3: Create and Share your Google Sheet
1. Create a new Google Spreadsheet.
2. The URL will look like `https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID/edit...`. Extract the `YOUR_GOOGLE_SHEET_ID` and add it to your `.env` file under `GOOGLE_SHEET_ID`.
3. Create four tabs in your spreadsheet:
   - **`Config`**: Column A = version (e.g., `v1`), Column B = pepper string. Reserved Row 1 for headers.
   - **`GlobalScores`**: Reserved Row 1 for headers (Mode, Score, ScoredBy, Timestamp, SessionId, HighScoreId).
   - **`PlayerMasterData`**: Stores the metadata and flattened high scores. Unique by `SystemUUID`. Reserved Row 1 for headers.
   - **`sessionData`**: Stores all valid session histories globally. Reserved Row 1 for headers (SessionId, PlayerUsername, Mode, Score, TimePlayed, Timestamp, SystemUUID). Unique by `SessionId`.
4. **Important**: Click the **Share** button on your Google Sheet. Invite the exact email address of your Service Account (found in your `.json` key file, e.g., `asteroid-server@project-id.iam.gserviceaccount.com`) as an **Editor**.

---

## API Endpoints

### `GET` / `POST /api/auth`
- Unprotected route.
- Returns a JWT token valid for `JWT_EXPIRES_IN` seconds.

### `GET /api/system/pepper?version=v1`
- Protected route (Requires Bearer Token).
- Fetches the system Pepper string assigned to the provided version on the `Config` sheet.

### `POST /api/getEncryptionKey`
- Protected route (Requires Bearer Token).
- Expects: `{ "publicKey": "<Client RSA Public Key (PEM)>" }`.
- Returns: `{ "encryptedAesKey": "<Base64 string>" }`. The client uses their RSA Private Key to decrypt this value, retrieving the server's 32-byte AES-256 session key.

### `POST /api/scores?version=v1`
- Protected route (Requires Bearer Token).
- Expects query param: `version` (optional, determines pepper string).
- Expects body: 
  ```json
  {
    "gameScore": "<encoded/encrypted payload>",
    "isPeppered": true,
    "isEncrypted": true
  }
  ```
- **If `isEncrypted=true`**: Server decrypts `gameScore` using AES-256-CBC and updates all tracking sheets including `GlobalScores`.
- **If `isEncrypted=false`**: Server does not decrypt AES, but decodes the payload, validates it, and updates `PlayerMasterData` and `sessionData` (skips `GlobalScores`).
- Decodes via LZMA2, Base64, Salt, and XOR. Verifies SHA-256 integrity signatures and physical game constraints.

### `GET /api/leaderboard`
- Protected route (Requires Bearer Token).
- Reads `GlobalScores` sheet and returns the highest score globally for `TIME_BOUND`, `ENDLESS`, and `CLASSIC` modes, gracefully masking negative sheet numbers to 0.

---

## Client-Side Pipeline Specifications

To correctly submit data to `/api/scores`, the client system must implement the following pipeline exactly.

### 1. Encoding Pipeline (Before Encryption)
1. **Compress**: Compress raw JSON string to bytes using LZMA2 (Preset 9 / Max).
2. **Base64 Encode**: Encode compressed bytes to a base64 string.
3. **Add Salt**: Append `SALT` ("privacy-apron-privacy-eternal-dominoes-approach") to the base64 string.
4. **XOR Mask Config**: If using pepper, determine the `XOR_KEY` by appending the fetched pepper string to the base `XOR_KEY`. Otherwise, use the base `XOR_KEY` ("B4Y&%!*wZ5b!WRgVo#9EUB78").
5. **XOR Mask**: Convert the salted string to bytes, and XOR each byte against the `XOR_KEY` recursively.
6. **Base64 Encode**: Encode the XOR'd bytes to a base64 string (`protectedData`).
7. **Sign & Assemble**: Calculate the SHA-256 hash of `protectedData` (lowercase hex). Append `CHECKSUM_SEPARATOR` ("(>w<)") and the hash to `protectedData`.

### 2. Encryption Pipeline (Data Transmission)
1. **Fetch Key**: Call `POST /api/getEncryptionKey` with the client's RSA Public Key and retrieve the Base64 RSA-encrypted AES key.
2. **Decrypt Key**: Decrypt the received key using the client's RSA Private Key to obtain the raw 32-byte AES-256 key.
3. **Encrypt Payload**: Generate a random 16-byte IV. Use AES-256-CBC to encrypt the assembled string from the Encoding Pipeline. Prepend the 16-byte IV to the ciphertext bytes.
4. **Base64 Encode Encrypted Payload**: Encode the concatenated `[IV + CipherText]` to a Base64 string.
5. **Send Data**: Assign the resulting Base64 string to `gameScore` in the request body. Set `isEncrypted: true` and `isPeppered: true` (if pepper was used) and `version` query parameter. Retry up to 5 times if the server does not respond with status 201.
