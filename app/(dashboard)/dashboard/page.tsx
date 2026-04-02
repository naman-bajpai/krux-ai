import { Suspense, type HTMLAttributes } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardStats } from "@/components/dashboard/stats-card";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MigrationPipeline } from "@/components/dashboard/migration-pipeline";
import { ROICard } from "@/components/dashboard/roi-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Upload, FileOutput, BarChart3 } from "lucide-react";
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
          migrationObjects: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      }),
      db.auditLog.findMany({
        where: { ...(orgId ? { project: { orgId } } : {}), userId },
        orderBy: { timestamp: "desc" },
        take: 8,
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

  const projects = recentProjects.map((p: any) => ({
    ...p,
    approvedCount: p.migrationObjects.length,
    migrationObjects: undefined,
  }));

  return {
    projectCount,
    totalObjects,
    approvedObjects,
    convertedObjects: objectStats["CONVERTED"] ?? 0,
    pendingObjects: objectStats["PENDING"] ?? 0,
    convertingObjects: objectStats["CONVERTING"] ?? 0,
    reviewedObjects: objectStats["REVIEWED"] ?? 0,
    failedObjects: objectStats["FAILED"] ?? 0,
    completionRate:
      totalObjects > 0 ? Math.round((approvedObjects / totalObjects) * 100) : 0,
    recentProjects: projects,
    recentActivity,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const data = await getDashboardData(
    session!.user.id,
    session!.user.organizationId
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting},{" "}
            <span className="text-primary">
              {session?.user.name?.split(" ")[0] ?? "there"}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with your migration projects.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link href="/analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link href="/migration">
              <Upload className="h-3.5 w-3.5" />
              Upload Objects
            </Link>
          </Button>
          <Button size="sm" asChild className="gap-1.5 text-xs">
            <Link href="/projects/new">
              <Plus className="h-3.5 w-3.5" />
              New Project
            </Link>
          </Button>
        </div>
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

      {/* Migration pipeline */}
      <Suspense fallback={<ContentSkeleton className="h-40" />}>
        <MigrationPipeline
          pending={data.pendingObjects}
          converting={data.convertingObjects}
          converted={data.convertedObjects}
          reviewed={data.reviewedObjects}
          approved={data.approvedObjects}
          failed={data.failedObjects}
        />
      </Suspense>

      {/* Projects + ROI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Suspense fallback={<ContentSkeleton className="h-72" />}>
            <RecentProjects projects={data.recentProjects} />
          </Suspense>
        </div>
        <div className="lg:col-span-1">
          <Suspense fallback={<ContentSkeleton className="h-72" />}>
            <ROICard
              approvedObjects={data.approvedObjects}
              totalObjects={data.totalObjects}
              completionRate={data.completionRate}
            />
          </Suspense>
        </div>
      </div>

      {/* Activity feed */}
      <Suspense fallback={<ContentSkeleton className="h-64" />}>
        <ActivityFeed activities={data.recentActivity} />
      </Suspense>
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

function ContentSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={`rounded-lg ${className ?? "h-64"}`} {...props} />;
}

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      {...props}
    />
  );
}
