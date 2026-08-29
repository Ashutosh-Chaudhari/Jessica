/**
 * Spec section 63. Jessica sends voice to a third-party speech service and the
 * transcript to a third-party model; the user is told so before they speak,
 * not buried in a policy page.
 */
export function PrivacyNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={`border-l-4 rule bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-muted ${className}`}
    >
      Your voice is sent to a cloud speech service for transcription, and the transcript to an AI
      service for scoring. The audio is not kept.
    </p>
  );
}
