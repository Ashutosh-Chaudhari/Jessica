import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { ProgressStats } from "@jessica/types";
import { api } from "../services";
import { useAuth } from "../hooks/useAuth";
import { Layout } from "../components/Layout";
import { Button, Eyebrow, Field, Notice, SectionHead } from "../components/primitives";
import { ThemeSegmented } from "../components/ThemeToggle";
import { formatDuration } from "../hooks/format";

/** Typing the word is the confirmation. A modal with an OK button is not one. */
const CONFIRM_WORD = "delete";

export default function Profile() {
  const { user, applyDisplayName, clearSession } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.display_name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [stats, setStats] = useState<ProgressStats | null>(null);

  const [confirm, setConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Profile - Jessica";
    void api.progress
      .getStats()
      .then(setStats)
      .catch((e: unknown) => console.error("could not load totals:", e));
  }, []);

  // Keep the field in step if the name arrives after first render.
  useEffect(() => {
    if (user?.display_name) setName((current) => (current === "" ? user.display_name : current));
  }, [user?.display_name]);

  const dirty = name.trim() !== (user?.display_name ?? "") && name.trim().length > 0;

  async function saveName() {
    setNameBusy(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const stored = await api.profile.updateDisplayName(name);
      applyDisplayName(stored);
      setName(stored);
      setNameSaved(true);
    } catch (e: unknown) {
      setNameError(e instanceof Error ? e.message : "Could not save your name.");
    } finally {
      setNameBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.profile.deleteAccount();
      clearSession();
      navigate("/");
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete your account.");
      setDeleteBusy(false);
    }
  }

  return (
    <Layout>
      <div className="border-b-2 rule pb-8">
        <Eyebrow>Settings</Eyebrow>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Profile</h1>
      </div>

      {/* ------------------------------------------------------------- name */}
      <section className="mt-10">
        <SectionHead label="Your name" title="shown on your dashboard" />
        <form
          className="mt-5 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && !nameBusy) void saveName();
          }}
        >
          <Field
            id="display-name"
            label="Display name"
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
            hint={`${name.trim().length}/60 characters`}
          />
          <div className="mt-4 flex items-center gap-4">
            <Button type="submit" disabled={!dirty || nameBusy}>
              {nameBusy ? "Saving…" : "Save name"}
            </Button>
            {nameSaved && (
              <span className="font-mono text-sm uppercase tracking-[0.1em] text-signal-text">
                Saved
              </span>
            )}
          </div>
          {nameError && (
            <div className="mt-4">
              <Notice>{nameError}</Notice>
            </div>
          )}
        </form>
      </section>

      {/* -------------------------------------------------------- appearance */}
      <section className="mt-12">
        <SectionHead label="Appearance" title="this browser only" />
        <div className="mt-5 max-w-md">
          <ThemeSegmented />
        </div>
      </section>

      {/* ----------------------------------------------------------- account */}
      <section className="mt-12">
        <SectionHead label="Your account" />
        <dl className="mt-5 max-w-md">
          {[
            ["Email", user?.email || "—"],
            ["Topics completed", String(stats?.completed_topics ?? 0)],
            ["Attempts made", String(stats?.total_attempts ?? 0)],
            ["Time spoken", formatDuration(stats?.speaking_time_seconds ?? 0)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b rule py-2.5 last:border-0"
            >
              <dt className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{label}</dt>
              <dd className="tabular font-mono text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ----------------------------------------------------------- privacy */}
      <section className="mt-12">
        <SectionHead label="What happens to your voice" />
        <div className="mt-5 max-w-xl space-y-3 prose-body text-muted">
          <p>
            When you finish a recording, the audio is sent to a cloud speech service and turned
            into text. That text is then sent to an AI service, which scores how clearly you
            communicated.
          </p>
          <p>
            The audio itself is not stored. Your transcript, scores and feedback are kept so
            your history and progress work, and they go when your account does.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ delete */}
      <section className="mt-12 border-2 border-live p-6">
        <Eyebrow className="text-live-text">Delete your account</Eyebrow>
        <p className="mt-3 max-w-xl prose-body">
          This removes your profile, every attempt, every transcript and your whole history.
          It happens immediately and cannot be undone.
        </p>

        <div className="mt-6 max-w-sm">
          <Field
            id="confirm-delete"
            label={`Type "${CONFIRM_WORD}" to confirm`}
            value={confirm}
            autoComplete="off"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <Button
          variant="danger"
          className="mt-4"
          disabled={confirm.trim().toLowerCase() !== CONFIRM_WORD || deleteBusy}
          onClick={() => void deleteAccount()}
        >
          {deleteBusy ? "Deleting…" : "Delete my account"}
        </Button>

        {deleteError && (
          <div className="mt-4">
            <Notice>{deleteError}</Notice>
          </div>
        )}
      </section>
    </Layout>
  );
}
