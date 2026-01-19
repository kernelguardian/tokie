import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import { DataSource, OTPEntry, Preferences } from "../types";
import { extractOTP } from "../otp-detector";

const MESSAGES_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

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
      const query = `
        SELECT
          m.ROWID,
          m.text,
          m.date,
          m.is_from_me,
          COALESCE(h.id, c.chat_identifier) as sender
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE m.date > ${cutoffApple}
          AND m.text IS NOT NULL
          AND m.is_from_me = 0
        ORDER BY m.date DESC
        LIMIT 100
      `;

      const result = execSync(
        `sqlite3 -separator $'\\t' "${MESSAGES_DB_PATH}" "${query.replace(/"/g, '\\"')}"`,
        {
          encoding: "utf-8",
          timeout: 5000,
        }
      );

      if (!result || result.trim() === "") {
        return [];
      }

      const lines = result.trim().split("\n");

      const messages: Array<{
        ROWID: number;
        text: string;
        date: number;
        sender: string | null;
      }> = [];

      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 5) {
          messages.push({
            ROWID: parseInt(parts[0], 10),
            text: parts[1],
            date: parseFloat(parts[2]),
            sender: parts[4] || null,
          });
        }
      }

      for (const msg of messages) {
        if (!msg.text) continue;

        const otpMatch = extractOTP(msg.text);
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
    } catch {
      // Database access might fail due to permissions
      // This is expected on first run before Full Disk Access is granted
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
