import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, LogOut } from "lucide-react";

interface Org {
  id: string;
  name: string;
  logoUrl?: string | null;
}

function Avatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) return <img className="ws-avatar" src={logoUrl} alt="" />;
  return <span className="ws-avatar">{name.trim().charAt(0) || "?"}</span>;
}

const labelStyle = { display: "flex", alignItems: "center", gap: 8 } as const;

export function AccountMenu({
  name,
  email,
  logoUrl,
  orgs,
  activeOrgId,
}: {
  name: string | null;
  email: string;
  logoUrl?: string | null;
  orgs: Org[];
  activeOrgId: string;
}) {
  const [open, setOpen] = useState(false);
  const [showOrgs, setShowOrgs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowOrgs(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const close = () => {
    setOpen(false);
    setShowOrgs(false);
  };

  return (
    <div className="account-menu" ref={ref}>
      <button className="account-trigger" onClick={() => setOpen((v) => !v)}>
        <Avatar name={name ?? email} logoUrl={logoUrl} />
        {name ?? email}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div className="account-dropdown">
          <div className="account-head" style={labelStyle}>
            <Avatar name={name ?? email} logoUrl={logoUrl} />
            <span>
              <div className="account-name">{name ?? "Account"}</div>
              <div className="account-email">{email}</div>
            </span>
          </div>

          <div className="menu-divider" />

          <Link to="/settings" search={{ org: activeOrgId }} className="menu-item" onClick={close}>
            Settings
          </Link>

          {orgs.length > 0 && (
            <>
              <div className="menu-divider" />
              <button
                className="menu-item"
                onClick={() => setShowOrgs((v) => !v)}
              >
                <span style={labelStyle}>
                  <Building2 size={15} />
                  Switch Workspace
                </span>
                <span style={{ fontSize: 10 }}>▸</span>
              </button>
            </>
          )}

          <Link to="/logout" className="menu-item">
            <span style={labelStyle}>
              <LogOut size={15} />
              Logout
            </span>
          </Link>

          {showOrgs && orgs.length > 0 && (
            <div className="account-submenu">
              <div className="account-head">
                <div className="account-email">{email}</div>
              </div>
              {orgs.map((o) => (
                <Link
                  key={o.id}
                  to="/settings"
                  search={{ org: o.id }}
                  className="menu-item"
                  onClick={close}
                >
                  <span style={labelStyle}>
                    <Avatar name={o.name} logoUrl={o.logoUrl} />
                    {o.name}
                  </span>
                  {o.id === activeOrgId && (
                    <span style={{ color: "var(--primary)" }}>✓</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
