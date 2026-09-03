import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration } from "@google/genai";
import {
  createCalendarEvent,
  listUpcomingEvents,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/calendar";
import {
  createScheduleEvent,
  listScheduleEvents,
  deleteScheduleEvent,
  updateScheduleEvent,
} from "@/lib/schedule";
import { createTask, listTasks, updateTask, deleteTask } from "@/lib/tasks";
import { createNote, listNotes, updateNote, deleteNote } from "@/lib/notes";
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
// needs a real JSON Schema. `nullable` is applied automatically (see
// markOptionalNullable below) to every property that isn't `required`,
// because both GPT-OSS (via Groq) and Gemini will sometimes explicitly
// send `null` for a field it has no value for, rather than omitting the
// key -- and a plain `{ type: "string" }` schema rejects that outright.

type NeutralProperty = {
  type: string;
  description?: string;
  items?: { type: string };
  nullable?: boolean;
};

type NeutralTool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, NeutralProperty>;
    required?: string[];
  };
};

function markOptionalNullable(tool: NeutralTool): NeutralTool {
  const required = new Set(tool.parameters.required ?? []);
  const properties = Object.fromEntries(
    Object.entries(tool.parameters.properties).map(([key, val]) => [
      key,
      required.has(key) ? val : { ...val, nullable: true },
    ])
  );
  return { ...tool, parameters: { ...tool.parameters, properties } };
}

const RAW_TOOLS: NeutralTool[] = [
  {
    name: "create_calendar_event",
    description:
      "Creates a new event on Shina's Google Calendar, optionally with a Google Meet link and attendees. Only use this for actual calendar meetings/appointments -- when Shina explicitly says 'calendar', wants a Meet link, or wants to invite other people. For anything she just wants tracked on her personal day list (a priority, a reminder, a routine), use create_schedule_event instead. For a plain checkbox to-do with no time attached, use create_task.",
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
    description: "Lists events on Shina's actual Google Calendar between now and a number of hours ahead, including each event's id. Call this before delete_calendar_event if you don't already know the event's id.",
    parameters: {
      type: "object",
      properties: { hoursAhead: { type: "number" } },
    },
  },
  {
    name: "delete_calendar_event",
    description: "Deletes an event from Shina's Google Calendar. Requires its id -- if you don't already have it from an earlier list_upcoming_events call in this conversation, call list_upcoming_events first to find the matching event by title/time.",
    parameters: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Edits an existing Google Calendar event's title, description, or time. Requires its id -- if you don't already have it, call list_upcoming_events first to find the matching event by title/time. Only pass the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 datetime" },
        endTime: { type: "string", description: "ISO 8601 datetime" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "create_schedule_event",
    description:
      "Adds an item to Shina's personal Schedule -- the day list on her dashboard, separate from Google Calendar. This is the default whenever she says 'schedule', gives something a priority level or reminder, or describes something that repeats every day/weekday/weekend. If she lists several items in one message, call this tool once per item, in the same turn -- carry over each item's own priority/time/reminder exactly as she stated them.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD, the date of the first (or only) occurrence" },
        start_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        end_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        priority: { type: "number", description: "1 (low) to 5 (high). Default 3 if she doesn't say." },
        remind_before_minutes: {
          type: "number",
          description:
            "Minutes before start to notify her -- 5, 10, 30, or 60. If she used the word 'reminder' but didn't say how far in advance, set this to 0 (notify right at the start time) rather than leaving it out -- omitting it entirely means no notification ever fires.",
        },
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
    description: "Lists items on Shina's personal Schedule (not Google Calendar) for a given date, including each item's id. Defaults to today if no date is given. Call this before delete_schedule_event if you don't already know the item's id.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD, defaults to today" } },
    },
  },
  {
    name: "delete_schedule_event",
    description: "Deletes an item from Shina's personal Schedule. Requires its id -- if you don't already have it from an earlier list_schedule_events call in this conversation, call list_schedule_events first to find the matching item by title/date.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        scope: {
          type: "string",
          description: "'single' (default) deletes just this occurrence. 'series' deletes this and every future occurrence in the same recurring series.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_schedule_event",
    description: "Edits one existing item on Shina's Schedule -- title, date, time, priority, reminder, or meeting link. Requires its id -- if you don't already have it from earlier in this conversation, call list_schedule_events first to find the matching item by title/date. Only pass the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM, 24-hour" },
        end_time: { type: "string", description: "HH:MM, 24-hour" },
        priority: { type: "number", description: "1 (low) to 5 (high)." },
        remind_before_minutes: { type: "number", description: "0 = right at start time." },
        meeting_link: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_task",
    description:
      "Adds a plain checkbox to-do to Shina's Tasks list -- distinct from her Schedule (no priority) and Calendar (no meeting time). Use this when she says 'task' or 'to-do', or just wants something to check off. Pass her wording through exactly as she said it -- do not paraphrase, correct, or reword it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD, optional" },
        start_time: { type: "string", description: "HH:MM, optional" },
        end_time: { type: "string", description: "HH:MM, optional" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "Lists everything on Shina's Tasks list, including each task's id and done status. Call this before update_task or delete_task if you don't already know the task's id.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_task",
    description: "Edits or completes an existing task. Requires its id -- if you don't already have it from earlier in this conversation, call list_tasks first to find the matching one by title. Only pass the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM" },
        end_time: { type: "string", description: "HH:MM" },
        done: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Deletes a task. Requires its id -- if you don't already have it, call list_tasks first to find the matching one by title.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description:
      "Saves a freeform note for Shina -- something she wants written down verbatim, not an action item. Pass her wording through exactly as she said or typed it, typos and all -- never paraphrase, correct, or substitute her own content with different wording.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["body"],
    },
  },
  {
    name: "list_notes",
    description: "Lists Shina's saved notes, including each note's id. Call this before update_note or delete_note if you don't already know the note's id.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_note",
    description: "Edits an existing note's title or body. Requires its id -- if you don't already have it, call list_notes first to find the matching one. Pass her new wording through exactly as she said or typed it.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_note",
    description: "Deletes a note. Requires its id -- if you don't already have it, call list_notes first to find the matching one.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
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
    description: "Gets the weather forecast for the user's location (defaults to Lagos, Nigeria) for a given day.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "number",
          description: "0 = today (current conditions, default). 1 = tomorrow. Up to 6 = six days ahead. Use the day that matches what Shina asked for.",
        },
      },
    },
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

