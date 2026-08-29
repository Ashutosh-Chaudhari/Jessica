import {
  ProviderError,
  type SpeechToTextProvider,
  type TranscriptResult,
  type UsageSink,
} from "./core.ts";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

export interface GroqConfig {
  apiKey: string;
  /** Configurable so the STT model can be upgraded without a code change. */
  model: string;
  onUsage?: UsageSink;
}

/** Groq needs a filename with a recognised extension, not just a byte stream. */
function filenameFor(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim() ?? "";
  const ext =
    { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" }[
      base
    ] ?? "webm";
  return `speech.${ext}`;
}

export function createGroqSpeechToText(cfg: GroqConfig): SpeechToTextProvider {
  return {
    async transcribe(audio: ArrayBuffer, mimeType: string): Promise<TranscriptResult> {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mimeType }), filenameFor(mimeType));
      form.append("model", cfg.model);
      // verbose_json is what gives us the true audio duration; the browser's
      // stopwatch is a client-side claim and pass/fail must not rest on it.
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.apiKey}` },
          body: form,
        });
      } catch (error) {
        cfg.onUsage?.({ provider: "groq", model: cfg.model, request_type: "stt", units: 0, ok: false });
        throw new ProviderError("groq", 0, error instanceof Error ? error.message : "network error");
      }

      if (!response.ok) {
        cfg.onUsage?.({ provider: "groq", model: cfg.model, request_type: "stt", units: 0, ok: false });
        // Groq uses the standard header rather than a body field.
        const seconds = Number.parseFloat(response.headers.get("retry-after") ?? "");
        throw new ProviderError(
          "groq",
          response.status,
          (await response.text()).slice(0, 300),
          Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined,
        );
      }

      const json = (await response.json()) as { text?: string; duration?: number };
      if (typeof json.text !== "string") {
        throw new ProviderError("groq", 502, "no transcript in response");
      }

      const durationSeconds = Math.round(json.duration ?? 0);
      cfg.onUsage?.({
        provider: "groq",
        model: cfg.model,
        request_type: "stt",
        units: durationSeconds,
        ok: true,
      });

      return { text: json.text.trim(), durationSeconds };
    },
  };
}
