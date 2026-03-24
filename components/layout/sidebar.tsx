"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  GitMerge,
  ClipboardCheck,
  Users,
  Settings,
  Zap,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    title: "Migration",
    href: "/migration",
    icon: GitMerge,
  },
  {
    title: "Review Queue",
    href: "/review",
    icon: ClipboardCheck,
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
];

const bottomNavItems = [
  {
    title: "Team",
    href: "/team",
    icon: Users,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "abstract-sidebar relative flex h-full flex-col transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b border-[hsl(var(--sidebar-border)/0.6)] px-4">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent shadow-[0_12px_30px_-18px_rgba(0,0,0,0.6)]">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm truncate text-sidebar-foreground">
                Krux 
              </span>
            )}
          </Link>
        </div>

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="abstract-panel absolute -right-3 top-16 z-10 h-7 w-7 rounded-full text-foreground shadow-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>

        {/* Main navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="flex flex-col gap-1 px-2">
            {!collapsed && (
              <p className="px-2 mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Main
              </p>
            )}
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-9 w-9 mx-auto items-center justify-center rounded-xl transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_16px_32px_-24px_rgba(148,209,215,0.7)]"
                          : "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-accent)/0.82)] hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[0_18px_36px_-28px_rgba(148,209,215,0.75)]"
                      : "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-accent)/0.82)] hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Bottom navigation */}
        <div className="border-t border-[hsl(var(--sidebar-border)/0.6)] px-2 py-4">
          {!collapsed && (
            <p className="px-2 mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Account
            </p>
          )}
          <nav className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname === item.href;

              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-9 w-9 mx-auto items-center justify-center rounded-xl transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_16px_32px_-24px_rgba(148,209,215,0.7)]"
                          : "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-accent)/0.82)] hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[0_18px_36px_-28px_rgba(148,209,215,0.75)]"
                      : "text-sidebar-foreground hover:bg-[hsl(var(--sidebar-accent)/0.82)] hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </TooltipProvider>
  );
}
