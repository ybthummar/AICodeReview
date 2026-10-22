/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";

import { useEffect, useState } from "react";
import {
  addClient,
  addRepoClient,
  getRepoClientMap,
  sendEmail,
} from "@/module/repo-client/actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Send, Users } from "lucide-react";

type Client = {
  id: string;
  name: string;
  email: string;
};

type Repo = {
  id: string;
  name: string;
  fullName: string;
  url: string;
  repositoryClients: {
    client: Client;
  }[];
};

export default function ClientsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailStatuses, setEmailStatuses] = useState<
    Record<string, "idle" | "sending" | "sent">
  >({});
  const [open, setOpen] = useState(false);

  async function loadData() {
    try {
      const data = await getRepoClientMap();
      setRepos(data || []);

      // Initialize email statuses as 'idle' for all repos
      const statuses: Record<string, "idle" | "sending" | "sent"> = {};
      data?.forEach((repo) => {
        statuses[repo.id] = "idle";
      });
      setEmailStatuses(statuses);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load repositories");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const client = await addClient(name, email);
      await addRepoClient(repoId, client.id);

      toast.success("Client mapped to repository successfully");

      setName("");
      setEmail("");
      setRepoId("");
      setOpen(false);

      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add client");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail(repoIdToSend: string) {
    setSendingEmail(repoIdToSend);

    // Set status to 'sending' (yellow)
    setEmailStatuses((prev) => ({
      ...prev,
      [repoIdToSend]: "sending",
    }));

    try {
      const result = await sendEmail(repoIdToSend);

      if (result.success) {
        // Set status to 'sent' (green)
        setEmailStatuses((prev) => ({
          ...prev,
          [repoIdToSend]: "sent",
        }));

        toast.success(
          "Email queued successfully! Clients will receive it shortly."
        );
      } else {
        // Revert to 'idle' on failure
        setEmailStatuses((prev) => ({
          ...prev,
          [repoIdToSend]: "idle",
        }));
        toast.error("Failed to send email");
      }
    } catch (error: any) {
      console.error("Can't send email:", error);
      // Revert to 'idle' on error
      setEmailStatuses((prev) => ({
        ...prev,
        [repoIdToSend]: "idle",
      }));
      toast.error(error.message || "Failed to send email");
    } finally {
      setSendingEmail(null);
    }
  }

  function getStatusColor(repoId: string): string {
    const status = emailStatuses[repoId] || "idle";
    switch (status) {
      case "sending":
        return "bg-yellow-500";
      case "sent":
        return "bg-green-500";
      default:
        return "bg-green-500";
    }
  }

  return (
    <div className="min-h-screen px-2 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-slate-200/70">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 pb-0.5">Clients & Stakeholders</h1>
              <p className="text-sm text-slate-500 mt-1">
                Map clients and stakeholders to repositories for automated weekly AI status updates.
              </p>
            </div>
          </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  size="lg"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5" />
                  Add Client
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">Add New Client</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Client Name
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter client name"
                      required
                      className="h-9 border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@gmail.com"
                      required
                      className="h-9 border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="repo" className="text-sm font-medium">
                      Repository
                    </Label>
                    <Select value={repoId} onValueChange={setRepoId}>
                      <SelectTrigger
                        id="repo"
                        className="h-9 w-full border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                      >
                        <SelectValue placeholder="Select a repository" />
                      </SelectTrigger>
                      <SelectContent>
                        {repos.map((repo) => (
                          <SelectItem
                            className="cursor-pointer"
                            key={repo.id}
                            value={repo.id}
                          >
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-9"
                  >
                    {loading ? "Adding..." : "Add Client"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 py-2">
        {repos.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No repositories found</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {repos.map((repo) => (
              <Card
                key={repo.id}
                className="border-blue-100 hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl text-slate-900">
                        {repo.fullName}
                      </CardTitle>
                    </div>
                    <Button
                      onClick={() => handleSendEmail(repo.id)}
                      disabled={
                        sendingEmail === repo.id ||
                        repo.repositoryClients.length === 0
                      }
                      size="sm"
                      variant="outline"
                      className="gap-2 border-blue-200 hover:bg-blue-50"
                    >
                      <Send className="h-4 w-4" />
                      {sendingEmail === repo.id ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {repo.repositoryClients.length === 0 ? (
                    <p className="text-slate-500 text-sm">
                      No clients mapped yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        {repo.repositoryClients.map(({ client }) => (
                          <div
                            key={client.id}
                            className="flex items-center gap-3 px-3 to-white rounded-lg transition-colors"
                          >
                            <div
                              className={`h-2 w-2 rounded-full ${getStatusColor(
                                repo.id
                              )}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 text-base">
                                {client.name} : {client.email}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
