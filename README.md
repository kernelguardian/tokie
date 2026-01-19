# Tokie

Unified OTP retrieval from iMessage, Gmail, and iCloud Mail. Quickly copy verification codes without context switching.

## Features

- Fetch OTP codes from **iMessage/SMS**, **Gmail**, and **iCloud Mail**
- Auto-copy codes to clipboard
- View full message content inline
- Optional auto-delete and mark-as-read for emails

## Setup

### iMessage / SMS

**Requirements:**

- macOS with Messages app configured
- Full Disk Access permission for Raycast

**Setup:**

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Enable **Raycast** (add it if not listed)
3. Restart Raycast
4. Enable "Use iMessage" in extension preferences

**Limitations:**

- Read-only access (cannot mark as read or delete messages)
- Requires SMS Forwarding enabled on iPhone for SMS messages
- Messages must be synced to Mac via iCloud or SMS Forwarding
- Some newer macOS versions store messages in binary format (supported)

---

### Gmail

**Requirements:**

- Google Cloud Console account
- OAuth 2.0 credentials (Client ID and Client Secret)

**Setup:**

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Gmail API**
   - Navigate to **APIs & Services** → **Library**
   - Search for "Gmail API" and enable it

3. **Configure OAuth Consent Screen**
   - Go to **APIs & Services** → **OAuth consent screen**
   - Select **External** user type
   - Fill in required fields (app name, support email)
   - Add scope: `https://www.googleapis.com/auth/gmail.modify`
   - Add your email as a test user

4. **Create OAuth Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application** type
   - Add authorized redirect URI: `https://raycast.com/redirect?packageName=tokie`
   - Copy the **Client ID** and **Client Secret**

5. **Configure in Raycast**
   - Open Tokie preferences
   - Enable "Use Gmail"
   - Paste your **Gmail Client ID**
   - Paste your **Gmail Client Secret**
   - On first use, you'll be prompted to authorize via browser

**Note:** While your app is in "Testing" mode, only test users you've added can use it. For personal use, this is sufficient.

---

### iCloud Mail

**Requirements:**

- Apple ID with iCloud Mail enabled
- App-specific password

**Setup:**

1. **Generate an App-Specific Password**
   - Go to [appleid.apple.com](https://appleid.apple.com/)
   - Sign in and go to **Sign-In and Security** → **App-Specific Passwords**
   - Click **Generate** and name it "Tokie" or similar
   - Copy the 16-character password (format: `xxxx-xxxx-xxxx-xxxx`)

2. **Configure in Raycast**
   - Open Tokie preferences
   - Enable "Use iCloud Mail"
   - Enter your **iCloud Email** (e.g., `you@icloud.com`)
   - Paste the **App-Specific Password** (with or without dashes)

**Note:** App-specific passwords are required because iCloud doesn't support standard password authentication for third-party apps.

---

## Preferences

| Preference              | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| **Use iMessage**        | Enable fetching OTPs from iMessage and SMS messages                       |
| **Use Gmail**           | Enable fetching OTPs from Gmail (requires OAuth setup)                    |
| **Use iCloud Mail**     | Enable fetching OTPs from iCloud Mail via IMAP                            |
| **Mark as Read**        | Automatically mark emails as read after copying OTP (Gmail & iCloud only) |
| **Delete After Copy**   | Automatically delete emails after copying OTP (Gmail & iCloud only)       |
| **Lookback Time**       | How many minutes back to search for OTPs (default: 3)                     |
| **Gmail Client ID**     | OAuth Client ID from Google Cloud Console                                 |
| **Gmail Client Secret** | OAuth Client Secret from Google Cloud Console                             |
| **iCloud Email**        | Your iCloud email address                                                 |
| **iCloud App Password** | App-specific password from appleid.apple.com                              |

---

## Supported OTP Formats

Tokie detects common OTP patterns including:

- Explicit codes: "Your code is 123456", "OTP: 123456", "PIN: 1234"
- Google-style: "G-123456"
- Generic patterns with keywords like "verification", "security code", "2FA", etc.

Codes must be 4-8 digits. Common non-OTP patterns (currency, order numbers, tracking numbers) are filtered out.

---

## Troubleshooting

### iMessage not showing codes

1. Verify Full Disk Access is granted to Raycast
2. Restart Raycast after granting permission
3. Increase lookback time if messages are older
4. Ensure SMS Forwarding is enabled on iPhone (Settings → Messages → Text Message Forwarding)

### Gmail authentication fails

1. Verify Client ID and Secret are correct
2. Check that redirect URI matches exactly: `https://raycast.com/redirect?packageName=tokie`
3. Ensure your email is added as a test user in OAuth consent screen
4. Try revoking access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and re-authenticating

### iCloud Mail connection fails

1. Verify email address is correct (use full @icloud.com address)
2. Ensure app-specific password is 16 characters (without dashes) or 19 characters (with dashes)
3. Generate a new app-specific password if the current one doesn't work
4. Check that iCloud Mail is enabled for your Apple ID

---

## Privacy

- No data is sent to third parties

---

## License

MIT
