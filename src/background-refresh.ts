import { LocalStorage, getPreferenceValues } from "@raycast/api";
import { OTPEntry } from "./types";
import {
  imessageSource,
  gmailSource,
  icloudSource,
  outlookSource,
  isGmailAuthorized,
  isOutlookAuthorized,
} from "./sources";

export const OTP_CACHE_KEY = "cached-otps";
const LAST_REFRESH_KEY = "last-background-refresh";

export async function getCachedOTPs(): Promise<OTPEntry[]> {
  const cached = await LocalStorage.getItem<string>(OTP_CACHE_KEY);
  if (!cached) return [];

  try {
    const parsed = JSON.parse(cached);
    return parsed.map((entry: OTPEntry & { timestamp: string }) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
  } catch {
    return [];
  }
}

export default async function backgroundRefresh() {
  const prefs = getPreferenceValues<Preferences>();
  const intervalMinutes = parseInt(prefs.backgroundRefreshInterval, 10);

  // Skip if disabled
  if (intervalMinutes === 0) return;

  // Check if enough time has passed since last refresh
  const lastRefresh = await LocalStorage.getItem<number>(LAST_REFRESH_KEY);
  const now = Date.now();

  if (lastRefresh) {
    const elapsed = (now - lastRefresh) / 60000; // minutes
    if (elapsed < intervalMinutes) return;
  }

  const lookbackMinutes = parseInt(prefs.lookbackMinutes, 10) || 10;

  // Skip if Gmail is enabled but not authorized
  if (prefs.enableGmail && prefs.gmailClientId) {
    const authorized = await isGmailAuthorized();
    if (!authorized) return;
  }

  // Skip if Outlook is enabled but not authorized
  if (prefs.enableOutlook && prefs.outlookClientId) {
    const authorized = await isOutlookAuthorized();
    if (!authorized) return;
  }

  const allOTPs: OTPEntry[] = [];
  const sources = [imessageSource, gmailSource, icloudSource, outlookSource];

  const results = await Promise.allSettled(sources.map((source) => source.fetchOTPs(lookbackMinutes)));

  for (const result of results) {
    if (result.status === "fulfilled") {
      allOTPs.push(...result.value);
    }
  }

  allOTPs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  await LocalStorage.setItem(OTP_CACHE_KEY, JSON.stringify(allOTPs));
  await LocalStorage.setItem(LAST_REFRESH_KEY, now);
}
