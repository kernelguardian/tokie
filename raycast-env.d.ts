/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Sources - Fetch OTPs from iMessage and SMS messages */
  "enableIMessage": boolean,
  /** Sources - Fetch OTPs from Gmail (requires OAuth Client ID) */
  "enableGmail": boolean,
  /** Sources - Fetch OTPs from iCloud Mail via IMAP */
  "enableICloudMail": boolean,
  /** Configuration - Mark emails as read after copying OTP (Gmail and iCloud) */
  "markAsRead": boolean,
  /** Configuration - Delete email after copying OTP (Gmail and iCloud) */
  "autoDelete": boolean,
  /** Configuration - How far back to search for OTPs (in minutes) */
  "lookbackMinutes": string,
  /** Gmail - OAuth Client ID for Gmail API access */
  "gmailClientId"?: string,
  /** Gmail - OAuth Client Secret (only for Web application type) */
  "gmailClientSecret"?: string,
  /** iCloud Mail - Your iCloud email address */
  "icloudEmail"?: string,
  /** iCloud Mail - App-specific password (generate at appleid.apple.com) */
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

