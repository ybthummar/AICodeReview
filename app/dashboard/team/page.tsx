"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GitBranch,
  Loader2,
  LogOut,
  Plus,
  Share2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth-client";
import type { ActionResult } from "@/lib/action-result";
import {
  addWorkspaceMember,
  createWorkspace,
  deleteWorkspace,
  getTeamOverview,
  removeWorkspaceMember,
  shareRepositoryWithWorkspace,
  unshareRepository,
  updateWorkspaceMemberRole,
  type TeamOverview,
  type WorkspaceView,
} from "@/module/team/actions";
import {
  hasRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type WorkspaceRole,
} from "@/module/team/lib/roles";

type AssignableRole = Exclude<WorkspaceRole, "OWNER">;
const ASSIGNABLE_ROLES: AssignableRole[] = ["ADMIN", "MEMBER", "VIEWER"];

const ROLE_BADGE: Record<WorkspaceRole, string> = {
  OWNER: "bg-purple-50 text-purple-700 border-purple-300",
  ADMIN: "bg-blue-50 text-blue-700 border-blue-300",
  MEMBER: "bg-emerald-50 text-emerald-700 border-emerald-300",
  VIEWER: "bg-slate-50 text-slate-600 border-slate-300",
};

function WorkspaceCard({
  workspace,
  shareable,
  currentUserId,
  onChanged,
}: {
  workspace: WorkspaceView;
  shareable: TeamOverview["shareableRepositories"];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AssignableRole>("MEMBER");
  const [repositoryToShare, setRepositoryToShare] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = hasRole(workspace.myRole, "ADMIN");
  const isOwner = workspace.myRole === "OWNER";
  const canShare = hasRole(workspace.myRole, "MEMBER");
  const available = shareable.filter((r) => !r.workspaceId);

  const perform = async (key: string, action: () => Promise<ActionResult<unknown>>, success: string) => {
    setBusy(key);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        onChanged();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const myMembership = workspace.members.find((m) => m.userId === currentUserId);

  return (
    <Card className="border-slate-200/80 bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-blue-600" />
            {workspace.name}
            <Badge variant="outline" className={`font-semibold ${ROLE_BADGE[workspace.myRole]}`}>
              {ROLE_LABELS[workspace.myRole]}
            </Badge>
          </CardTitle>
          <CardDescription className="mt-1">
            {workspace.members.length} member{workspace.members.length === 1 ? "" : "s"}
            {workspace.memberLimit ? ` of ${workspace.memberLimit} (Free plan)` : ""} · {workspace.repositories.length} shared repositor
            {workspace.repositories.length === 1 ? "y" : "ies"}
          </CardDescription>
        </div>

        {isOwner ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete workspace
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Members lose access to the shared repositories immediately. The repositories and their reviews are not deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => perform("delete", () => deleteWorkspace(workspace.id), "Workspace deleted")}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          myMembership && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "leave"}
              onClick={() =>
                perform("leave", () => removeWorkspaceMember(workspace.id, myMembership.id), "You left the workspace")
              }
              className="gap-1.5"
            >
              <LogOut className="h-4 w-4" /> Leave
            </Button>
          )
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Members</h3>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {workspace.members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const editable = isAdmin && member.role !== "OWNER" && !isSelf && (member.role !== "ADMIN" || isOwner);

              return (
                <li key={member.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.image || undefined} />
                    <AvatarFallback className="bg-blue-100 text-xs font-bold text-blue-700">
                      {member.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {member.name}
                      {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                  </div>

                  {editable ? (
                    <select
                      value={member.role}
                      disabled={busy === member.id}
                      onChange={(e) =>
                        perform(
                          member.id,
                          () => updateWorkspaceMemberRole(workspace.id, member.id, e.target.value as AssignableRole),
                          "Role updated"
                        )
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" || isOwner).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline" className={`font-semibold ${ROLE_BADGE[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  )}

                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy === member.id}
                      onClick={() =>
                        perform(member.id, () => removeWorkspaceMember(workspace.id, member.id), "Member removed")
                      }
                      className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await perform("add", () => addWorkspaceMember(workspace.id, email, newRole), "Member added");
                setEmail("");
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="flex-1"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AssignableRole)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                title={ROLE_DESCRIPTIONS[newRole]}
              >
                {ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" || isOwner).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy === "add"} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add
              </Button>
            </form>
          )}
          {isAdmin && (
            <p className="text-xs text-slate-500">
              Teammates must have signed in to RepoPilot with GitHub at least once. {ROLE_DESCRIPTIONS[newRole]}.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Shared repositories</h3>

          {workspace.repositories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
              Nothing shared yet. Shared repositories appear in every member&apos;s reviews, chat and toolkit.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {workspace.repositories.map((repository) => {
                const canUnshare = repository.ownerId === currentUserId || isAdmin;
                return (
                  <li key={repository.id} className="flex items-center gap-3 px-3 py-2.5">
                    <GitBranch className="h-4 w-4 text-slate-400" />
                    <span className="flex-1 truncate font-mono text-sm text-slate-800">{repository.fullName}</span>
                    {canUnshare && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === repository.id}
                        onClick={() => perform(repository.id, () => unshareRepository(repository.id), "Repository unshared")}
                        className="h-8 text-xs text-slate-600"
                      >
                        Unshare
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canShare && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={repositoryToShare}
                onChange={(e) => setRepositoryToShare(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">
                  {available.length ? "Choose one of your repositories" : "No unshared repositories available"}
                </option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={!repositoryToShare || busy === "share"}
                onClick={async () => {
                  await perform(
                    "share",
                    () => shareRepositoryWithWorkspace(workspace.id, repositoryToShare),
                    "Repository shared with the team"
                  );
                  setRepositoryToShare("");
                }}
                className="gap-1.5"
              >
                {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Share
              </Button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team-overview"],
    queryFn: async () => await getTeamOverview(),
    refetchOnWindowFocus: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["team-overview"] });
    queryClient.invalidateQueries({ queryKey: ["accessible-repositories"] });
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
    queryClient.invalidateQueries({ queryKey: ["connected-repos-prs"] });
    queryClient.invalidateQueries({ queryKey: ["review-insights-overview"] });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await createWorkspace(name);
      if (result.ok) {
        toast.success("Workspace created");
        setName("");
        refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not create the workspace.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-6 px-2 py-4 sm:px-6 lg:px-8">
      <div className="border-b border-slate-200/70 pb-4">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
          <Users className="h-7 w-7 text-blue-600" /> Team workspaces
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Share repositories with teammates so everyone sees the same reviews, findings and Code Health. Reviews are billed to whoever connected the repository.
        </p>
      </div>

      <Card className="border-slate-200/80 bg-white shadow-sm">
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New workspace name, for example Backend team"
              minLength={2}
              maxLength={60}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={creating} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create workspace
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Loading workspaces...
        </div>
      ) : data && data.workspaces.length > 0 ? (
        <div className="space-y-5">
          {data.workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              shareable={data.shareableRepositories}
              currentUserId={session?.user.id ?? ""}
              onChanged={refresh}
            />
          ))}
        </div>
      ) : (
        <Card className="border-2 border-dashed border-slate-200 bg-white/70 p-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-900">No workspaces yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create a workspace above, invite teammates by email and share the repositories you want them to see.
          </p>
        </Card>
      )}
    </div>
  );
}
