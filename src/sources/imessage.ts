import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import { DataSource, OTPEntry } from "../types";
import { extractOTP } from "../otp-detector";

const MESSAGES_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

/**
 * Extract plain text from attributedBody hex string
 * The attributedBody is a binary plist containing NSAttributedString
 * The actual text is stored as UTF-8 after a length prefix
 */
function extractTextFromAttributedBody(hexString: string): string | null {
  if (!hexString) return null;

  try {
    // Convert hex to buffer
    const buffer = Buffer.from(hexString, "hex");
    const str = buffer.toString("utf-8");

    // Look for the text content - it appears after "NSString" marker
    // The format has a length byte followed by the actual text
    // We look for readable ASCII/UTF-8 sequences
    const matches = str.match(/[\x20-\x7E\u00A0-\uFFFF]{10,}/g);
    if (matches && matches.length > 0) {
      // Find the longest match that looks like message content
      // Filter out obvious metadata strings
      const filtered = matches.filter(
        (m) =>
          !m.includes("NSMutableAttributedString") &&
          !m.includes("NSAttributedString") &&
          !m.includes("NSMutableString") &&
          !m.includes("NSDictionary") &&
          !m.includes("NSString") &&
          !m.includes("NSObject") &&
          !m.includes("NSValue") &&
          !m.includes("NSNumber") &&
          !m.includes("NSData") &&
          !m.includes("NSArray") &&
          !m.includes("streamtyped") &&
          !m.includes("$class")
      );
      if (filtered.length > 0) {
        // Return the longest filtered match (usually the message text)
        let text = filtered.reduce((a, b) => (a.length > b.length ? a : b));
        // Strip leading non-alphanumeric characters (binary artifacts)
        text = text.replace(/^[^a-zA-Z0-9]+/, "");
        return text;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/**
 * iMessage/SMS Data Source
 * Reads from the local Messages SQLite database.
 * Note: Requires Full Disk Access permission in System Preferences.
 */
export const imessageSource: DataSource = {
  name: "imessage",

  isEnabled(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return prefs.enableIMessage;
  },

  isConfigured(): boolean {
    return existsSync(MESSAGES_DB_PATH);
  },

  async fetchOTPs(lookbackMinutes: number): Promise<OTPEntry[]> {
    console.log("[DEBUG] iMessage fetchOTPs called, enabled:", this.isEnabled(), "configured:", this.isConfigured());

    if (!this.isEnabled() || !this.isConfigured()) {
      return [];
    }

    const entries: OTPEntry[] = [];

    try {
      // Calculate timestamp for lookback
      // macOS Messages uses Apple's "Cocoa" epoch (Jan 1, 2001)
      const now = Date.now();
      const lookbackMs = lookbackMinutes * 60 * 1000;
      const cutoffDate = new Date(now - lookbackMs);
      // Convert to Apple epoch (nanoseconds since Jan 1, 2001)
      const appleEpochOffset = 978307200; // seconds from Unix epoch to Apple epoch
      const cutoffApple = (cutoffDate.getTime() / 1000 - appleEpochOffset) * 1_000_000_000;

      // Query the Messages database
      // Using sqlite3 CLI to avoid native module dependencies
      // Note: Newer macOS versions store message text in attributedBody (binary plist)
      // instead of the text column, so we fetch both
      const query = `
        SELECT
          m.ROWID,
          m.text,
          m.date,
          m.is_from_me,
          COALESCE(h.id, c.chat_identifier) as sender,
          hex(m.attributedBody) as attributedBodyHex
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE m.date > ${cutoffApple}
          AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
          AND m.is_from_me = 0
        ORDER BY m.date DESC
        LIMIT 100
      `;

      const result = execSync(`sqlite3 -separator $'\\t' "${MESSAGES_DB_PATH}" "${query.replace(/"/g, '\\"')}"`, {
        encoding: "utf-8",
        timeout: 5000,
      });

      if (!result || result.trim() === "") {
        console.log("[DEBUG] iMessage: No messages found in database");
        return [];
      }

      const lines = result.trim().split("\n");
      console.log("[DEBUG] iMessage: Found", lines.length, "messages");

      const messages: Array<{
        ROWID: number;
        text: string;
        date: number;
        sender: string | null;
      }> = [];

      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 5) {
          // Try text column first, fall back to extracting from attributedBody
          let text = parts[1];
          if (!text && parts.length >= 6 && parts[5]) {
            text = extractTextFromAttributedBody(parts[5]) || "";
          }

          // Clean up sender - remove service tags like (smsft), (smsfp), etc.
          let sender = parts[4] || null;
          if (sender) {
            sender = sender.replace(/\([^)]*\)$/, "").trim();
          }

          messages.push({
            ROWID: parseInt(parts[0], 10),
            text,
            date: parseFloat(parts[2]),
            sender,
          });
        }
      }

      for (const msg of messages) {
        if (!msg.text) continue;

        console.log("[DEBUG] iMessage: Checking message from", msg.sender, "- text:", msg.text.slice(0, 100));
        const otpMatch = extractOTP(msg.text);
        console.log("[DEBUG] iMessage: OTP match result:", otpMatch);
        if (otpMatch) {
          // Convert Apple epoch (nanoseconds) back to JavaScript Date
          const timestamp = new Date((msg.date / 1_000_000_000 + appleEpochOffset) * 1000);

          entries.push({
            id: `imessage-${msg.ROWID}`,
            code: otpMatch.code,
            source: "imessage",
            sender: msg.sender || "Unknown",
            timestamp,
            rawMessage: msg.text,
            messageId: String(msg.ROWID),
          });
        }
      }
    } catch (error) {
      // Database access might fail due to permissions
      // This is expected on first run before Full Disk Access is granted
      console.error("[DEBUG] iMessage: Error fetching messages:", error);
    }

    return entries;
  },

  // iMessage doesn't support mark as read or delete via API
  // These operations would require AppleScript or other automation
};

/**
 * Check if Full Disk Access is likely granted
 */
export function checkMessagesAccess(): boolean {
  try {
    execSync(`sqlite3 "${MESSAGES_DB_PATH}" "SELECT 1 LIMIT 1"`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}
