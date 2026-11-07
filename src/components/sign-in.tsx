"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const authClient = createAuthClient();
export function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await authClient.signIn.social({ provider: "github", callbackURL: "/" });
            if (result.error) {
              setError(
                "Could not sign in. Check your GitHub OAuth configuration and allowed email.",
              );
              setBusy(false);
            }
          } catch {
            setError("Sign-in is unavailable. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}Continue with GitHub
      </Button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </>
  );
}
