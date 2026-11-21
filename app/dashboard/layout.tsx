import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar, { DashboardHeader } from "@/components/app-sidebar";
import { isAdminUser } from "@/lib/admin";
import { requireAuth } from "@/module/utils/auth-utils";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ user }, cookieStore] = await Promise.all([requireAuth(), cookies()]);

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <a href="#dashboard-content" className="sr-only z-50 rounded-md bg-white p-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <AppSidebar user={{ name: user.name, email: user.email, image: user.image }} isAdmin={isAdminUser(user)} />
      <SidebarInset className="min-w-0 bg-slate-50/80">
        <DashboardHeader />
        <div id="dashboard-content" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-14">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