const ALL_TOOLS: NeutralTool[] = RAW_TOOLS.map(markOptionalNullable);

// --- Dynamic tool routing -------------------------------------------------
// "event"/"add"/"book" are deliberately routed to every create/list tool --
// that keyword alone doesn't say which destination the user means, so the
// model is left to decide using the calendar/schedule/task/note rules in
// the system prompt, with all of them actually available to it.

const ROUTES: { keywords: string[]; tools: string[] }[] = [
  { keywords: ["weather", "rain", "temperature", "forecast", "sunny", "cold", "hot"], tools: ["get_weather"] },
  {
    keywords: ["calendar", "meeting", "meet link", "google meet", "invite", "attendee"],
    tools: ["create_calendar_event", "list_upcoming_events", "delete_calendar_event", "update_calendar_event"],
  },
  {
    keywords: [
      "schedule", "priority", "remind me", "reminder", "routine", "every day", "everyday",
      "each day", "weekdays", "weekends", "recurring", "repeat", "repeats",
    ],
    tools: ["create_schedule_event", "list_schedule_events", "delete_schedule_event", "update_schedule_event"],
  },
  {
    keywords: ["task", "to-do", "todo", "checklist"],
    tools: ["create_task", "list_tasks", "update_task", "delete_task"],
  },
  {
    keywords: ["note", "jot down", "write down", "write this down"],
    tools: ["create_note", "list_notes", "update_note", "delete_note"],
  },
  {
    keywords: ["delete", "remove", "cancel that", "get rid of", "clear"],
    tools: [
      "delete_schedule_event", "delete_calendar_event", "delete_task", "delete_note",
      "list_schedule_events", "list_upcoming_events", "list_tasks", "list_notes",
    ],
  },
  {
    keywords: ["edit", "change", "update", "rename", "modify", "reschedule"],
    tools: [
      "update_schedule_event", "list_schedule_events",
      "update_calendar_event", "list_upcoming_events",
      "update_task", "list_tasks",
      "update_note", "list_notes",
    ],
  },
  {
    // "tomorrow"/"next week" etc are ambiguous across Schedule, Calendar,
    // and Weather -- surface lookups for all three and let the model (with
    // the system prompt's date-resolution rule) pick what's actually being
    // asked about.
    keywords: ["tomorrow", "next week", "this week", "what's on", "what do i have", "my day", "coming up"],
    tools: ["list_schedule_events", "list_upcoming_events", "get_weather"],
  },
  {
    keywords: ["event", "events", "add", "book"],
    tools: [
      "create_calendar_event", "list_upcoming_events",
      "create_schedule_event", "list_schedule_events",
      "create_task", "create_note",
    ],
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

// --- Tool execution -----------------------------------------------------
// Central switch used by both providers' loops below. Throws on failure --
// callers wrap this so a failed tool shows up as an honest error in the
// executed-calls list rather than crashing the whole request.

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  refreshToken: string,
  location: { lat: number; lon: number } | null
) {
  switch (name) {
    case "create_calendar_event":
      return createCalendarEvent(refreshToken, args as never);
    case "list_upcoming_events":
      return listUpcomingEvents(refreshToken, (args.hoursAhead as number) ?? 24);
    case "delete_calendar_event":
      return deleteCalendarEvent(refreshToken, args.eventId as string);
    case "update_calendar_event":
      return updateCalendarEvent(refreshToken, args.eventId as string, args as never);
    case "create_schedule_event":
      return createScheduleEvent(args as never);
    case "list_schedule_events":
      return listScheduleEvents((args.date as string | undefined) ?? todayLagosDateKey());
    case "delete_schedule_event":
      return deleteScheduleEvent(
        args.id as string,
        (args.scope as "single" | "series" | undefined) ?? "single"
      );
    case "update_schedule_event":
      return updateScheduleEvent(args.id as string, args as never);
    case "create_task":
      return createTask(args as never);
    case "list_tasks":
      return listTasks();
    case "update_task":
      return updateTask(args.id as string, args as never);
    case "delete_task":
      return deleteTask(args.id as string);
    case "create_note":
      return createNote(args as never);
    case "list_notes":
      return listNotes();
    case "update_note":
      return updateNote(args.id as string, args as never);
    case "delete_note":
      return deleteNote(args.id as string);
    case "list_recent_emails":
      return listRecentEmails(refreshToken, (args.maxResults as number) ?? 10);
    case "send_email":
      return sendEmail(refreshToken, args.to as string, args.subject as string, args.body as string);
    case "get_weather":
      // Falls back to the DEFAULT_LAT/DEFAULT_LON (Lagos) constant only
      // when the browser didn't supply real coordinates -- previously this
      // always used the default, so chat's weather answers could silently
      // disagree with the Weather page (which uses real geolocation) for
      // anyone not physically in that exact default spot.
      return location ? fetchWeather(location.lat, location.lon) : fetchWeather();
    case "remember_fact":
      await addMemoryFact(args.fact as string, (args.category as string | undefined) ?? "general");
      return { saved: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// A remind_before_minutes value of 0 is a real, intentional setting ("notify
// right at start time") -- so this checks for null/undefined specifically,
// never falsy, or a genuine 0 would silently print nothing.
function remindPhrase(remindBeforeMinutes: unknown): string {
  if (remindBeforeMinutes === null || remindBeforeMinutes === undefined) return "";
  const mins = remindBeforeMinutes as number;
  return mins === 0
    ? " I'll remind you right when it starts."
    : ` I'll remind you ${mins} minutes before.`;
}

// Turns one executed tool call's result into the sentence(s) shown to
// Shina. This -- not anything the model writes itself -- is the only
// source of "Done" confirmations, so CeeBee can never claim an action
// succeeded that a tool didn't actually perform.
function formatLocally(name: string, args: Record<string, unknown>, result: unknown): string {
  switch (name) {
    case "create_calendar_event": {
      const r = result as { meetLink: string | null };
      const meet = r.meetLink ? ` I've added a Google Meet link.` : "";
      return `Done — I've added "${args.title}" to your calendar.${meet}`;
    }
    case "list_upcoming_events": {
      const events = result as { id: string; title: string; start: string; meetLink: string | null }[];
      if (events.length === 0) return "You have nothing coming up on your calendar.";
      const lines = events.map((e) => {
        const time = new Date(e.start).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
        return `- ${e.title} (${time})${e.meetLink ? " — has a Meet link" : ""}`;
      });
      return `Here's what's coming up on your calendar:\n${lines.join("\n")}`;
    }
    case "delete_calendar_event":
      return "Done — removed that from your calendar.";
    case "update_calendar_event": {
      const r = result as { title: string | null };
      return `Done — updated "${r.title ?? args.title ?? "that event"}" on your calendar.`;
    }
    case "create_schedule_event": {
      const r = result as { occurrences: number };
      const priority = (args.priority as number | undefined) ?? 3;
      const time = args.start_time ? ` at ${args.start_time}` : "";
      const remind = remindPhrase(args.remind_before_minutes);
      if (r.occurrences > 1) {
        const label =
          args.recurrence === "daily" ? "every day" :
          args.recurrence === "weekdays" ? "on weekdays" :
          args.recurrence === "weekends" ? "on weekends" : "on the days you picked";
        return `Done — added "${args.title}"${time} to your schedule, repeating ${label} (${r.occurrences} days, priority ${priority}).${remind}`;
      }
      return `Done — added "${args.title}"${time} to your schedule (priority ${priority}).${remind}`;
    }
    case "list_schedule_events": {
      const events = result as { id: string; title: string; start_time: string | null; priority: number; remind_before_minutes: number | null }[];
      if (events.length === 0) return "Nothing on your schedule for that day.";
      const lines = events.map(
        (e) =>
          `- ${e.title}${e.start_time ? ` (${e.start_time.slice(0, 5)})` : ""} — priority ${e.priority}${
            e.remind_before_minutes != null ? " ⏰" : ""
          }`
      );
      return `Here's your schedule:\n${lines.join("\n")}`;
    }
    case "delete_schedule_event": {
      const r = result as { scope: "single" | "series" };
      return r.scope === "series"
        ? "Done — removed that and every future occurrence from your schedule."
        : "Done — removed that from your schedule.";
    }
    case "update_schedule_event": {
      const r = result as { event: { title: string; priority: number; start_time: string | null; remind_before_minutes: number | null } };
      const bits: string[] = [];
      if (args.priority !== undefined) bits.push(`priority now ${r.event.priority}`);
      if (args.start_time !== undefined) bits.push(`time now ${r.event.start_time?.slice(0, 5)}`);
      if (args.event_date !== undefined) bits.push(`date now ${args.event_date}`);
      const remind = remindPhrase(args.remind_before_minutes);
      const detail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
      return `Done — updated "${r.event.title}"${detail}.${remind}`;
    }
    case "create_task":
      return `Done — added "${args.title}" to your tasks.`;
    case "list_tasks": {
      const tasks = result as { id: string; title: string; done: boolean }[];
      if (tasks.length === 0) return "Your task list is empty.";
      const lines = tasks.map((t) => `- ${t.done ? "✓ " : ""}${t.title}`);
      return `Here's your tasks:\n${lines.join("\n")}`;
    }
    case "update_task": {
      const r = result as { task: { title: string; done: boolean } };
      if (args.done === true) return `Done — marked "${r.task.title}" complete.`;
      if (args.done === false) return `Done — marked "${r.task.title}" not done.`;
      return `Done — updated "${r.task.title}".`;
    }
    case "delete_task":
      return "Done — removed that task.";
    case "create_note":
      return "Done — saved that note.";
    case "list_notes": {
      const notes = result as { id: string; title: string | null; body: string }[];
      if (notes.length === 0) return "You don't have any notes saved.";
      const lines = notes.map((n) => `- ${n.title ? `${n.title}: ` : ""}${n.body.slice(0, 60)}`);
      return `Here's your notes:\n${lines.join("\n")}`;
    }
    case "update_note":
      return "Done — updated that note.";
    case "delete_note":
      return "Done — deleted that note.";
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
      const w = result as {
        currentTemp: number; condition: string; high: number; low: number;
        daily: { date: string; high: number; low: number; condition: string; precipChance: number }[];
      };
      const day = (args.day as number | undefined) ?? 0;
      if (day === 0) {
        return `It's currently ${w.currentTemp}°C and ${w.condition.toLowerCase()}. High ${w.high}°, low ${w.low}°.`;
      }
      const d = w.daily[day];
      if (!d) return "I can only see the next 7 days of forecast.";
      const label = day === 1 ? "Tomorrow" : new Date(d.date).toLocaleDateString("en-GB", { weekday: "long" });
      const rain = d.precipChance ? `, ${d.precipChance}% chance of rain` : "";
      return `${label}: ${d.condition.toLowerCase()}, high ${d.high}°, low ${d.low}°${rain}.`;
    }
    case "remember_fact":
      return "Got it — I'll remember that.";
    default:
      return "Done.";
  }
}

// --- Provider adapters -----------------------------------------------------

type ExecutedCall = { name: string; args: Record<string, unknown>; result: unknown };

type ProviderResult = {
  text: string;
  executed: ExecutedCall[];
  usage: {
    promptTokens?: number;
    outputTokens?: number;
    thoughtTokens?: number;
    cachedTokens?: number;
    totalTokens?: number;
  };
};

type HistoryMessage = { role: "user" | "model"; parts: { text: string }[] };

// How many back-and-forth tool rounds a single request is allowed before
// CeeBee is forced to wrap up with whatever she's completed so far. Keeps
// a confused model from looping forever instead of just answering.
const MAX_TOOL_ROUNDS = 5;

function addUsage(
  total: ProviderResult["usage"],
  add: Partial<Record<keyof ProviderResult["usage"], number | undefined>>
) {
  for (const key of Object.keys(add) as (keyof ProviderResult["usage"])[]) {
    const v = add[key];
    if (v === undefined) continue;
    total[key] = (total[key] ?? 0) + v;
  }
}

// Runs one tool call, guarding against re-doing something already done
// earlier in this same request -- this is what stops "add A and B" from
// creating duplicate rows when a model re-emits a call it already made.
async function runToolOnce(
  call: { name: string; args: Record<string, unknown> },
  refreshToken: string,
  seenSignatures: Set<string>,
  executed: ExecutedCall[],
  location: { lat: number; lon: number } | null
): Promise<unknown> {
  const signature = `${call.name}:${JSON.stringify(call.args)}`;
  let result: unknown;
  if (seenSignatures.has(signature)) {
    result = { skipped: true, reason: "Already done earlier in this same request." };
  } else {
    seenSignatures.add(signature);
    try {
      result = await executeTool(call.name, call.args, refreshToken, location);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
  executed.push({ name: call.name, args: call.args, result });
  return result;
}

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
            nullable: val.nullable,
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
  tools: NeutralTool[] | undefined,
  refreshToken: string,
  location: { lat: number; lon: number } | null
): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in your .env file.");

  const ai = new GoogleGenAI({ apiKey });

  // Mutable conversation transcript -- grows with each tool round so the
  // model sees its own prior calls and their real results before deciding
  // whether it needs to do anything else. Typed loosely (not against the
  // SDK's exact Content/Part types) because we build these objects by
  // hand across three different shapes (text, functionCall passthrough,
  // functionResponse) and don't want a future SDK type-narrowing to break
  // the build again over what is, at runtime, already the correct shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    ...history.map((m) => ({ role: m.role, parts: m.parts.map((p) => ({ text: p.text })) })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const config: Record<string, unknown> = {
    systemInstruction: systemPrompt,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (tools) config.tools = [{ functionDeclarations: toGeminiDeclarations(tools) }];

  const executed: ExecutedCall[] = [];
  const seenSignatures = new Set<string>();
  const totalUsage: ProviderResult["usage"] = {};
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
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
    addUsage(totalUsage, {
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      thoughtTokens: usage?.thoughtsTokenCount,
      cachedTokens: usage?.cachedContentTokenCount,
      totalTokens: usage?.totalTokenCount,
    });

    const calls = (response.functionCalls ?? []).map((c) => ({
      name: c.name!,
      args: (c.args as Record<string, unknown>) ?? {},
    }));

    if (calls.length === 0) {
      finalText = response.text ?? "";
      break;
    }

    // Preserve the model's actual turn (with its functionCall parts) so
    // the next round's request is a faithful continuation of this one.
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const functionResponseParts = [];
    for (const call of calls) {
      const result = await runToolOnce(call, refreshToken, seenSignatures, executed, location);
      functionResponseParts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: functionResponseParts });
  }

  return { text: finalText, executed, usage: totalUsage };
}

async function callGroq(
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  tools: NeutralTool[] | undefined,
  useReasoning: boolean,
  refreshToken: string,
  location: { lat: number; lon: number } | null
): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in your .env file.");

  // Mutable OpenAI-style message list -- grows with each tool round.
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.parts.map((p) => p.text).join(" "),
    })),
    { role: "user", content: userMessage },
  ];

  const groqTools = tools?.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([key, val]) => [
            key,
            {
              // A nullable optional field becomes a real JSON Schema union
              // type ["string", "null"], so GPT-OSS explicitly sending
              // null for a field it has nothing to fill in doesn't get
              // rejected by Groq's strict tool-call validator.
              type: val.nullable ? [val.type, "null"] : val.type,
              description: val.description,
              items: val.items,
            },
          ])
        ),
        required: t.parameters.required,
      },
    },
  }));

  const executed: ExecutedCall[] = [];
  const seenSignatures = new Set<string>();
  const totalUsage: ProviderResult["usage"] = {};
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model,
      messages,
      // GPT-OSS includes a reasoning trace by default. That's wasted tokens
      // for simple lookups/actions, but genuinely useful for questions that
      // need real multi-step thinking -- toggled per-message, not globally off.
      include_reasoning: useReasoning,
    };
    if (groqTools) {
      body.tools = groqTools;
      body.tool_choice = "auto";
      // Lets the model return several tool calls in one response (e.g.
      // several create_schedule_event calls for a multi-item request).
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
    addUsage(totalUsage, {
      promptTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    });

    const message = data.choices?.[0]?.message ?? {};
    const rawToolCalls = (message.tool_calls ?? []) as {
      id: string;
      function: { name: string; arguments: string };
    }[];

    if (rawToolCalls.length === 0) {
      finalText = message.content ?? "";
      break;
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: rawToolCalls });

    for (const tc of rawToolCalls) {
      const call = { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") };
      const result = await runToolOnce(call, refreshToken, seenSignatures, executed, location);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return { text: finalText, executed, usage: totalUsage };
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

You have four separate places things can go -- never mix them up. Each one now has full create/list/edit/delete tools:
- Google Calendar (create_calendar_event / list_upcoming_events / update_calendar_event / delete_calendar_event): real calendar meetings and appointments. Only use this when Shina explicitly says "calendar", wants a Google Meet link, or wants to invite other people.
- Her Schedule (create_schedule_event / list_schedule_events / update_schedule_event / delete_schedule_event): her personal day list, with priority levels and reminders. This is the default any time she says "schedule", gives something a priority, or wants it tracked for the day.
- Her Tasks (create_task / list_tasks / update_task / delete_task): a plain checkbox to-do with no priority and no specific time requirement. Use this when she says "task" or "to-do".
- Her Notes (create_note / list_notes / update_note / delete_note): freeform text she wants saved verbatim, not an action item.

If Shina lists multiple things to add in one message (numbered or not), call the matching create tool once per item, all in this same turn -- do not stop after the first one. Carry over each item's own priority, time, and reminder exactly as she stated them.

If something repeats "every day"/"everyday", set recurrence to "daily" on create_schedule_event. "Weekdays" or "every weekday" -> "weekdays". "Weekends" -> "weekends". Specific days (e.g. "Mondays and Wednesdays") -> "custom" with recurrence_days (0=Sunday..6=Saturday). Recurrence only applies to the Schedule, never to Google Calendar or Tasks.

To delete, remove, or edit/change something, you need its id first. If you don't already have it from earlier in this conversation, call the matching list tool first (list_schedule_events, list_upcoming_events, list_tasks, or list_notes), find the item that matches what Shina described, then call the delete or update tool with its id. Every destination has both an edit and a delete tool now -- Calendar, Schedule, Tasks, and Notes -- so never tell her something can't be edited or deleted; look its id up and do it. When editing, only pass the fields that are actually changing. Never tell her something was deleted, added, or changed unless a tool actually returned a real result confirming it -- if you're not certain, say so plainly instead of guessing.

If Shina asks for a "reminder" specifically (not just a plain schedule item), you must set remind_before_minutes on create_schedule_event or update_schedule_event -- default it to 0 (notify right when it starts) if she doesn't say how far in advance. A schedule item with remind_before_minutes left unset produces no notification at all, so never skip it when she used the word "reminder" or "remind me".

When saving a note or a task, pass Shina's own wording through exactly as she said or typed it -- do not fix, rephrase, or substitute her words with different terms, even if they contain typos or seem unusual. If something is genuinely ambiguous, ask rather than guessing at what she meant.

Never call a tool unless the request genuinely needs external data or an action. When creating calendar events, add a Meet link only if it sounds like a meeting/call. For weather, use the "day" parameter to match what Shina actually asked for (0 = today, 1 = tomorrow, etc.) rather than always answering with today's conditions.

When Shina asks what's on her schedule or calendar for a day other than today ("tomorrow", "next Tuesday", "next week", a specific date), work out the actual YYYY-MM-DD date against the current date/time below and pass it as the date parameter to list_schedule_events -- don't default to today just because she didn't spell out a full date.

Current date/time: ${formatted} (Africa/Lagos). Resolve all relative dates against this exact moment.${memorySection}`;
}

// --- Main entry point ---------------------------------------------------

export async function runAgent(
  userMessage: string,
  refreshToken: string,
  history: HistoryMessage[] = [],
  location: { lat: number; lon: number } | null = null
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
      ? await callGemini(model, systemPrompt, recentHistory, userMessage, tools, refreshToken, location)
      : await callGroq(model, systemPrompt, recentHistory, userMessage, tools, useReasoning, refreshToken, location);
  const latencyMs = Date.now() - start;

  await logUsage({
    model,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
    thoughtTokens: result.usage.thoughtTokens,
    cachedTokens: result.usage.cachedTokens,
    totalTokens: result.usage.totalTokens,
    toolCalls: result.executed.length,
    latencyMs,
  });

  if (result.executed.length === 0) {
    return result.text || "I didn't quite catch what you needed there -- could you rephrase?";
  }

  const summaries: string[] = [];
  for (const call of result.executed) {
    const r = call.result as Record<string, unknown> | null | undefined;
    if (r && typeof r === "object" && "skipped" in r) {
      // Duplicate call caught by dedup -- don't clutter the reply with it,
      // just skip silently (server logs still show it happened).
      console.warn(`CeeBee: skipped duplicate tool call ${call.name}`, call.args);
      continue;
    }
    if (r && typeof r === "object" && "error" in r) {
      summaries.push(`Couldn't complete that (${call.name.replace(/_/g, " ")}): ${r.error}`);
      continue;
    }
    summaries.push(formatLocally(call.name, call.args, call.result));
  }

  return summaries.length > 0 ? summaries.join("\n\n") : "Done.";
}

// --- Conversation titling -------------------------------------------------
// Generates a short (3-6 word) summary title from the first exchange, the
// same way Gemini/ChatGPT rename a chat after your first message instead of
// just truncating it. Runs once, after the first reply, and is best-effort:
// if it fails (rate limit, etc.) the caller just keeps whatever title it
// already set (the old truncated-message fallback), so a failure here never
// breaks the conversation itself.
export async function generateConversationTitle(userMessage: string, reply: string): Promise<string | null> {
  const model = await getCurrentModel();
  const provider = providerForModel(model);
  const prompt = `Summarize this exchange as a short chat title, 3-6 words, no quotes, no trailing punctuation, no emoji.\n\nUser: ${userMessage}\nAssistant: ${reply}\n\nTitle:`;

  try {
    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return null;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, maxOutputTokens: 20 },
      });
      return cleanTitle(response.text ?? "");
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        include_reasoning: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return cleanTitle(data.choices?.[0]?.message?.content ?? "");
  } catch {
    // Best-effort -- a titling failure should never surface to the user.
    return null;
  }
}

function cleanTitle(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").replace(/[.!]+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : null;
}
