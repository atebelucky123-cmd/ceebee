import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration } from "@google/genai";
import { createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { listRecentEmails, sendEmail } from "@/lib/gmail";
import { fetchWeather } from "@/lib/weather";
import { getRelevantMemoryFacts, addMemoryFact } from "@/lib/memory";
import { checkRateLimit } from "@/lib/rateLimit";
import { logUsage } from "@/lib/usageLog";
import { getCurrentModel, providerForModel } from "@/lib/settings";

// --- Neutral tool schema -------------------------------------------------
// Defined once in plain JSON-schema shape (lowercase types), then adapted
// per provider below -- Gemini needs its Type enum, Groq (OpenAI-compatible)
// can use this shape almost as-is.

type NeutralTool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required?: string[];
  };
};

const ALL_TOOLS: NeutralTool[] = [
  {
    name: "create_calendar_event",
    description:
      "Creates a new event on the user's Google Calendar, optionally with a Google Meet link and attendees.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 datetime, e.g. 2026-09-02T15:00:00+01:00" },
        endTime: { type: "string", description: "ISO 8601 datetime" },
        attendeeEmails: { type: "array", items: { type: "string" } },
        createMeetLink: { type: "boolean" },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "list_upcoming_events",
    description: "Lists the user's calendar events between now and a number of hours ahead.",
    parameters: {
      type: "object",
      properties: { hoursAhead: { type: "number" } },
    },
  },
  {
    name: "list_recent_emails",
    description: "Lists the most recent emails in the user's inbox.",
    parameters: {
      type: "object",
      properties: { maxResults: { type: "number" } },
    },
  },
  {
    name: "send_email",
    description: "Sends an email from the user's connected account.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "get_weather",
    description: "Gets the current weather and forecast for the user's location (defaults to Lagos, Nigeria).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "remember_fact",
    description:
      "Saves a durable fact about Shina for future conversations. Only call this when the user shares something worth remembering long-term.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string" },
        category: { type: "string", description: "e.g. 'preference', 'project', 'person', 'routine'" },
      },
      required: ["fact"],
    },
  },
];

// --- Dynamic tool routing -------------------------------------------------

const ROUTES: { keywords: string[]; tools: string[] }[] = [
  { keywords: ["weather", "rain", "temperature", "forecast", "sunny", "cold", "hot"], tools: ["get_weather"] },
  { keywords: ["calendar", "event", "meeting", "schedule", "meet link", "invite"], tools: ["create_calendar_event", "list_upcoming_events"] },
  { keywords: ["email", "inbox", "gmail", "reply", "message from"], tools: ["list_recent_emails", "send_email"] },
  { keywords: ["remember", "don't forget", "keep in mind", "note that"], tools: ["remember_fact"] },
];

function selectTools(message: string): NeutralTool[] | undefined {
  const lower = message.toLowerCase();
  const matchedNames = new Set<string>();
  for (const route of ROUTES) {
    if (route.keywords.some((k) => lower.includes(k))) {
      route.tools.forEach((t) => matchedNames.add(t));
    }
  }
  if (matchedNames.size === 0) return undefined;
  return ALL_TOOLS.filter((t) => matchedNames.has(t.name));
}

// --- Provider adapters -----------------------------------------------------

type ProviderResult = {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
  usage: {
    promptTokens?: number;
    outputTokens?: number;
    thoughtTokens?: number;
    cachedTokens?: number;
    totalTokens?: number;
  };
};

type HistoryMessage = { role: "user" | "model"; parts: { text: string }[] };

function neutralTypeToGemini(t: string): Type {
  switch (t) {
    case "string": return Type.STRING;
    case "number": return Type.NUMBER;
    case "boolean": return Type.BOOLEAN;
    case "array": return Type.ARRAY;
    default: return Type.OBJECT;
  }
}

function toGeminiDeclarations(tools: NeutralTool[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([key, val]) => [
          key,
          {
            type: neutralTypeToGemini(val.type),
            description: val.description,
            items: val.items ? { type: neutralTypeToGemini(val.items.type) } : undefined,
          },
        ])
      ),
      required: t.parameters.required,
    },
  }));
}

async function callGemini(
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  tools: NeutralTool[] | undefined
): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in your .env file.");

  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    ...history.map((m) => ({ role: m.role, parts: m.parts.map((p) => ({ text: p.text })) })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const config: Record<string, unknown> = {
    systemInstruction: systemPrompt,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (tools) config.tools = [{ functionDeclarations: toGeminiDeclarations(tools) }];

  const response = await ai.models.generateContent({ model, contents, config });

  const usage = response.usageMetadata as
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        cachedContentTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;

  const calls = (response.functionCalls ?? []).map((c) => ({
    name: c.name!,
    args: (c.args as Record<string, unknown>) ?? {},
  }));

  return {
    text: response.text ?? "",
    toolCalls: calls,
    usage: {
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      thoughtTokens: usage?.thoughtsTokenCount,
      cachedTokens: usage?.cachedContentTokenCount,
      totalTokens: usage?.totalTokenCount,
    },
  };
}

async function callGroq(
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  tools: NeutralTool[] | undefined
): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in your .env file.");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.parts.map((p) => p.text).join(" "),
    })),
    { role: "user", content: userMessage },
  ];

  const body: Record<string, unknown> = { model, messages };
  if (tools) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error: ${errText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};

  const toolCalls = (message.tool_calls ?? []).map(
    (tc: { function: { name: string; arguments: string } }) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}"),
    })
  );

  return {
    text: message.content ?? "",
    toolCalls,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    },
  };
}

