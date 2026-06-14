import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuthorizationUrl } from "../server/auth";

const getLoginUrl = createServerFn({ method: "GET" }).handler(() =>
  getAuthorizationUrl(),
);

export const Route = createFileRoute("/login")({
  loader: async () => {
    const url = await getLoginUrl();
    throw redirect({ href: url });
  },
});
