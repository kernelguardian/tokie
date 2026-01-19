import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  openExtensionPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { OTPEntry, OTPSource, Preferences } from "./types";
import {
  imessageSource,
  gmailSource,
  icloudSource,
  authorizeGmail,
  isGmailAuthorized,
  checkMessagesAccess,
} from "./sources";

const SOURCE_ICONS: Record<OTPSource, Icon> = {
  imessage: Icon.Message,
  gmail: Icon.Envelope,
  icloud: Icon.Cloud,
};

const SOURCE_COLORS: Record<OTPSource, Color> = {
  imessage: Color.Green,
  gmail: Color.Red,
  icloud: Color.Blue,
};

const SOURCE_LABELS: Record<OTPSource, string> = {
  imessage: "iMessage",
  gmail: "Gmail",
  icloud: "iCloud",
};

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  return date.toLocaleDateString();
}

function formatSender(sender: string): string {
  const match = sender.match(/^([^<]+)</);
  if (match) {
    return match[1].trim();
  }
  if (sender.length > 30) {
    return sender.slice(0, 27) + "...";
  }
  return sender;
}

export default function ListOTPs() {
  const [otps, setOTPs] = useState<OTPEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const prefs = getPreferenceValues<Preferences>();
  const lookbackMinutes = parseInt(prefs.lookbackMinutes, 10) || 10;

  const loadOTPs = useCallback(async () => {
    setIsLoading(true);

    const allOTPs: OTPEntry[] = [];
    const sources = [imessageSource, gmailSource, icloudSource];

    if (prefs.enableGmail && prefs.gmailClientId) {
      const authorized = await isGmailAuthorized();
      setGmailAuthorized(authorized);
    }

    const results = await Promise.allSettled(
      sources.map((source) => source.fetchOTPs(lookbackMinutes))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allOTPs.push(...result.value);
      }
    }

    allOTPs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    setOTPs(allOTPs);
    setIsLoading(false);
  }, [lookbackMinutes, prefs.enableGmail, prefs.gmailClientId]);

  useEffect(() => {
    loadOTPs();
  }, [loadOTPs]);

  const handleCopy = useCallback(
    async (entry: OTPEntry) => {
      await Clipboard.copy(entry.code, { concealed: true });
      await showHUD(`Copied ${entry.code}`);

      if (entry.source === "gmail" || entry.source === "icloud") {
        const source = entry.source === "gmail" ? gmailSource : icloudSource;

        if (prefs.markAsRead && source.markAsRead) {
          try {
            await source.markAsRead(entry);
          } catch {
            // Silently fail
          }
        }

        if (prefs.autoDelete && source.deleteMessage) {
          try {
            await source.deleteMessage(entry);
            setOTPs((current) => current.filter((o) => o.id !== entry.id));
          } catch {
            // Silently fail
          }
        }
      }
    },
    [prefs.markAsRead, prefs.autoDelete]
  );

  const handleMarkAsRead = useCallback(async (entry: OTPEntry) => {
    const source = entry.source === "gmail" ? gmailSource : icloudSource;
    if (!source.markAsRead) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Marking as read...",
    });

    try {
      await source.markAsRead(entry);
      toast.style = Toast.Style.Success;
      toast.title = "Marked as read";
    } catch {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to mark as read";
    }
  }, []);

  const handleDelete = useCallback(async (entry: OTPEntry) => {
    const source = entry.source === "gmail" ? gmailSource : icloudSource;
    if (!source.deleteMessage) return;

    const confirmed = await confirmAlert({
      title: "Delete Message",
      message: "Are you sure you want to delete this message?",
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Deleting...",
    });

    try {
      await source.deleteMessage(entry);
      setOTPs((current) => current.filter((o) => o.id !== entry.id));
      toast.style = Toast.Style.Success;
      toast.title = "Message deleted";
    } catch {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete message";
    }
  }, []);

  const handleGmailAuth = useCallback(async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Connecting to Gmail...",
    });

    try {
      await authorizeGmail();
      setGmailAuthorized(true);
      toast.style = Toast.Style.Success;
      toast.title = "Gmail connected";
      await loadOTPs();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to connect Gmail";
      toast.message = error instanceof Error ? error.message : undefined;
    }
  }, [loadOTPs]);

  const hasEnabledSource = prefs.enableIMessage || prefs.enableGmail || prefs.enableICloudMail;

  const needsGmailAuth = prefs.enableGmail && prefs.gmailClientId && !gmailAuthorized;
  const needsGmailConfig = prefs.enableGmail && !prefs.gmailClientId;
  const needsICloudConfig =
    prefs.enableICloudMail && (!prefs.icloudEmail || !prefs.icloudAppPassword);
  const needsMessagesAccess = prefs.enableIMessage && !checkMessagesAccess();

  if (!hasEnabledSource) {
    return (
      <List>
        <List.EmptyView
          title="No Sources Enabled"
          description="Enable at least one source in extension preferences"
          actions={
            <ActionPanel>
              <Action
                title="Open Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search OTPs..." isShowingDetail={showDetail}>
      {needsGmailAuth && (
        <List.Section title="Setup Required">
          <List.Item
            title="Connect Gmail"
            subtitle="Authorization required to fetch OTPs"
            icon={{ source: Icon.Envelope, tintColor: Color.Red }}
            actions={
              <ActionPanel>
                <Action title="Connect Gmail" icon={Icon.Link} onAction={handleGmailAuth} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {needsGmailConfig && (
        <List.Section title="Configuration Required">
          <List.Item
            title="Configure Gmail"
            subtitle="Add OAuth Client ID in preferences"
            icon={{ source: Icon.Envelope, tintColor: Color.Orange }}
            actions={
              <ActionPanel>
                <Action
                  title="Open Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {needsICloudConfig && (
        <List.Section title="Configuration Required">
          <List.Item
            title="Configure iCloud Mail"
            subtitle="Add email and app password in preferences"
            icon={{ source: Icon.Cloud, tintColor: Color.Orange }}
            actions={
              <ActionPanel>
                <Action
                  title="Open Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {needsMessagesAccess && (
        <List.Section title="Permission Required">
          <List.Item
            title="Grant Full Disk Access"
            subtitle="Required to read iMessage database"
            icon={{ source: Icon.Message, tintColor: Color.Orange }}
            actions={
              <ActionPanel>
                <Action.Open
                  title="Open System Settings"
                  target="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {otps.length === 0 && !isLoading && (
        <List.EmptyView
          title="No OTPs Found"
          description={`No verification codes found in the last ${lookbackMinutes} minutes`}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={loadOTPs} />
              <Action
                title="Open Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      )}

      {otps.length > 0 && (
        <List.Section title="Recent OTPs" subtitle={`${otps.length} found`}>
          {otps.map((entry) => (
            <List.Item
              key={entry.id}
              title={entry.code}
              subtitle={showDetail ? undefined : entry.subject || formatSender(entry.sender)}
              icon={{ source: SOURCE_ICONS[entry.source], tintColor: SOURCE_COLORS[entry.source] }}
              accessories={
                showDetail
                  ? undefined
                  : [
                      {
                        tag: {
                          value: SOURCE_LABELS[entry.source],
                          color: SOURCE_COLORS[entry.source],
                        },
                      },
                      {
                        text: formatTimestamp(entry.timestamp),
                        tooltip: entry.timestamp.toLocaleString(),
                      },
                    ]
              }
              detail={
                <List.Item.Detail
                  markdown={`# ${entry.code}\n\n**From:** ${entry.sender}\n\n${entry.subject ? `**Subject:** ${entry.subject}\n\n` : ""}**Time:** ${entry.timestamp.toLocaleString()}\n\n---\n\n${entry.rawMessage}`}
                />
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action
                      title="Copy Otp"
                      icon={Icon.Clipboard}
                      onAction={() => handleCopy(entry)}
                    />
                    <Action.Paste title="Paste Otp" content={entry.code} />
                  </ActionPanel.Section>

                  <ActionPanel.Section>
                    <Action
                      title={showDetail ? "Hide Message" : "Show Message"}
                      icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
                      shortcut={{ modifiers: ["cmd"], key: "o" }}
                      onAction={() => setShowDetail(!showDetail)}
                    />
                  </ActionPanel.Section>

                  {(entry.source === "gmail" || entry.source === "icloud") && (
                    <ActionPanel.Section>
                      <Action
                        title="Mark as Read"
                        icon={Icon.Eye}
                        onAction={() => handleMarkAsRead(entry)}
                      />
                      <Action
                        title="Delete Message"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => handleDelete(entry)}
                      />
                    </ActionPanel.Section>
                  )}

                  <ActionPanel.Section>
                    <Action
                      title="Refresh"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={loadOTPs}
                    />
                    <Action
                      title="Open Preferences"
                      icon={Icon.Gear}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
                      onAction={openExtensionPreferences}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