// --- Tool execution -----------------------------------------------------

async function executeTool(name: string, args: Record<string, unknown>, refreshToken: string) {
  switch (name) {
    case "create_calendar_event":
      return createCalendarEvent(refreshToken, args as never);
    case "list_upcoming_events":
      return listUpcomingEvents(refreshToken, (args.hoursAhead as number) ?? 24);
    case "list_recent_emails":
      return listRecentEmails(refreshToken, (args.maxResults as number) ?? 10);
    case "send_email":
      return sendEmail(refreshToken, args.to as string, args.subject as string, args.body as string);
    case "get_weather":
      return fetchWeather();
    case "remember_fact":
      await addMemoryFact(args.fact as string, (args.category as string | undefined) ?? "general");
      return { saved: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function formatLocally(name: string, args: Record<string, unknown>, result: unknown): string {
  switch (name) {
    case "create_calendar_event": {
      const r = result as { meetLink: string | null };
      const meet = r.meetLink ? ` I've added a Google Meet link.` : "";
      return `Done — I've added "${args.title}" to your calendar.${meet}`;
    }
    case "list_upcoming_events": {
      const events = result as { title: string; start: string; meetLink: string | null }[];
      if (events.length === 0) return "You have nothing coming up.";
      const lines = events.map((e) => {
        const time = new Date(e.start).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
        return `- ${e.title} (${time})${e.meetLink ? " — has a Meet link" : ""}`;
      });
      return `Here's what's coming up:\n${lines.join("\n")}`;
    }
    case "list_recent_emails": {
      const emails = result as { from: string; subject: string; unread: boolean }[];
      const unread = emails.filter((e) => e.unread).length;
      if (emails.length === 0) return "No recent emails.";
      const lines = emails.slice(0, 5).map((e) => `- ${e.from}: ${e.subject}`);
      return `You have ${unread} unread out of ${emails.length} recent emails:\n${lines.join("\n")}`;
    }
    case "send_email":
      return `Done — I've sent the email to ${args.to}.`;
    case "get_weather": {
      const w = result as { currentTemp: number; condition: string; high: number; low: number };
      return `It's currently ${w.currentTemp}°C and ${w.condition.toLowerCase()}. High ${w.high}°, low ${w.low}°.`;
    }
    case "remember_fact":
      return "Got it — I'll remember that.";
    default:
      return "Done.";
  }
}

// --- System prompt ---------------------------------------------------

async function buildSystemPrompt(userMessage: string) {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  }).format(now);

  const facts = await getRelevantMemoryFacts(userMessage);
  const memorySection = facts.length > 0
    ? `\n\nRelevant things you know about Shina:\n${facts.map((f) => `- ${f}`).join("\n")}`
    : "";

  return `You are CeeBee, Shina's personal assistant (she/her). Be direct and concise -- 1-3 sentences unless asked for more. Never call a tool unless the request genuinely needs external data or an action. When creating events, add a Meet link only if it sounds like a meeting/call.

Current date/time: ${formatted} (Africa/Lagos). Resolve all relative dates against this exact moment.${memorySection}`;
}

// --- Main entry point ---------------------------------------------------

export async function runAgent(
  userMessage: string,
  refreshToken: string,
  history: HistoryMessage[] = []
) {
  const model = await getCurrentModel();
  const provider = providerForModel(model);

  const allowed = await checkRateLimit(provider);
  if (!allowed) {
    return `CeeBee's temporarily busy (hit her ${provider === "gemini" ? "Gemini" : "Groq"} request limit) — try again in a moment.`;
  }

  const recentHistory = history.slice(-8);
  const tools = selectTools(userMessage);
  const systemPrompt = await buildSystemPrompt(userMessage);

  const start = Date.now();
  const result =
    provider === "gemini"
      ? await callGemini(model, systemPrompt, recentHistory, userMessage, tools)
      : await callGroq(model, systemPrompt, recentHistory, userMessage, tools);
  const latencyMs = Date.now() - start;

  await logUsage({
    model,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
    thoughtTokens: result.usage.thoughtTokens,
    cachedTokens: result.usage.cachedTokens,
    totalTokens: result.usage.totalTokens,
    toolCalls: result.toolCalls.length,
    latencyMs,
  });

  if (result.toolCalls.length === 0) {
    return result.text;
  }

  const summaries: string[] = [];
  for (const call of result.toolCalls) {
    try {
      const toolResult = await executeTool(call.name, call.args, refreshToken);
      summaries.push(formatLocally(call.name, call.args, toolResult));
    } catch (err) {
      summaries.push(`Couldn't complete that: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return summaries.join("\n\n");
}
