"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  ChevronsUpDown,
  ClipboardList,
  CreditCard,
  Crown,
  Github,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Rat,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth-client";
import { getSubscriptionStatus } from "@/module/dashboard/actions";

const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Repositories", href: "/dashboard/repositories", icon: Github },
      { title: "Reviews", href: "/dashboard/reviews", icon: MessageSquareText },
      { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { title: "Ask Codebase", href: "/dashboard/chat", icon: Bot },
      { title: "AI Toolkit", href: "/dashboard/toolkit", icon: Wrench },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Team", href: "/dashboard/team", icon: UsersRound },
      { title: "Audit & Reports", href: "/dashboard/audit", icon: ClipboardList },
      { title: "Subscriptions", href: "/dashboard/subscriptions", icon: CreditCard },
      { title: "Clients", href: "/dashboard/clients", icon: Users },
      { title: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

const adminItem = { title: "Admin Panel", href: "/dashboard/admin", icon: ShieldCheck };

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

export function DashboardHeader() {
  const pathname = usePathname();
  const { isMobile, open, openMobile } = useSidebar();
  const page = [...navigationGroups.flatMap((group) => group.items), adminItem]
    .find((item) => isActivePath(pathname, item.href));

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-5">
      <SidebarTrigger
        aria-label="Toggle navigation"
        aria-expanded={isMobile ? openMobile : open}
        className="size-10 rounded-lg text-slate-600"
      />
      <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
      <span className="truncate text-sm font-semibold text-slate-800">{page?.title ?? "Dashboard"}</span>
    </header>
  );
}

export default function AppSidebar({
  user,
  isAdmin,
}: {
  user: { name: string; email: string; image?: string | null };
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: subscription } = useQuery({
    queryKey: ["sidebar-subscription"],
    queryFn: () => getSubscriptionStatus(),
    staleTime: 60_000,
  });

  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";

  async function logout() {
    try {
      const result = await signOut();
      if (result.error) throw new Error(result.error.message);
      setOpenMobile(false);
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-slate-200">
      <SidebarHeader className="h-16 shrink-0 flex-row items-center justify-between border-b border-slate-200 px-3 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          onClick={() => setOpenMobile(false)}
          aria-label="RepoPilot dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Rat className="size-5" aria-hidden="true" />
          </span>
          <span className="truncate text-lg font-bold tracking-tight text-slate-900 group-data-[collapsible=icon]:hidden">RepoPilot</span>
        </Link>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={() => setOpenMobile(false)} aria-label="Close navigation">
            <X className="size-5" />
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 py-2 group-data-[collapsible=icon]:overflow-y-auto">
        <nav aria-label="Dashboard navigation">
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label} className="px-2.5 group-data-[collapsible=icon]:px-2">
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500">{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {(isAdmin && group.label === "Manage" ? [...group.items, adminItem] : group.items).map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={active}
                        className="h-10 gap-3 rounded-lg px-2.5 text-slate-600 data-[active=true]:bg-blue-100/80 data-[active=true]:font-semibold data-[active=true]:text-blue-800"
                      >
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                          aria-label={item.title}
                          aria-current={active ? "page" : undefined}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="shrink-0 border-t border-slate-200 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label="Account menu" className="gap-2.5 rounded-lg">
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={user.image ?? undefined} alt="" />
                <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-800">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name || "Account"}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <ChevronsUpDown className="text-slate-400 group-data-[collapsible=icon]:hidden" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={8} className="w-60">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b px-2.5 py-2 text-sm font-semibold">
              <span className="truncate">{user.name || "Account"}</span>
              {subscription?.isPro && <Crown className="size-4 shrink-0 text-amber-600" aria-label="Pro" />}
            </div>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" onClick={() => setOpenMobile(false)}>
                <Settings aria-hidden="true" /> Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void logout()} variant="destructive">
              <LogOut aria-hidden="true" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
