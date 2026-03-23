import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  publicProcedure,
} from "@/server/trpc";
import { TRPCError } from "@trpc/server";

// Use zod enum directly so we don't depend on @prisma/client enum export
const UserRoleSchema = z.enum(["ADMIN", "REVIEWER", "VIEWER"]);

export const userRouter = createTRPCRouter({
  // Get current user profile
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: {
        organization: true,
      },
    });

    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  // Register with credentials
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already in use",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: "VIEWER",
        },
      });

      return { id: user.id, email: user.email };
    }),

  // Update own profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100).optional(),
        image: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: input,
      });
    }),

  // Change password
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No password set for this account",
        });
      }

      const isValid = await bcrypt.compare(
        input.currentPassword,
        user.passwordHash
      );
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { passwordHash },
      });

      return { success: true };
    }),

  // Admin: list all users
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
        role: UserRoleSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const page: number = input.page;
      const limit: number = input.limit;
      const search: string | undefined = input.search;
      const role = input.role;
      const skip = (page - 1) * limit;

      // Build where clause imperatively to avoid spread inference issues
      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }
      if (role) {
        where.role = role;
      }

      const [users, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: { organization: { select: { name: true } } },
        }),
        ctx.db.user.count({ where }),
      ]);

      return { users, total, pages: Math.ceil(total / limit) };
    }),

  // Admin: update user role
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: UserRoleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });
    }),
});
