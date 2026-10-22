import React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/app-sidebar";
import { requireAuth } from "@/module/utils/auth-utils";

interface DashboadLayoutProps {
  children: React.ReactNode;
}

async function DashboadLayout({ children }: DashboadLayoutProps) {
  await requireAuth();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-screen bg-slate-50/50">
        <div className="flex-1 w-full">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default DashboadLayout;
