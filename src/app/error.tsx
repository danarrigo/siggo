"use client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="gate-page">
      <section className="gate-card">
        <h1>Unable to load competitions</h1>
        <p>
          We could not load your workspace. Your stored data is still intact. Check the database
          connection and migrations, then try again.
        </p>
        <Button onClick={reset}>
          <RefreshCw size={15} />
          Try again
        </Button>
      </section>
    </main>
  );
}
