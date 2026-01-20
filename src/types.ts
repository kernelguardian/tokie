export type OTPSource = "imessage" | "gmail" | "icloud" | "outlook";

export interface OTPEntry {
  id: string;
  code: string;
  source: OTPSource;
  sender: string;
  subject?: string;
  timestamp: Date;
  rawMessage: string;
  messageId?: string;
}

export interface DataSource {
  name: OTPSource;
  isEnabled: () => boolean;
  isConfigured: () => boolean;
  fetchOTPs: (lookbackMinutes: number) => Promise<OTPEntry[]>;
  markAsRead?: (entry: OTPEntry) => Promise<void>;
  deleteMessage?: (entry: OTPEntry) => Promise<void>;
}
