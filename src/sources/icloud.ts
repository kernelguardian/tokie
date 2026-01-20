import { getPreferenceValues } from "@raycast/api";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { DataSource, OTPEntry } from "../types";
import { extractOTP } from "../otp-detector";

const ICLOUD_IMAP_HOST = "imap.mail.me.com";
const ICLOUD_IMAP_PORT = 993;

async function getImapClient(): Promise<ImapFlow | null> {
  const prefs = getPreferenceValues<Preferences>();

  if (!prefs.icloudEmail || !prefs.icloudAppPassword) {
    return null;
  }

  const client = new ImapFlow({
    host: ICLOUD_IMAP_HOST,
    port: ICLOUD_IMAP_PORT,
    secure: true,
    auth: {
      user: prefs.icloudEmail,
      pass: prefs.icloudAppPassword,
    },
    logger: false,
  });

  try {
    console.log("[DEBUG] iCloud: Connecting to IMAP with email:", prefs.icloudEmail);
    console.log("[DEBUG] iCloud: Password length:", prefs.icloudAppPassword?.length || 0);
    await client.connect();
    console.log("[DEBUG] iCloud: Connected successfully");
    return client;
  } catch (error) {
    console.error("[DEBUG] iCloud: Failed to connect to IMAP:", error);
    return null;
  }
}

export const icloudSource: DataSource = {
  name: "icloud",

  isEnabled(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return prefs.enableICloudMail;
  },

  isConfigured(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return !!prefs.icloudEmail && !!prefs.icloudAppPassword;
  },

  async fetchOTPs(lookbackMinutes: number): Promise<OTPEntry[]> {
    console.log("[DEBUG] iCloud fetchOTPs called, enabled:", this.isEnabled(), "configured:", this.isConfigured());

    if (!this.isEnabled() || !this.isConfigured()) {
      return [];
    }

    const entries: OTPEntry[] = [];
    const client = await getImapClient();

    if (!client) {
      console.log("[DEBUG] iCloud: Failed to get IMAP client");
      return [];
    }

    try {
      console.log("[DEBUG] iCloud: Opening INBOX...");
      await client.mailboxOpen("INBOX");

      const sinceDate = new Date(Date.now() - lookbackMinutes * 60 * 1000);
      console.log("[DEBUG] iCloud: Searching for messages since:", sinceDate.toISOString());

      const searchResult = await client.search({
        since: sinceDate,
      });

      // Handle case where search returns false (no results)
      const messages = searchResult === false ? [] : searchResult;
      console.log("[DEBUG] iCloud: Found", messages.length, "messages");

      if (messages.length === 0) {
        await client.logout();
        return [];
      }

      const uidsToFetch = messages.slice(-50);

      for await (const msg of client.fetch(uidsToFetch, {
        envelope: true,
        source: true,
        uid: true,
      })) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const textContent = parsed.text || "";
          const htmlContent = parsed.html ? parsed.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") : "";

          console.log("[DEBUG] iCloud: Checking email - Subject:", parsed.subject);
          const textToCheck = `${parsed.subject || ""} ${textContent} ${htmlContent}`;
          const otpMatch = extractOTP(textToCheck);
          console.log("[DEBUG] iCloud: OTP match result:", otpMatch);

          if (otpMatch) {
            const sender = parsed.from?.value?.[0]?.address || parsed.from?.value?.[0]?.name || "Unknown";

            entries.push({
              id: `icloud-${msg.uid}`,
              code: otpMatch.code,
              source: "icloud",
              sender,
              subject: parsed.subject,
              timestamp: parsed.date || new Date(),
              rawMessage: textContent.slice(0, 200),
              messageId: String(msg.uid),
            });
          }
        } catch (parseError) {
          console.error("Failed to parse email:", parseError);
        }
      }

      await client.logout();
    } catch (error) {
      console.error("Failed to fetch iCloud messages:", error);
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }

    return entries;
  },

  async markAsRead(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const client = await getImapClient();
    if (!client) return;

    try {
      await client.mailboxOpen("INBOX");
      await client.messageFlagsAdd(entry.messageId, ["\\Seen"]);
      await client.logout();
    } catch (error) {
      console.error("Failed to mark iCloud message as read:", error);
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }
  },

  async deleteMessage(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const client = await getImapClient();
    if (!client) return;

    try {
      await client.mailboxOpen("INBOX");
      await client.messageFlagsAdd(entry.messageId, ["\\Deleted"]);
      await client.messageDelete(entry.messageId);
      await client.logout();
    } catch (error) {
      console.error("Failed to delete iCloud message:", error);
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }
  },
};

export async function testICloudConnection(): Promise<boolean> {
  const client = await getImapClient();
  if (!client) {
    return false;
  }

  try {
    await client.logout();
    return true;
  } catch {
    return false;
  }
}
