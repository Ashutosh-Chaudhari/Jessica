import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { ProgressStats } from "@jessica/types";
import { api } from "../services";
import { useAuth } from "../hooks/useAuth";
import { Layout } from "../components/Layout";
import { Button, Field, Notice, PageHeader } from "../components/primitives";
import { ThemeSegmented } from "../components/ThemeToggle";
import { formatDuration } from "../hooks/format";

/** Typing the word is the confirmation. A modal with an OK button is not one. */
const CONFIRM_WORD = "delete";

export default function Profile() {
  const { user, applyDisplayName, clearSession, logout } = useAuth();
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
      <PageHeader
        eyebrow="Settings"
        title="Profile"
        aside={
          user?.email ? (
            <p className="max-w-[16rem] truncate font-mono text-xs uppercase tracking-[0.12em] text-muted">
              {user.email}
            </p>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------------- name */}
      <Setting label="Your name" note="Shown on your dashboard.">
        <form
          className="max-w-md"
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
          <div className="mt-5 flex items-center gap-5">
            <Button type="submit" disabled={!dirty} busy={nameBusy}>
              {nameBusy ? "Saving" : "Save name"}
            </Button>
            {nameSaved && (
              <span
                role="status"
                className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-signal-text"
              >
                <span aria-hidden="true" className="h-2 w-2 bg-signal" />
                Saved
              </span>
            )}
          </div>
          {nameError && (
            <div className="mt-5">
              <Notice>{nameError}</Notice>
            </div>
          )}
        </form>
      </Setting>

      {/* -------------------------------------------------------- appearance */}
      <Setting label="Appearance" note="This browser only.">
        <div className="max-w-md">
          <ThemeSegmented />
        </div>
      </Setting>

      {/* ----------------------------------------------------------- account */}
      <Setting label="Your account">
        <dl className="max-w-md border-t border-rule">
          {[
            ["Email", user?.email || "—"],
            ["Topics completed", String(stats?.completed_topics ?? 0)],
            ["Attempts made", String(stats?.total_attempts ?? 0)],
            ["Time spoken", formatDuration(stats?.speaking_time_seconds ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
              <dt className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{label}</dt>
              <dd className="truncate font-mono text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" className="mt-6" onClick={() => void logout().then(() => navigate("/"))}>
          Sign out
        </Button>
      </Setting>

      {/* ----------------------------------------------------------- privacy */}
      <Setting label="Privacy" note="What happens to your voice.">
        <dl className="grid max-w-3xl gap-x-10 sm:grid-cols-2">
          {[
            [
              "Microphone",
              "Used only while you record an answer. Your browser asks first, and you can withdraw access in its site settings at any time.",
            ],
            [
              "Audio",
              "When you finish a recording, the audio is sent to a cloud speech service and turned into text. The audio itself is not stored.",
            ],
            [
              "Transcript",
              "The text is sent to an AI service, which scores how clearly you communicated. Your transcript, scores and feedback are kept so your history and progress work.",
            ],
            ["Deletion", "They go when your account does. Deleting it below removes everything at once."],
          ].map(([term, detail]) => (
            <div key={term} className="border-t border-line py-5">
              <dt className="eyebrow text-fg">{term}</dt>
              <dd className="mt-2 prose-body text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </Setting>

      {/* ------------------------------------------------------------ delete */}
      <section aria-labelledby="delete-account" className="mt-12 border border-t-4 border-live border-t-live p-6 sm:p-8">
        <h2 id="delete-account" className="eyebrow text-live-text">
          Delete your account
        </h2>
        <p className="mt-4 max-w-xl prose-body">
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
          className="mt-5"
          disabled={confirm.trim().toLowerCase() !== CONFIRM_WORD}
          busy={deleteBusy}
          onClick={() => void deleteAccount()}
        >
          {deleteBusy ? "Deleting" : "Delete my account"}
        </Button>

        {deleteError && (
          <div className="mt-5">
            <Notice>{deleteError}</Notice>
          </div>
        )}
      </section>
    </Layout>
  );
}

/** Label on the left, control on the right: a settings page read like a contents list. */
function Setting({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-line-strong py-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 className="display text-2xl">{label}</h2>
        {note && <p className="mt-2 font-mono text-xs text-muted">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
