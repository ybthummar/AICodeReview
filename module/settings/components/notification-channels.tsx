"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addNotificationChannel,
  deleteNotificationChannel,
  getNotificationChannels,
  sendTestNotification,
  updateNotificationChannel,
} from "@/module/notifications/actions";
import {
  NOTIFICATION_TRIGGERS,
  TRIGGER_LABELS,
  type NotificationKind,
  type NotificationTrigger,
} from "@/module/notifications/lib/format";

const KIND_LABELS: Record<NotificationKind, string> = {
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
};

const KIND_STYLES: Record<NotificationKind, string> = {
  slack: "bg-purple-50 text-purple-700 border-purple-200",
  discord: "bg-indigo-50 text-indigo-700 border-indigo-200",
  teams: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function NotificationChannels() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [trigger, setTrigger] = useState<NotificationTrigger>("risky");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: async () => await getNotificationChannels(),
    refetchOnWindowFocus: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notification-channels"] });

  const add = useMutation({
    mutationFn: async () => await addNotificationChannel({ name, url, trigger }),
    onSuccess: (result) => {
      if (!result.ok) return void toast.error(result.error);
      toast.success("Channel added. Send a test message to confirm it works.");
      setName("");
      setUrl("");
      refresh();
    },
    onError: () => toast.error("Could not add the channel."),
  });

  const runOnChannel = async (id: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusyId(id);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <BellRing className="h-5 w-5 text-blue-600" /> Alerts
        </CardTitle>
        <CardDescription>
          Post a message to Slack, Discord or Microsoft Teams when a review finishes. Paste an incoming-webhook URL from your workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="grid gap-2 lg:grid-cols-[1fr_2fr_1fr_auto]"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Channel name"
            maxLength={60}
            required
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            autoComplete="off"
            spellCheck={false}
            required
          />
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as NotificationTrigger)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {NOTIFICATION_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={add.isPending} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </form>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Loading channels...
          </div>
        ) : channels && channels.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {channels.map((channel) => (
              <li key={channel.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <Badge variant="outline" className={`font-semibold ${KIND_STYLES[channel.kind]}`}>
                  {KIND_LABELS[channel.kind]}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{channel.name}</p>
                  <p className="truncate font-mono text-xs text-slate-400">{channel.urlHint}</p>
                </div>

                <select
                  value={channel.trigger}
                  disabled={busyId === channel.id}
                  onChange={(e) =>
                    runOnChannel(
                      channel.id,
                      () => updateNotificationChannel(channel.id, { trigger: e.target.value as NotificationTrigger }),
                      "Trigger updated"
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {NOTIFICATION_TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </select>

                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    disabled={busyId === channel.id}
                    onChange={(e) =>
                      runOnChannel(
                        channel.id,
                        () => updateNotificationChannel(channel.id, { enabled: e.target.checked }),
                        e.target.checked ? "Channel enabled" : "Channel paused"
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  Active
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === channel.id}
                  onClick={() => runOnChannel(channel.id, () => sendTestNotification(channel.id), "Test message sent")}
                  className="h-8 gap-1.5 text-xs"
                >
                  {busyId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Test
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === channel.id}
                  onClick={() => runOnChannel(channel.id, () => deleteNotificationChannel(channel.id), "Channel removed")}
                  className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove channel"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No channels yet. Add a webhook above to get alerts where your team already works.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
