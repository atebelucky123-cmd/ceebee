import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration } from "@google/genai";
import { createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { createScheduleEvent, listScheduleEvents } from "@/lib/schedule";
import { listRecentEmails, sendEmail } from "@/lib/gmail";
import { fetchWeather } from "@/lib/weather";
import { getRelevantMemoryFacts, addMemoryFact } from "@/lib/memory";
import { checkRateLimit } from "@/lib/rateLimit";
import { logUsage } from "@/lib/usageLog";
import { getCurrentModel, providerForModel } from "@/lib/settings";
import { todayLagosDateKey } from "@/lib/dateUtils";

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
      "Creates a new event on Shina's Google Calendar, optionally with a Google Meet link and attendees. Only use this for actual calendar meetings/appointments -- when Shina explicitly says 'calendar', wants a Meet link, or wants to invite other people. For anything she just wants tracked on her personal day list (a priority, a reminder, a routine), use create_schedule_event instead.",
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
    description: "Lists events on Shina's actual Google Calendar between now and a number of hours ahead.",
    parameters: {
      type: "object",
      properties: { hoursAhead: { type: "number" } },
    },
  },
  {
    name: "create_schedule_event",
    description:
      "Adds an item to Shina's personal Schedule -- the day list on her dashboard, separate from Google Calendar. This is the default whenever she says 'schedule', 'add to my schedule', or gives a priority level or reminder, or describes something that repeats every day/weekday/weekend. If she lists several items in one message, call this tool once per item, in the same turn -- never stop after the first one, and carry over each item's own priority/time/reminder.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD, the date of the first (or only) occurrence" },
        start_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        end_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        priority: { type: "number", description: "1 (low) to 5 (high). Default 3 if she doesn't say." },
        remind_before_minutes: { type: "number", description: "Minutes before start to remind her -- 5, 10, 30, or 60." },
        meeting_link: { type: "string" },
        recurrence: {
          type: "string",
          description:
            "'none' (default) for a one-off item. 'daily' for 'every day'/'everyday'. 'weekdays' for weekdays/workdays. 'weekends' for weekends. 'custom' for specific days of the week (use recurrence_days).",
        },
        recurrence_days: {
          type: "array",
          items: { type: "number" },
          description: "Only when recurrence is 'custom': 0=Sunday, 1=Monday, ... 6=Saturday.",
        },
      },
      required: ["title", "event_date"],
    },
  },
  {
    name: "list_schedule_events",
    description: "Lists items on Shina's personal Schedule (not Google Calendar) for a given date. Defaults to today if no date is given.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD, defaults to today" } },
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
// "event" and "add" are deliberately routed to BOTH calendar and schedule
// tools -- that keyword alone doesn't say which one the user means, so the
// model is left to decide using the calendar-vs-schedule rules in the
// system prompt, with both tool families actually available to it.

