import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/trpc";
import { ProjectStatus } from "@prisma/client";

export const projectRouter = createTRPCRouter({
  // List projects for user's org
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(10),
        status: z.nativeEnum(ProjectStatus).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search } = input;
      const skip = (page - 1) * limit;
      const orgId = ctx.session.user.organizationId;

      const where = {
        ...(orgId ? { orgId } : {}),
        ...(status && { status }),
        ...(search && {
          name: { contains: search, mode: "insensitive" as const },
        }),
      };

      const [projects, total] = await Promise.all([
        ctx.db.project.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            organization: { select: { name: true, plan: true } },
            _count: {
              select: { migrationObjects: true },
            },
            migrationObjects: {
              where: { status: "APPROVED" },
              select: { id: true },
            },
          },
        }),
        ctx.db.project.count({ where }),
      ]);

      const projectsWithProgress = projects.map((p) => {
        const approvedCount = p.migrationObjects.length;
        const total = p._count.migrationObjects;
        const completionRate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;
        const { migrationObjects: _, ...rest } = p;
        return { ...rest, approvedCount, completionRate };
      });

      return { projects: projectsWithProgress, total, pages: Math.ceil(total / limit) };
    }),

  // Get single project with stats
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          organization: true,
          _count: { select: { migrationObjects: true, auditLogs: true } },
        },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Get object status breakdown
      const statusBreakdown = await ctx.db.migrationObject.groupBy({
        by: ["status"],
        where: { projectId: input.id },
        _count: { status: true },
      });

      const stats = {
        total: project._count.migrationObjects,
        breakdown: Object.fromEntries(
          statusBreakdown.map((s) => [s.status, s._count.status])
        ),
      };

      return { ...project, stats };
    }),

  // Create project
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(200),
        description: z.string().max(1000).optional(),
        sapSystemUrl: z.string().url().optional(),
        sapRelease: z.string().max(20).optional(),
        targetStack: z.string().max(100).optional(),
        orgId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId =
        input.orgId ??
        ctx.session.user.organizationId;

      if (!orgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization required to create a project",
        });
      }

      const project = await ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          sapSystemUrl: input.sapSystemUrl,
          sapRelease: input.sapRelease,
          targetStack: input.targetStack,
          orgId,
          status: ProjectStatus.DRAFT,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          projectId: project.id,
          userId: ctx.session.user.id,
          action: "PROJECT_CREATED",
          metadata: { name: project.name },
        },
      });

      return project;
    }),

  // Update project
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).max(200).optional(),
        description: z.string().max(1000).optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        sapSystemUrl: z.string().url().optional().nullable(),
        sapRelease: z.string().max(20).optional(),
        targetStack: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });

      await ctx.db.auditLog.create({
        data: {
          projectId: project.id,
          userId: ctx.session.user.id,
          action: "PROJECT_UPDATED",
          metadata: { updates: data },
        },
      });

      return project;
    }),

  // Delete project (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.project.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Get project audit log
  auditLog: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.auditLog.findMany({
        where: { projectId: input.projectId },
        orderBy: { timestamp: "desc" },
        take: input.limit,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
    }),

  // Dashboard stats
  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.session.user.organizationId;
    const where = orgId ? { orgId } : {};

    const [projectCount, objectCounts, recentProjects] = await Promise.all([
      ctx.db.project.count({ where }),
      ctx.db.migrationObject.groupBy({
        by: ["status"],
        where: { project: where },
        _count: { status: true },
      }),
      ctx.db.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          _count: { select: { migrationObjects: true } },
          organization: { select: { name: true } },
        },
      }),
    ]);

    const objectStats = Object.fromEntries(
      objectCounts.map((o) => [o.status, o._count.status])
    );

    const totalObjects = Object.values(objectStats).reduce(
      (a, b) => a + b,
      0
    );
    const approvedObjects = objectStats["APPROVED"] ?? 0;
    const completionRate =
      totalObjects > 0
        ? Math.round((approvedObjects / totalObjects) * 100)
        : 0;

    return {
      projectCount,
      totalObjects,
      approvedObjects,
      completionRate,
      objectStats,
      recentProjects,
    };
  }),
});
