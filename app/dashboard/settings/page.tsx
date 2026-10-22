"use client";

import ProfilePage from "@/module/settings/components/profile-form";
import RepositoryList from "@/module/settings/components/repositories-list";

function SettingsPage() {
  return (
    <div className="min-h-screen px-2 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto space-y-6">
      <div className="pb-3 border-b border-slate-200/70">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 pb-0.5">
          Account Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your personal developer profile, linked GitHub access, and connected code repositories.
        </p>
      </div>

      <div className="space-y-6">
        <ProfilePage />
        <RepositoryList />
      </div>
    </div>
  );
}

export default SettingsPage;
