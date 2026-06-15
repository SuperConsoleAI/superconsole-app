import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { handleCallback } from "../server/auth";
import { ensureUser } from "../server/data";

const completeLogin = createServerFn({ method: "POST" })
  .validator((code: string) => code)
  .handler(async ({ data }) => {
    const user = await handleCallback(data);
    await ensureUser(user);
  });

export const Route = createFileRoute("/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => ({ code: search.code, error: search.error }),
  loader: async ({ deps }) => {
    if (deps.error || !deps.code) {
      throw redirect({ to: "/login" });
    }
    await completeLogin({ data: deps.code });
    throw redirect({ to: "/", search: { org: undefined } });
  },
});
