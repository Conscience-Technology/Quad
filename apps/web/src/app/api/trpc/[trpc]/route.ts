import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const runtime = "nodejs"; // argon2 + drizzle need Node, not Edge

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error(`[trpc] ${path ?? "<no-path>"}: ${error.message}`);
      }
    },
  });
}

export { handler as GET, handler as POST };
