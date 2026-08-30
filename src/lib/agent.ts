import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration } from "@google/genai";
import { createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { listRecentEmails, sendEmail } from "@/lib/gmail";
import { fetchWeather } from "@/lib/weather";
import { getRelevantMemoryFacts, addMemoryFact } from "@/lib/memory";
import { checkRateLimit } from "@/lib/rateLimit";
import { logUsage } from "@/lib/usageLog";

// --- Tool definitions -------------------------------------------------

const ALL_TOOLS: FunctionDeclaration[] = [
  {
    name: "create_calendar_event",
    description:
      "Creates a new event on the user's Google Calendar, optionally with a Google Meet link and attendees.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        startTime: {
          type: Type.STRING,
          description: "ISO 8601 datetime, e.g. 2026-09-02T15:00:00+01:00",
        },
        endTime: { type: Type.STRING, description: "ISO 8601 datetime" },
        attendeeEmails: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        createMeetLink: { type: Type.BOOLEAN },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "list_upcoming_events",
    description:
      "Lists the user's calendar events between now and a number of hours ahead.",
    parameters: {
      type: Type.OBJECT,
      properties: { hoursAhead: { type: Type.NUMBER } },
    },
  },
  {
    name: "list_recent_emails",
    description: "Lists the most recent emails in the user's inbox.",
    parameters: {
      type: Type.OBJECT,
      properties: { maxResults: { type: Type.NUMBER } },
    },
  },
  {
    name: "send_email",
    description: "Sends an email from the user's connected account.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING },
        subject: { type: Type.STRING },
        body: { type: Type.STRING },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "get_weather",
    description:
      "Gets the current weather and forecast for the user's location (defaults to Lagos, Nigeria).",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "remember_fact",
    description:
      "Saves a durable fact about Shina for future conversations. Only call this when the user shares something worth remembering long-term.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fact: { type: Type.STRING },
        category: {
          type: Type.STRING,
          description: "e.g. 'preference', 'project', 'person', 'routine'",
        },
      },
      required: ["fact"],
    },
  },
];

// --- Dynamic tool routing -------------------------------------------------
// Sending all 6 tool schemas on every request costs tokens even when the
// message is "good morning". Route to a relevant subset by keyword, and to
// NO tools at all for plain conversation -- both cut tokens and avoid
// pointless tool-call rounds.

const ROUTES: { keywords: string[]; tools: string[] }[] = [
  {
    keywords: ["weather", "rain", "temperature", "forecast", "sunny", "cold", "hot"],
    tools: ["get_weather"],
  },
  {
    keywords: ["calendar", "event", "meeting", "schedule", "meet link", "invite"],
    tools: ["create_calendar_event", "list_upcoming_events"],
  },
  {
    keywords: ["email", "inbox", "gmail", "reply", "message from"],
    tools: ["list_recent_emails", "send_email"],
  },
  {
    keywords: ["remember", "don't forget", "keep in mind", "note that"],
    tools: ["remember_fact"],
  },
];

function selectTools(message: string): FunctionDeclaration[] | undefined {
  const lower = message.toLowerCase();
  const matchedNames = new Set<string>();

  for (const route of ROUTES) {
    if (route.keywords.some((k) => lower.includes(k))) {
      route.tools.forEach((t) => matchedNames.add(t));
    }
  }

  if (matchedNames.size === 0) return undefined; // plain chat, no tools at all
  return ALL_TOOLS.filter((t) => t.name && matchedNames.has(t.name));
}

