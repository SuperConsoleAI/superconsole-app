import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import { AccountMenu } from "../AccountMenu";
import { Logo } from "../Logo";

const getDashboard = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getDashboard({ data: deps.org }),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const orgId = data.activeOrg?.id ?? "";

  return (
    <div className="shell">
      <div className="topbar">
        <Link to="/" search={{ org: orgId }} className="brand-row">
          <Logo />
          <span className="brand">SuperConsole</span>
        </Link>
        <AccountMenu
          name={data.user.name}
          email={data.user.email}
          logoUrl={data.user.logoUrl}
          orgs={data.orgs}
          activeOrgId={orgId}
        />
      </div>

      <div className="download-hero">
        <h1>Download SuperConsole</h1>
        <p>Use the desktop app to start running parallel business agents.</p>
        <a className="btn lg" href="https://github.com">
          Download SuperConsole
        </a>
      </div>
    </div>
  );
}
