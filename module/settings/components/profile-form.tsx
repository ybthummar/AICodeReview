/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import type React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserProfile, updateUserProfile } from "../actions";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Mail, ShieldCheck, Edit3, Loader2 } from "lucide-react";
import { isAdminUser } from "@/lib/admin";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => await getUserProfile(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setEmail(profile.email || "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      return await updateUserProfile(data);
    },
    onSuccess: (result) => {
      if (result?.success) {
        toast.success("Profile updated successfully");
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        setOpen(false);
      }
    },
    onError: () => {
      toast.error("Failed to update profile");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, email });
  };

  if (isLoading) {
    return (
      <Card className="border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full bg-slate-100" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48 bg-slate-100" />
            <Skeleton className="h-4 w-64 bg-slate-100" />
          </div>
        </div>
      </Card>
    );
  }

  const isAdmin = isAdminUser(profile);

  return (
    <Card className="border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-slate-900 pb-0.5">
              Profile Information
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Your linked GitHub credentials and personal details
            </CardDescription>
          </div>
          {isAdmin && (
            <Badge className="bg-purple-100 text-purple-700 border-purple-300 font-semibold flex items-center gap-1 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-blue-100 shadow-sm">
              <AvatarImage src={profile?.image || undefined} />
              <AvatarFallback className="bg-blue-600 text-white font-bold text-lg">
                {profile?.name?.slice(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <p className="text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> {profile?.name || "Developer"}
              </p>
              <p className="text-sm text-slate-600 font-mono flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" /> {profile?.email || "No email linked"}
              </p>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Update Profile</DialogTitle>
                <DialogDescription>
                  Make changes to your public display name and contact email.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
                    Display Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-9"
                  />
                </div>
                <DialogFooter className="pt-2">
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
