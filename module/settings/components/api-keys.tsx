"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createApiKey, listApiKeys, revokeApiKey } from "@/module/api-keys/actions";

export default function ApiKeys() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => await listApiKeys(),
    refetchOnWindowFocus: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["api-keys"] });

  const create = useMutation({
    mutationFn: async () => await createApiKey(name),
    onSuccess: (result) => {
      if (!result.ok) return void toast.error(result.error);
      setNewKey(result.data.key);
      setCopied(false);
      setName("");
      refresh();
    },
    onError: () => toast.error("Could not create the API key."),
  });

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed. Select the key and copy it manually.");
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this key? Tools using it stop working immediately.")) return;

    setRevokingId(id);
    try {
      const result = await revokeApiKey(id);
      if (result.ok) {
        toast.success("Key revoked");
        refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not revoke the key.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <KeyRound className="h-5 w-5 text-blue-600" /> API keys
        </CardTitle>
        <CardDescription>
          Use a key with the <code>repopilot</code> command line tool or the VS Code extension to review local changes
          before you push. Each review counts toward your monthly allowance.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, for example Work laptop"
            maxLength={60}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={create.isPending} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create key
          </Button>
        </form>

        {newKey && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">
              Copy your key now. It is shown only once.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800">
                {newKey}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyKey} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewKey(null)}>
                Done
              </Button>
            </div>
            <p className="text-xs text-emerald-800">
              Set it as <code>REPOPILOT_API_KEY</code> for the CLI, or paste it when the VS Code extension asks.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Loading keys...
          </div>
        ) : keys && keys.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{key.name}</p>
                  <p className="font-mono text-xs text-slate-400">{key.prefix}…</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}</p>
                  <p>
                    {key.lastUsedAt
                      ? `Used ${formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}`
                      : "Never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={revokingId === key.id}
                  onClick={() => revoke(key.id)}
                  className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Revoke key"
                >
                  {revokingId === key.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No active keys yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
