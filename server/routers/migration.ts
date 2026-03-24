import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  reviewerProcedure,
} from "@/server/trpc";
import { ObjectStatus, ObjectType, ReviewDecisionType } from "@prisma/client";
import { migrationQueue } from "@/server/jobs/queue";

export const migrationRouter = createTRPCRouter({
  // List migration objects for a project
  listObjects: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        status: z.nativeEnum(ObjectStatus).optional(),
        objectType: z.nativeEnum(ObjectType).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { projectId, page, limit, status, objectType, search } = input;
      const skip = (page - 1) * limit;

      const where = {
        projectId,
        ...(status && { status }),
        ...(objectType && { objectType }),
        ...(search && {
          OR: [
            { objectName: { contains: search, mode: "insensitive" as const } },
            { packageName: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      };

      const [objects, total] = await Promise.all([
        ctx.db.migrationObject.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            _count: { select: { reviewDecisions: true } },
          },
        }),
        ctx.db.migrationObject.count({ where }),
      ]);

      return { objects, total, pages: Math.ceil(total / limit) };
    }),

  // Get single object with decisions
  objectById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const obj = await ctx.db.migrationObject.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true } },
          reviewDecisions: {
            orderBy: { createdAt: "desc" },
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      });

      if (!obj) throw new TRPCError({ code: "NOT_FOUND" });
      return obj;
    }),

  // Upload objects for migration
  uploadObjects: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        objects: z.array(
          z.object({
            objectType: z.nativeEnum(ObjectType),
            objectName: z.string().min(1).max(200),
            packageName: z.string().max(100).optional(),
            sourceCode: z.string().min(1),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, objects } = input;

      // Upsert objects
      const created = await ctx.db.$transaction(
        objects.map((obj) =>
          ctx.db.migrationObject.upsert({
            where: {
              projectId_objectType_objectName: {
                projectId,
                objectType: obj.objectType,
                objectName: obj.objectName,
              },
            },
            create: {
              projectId,
              objectType: obj.objectType,
              objectName: obj.objectName,
              packageName: obj.packageName,
              sourceCode: obj.sourceCode,
              status: ObjectStatus.PENDING,
            },
            update: {
              sourceCode: obj.sourceCode,
              packageName: obj.packageName,
              status: ObjectStatus.PENDING,
              convertedCode: null,
              confidenceScore: null,
              errorMessage: null,
            },
          })
        )
      );

      await ctx.db.auditLog.create({
        data: {
          projectId,
          userId: ctx.session.user.id,
          action: "OBJECTS_UPLOADED",
          metadata: { count: created.length },
        },
      });

      return { created: created.length };
    }),

  // Enqueue objects for conversion
  enqueueConversion: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectIds: z.array(z.string()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, objectIds } = input;

      // Mark as CONVERTING
      await ctx.db.migrationObject.updateMany({
        where: { id: { in: objectIds }, projectId },
        data: { status: ObjectStatus.CONVERTING },
      });

      // Enqueue jobs
      const jobs = objectIds.map((objectId) => ({
        name: "convert-object",
        data: { objectId, projectId, userId: ctx.session.user.id },
      }));

      await migrationQueue.addBulk(jobs);

      await ctx.db.auditLog.create({
        data: {
          projectId,
          userId: ctx.session.user.id,
          action: "CONVERSION_ENQUEUED",
          metadata: { objectCount: objectIds.length },
        },
      });

      return { enqueued: objectIds.length };
    }),

  // Submit review decision
  submitReview: reviewerProcedure
    .input(
      z.object({
        objectId: z.string(),
        decision: z.nativeEnum(ReviewDecisionType),
        notes: z.string().max(5000).optional(),
        modifiedCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const obj = await ctx.db.migrationObject.findUnique({
        where: { id: input.objectId },
        select: { id: true, projectId: true, status: true },
      });

      if (!obj) throw new TRPCError({ code: "NOT_FOUND" });

      if (!["CONVERTED", "REVIEWED"].includes(obj.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Object must be in CONVERTED or REVIEWED state to review",
        });
      }

      // Create decision
      const reviewDecision = await ctx.db.reviewDecision.create({
        data: {
          objectId: input.objectId,
          userId: ctx.session.user.id,
          decision: input.decision,
          notes: input.notes,
          modifiedCode: input.modifiedCode,
        },
      });

      // Update object status
      const newStatus =
        input.decision === ReviewDecisionType.APPROVED
          ? ObjectStatus.APPROVED
          : input.decision === ReviewDecisionType.MODIFIED
          ? ObjectStatus.REVIEWED
          : ObjectStatus.CONVERTED;

      await ctx.db.migrationObject.update({
        where: { id: input.objectId },
        data: {
          status: newStatus,
          ...(input.modifiedCode && { convertedCode: input.modifiedCode }),
        },
      });

      await ctx.db.auditLog.create({
        data: {
          projectId: obj.projectId,
          userId: ctx.session.user.id,
          action: "REVIEW_SUBMITTED",
          metadata: {
            objectId: input.objectId,
            decision: input.decision,
          },
        },
      });

      return reviewDecision;
    }),

  // Get objects pending review
  pendingReview: reviewerProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.user.organizationId;

      const where: any = {
        status: { in: [ObjectStatus.CONVERTED, ObjectStatus.REVIEWED] },
      };

      if (input.projectId) {
        where.projectId = input.projectId;
      } else if (orgId) {
        where.project = { orgId };
      }

      // If user has no org (should be rare), return empty list rather than throwing.
      if (!input.projectId && !orgId) return [];

      return ctx.db.migrationObject.findMany({
        where: {
          ...where,
        },
        orderBy: [
          { confidenceScore: "asc" }, // Review low confidence first
          { updatedAt: "asc" },
        ],
        take: input.limit,
      });
    }),
});
