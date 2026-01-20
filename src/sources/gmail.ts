import { OAuth, getPreferenceValues } from "@raycast/api";
import { DataSource, OTPEntry, Preferences } from "../types";
import { extractOTP } from "../otp-detector";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

let oauthClient: OAuth.PKCEClient | null = null;

function getOAuthClient(): OAuth.PKCEClient {
  if (!oauthClient) {
    oauthClient = new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Google",
      providerIcon: "gmail-icon.png",
      description: "Connect your Gmail account to retrieve OTPs",
    });
  }
  return oauthClient;
}

async function getAccessToken(): Promise<string | null> {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.gmailClientId) {
    return null;
  }

  const client = getOAuthClient();
  const tokenSet = await client.getTokens();

  if (tokenSet?.accessToken) {
    if (tokenSet.isExpired()) {
      // Refresh the token
      const newTokens = await refreshTokens(
        tokenSet.refreshToken!,
        prefs.gmailClientId,
        prefs.gmailClientSecret
      );
      if (newTokens) {
        await client.setTokens(newTokens);
        return newTokens.access_token;
      }
      return null;
    }
    return tokenSet.accessToken;
  }

  return null;
}

async function refreshTokens(
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuth.TokenResponse | null> {
  try {
    const params: Record<string, string> = {
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    if (clientSecret) {
      params.client_secret = clientSecret;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
    };
  } catch {
    return null;
  }
}

export async function authorizeGmail(): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.gmailClientId) {
    throw new Error("Gmail Client ID not configured");
  }

  const client = getOAuthClient();
  const authRequest = await client.authorizationRequest({
    endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: prefs.gmailClientId,
    scope: GMAIL_SCOPES,
    extraParameters: {
      access_type: "offline",
      prompt: "consent",
    },
  });

  console.log("[DEBUG] Gmail OAuth redirect URI:", authRequest.redirectURI);

  const { authorizationCode } = await client.authorize(authRequest);

  const tokenParams: Record<string, string> = {
    client_id: prefs.gmailClientId,
    code: authorizationCode,
    code_verifier: authRequest.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: authRequest.redirectURI,
  };

  if (prefs.gmailClientSecret) {
    tokenParams.client_secret = prefs.gmailClientSecret;
  }

  const tokenBody = new URLSearchParams(tokenParams);

  console.log("[DEBUG] Token exchange request - redirect_uri:", authRequest.redirectURI);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("[DEBUG] Token exchange failed:", tokenResponse.status, errorText);
    throw new Error(`Failed to exchange authorization code: ${errorText}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
  };

  await client.setTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
}

export async function isGmailAuthorized(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
      parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    }>;
  };
  snippet: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractMessageBody(payload: GmailMessage["payload"]): string {
  // Try to get plain text body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Look through parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Handle nested multipart
      if (part.parts) {
        for (const subpart of part.parts) {
          if (subpart.mimeType === "text/plain" && subpart.body?.data) {
            return decodeBase64Url(subpart.body.data);
          }
        }
      }
    }
    // Fall back to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        // Strip HTML tags for OTP extraction
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      }
    }
  }

  return "";
}

export const gmailSource: DataSource = {
  name: "gmail",

  isEnabled(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return prefs.enableGmail;
  },

  isConfigured(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return !!prefs.gmailClientId;
  },

  async fetchOTPs(lookbackMinutes: number): Promise<OTPEntry[]> {
    if (!this.isEnabled() || !this.isConfigured()) {
      return [];
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return [];
    }

    const entries: OTPEntry[] = [];

    try {
      // Calculate the "after" timestamp for Gmail query
      const afterDate = new Date(Date.now() - lookbackMinutes * 60 * 1000);
      const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

      // Search for recent messages that might contain OTPs
      const query = encodeURIComponent(`after:${afterTimestamp} in:inbox`);
      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        console.error("Failed to list Gmail messages");
        return [];
      }

      const listData = (await listResponse.json()) as GmailListResponse;
      if (!listData.messages) {
        return [];
      }

      // Fetch message details in parallel (limited batch)
      const messagePromises = listData.messages.slice(0, 20).map(async (msg) => {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!msgResponse.ok) return null;
        return (await msgResponse.json()) as GmailMessage;
      });

      const messages = (await Promise.all(messagePromises)).filter(
        (m): m is GmailMessage => m !== null
      );

      for (const msg of messages) {
        const body = extractMessageBody(msg.payload);
        const textToCheck = `${msg.snippet} ${body}`;
        const otpMatch = extractOTP(textToCheck);

        if (otpMatch) {
          const fromHeader = msg.payload.headers.find((h) => h.name.toLowerCase() === "from");
          const subjectHeader = msg.payload.headers.find((h) => h.name.toLowerCase() === "subject");

          entries.push({
            id: `gmail-${msg.id}`,
            code: otpMatch.code,
            source: "gmail",
            sender: fromHeader?.value || "Unknown",
            subject: subjectHeader?.value,
            timestamp: new Date(parseInt(msg.internalDate, 10)),
            rawMessage: msg.snippet,
            messageId: msg.id,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch Gmail messages:", error);
    }

    return entries;
  },

  async markAsRead(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.messageId}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          removeLabelIds: ["UNREAD"],
        }),
      }
    );
  },

  async deleteMessage(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    // Move to trash instead of permanent delete for safety
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.messageId}/trash`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  },
};
