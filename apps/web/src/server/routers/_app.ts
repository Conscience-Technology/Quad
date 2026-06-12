import { router } from "../trpc";
import { apiKeysRouter } from "./api-keys";
import { authRouter } from "./auth";
import { bugsRouter } from "./bugs";
import { instanceRouter } from "./instance";
import { membersRouter } from "./members";
import { projectsRouter } from "./projects";
import { tasksRouter } from "./tasks";
import { usersRouter } from "./users";

export const appRouter = router({
  auth: authRouter,
  instance: instanceRouter,
  users: usersRouter,
  projects: projectsRouter,
  members: membersRouter,
  apiKeys: apiKeysRouter,
  bugs: bugsRouter,
  tasks: tasksRouter,
});

export type AppRouter = typeof appRouter;
