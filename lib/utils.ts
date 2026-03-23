import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatConfidenceScore(score: number | null): string {
  if (score === null) return "—";
  return `${Math.round(score * 100)}%`;
}

export function getConfidenceColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 0.85) return "text-green-600 dark:text-green-400";
  if (score >= 0.65) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: "bg-slate-100 text-slate-700",
    CONVERTING: "bg-blue-100 text-blue-700",
    CONVERTED: "bg-purple-100 text-purple-700",
    REVIEWED: "bg-yellow-100 text-yellow-700",
    APPROVED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    DRAFT: "bg-slate-100 text-slate-700",
    ACTIVE: "bg-blue-100 text-blue-700",
    PAUSED: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-green-100 text-green-700",
    ARCHIVED: "bg-slate-100 text-slate-500",
  };
  return map[status] ?? "bg-slate-100 text-slate-700";
}