const ROUTES: { keywords: string[]; tools: string[] }[] = [
  { keywords: ["weather", "rain", "temperature", "forecast", "sunny", "cold", "hot"], tools: ["get_weather"] },
  {
    keywords: ["calendar", "meeting", "meet link", "google meet", "invite", "attendee"],
    tools: ["create_calendar_event", "list_upcoming_events"],
  },
  {
    keywords: [
      "schedule", "priority", "remind me", "reminder", "routine", "every day", "everyday",
      "each day", "weekdays", "weekdays only", "weekends", "recurring", "repeat", "repeats",
    ],
    tools: ["create_schedule_event", "list_schedule_events"],
  },
  {
    keywords: ["event", "events", "add", "book"],
    tools: ["create_calendar_event", "list_upcoming_events", "create_schedule_event", "list_schedule_events"],
  },
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

// GPT-OSS's reasoning trace costs real tokens -- keep it off for the simple
// stuff (calendar, weather, chit-chat) and only switch it on when the
// message actually calls for multi-step thinking or planning.
const DEEP_REASONING_KEYWORDS = [
  "plan", "compare", "analyze", "strategy", "should i", "pros and cons",
  "explain why", "think through", "decide between", "help me figure out",
  "write code", "debug", "algorithm",
];

function needsDeepReasoning(message: string): boolean {
  const lower = message.toLowerCase();
  return DEEP_REASONING_KEYWORDS.some((k) => lower.includes(k));
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
  tools: NeutralTool[] | undefined,
  useReasoning: boolean
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

  const body: Record<string, unknown> = {
    model,
    messages,
    // GPT-OSS includes a reasoning trace by default. That's wasted tokens
    // for simple lookups/actions, but genuinely useful for questions that
    // need real multi-step thinking -- toggled per-message, not globally off.
    include_reasoning: useReasoning,
  };
  if (tools) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
    // Lets the model return several tool calls in one response (e.g.
    // several create_schedule_event calls for a multi-item request)
    // instead of only ever emitting one and stopping.
    body.parallel_tool_calls = true;
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
    case "create_schedule_event":
      return createScheduleEvent(args as never);
    case "list_schedule_events":
      return listScheduleEvents((args.date as string | undefined) ?? todayLagosDateKey());
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
      return `Here's what's coming up on your calendar:\n${lines.join("\n")}`;
    }
    case "create_schedule_event": {
      const r = result as { occurrences: number };
      const priority = (args.priority as number | undefined) ?? 3;
      if (r.occurrences > 1) {
        const label =
          args.recurrence === "daily" ? "every day" :
          args.recurrence === "weekdays" ? "on weekdays" :
          args.recurrence === "weekends" ? "on weekends" : "on the days you picked";
        return `Done — added "${args.title}" to your schedule, repeating ${label} (${r.occurrences} days, priority ${priority}).`;
      }
      return `Done — added "${args.title}" to your schedule (priority ${priority}).`;
    }
    case "list_schedule_events": {
      const events = result as { title: string; start_time: string | null; priority: number }[];
      if (events.length === 0) return "Nothing on your schedule for that day.";
      const lines = events.map(
        (e) => `- ${e.title}${e.start_time ? ` (${e.start_time.slice(0, 5)})` : ""} — priority ${e.priority}`
      );
      return `Here's your schedule:\n${lines.join("\n")}`;
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

  return `You are CeeBee, Shina's personal assistant (she/her). Be direct and concise -- 1-3 sentences unless asked for more.

You have two separate places things can go -- never mix them up:
- Google Calendar (create_calendar_event / list_upcoming_events): real calendar meetings and appointments. Only use this when Shina explicitly says "calendar", wants a Google Meet link, or wants to invite other people.
- Her Schedule (create_schedule_event / list_schedule_events): her personal day list on the dashboard, with priority levels and reminders. This is the default any time she says "schedule", gives something a priority, or just wants it tracked for the day -- even if she doesn't name it explicitly.

If Shina lists multiple things to add in one message (numbered or not), call the matching create tool once per item, all in this same turn -- do not stop after the first one. Carry over each item's own priority, time, and reminder exactly as she stated them.

If something repeats "every day"/"everyday", set recurrence to "daily" on create_schedule_event. "Weekdays" or "every weekday" -> "weekdays". "Weekends" -> "weekends". Specific days (e.g. "Mondays and Wednesdays") -> "custom" with recurrence_days (0=Sunday..6=Saturday). Otherwise leave recurrence as "none" -- recurrence only applies to the Schedule, never to Google Calendar events.

Never call a tool unless the request genuinely needs external data or an action. When creating calendar events, add a Meet link only if it sounds like a meeting/call.

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
  const useReasoning = needsDeepReasoning(userMessage);

  const start = Date.now();
  const result =
    provider === "gemini"
      ? await callGemini(model, systemPrompt, recentHistory, userMessage, tools)
      : await callGroq(model, systemPrompt, recentHistory, userMessage, tools, useReasoning);
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
