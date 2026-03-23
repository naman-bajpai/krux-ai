import { Suspense, type HTMLAttributes } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardStats } from "@/components/dashboard/stats-card";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

async function getDashboardData(userId: string, orgId?: string) {
  const projectWhere = orgId ? { orgId } : {};

  const [projectCount, objectCounts, recentProjects, recentActivity] =
    await Promise.all([
      db.project.count({ where: projectWhere }),
      db.migrationObject.groupBy({
        by: ["status"],
        where: { project: projectWhere },
        _count: { status: true },
      }),
      db.project.findMany({
        where: projectWhere,
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: {
          _count: { select: { migrationObjects: true } },
          organization: { select: { name: true } },
        },
      }),
      db.auditLog.findMany({
        where: { ...(orgId ? { project: { orgId } } : {}), userId },
        orderBy: { timestamp: "desc" },
        take: 10,
        include: {
          user: { select: { name: true, email: true, image: true } },
          project: { select: { name: true } },
        },
      }),
    ]);

  const objectStats = Object.fromEntries(
    objectCounts.map((o: any) => [o.status, o._count.status])
  ) as Record<string, number>;
  const totalObjects = Object.values(objectStats).reduce((a, b) => a + b, 0);
  const approvedObjects = objectStats["APPROVED"] ?? 0;

  return {
    projectCount,
    totalObjects,
    approvedObjects,
    convertedObjects: objectStats["CONVERTED"] ?? 0,
    pendingObjects: objectStats["PENDING"] ?? 0,
    completionRate:
      totalObjects > 0 ? Math.round((approvedObjects / totalObjects) * 100) : 0,
    recentProjects,
    recentActivity,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const data = await getDashboardData(
    session!.user.id,
    session!.user.organizationId
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()},{" "}
          <span className="text-primary">
            {session?.user.name?.split(" ")[0] ?? "there"}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your migration projects.
        </p>
      </div>

      {/* Stats grid */}
      <Suspense fallback={<StatsGridSkeleton />}>
        <DashboardStats
          projectCount={data.projectCount}
          totalObjects={data.totalObjects}
          approvedObjects={data.approvedObjects}
          convertedObjects={data.convertedObjects}
          pendingObjects={data.pendingObjects}
          completionRate={data.completionRate}
        />
      </Suspense>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent projects (takes 2/3 width) */}
        <div className="lg:col-span-2">
          <Suspense fallback={<ContentSkeleton />}>
            <RecentProjects projects={data.recentProjects} />
          </Suspense>
        </div>

        {/* Activity feed (takes 1/3 width) */}
        <div className="lg:col-span-1">
          <Suspense fallback={<ContentSkeleton />}>
            <ActivityFeed activities={data.recentActivity} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return <Skeleton className="h-64 rounded-lg" />;
}

// Skeleton component since we haven't imported it from shadcn yet
function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      {...props}
    />
  );
}
