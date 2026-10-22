"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Github,
  CreditCard,
  Settings,
  LogOut,
  LayoutDashboard,
  Users,
  ChevronDown,
  MessageSquareText,
  Crown,
  Rat,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import LogoutButton from "@/module/auth/components/logout";
import { useEffect } from "react";
import { getDashboardStats } from "@/module/dashboard/actions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck } from "lucide-react";
import { isAdminUser } from "@/lib/admin";

const baseNavigationItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Repositories", href: "/dashboard/repositories", icon: Github },
  { title: "Reviews", href: "/dashboard/reviews", icon: MessageSquareText },
  {
    title: "Subscriptions",
    href: "/dashboard/subscriptions",
    icon: CreditCard,
  },
  { title: "Clients", href: "/dashboard/clients", icon: Users },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [proUser, setProUser] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const getSubscriptionTier = async () => {
      const subscriptionTier = await getDashboardStats();

      if (
        subscriptionTier?.subscriptionType?.subscriptionTier === "PRO" &&
        subscriptionTier?.subscriptionType?.subscriptionStatus === "ACTIVE"
      ) {
        setProUser(true);
      }
    };

    getSubscriptionTier();
  }, []);

  const isActive = (url: string) => {
    return (
      pathname === url || (pathname?.startsWith(url) && url !== "/dashboard")
    );
  };

  if (!session) {
    return null;
  }

  const user = session.user;
  const isAdmin = isAdminUser(user);
  const navigationList = [
    ...baseNavigationItems,
    ...(isAdmin
      ? [
          {
            title: "Admin Panel",
            href: "/dashboard/admin",
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const userData = {
    name: user?.name || "User",
    email: user?.email || "",
    avatar: user?.image || "",
    userIntials:
      user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "U",
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={`${
          isCollapsed ? "w-20" : "w-64"
        } sticky top-0 h-screen shrink-0 z-30 bg-white shadow-md flex flex-col border-r transition-all duration-300`}
      >
        {/* Header with Logo */}
        <div className={`px-6 pt-6 pb-5 ${isCollapsed && "px-3"}`}>
          <Link
            href="/"
            className="flex justify-center space-x-2 text-3xl font-semibold"
          >
            <div
              className={`flex items-center ${
                isCollapsed ? "justify-center" : "justify-center gap-x-3"
              }`}
            >
              <Rat className="h-14 w-14 text-blue-600" />
              {!isCollapsed && (
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight mt-2">
                  RepoPilot
                </h1>
              )}
            </div>
          </Link>
        </div>
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-24 p-1.5 rounded-full bg-white shadow-md border text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer z-10"
        >
          <ChevronLeft
            className={`h-4 w-4 transition-transform duration-300 ${
              isCollapsed ? "rotate-180" : ""
            }`}
          />
        </button>

        <Separator className="my-2" />

        {/* Navigation Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navigationList.map((item) => {
            const active = isActive(item.href);
            const menuItem = (
              <div
                key={item.href}
                className={`
                  group flex items-center ${
                    isCollapsed ? "justify-center px-2" : "px-4"
                  } py-2.5 rounded-lg transition-all duration-200 text-sm font-medium cursor-pointer
                  ${
                    active
                      ? "bg-[#2563EB] text-white shadow-md hover:bg-[#012bff]"
                      : "text-gray-700 group hover:bg-[#e8e8e8]"
                  }
                `}
              >
                <item.icon
                  className={`w-5 h-5 ${!isCollapsed && "mr-3"} ${
                    active
                      ? "text-white"
                      : "text-gray-500 group-hover:text-black"
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.title}</span>}
              </div>
            );

            // Wrap with Tooltip when collapsed
            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href}>{menuItem}</Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    <p>{item.title}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link key={item.href} href={item.href}>
                {menuItem}
              </Link>
            );
          })}
        </nav>
        {/* Footer */}
        <div className={`p-5 ${isCollapsed && "p-3"}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="w-full flex items-center justify-center rounded-xl text-left
                      text-black transition-colors duration-200 cursor-pointer hover:bg-[#e8e8e8] hover:text-black p-2"
                    >
                      <Avatar className="h-9 w-9 border-black">
                        <AvatarImage
                          src={userData.avatar}
                          alt={userData.name}
                        />
                        <AvatarFallback className="text-sm font-semibold">
                          {userData.userIntials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </TooltipTrigger>
                </Tooltip>
              ) : (
                <button
                  className="w-full flex items-center justify-between rounded-xl text-left px-3 py-2
                  text-black transition-colors duration-200 cursor-pointer hover:bg-[#e8e8e8] hover:text-black"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <Avatar className="h-9 w-9 border-black">
                      <AvatarImage src={userData.avatar} alt={userData.name} />
                      <AvatarFallback className="text-sm font-semibold">
                        {userData.userIntials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="truncate">
                      <div className="flex items-center">
                        <p className="text-sm font-semibold truncate">
                          {userData.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
                </button>
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-64 bg-white shadow-2xl rounded-lg p-1 border border-gray-100"
              align={isCollapsed ? "start" : "end"}
              side={isCollapsed ? "right" : "bottom"}
            >
              <div className="px-3 py-2 text-sm text-gray-700 font-medium border-b border-gray-100 mb-1">
                <div className="flex gap-x-2 justify-between">
                  <p className="truncate">{userData.name}</p>
                  <div>{proUser && <Crown className="text-yellow-600" />}</div>
                </div>
                <p className="text-xs text-gray-500 font-normal truncate">
                  {userData.email}
                </p>
              </div>

              <Link href="/dashboard/settings" passHref>
                <DropdownMenuItem className="cursor-pointer text-gray-700 hover:bg-blue-50 p-2 rounded-md">
                  <Settings className="h-4 w-4 mr-2" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
              </Link>

              <LogoutButton>
                <DropdownMenuItem className="cursor-pointer text-red-600 hover:bg-red-50 p-2 rounded-md">
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </LogoutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default AppSidebar;
