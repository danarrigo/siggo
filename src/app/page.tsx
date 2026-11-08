import { Dashboard } from "@/components/dashboard";
import { SignIn } from "@/components/sign-in";
import { authConfigured, localPreview, missingSettings } from "@/lib/auth";
import { defaultWorkspace } from "@/lib/model";
import { currentUser, loadCatalog, loadWorkspace } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function Home() {
  const preview = localPreview();
  if (!authConfigured() && !preview)
    return (
      <div className="gate-page">
        <section className="gate-card">
          <Brand />
          <h1>Connect your private workspace.</h1>
          <p>
            The app is ready. Finish configuring the database and private sign-in before your
            catalog or personal profile is exposed on this deployment.
          </p>
          <div className="setup-settings">
            {missingSettings().map((setting) => (
              <code key={setting}>{setting}</code>
            ))}
          </div>
          <p className="setup-note">
            Follow the deployment steps in README.md, apply the database migration, then redeploy.
            Kaggle credentials are optional; other sources work without them.
          </p>
        </section>
      </div>
    );
  const user = preview ? null : await currentUser();
  if (!preview && !user)
    return (
      <div className="gate-page">
        <section className="gate-card">
          <Brand />
          <h1>Sign in to Siggo</h1>
          <p>Use your allowed GitHub account to access saved competitions and preferences.</p>
          <SignIn />
        </section>
      </div>
    );
  const catalog = await loadCatalog();
  const workspace = user ? await loadWorkspace(user.id, catalog) : defaultWorkspace;
  // eslint-disable-next-line react-hooks/purity -- Dynamic RSC takes one request-time snapshot, not a client render-time clock.
  const now = Date.now();
  return (
    <Dashboard
      catalog={{
        competitions: catalog.competitions,
        sources: catalog.sources,
        updatedAt: catalog.updatedAt,
      }}
      initialWorkspace={workspace}
      mode={preview ? "local" : "cloud"}
      now={now}
      testData={preview && process.env.SIGNAL_E2E === "1"}
    />
  );
}
function Brand() {
  return <div className="brand">siggo</div>;
}
