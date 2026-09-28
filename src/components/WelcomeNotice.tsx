import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/database";

export function WelcomeNotice() {
  const dismissed = useLiveQuery(
    async () => Boolean(await db.meta.get("welcome-v1")),
    [],
    true,
  );
  const [error, setError] = useState("");
  if (dismissed) return null;
  return (
    <section className="welcome-notice" aria-labelledby="welcome-title">
      <p className="eyebrow">EARLY COMMUNITY PREVIEW</p>
      <h2 id="welcome-title">A little room for whatever you noticed.</h2>
      <p>
        You can start with a few words. Entries save when you choose Save, in
        this browser on this device. There’s no account recovery or automatic
        sync to another device.
      </p>
      <p>
        Keep a private backup using <strong>Backups</strong>. Clearing browser
        data can remove your journal. Local profiles and backup files aren’t
        password-protected or encrypted.
      </p>
      <p>
        Corrections and removed photos stay in edit history and backups;
        permanent erasure in the app isn’t available yet. Breadcrumb helps you
        remember, without diagnoses or medication alarms.
      </p>
      <button
        className="secondary"
        type="button"
        onClick={async () => {
          try {
            await db.meta.put({ key: "welcome-v1", value: "dismissed" });
          } catch {
            setError(
              "Could not save this preference. You can still use your journal.",
            );
          }
        }}
      >
        Got it — let’s begin
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
