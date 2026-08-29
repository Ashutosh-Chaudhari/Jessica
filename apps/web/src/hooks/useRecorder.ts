import { useCallback, useEffect, useRef, useState } from "react";

type RecorderError = "unsupported" | "denied" | "unknown";

interface RecorderState {
  recording: boolean;
  elapsedSeconds: number;
  audioUrl: string | null;
  error: RecorderError | null;
}

interface RecorderApi extends RecorderState {
  /** Resolves false if the microphone is unavailable - `error` is set by then,
   *  but a caller awaiting start() would still be holding the previous render's
   *  stale copy of it. */
  start: () => Promise<boolean>;
  /** Resolves with the finished recording - MediaRecorder only hands it over on stop. */
  stop: () => Promise<Blob | null>;
  reset: () => void;
}

/**
 * Captures microphone audio via MediaRecorder (spec section 32) and hands the
 * blob to the caller, which uploads it to the Worker -> Groq Whisper.
 */
export function useRecorder(maxSeconds: number): RecorderApi {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<RecorderError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const stoppingRef = useRef(false);
  const waitersRef = useRef<((blob: Blob | null) => void)[]>([]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupAudio = useCallback(() => {
    blobRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setAudioUrl(null);
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    clearTimer();
    setRecording(false);

    const recorder = recorderRef.current;

    // A stop is already in flight - most often the auto-stop at maxSeconds.
    // MediaRecorder flips to "inactive" synchronously but only produces the
    // blob on its stop event, so joining the queue is the difference between
    // getting the recording and getting null.
    if (stoppingRef.current) {
      return new Promise((resolve) => waitersRef.current.push(resolve));
    }
    if (!recorder || recorder.state === "inactive") return Promise.resolve(blobRef.current);

    stoppingRef.current = true;
    return new Promise((resolve) => {
      waitersRef.current.push(resolve);
      recorder.stop();
    });
  }, [clearTimer]);

  const start = useCallback(async (): Promise<boolean> => {
    // Re-entrancy guard: a second start() would orphan the first recorder and
    // leave its microphone track live forever.
    if (recorderRef.current?.state === "recording") return true;

    setError(null);
    cleanupAudio();
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("denied");
      return false;
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        blobRef.current = blob;
        urlRef.current = URL.createObjectURL(blob);
        setAudioUrl(urlRef.current);
        stoppingRef.current = false;
        waitersRef.current.splice(0).forEach((resolve) => resolve(blob));
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      stoppingRef.current = false;
      setElapsedSeconds(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => {
          const next = Math.min(s + 1, maxSeconds);
          if (next >= maxSeconds) void stop(); // auto-stop at max duration
          return next;
        });
      }, 1000);
      return true;
    } catch {
      // The stream was already open by this point; do not leave the mic on.
      stream.getTracks().forEach((t) => t.stop());
      setError("unknown");
      return false;
    }
  }, [cleanupAudio, maxSeconds, stop]);

  const reset = useCallback(() => {
    void stop();
    setElapsedSeconds(0);
    setError(null);
    cleanupAudio();
  }, [cleanupAudio, stop]);

  useEffect(
    () => () => {
      clearTimer();
      waitersRef.current.splice(0).forEach((resolve) => resolve(null));
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [clearTimer],
  );

  return { recording, elapsedSeconds, audioUrl, error, start, stop, reset };
}