// --- Tool execution -----------------------------------------------------

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  refreshToken: string
) {
  switch (name) {
    case "create_calendar_event":
      return createCalendarEvent(refreshToken, args as never);
    case "list_upcoming_events":
      return listUpcomingEvents(refreshToken, (args.hoursAhead as number) ?? 24);
    case "list_recent_emails":
      return listRecentEmails(refreshToken, (args.maxResults as number) ?? 10);
    case "send_email":
      return sendEmail(
        refreshToken,
        args.to as string,
        args.subject as string,
        args.body as string
      );
    case "get_weather":
      return fetchWeather();
    case "remember_fact":
      await addMemoryFact(
        args.fact as string,
        (args.category as string | undefined) ?? "general"
      );
      return { saved: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Local response formatting -------------------------------------------
// Skips a second Gemini call for every tool result. This is the single
// biggest win for both cost and Gemini's free-tier RPM limit: most
// interactions become exactly 1 Gemini request instead of 2+.

function formatLocally(name: string, args: Record<string, unknown>, result: unknown): string {
  switch (name) {
    case "create_calendar_event": {
      const r = result as { meetLink: string | null };
      const meet = r.meetLink ? ` I've added a Google Meet link.` : "";
      return `Done — I've added "${args.title}" to your calendar.${meet}`;
    }
    case "list_upcoming_events": {
      const events = result as {
        title: string;
        start: string;
        meetLink: string | null;
      }[];
      if (events.length === 0) return "You have nothing coming up.";
      const lines = events.map((e) => {
        const time = new Date(e.start).toLocaleString("en-GB", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `- ${e.title} (${time})${e.meetLink ? " — has a Meet link" : ""}`;
      });
      return `Here's what's coming up:\n${lines.join("\n")}`;
    }
    case "list_recent_emails": {
      const emails = result as { from: string; subject: string; unread: boolean }[];
      const unread = emails.filter((e) => e.unread).length;
      if (emails.length === 0) return "No recent emails.";
      const lines = emails
        .slice(0, 5)
        .map((e) => `- ${e.from}: ${e.subject}`);
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
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(now);

  const facts = await getRelevantMemoryFacts(userMessage);
  const memorySection =
    facts.length > 0
      ? `\n\nRelevant things you know about Shina:\n${facts.map((f) => `- ${f}`).join("\n")}`
      : "";

  return `You are CeeBee, Shina's personal assistant (she/her). Be direct and concise -- 1-3 sentences unless asked for more. Never call a tool unless the request genuinely needs external data or an action. When creating events, add a Meet link only if it sounds like a meeting/call.

Current date/time: ${formatted} (Africa/Lagos). Resolve all relative dates against this exact moment.${memorySection}`;
}

type HistoryMessage = { role: "user" | "model"; parts: { text: string }[] };

// Runs one turn. Optimized to target ~1 Gemini request per interaction:
// history is capped, tools are routed by keyword (or omitted entirely for
// plain chat), and tool results are formatted locally instead of costing a
// second model call.
export async function runAgent(
  userMessage: string,
  refreshToken: string,
  history: HistoryMessage[] = []
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in your .env file.");

  const allowed = await checkRateLimit();
  if (!allowed) {
    return "CeeBee's temporarily busy (hit her request limit) — try again in a moment.";
  }

  const ai = new GoogleGenAI({ apiKey });

  // Cap to the last 8 messages -- old turns don't need to be resent forever.
  const recentHistory = history.slice(-8);

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    ...recentHistory.map((m) => ({
      role: m.role,
      parts: m.parts.map((p) => ({ text: p.text })),
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const tools = selectTools(userMessage);
  const config: Record<string, unknown> = {
    systemInstruction: await buildSystemPrompt(userMessage),
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (tools) config.tools = [{ functionDeclarations: tools }];

  const start = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents,
    config,
  });
  const latencyMs = Date.now() - start;

  const usage = response.usageMetadata as
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        cachedContentTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;

  const calls = response.functionCalls ?? [];

  await logUsage({
    model: "gemini-3.6-flash",
    promptTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    thoughtTokens: usage?.thoughtsTokenCount,
    cachedTokens: usage?.cachedContentTokenCount,
    totalTokens: usage?.totalTokenCount,
    toolCalls: calls.length,
    latencyMs,
  });

  if (calls.length === 0) {
    return response.text ?? "";
  }

  // Execute every tool call Gemini requested and format each result
  // locally -- no second model round-trip needed.
  const summaries: string[] = [];
  for (const call of calls) {
    const args = (call.args as Record<string, unknown>) ?? {};
    try {
      const result = await executeTool(call.name!, args, refreshToken);
      summaries.push(formatLocally(call.name!, args, result));
    } catch (err) {
      summaries.push(
        `Couldn't complete that: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  return summaries.join("\n\n");
}
