import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { clearSession } from "../server/auth";

const doLogout = createServerFn({ method: "POST" }).handler(() => {
  clearSession();
});

export const Route = createFileRoute("/logout")({
  loader: async () => {
    await doLogout();
    throw redirect({ to: "/login" });
  },
});
