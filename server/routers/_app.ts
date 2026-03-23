import { createTRPCRouter } from "@/server/trpc";
import { userRouter } from "@/server/routers/user";
import { projectRouter } from "@/server/routers/project";
import { migrationRouter } from "@/server/routers/migration";
import { sapRouter } from "@/server/routers/sap";

export const appRouter = createTRPCRouter({
  user: userRouter,
  project: projectRouter,
  migration: migrationRouter,
  sap: sapRouter,
});

export type AppRouter = typeof appRouter;
