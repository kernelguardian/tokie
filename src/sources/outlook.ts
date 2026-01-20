import { OAuth, getPreferenceValues } from "@raycast/api";
import { DataSource, OTPEntry } from "../types";
import { extractOTP } from "../otp-detector";

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "offline_access",
].join(" ");

let oauthClient: OAuth.PKCEClient | null = null;

function getOAuthClient(): OAuth.PKCEClient {
  if (!oauthClient) {
    oauthClient = new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Microsoft",
      providerIcon: "outlook-icon.png",
      description: "Connect your Microsoft account to retrieve OTPs",
    });
  }
  return oauthClient;
}

async function getAccessToken(): Promise<string | null> {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.outlookClientId) {
    return null;
  }

  const client = getOAuthClient();
  const tokenSet = await client.getTokens();

  if (tokenSet?.accessToken) {
    if (tokenSet.isExpired()) {
      const newTokens = await refreshTokens(tokenSet.refreshToken!, prefs.outlookClientId, prefs.outlookClientSecret);
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
      scope: OUTLOOK_SCOPES,
    };

    if (clientSecret) {
      params.client_secret = clientSecret;
    }

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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

export async function authorizeOutlook(): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.outlookClientId) {
    throw new Error("Outlook Client ID not configured");
  }

  const client = getOAuthClient();
  const authRequest = await client.authorizationRequest({
    endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    clientId: prefs.outlookClientId,
    scope: OUTLOOK_SCOPES,
    extraParameters: {
      response_mode: "query",
    },
  });

  const { authorizationCode } = await client.authorize(authRequest);

  const tokenParams: Record<string, string> = {
    client_id: prefs.outlookClientId,
    code: authorizationCode,
    code_verifier: authRequest.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: authRequest.redirectURI,
    scope: OUTLOOK_SCOPES,
  };

  if (prefs.outlookClientSecret) {
    tokenParams.client_secret = prefs.outlookClientSecret;
  }

  const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
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

export async function isOutlookAuthorized(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

interface GraphMessage {
  id: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  body: {
    contentType: string;
    content: string;
  };
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

export const outlookSource: DataSource = {
  name: "outlook",

  isEnabled(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return prefs.enableOutlook;
  },

  isConfigured(): boolean {
    const prefs = getPreferenceValues<Preferences>();
    return !!prefs.outlookClientId;
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
      const sinceDate = new Date(Date.now() - lookbackMinutes * 60 * 1000);
      const isoDate = sinceDate.toISOString();

      const filter = encodeURIComponent(`receivedDateTime ge ${isoDate}`);
      const select = "id,receivedDateTime,subject,bodyPreview,from,body";

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$select=${select}&$top=50&$orderby=receivedDateTime desc`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch Outlook messages:", response.status);
        return [];
      }

      const data = (await response.json()) as GraphMessagesResponse;

      for (const msg of data.value) {
        let bodyText = msg.bodyPreview;
        if (msg.body.contentType === "html") {
          bodyText = msg.body.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        } else if (msg.body.content) {
          bodyText = msg.body.content;
        }

        const textToCheck = `${msg.subject} ${bodyText}`;
        const otpMatch = extractOTP(textToCheck);

        if (otpMatch) {
          entries.push({
            id: `outlook-${msg.id}`,
            code: otpMatch.code,
            source: "outlook",
            sender: msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || "Unknown",
            subject: msg.subject,
            timestamp: new Date(msg.receivedDateTime),
            rawMessage: msg.bodyPreview?.slice(0, 200) || "",
            messageId: msg.id,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch Outlook messages:", error);
    }

    return entries;
  },

  async markAsRead(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    await fetch(`https://graph.microsoft.com/v1.0/me/messages/${entry.messageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isRead: true }),
    });
  },

  async deleteMessage(entry: OTPEntry): Promise<void> {
    if (!entry.messageId) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    await fetch(`https://graph.microsoft.com/v1.0/me/messages/${entry.messageId}/move`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destinationId: "deleteditems" }),
    });
  },
};
