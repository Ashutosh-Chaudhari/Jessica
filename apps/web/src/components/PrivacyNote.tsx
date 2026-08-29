/**
 * Spec section 63. Jessica sends voice to a third-party speech service and the
 * transcript to a third-party model; the user is told so before they speak,
 * not buried in a policy page.
 */
export function PrivacyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-zinc-600 ${className}`}>
      Your voice is sent to our cloud speech service for transcription, and the
      transcript to our AI evaluation service for communication analysis. Audio
      is not permanently stored.
    </p>
  );
}
