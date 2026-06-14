import { Anchor, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function LoginScreen() {
  const { signIn, pending, error } = useAuth();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Anchor className="h-8 w-8 text-primary" />
      </span>
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Sign in to SuperConsole
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          SuperConsole connects to your account to sync organizations and
          connectors. Your agent sessions and files always stay on this machine.
        </p>
      </div>

      <Button onClick={signIn} disabled={pending} className="min-w-44">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for browser...
          </>
        ) : (
          "Sign in / Sign up"
        )}
      </Button>

      {pending && (
        <p className="text-xs text-muted-foreground">
          Complete sign-in in your browser, then return here.
        </p>
      )}
      {error && (
        <p className="max-w-sm text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
