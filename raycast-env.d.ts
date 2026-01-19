/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Use iMessage - Fetch OTPs from iMessage and SMS messages */
  "enableIMessage": boolean,
  /** Use Gmail - Fetch OTPs from Gmail (requires OAuth setup) */
  "enableGmail": boolean,
  /** Use iCloud Mail - Fetch OTPs from iCloud Mail via IMAP */
  "enableICloudMail": boolean,
  /** Mark as Read - Mark emails as read after copying OTP (Gmail and iCloud) */
  "markAsRead": boolean,
  /** Delete After Copy - Delete email after copying OTP (Gmail and iCloud) */
  "autoDelete": boolean,
  /** Lookback Time (minutes) - How far back to search for OTPs */
  "lookbackMinutes": string,
  /** Gmail Client ID - OAuth Client ID for Gmail API access */
  "gmailClientId"?: string,
  /** Gmail Client Secret - OAuth Client Secret (only for Web application type) */
  "gmailClientSecret"?: string,
  /** iCloud Email - Your iCloud email address */
  "icloudEmail"?: string,
  /** iCloud App Password - App-specific password (generate at appleid.apple.com) */
  "icloudAppPassword"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `view-2fa-codes` command */
  export type View2FaCodes = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `view-2fa-codes` command */
  export type View2FaCodes = {}
}

