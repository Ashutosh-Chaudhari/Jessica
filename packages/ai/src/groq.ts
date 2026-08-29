import { parseEvaluation } from "@jessica/types";
import {
  ProviderError,
  type EvaluationProvider,
  type EvaluationResult,
  type SpeechToTextProvider,
  type TopicGenerator,
  type TopicGeneratorInput,
  type TopicGeneratorResult,
  type TranscriptResult,
  type UsageSink,
} from "./core.ts";
import { EVAL_SYSTEM, TOPIC_SYSTEM, evalUserMessage, topicUserMessage } from "./prompts.ts";

const STT_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqConfig {
  apiKey: string;
  /** Configurable so the STT model can be upgraded without a code change. */
  model: string;
  onUsage?: UsageSink;
}

export interface GroqChatConfig {
  apiKey: string;
  /** The chat model used for topic generation and scoring. */
  model: string;
  onUsage?: UsageSink;
}

/* ------------------------------------------------------------------- chat */

interface ChatResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { total_tokens?: number };
}

/**
 * OpenAI-compatible chat with a strict JSON schema. Groq enforces the schema
 * server side, so the response is parseable without a repair pass.
 */
async function groqChat(
  cfg: GroqChatConfig,
  requestType: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  temperature: number,
): Promise<unknown> {
  const fail = () =>
    cfg.onUsage?.({ provider: "groq", model: cfg.model, request_type: requestType, units: 0, ok: false });

  let response: Response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: requestType, schema, strict: true },
        },
      }),
    });
  } catch (error) {
    fail();
    throw new ProviderError("groq", 0, error instanceof Error ? error.message : "network error");
  }

  if (!response.ok) {
    fail();
    const seconds = Number.parseFloat(response.headers.get("retry-after") ?? "");
    throw new ProviderError(
      "groq",
      response.status,
      (await response.text()).slice(0, 300),
      Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined,
    );
  }

  const json = (await response.json()) as ChatResponse;
  cfg.onUsage?.({
    provider: "groq",
    model: cfg.model,
    request_type: requestType,
    units: json.usage?.total_tokens ?? 0,
    ok: true,
  });

  const choice = json.choices?.[0];
  if (choice?.finish_reason && choice.finish_reason !== "stop") {
    // A truncated or filtered completion repeats identically; retrying only
    // burns quota. 422 is not retryable.
    throw new ProviderError("groq", 422, `finish_reason ${choice.finish_reason}`);
  }

  const text = choice?.message?.content;
  if (!text) throw new ProviderError("groq", 502, "empty response");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError("groq", 502, "response was not valid JSON");
  }
}

const TOPIC_SCHEMA = {
  type: "object",
  properties: { topic_text: { type: "string" }, category: { type: "string" } },
  required: ["topic_text", "category"],
  additionalProperties: false,
} as const;

const EVAL_SCHEMA = {
  type: "object",
  properties: {
    overall: { type: "integer" },
    fluency: { type: "integer" },
    coherence: { type: "integer" },
    vocabulary: { type: "integer" },
    relevance: { type: "integer" },
    structure: { type: "integer" },
    filler_count: { type: "integer" },
    feedback: { type: "array", items: { type: "string" } },
  },
  required: [
    "overall", "fluency", "coherence", "vocabulary",
    "relevance", "structure", "filler_count", "feedback",
  ],
  additionalProperties: false,
} as const;

export function createGroqTopicGenerator(cfg: GroqChatConfig): TopicGenerator {
  return {
    async generate(input: TopicGeneratorInput): Promise<TopicGeneratorResult> {
      const parsed = (await groqChat(
        cfg,
        "topic",
        TOPIC_SYSTEM,
        topicUserMessage(input),
        TOPIC_SCHEMA as unknown as Record<string, unknown>,
        // High temperature is the point: the topic space must not converge.
        1.1,
      )) as { topic_text?: unknown; category?: unknown };

      if (typeof parsed.topic_text !== "string") {
        throw new ProviderError("groq", 502, "topic_text missing");
      }
      return {
        topicText: parsed.topic_text.trim(),
        category: typeof parsed.category === "string" ? parsed.category : input.category,
      };
    },
  };
}

export function createGroqEvaluator(cfg: GroqChatConfig): EvaluationProvider {
  return {
    async evaluate(topicText: string, transcript: string): Promise<EvaluationResult> {
      const parsed = await groqChat(
        cfg,
        "evaluation",
        EVAL_SYSTEM,
        evalUserMessage(topicText, transcript),
        EVAL_SCHEMA as unknown as Record<string, unknown>,
        0.2,
      );

      // A server-enforced schema still is not a guarantee of usable values
      // (spec section 53): ranges and feedback content are checked here.
      const evaluation = parseEvaluation(parsed);
      if (!evaluation) throw new ProviderError("groq", 502, "evaluation failed validation");
      return evaluation;
    },
  };
}

/* -------------------------------------------------------------------- stt */

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
        response = await fetch(STT_ENDPOINT, {
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
