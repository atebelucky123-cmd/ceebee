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
import { listRecentEmails, getFullEmailBody, getEmailMeta, markEmailsRead, isMissingScopeError } from "@/lib/gmail";
import { getAgenda, getWeatherCached } from "@/lib/agenda";
import { buildDayContext, describeDayContext, type DayContext } from "@/lib/context";
import { getRelevantMemoryFacts, addMemoryFact } from "@/lib/memory";
import { checkRateLimit } from "@/lib/rateLimit";
import { logUsage } from "@/lib/usageLog";
import { getCurrentModel, providerForModel, SUMMARY_MODEL } from "@/lib/settings";
import { isReconnectError, pickAccount, type GoogleAccount } from "@/lib/accounts";
import { labelForKey, lagosParts, toMinutes } from "@/lib/time";
import { cardsDigest, type AgentReply, type Card, type AgendaCardItem } from "@/lib/cards";
import type { FullWeatherData } from "@/lib/weather";

// =========================================================================
// CeeBee v2 ("Hive") agent.
//
// What changed from v1, and why:
//  - She knows the day before you ask. A live snapshot of today/tomorrow
//    (Schedule + Calendar merged), open tasks, forecast and noticed clashes
//    is in every system prompt, with real ids -- so she can answer and act
//    without a lookup round-trip.
//  - Her own words survive. v1 discarded the model's reply whenever a tool
//    ran and printed canned "Done --" lines instead; now she says what she
//    did and offers the next step (the Hive brand voice), while *proof*
//    of what happened comes from cards built only from real tool results.
//  - Tappable next steps. She ends with up to 3 suggestion chips.
//  - She drafts, you send. send_email is gone from her toolset; draft_email
//    produces a card with Send/Edit, and only Shina's tap sends it.
//  - Follow-ups work. "Yes, move it" has no keywords, so short follow-ups
//    inherit the tool set of the turn before.
// =========================================================================

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
    name: "show_schedule",
    description:
      "Shows Shina a card of everything on a day -- her Schedule and Google Calendar merged, in time order, with rain warnings. Call this whenever she asks what's on, what her day/morning/afternoon/evening looks like, or what she has on a date, so she sees the list rather than just reading about it. Use from_time/to_time to narrow to part of a day (afternoon = 12:00-17:59, evening = 17:00-23:59, morning = 00:00-11:59).",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        from_time: { type: "string", description: "HH:MM, optional" },
        to_time: { type: "string", description: "HH:MM, optional" },
      },
      required: ["date"],
    },
  },
  {
    name: "create_calendar_event",
    description:
      "Creates a new event on Shina's Google Calendar, optionally with a Google Meet link and attendees. Only use this for actual calendar meetings/appointments -- when Shina explicitly says 'calendar', wants a Meet link, or wants to invite other people. For anything she just wants tracked on her personal day list (a priority, a reminder, a routine), use create_schedule_event instead. For a plain checkbox to-do with no time attached, use create_task.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 datetime with offset, e.g. 2026-09-02T15:00:00+01:00" },
        endTime: { type: "string", description: "ISO 8601 datetime with offset" },
        attendeeEmails: { type: "array", items: { type: "string" } },
        createMeetLink: { type: "boolean" },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "list_upcoming_events",
    description: "Lists events on Shina's Google Calendar from now to a number of hours ahead, with ids. Today and tomorrow are already in your context -- only call this for further ahead.",
    parameters: {
      type: "object",
      properties: { hoursAhead: { type: "number" } },
    },
  },
  {
    name: "delete_calendar_event",
    description: "Deletes an event from Shina's Google Calendar by id (ids for today/tomorrow are in your context).",
    parameters: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Edits an existing Google Calendar event's title, description, or time, by id. Only pass the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 datetime with offset" },
        endTime: { type: "string", description: "ISO 8601 datetime with offset" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "create_schedule_event",
    description:
      "Adds an item to Shina's personal Schedule -- the day list on her Today screen, separate from Google Calendar. This is the default whenever she says 'schedule', gives something a priority level, or describes something that repeats every day/weekday/weekend. If she lists several items in one message, call this tool once per item, in the same turn -- carry over each item's own priority/time/reminder exactly as she stated them.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD, the date of the first (or only) occurrence" },
        start_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        end_time: { type: "string", description: "HH:MM, 24-hour, optional" },
        priority: { type: "number", description: "1 (low) to 5 (urgent). Default 3 if she doesn't say." },
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
    name: "create_reminder",
    description:
      "Sets a reminder for Shina -- use this instead of create_schedule_event whenever she specifically says 'reminder' or 'remind me'. It's the same Schedule item under the hood, but this is what makes it reliably show up on her Reminders list and fire a notification.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD. Defaults to today if she doesn't say." },
        start_time: { type: "string", description: "HH:MM, 24-hour -- the time she wants reminded, e.g. '11:00' for 11am." },
        remind_before_minutes: {
          type: "number",
          description: "Minutes before start_time to notify her -- 5, 10, 30, or 60. If she doesn't say how far in advance, omit this entirely -- it defaults to 0, meaning notify right at start_time.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "list_schedule_events",
    description: "Lists items on Shina's personal Schedule for a given date, with ids. Today and tomorrow are already in your context -- only call this for other dates.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "delete_schedule_event",
    description: "Deletes an item from Shina's personal Schedule by id.",
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
    description: "Edits one existing item on Shina's Schedule -- title, date, time, priority, reminder, or meeting link -- by id. Moving something to another day/time is an update (change event_date and/or start_time/end_time), not a delete + create. Only pass the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM, 24-hour" },
        end_time: { type: "string", description: "HH:MM, 24-hour" },
        priority: { type: "number", description: "1 (low) to 5 (urgent)." },
        remind_before_minutes: { type: "number", description: "0 = right at start time." },
        meeting_link: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_task",
    description:
      "Adds a plain checkbox to-do to Shina's Tasks list -- distinct from her Schedule (no priority) and Calendar (no meeting time). Use this when she says 'task' or 'to-do', or just wants something to check off. Pass her wording through exactly as she said it.",
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
    description: "Lists everything on Shina's Tasks list, including done ones. Open tasks are already in your context.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_task",
    description: "Edits or completes an existing task by id. Only pass the fields that are actually changing.",
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
    description: "Deletes a task by id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description:
      "Saves a freeform note for Shina -- something she wants written down verbatim, not an action item. Pass her wording through exactly as she said or typed it, typos and all.",
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
    description: "Lists Shina's saved notes, including each note's id.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_note",
    description: "Edits an existing note's title or body by id. Pass her new wording through exactly.",
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
    description: "Deletes a note by id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_recent_emails",
    description: "Lists recent inbox emails across all of Shina's connected accounts (or one, by account label), newest first, with ids and which account each came from.",
    parameters: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Default 10" },
        unread_only: { type: "boolean" },
        account: { type: "string", description: "Account label, e.g. 'Work'. Omit for all accounts." },
      },
    },
  },
  {
    name: "read_email",
    description: "Reads the full body of one email, to summarise it or reply to it properly. Needs the email id and its account label (both come from list_recent_emails).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        account: { type: "string" },
      },
      required: ["id", "account"],
    },
  },
  {
    name: "draft_email",
    description:
      "Drafts an email (new, or a reply) and shows it to Shina as a card with Send and Edit buttons. This does NOT send anything -- only Shina pressing Send does. Use it whenever she asks you to email, reply to, tell, or follow up with someone. For a reply, pass reply_to_email_id (and account) so it threads correctly; 'to' and 'subject' can then be left for the original sender/subject. Write in Shina's voice and sign off as Shina.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string" },
        body: { type: "string" },
        account: { type: "string", description: "Which account to send from (label). Replies default to the account the email arrived on." },
        reply_to_email_id: { type: "string" },
      },
      required: ["body"],
    },
  },
  {
    name: "mark_emails_read",
    description:
      "Marks emails as read in Gmail. Pass specific ids (from list_recent_emails), or all_unread: true to clear every unread email in the inbox. Optionally limit to one account by label; otherwise all_unread applies to every connected account.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Email ids to mark read" },
        all_unread: { type: "boolean" },
        account: { type: "string", description: "Account label, e.g. 'Personal'" },
      },
    },
  },
  {
    name: "get_weather",
    description: "Gets the forecast for a given day. Today's conditions and rain windows are already in your context -- use this for days further ahead.",
    parameters: {
      type: "object",
      properties: {
        day: {
          type: "number",
          description: "0 = today (default). 1 = tomorrow. Up to 6 = six days ahead.",
        },
      },
    },
  },
  {
    name: "remember_fact",
    description:
      "Saves a durable fact about Shina for future conversations (people, preferences, routines, projects). Call this when she shares something worth remembering long-term.",
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

// Tools that change something. Used for the honesty guard (a reply that
// claims an action when none of these succeeded) and for receipts.
const WRITE_TOOLS = new Set([
  "create_calendar_event", "delete_calendar_event", "update_calendar_event",
  "create_schedule_event", "create_reminder", "delete_schedule_event", "update_schedule_event",
  "create_task", "update_task", "delete_task",
  "create_note", "update_note", "delete_note",
  "remember_fact",
  "mark_emails_read",
]);

// --- Dynamic tool routing -------------------------------------------------
// Sending every tool on every turn would blow through Groq's free-tier
// tokens-per-minute, so tools are still routed by keyword -- but now with a
// much wider net, an always-on show_schedule, and follow-up inheritance.

const ROUTES: { keywords: string[]; tools: string[] }[] = [
  { keywords: ["weather", "rain", "temperature", "forecast", "sunny", "cold", "hot", "umbrella"], tools: ["get_weather"] },
  {
    keywords: ["calendar", "meeting", "meet link", "google meet", "invite", "attendee", "call with", "zoom"],
    tools: ["create_calendar_event", "list_upcoming_events", "delete_calendar_event", "update_calendar_event"],
  },
  {
    keywords: [
      "schedule", "priority", "remind me", "reminder", "remind", "routine", "every day", "everyday",
      "each day", "weekdays", "weekends", "recurring", "repeat", "repeats", "gym", "appointment",
    ],
    tools: ["create_schedule_event", "create_reminder", "list_schedule_events", "delete_schedule_event", "update_schedule_event"],
  },
  {
    keywords: ["task", "to-do", "todo", "checklist", "overdue", "done with", "finished", "completed", "tick off", "mark"],
    tools: ["create_task", "list_tasks", "update_task", "delete_task"],
  },
  {
    keywords: ["note", "jot down", "write down", "write this down"],
    tools: ["create_note", "list_notes", "update_note", "delete_note"],
  },
  {
    keywords: ["delete", "remove", "cancel", "get rid of", "clear", "drop"],
    tools: [
      "delete_schedule_event", "delete_calendar_event", "delete_task", "delete_note",
      "list_schedule_events", "list_upcoming_events", "list_tasks", "list_notes",
    ],
  },
  {
    keywords: [
      "edit", "change", "update", "rename", "modify", "reschedule", "move", "push", "shift", "postpone",
      "bring forward", "earlier", "later", "clash", "conflict", "overlap", "fit", "plan",
    ],
    tools: [
      "update_schedule_event", "list_schedule_events",
      "update_calendar_event", "list_upcoming_events",
      "update_task", "list_tasks",
      "update_note", "list_notes",
    ],
  },
  {
    keywords: ["next week", "this week", "weekend", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    tools: ["list_schedule_events", "list_upcoming_events", "get_weather"],
  },
  {
    keywords: ["event", "events", "add", "book", "put", "set up", "block"],
    tools: [
      "create_calendar_event", "list_upcoming_events",
      "create_schedule_event", "create_reminder", "list_schedule_events",
      "create_task", "create_note",
    ],
  },
  {
    keywords: [
      "email", "inbox", "gmail", "reply", "respond", "message from", "mail", "draft", "write to", "tell ",
      "let ", "follow up", "follow-up", "summar", "unread", "send", "as read", "mark all", "clear my inbox",
    ],
    tools: ["list_recent_emails", "read_email", "draft_email", "mark_emails_read"],
  },
  { keywords: ["remember", "don't forget", "keep in mind", "note that", "my name", "i prefer", "i like"], tools: ["remember_fact"] },
];

const ALWAYS_ON = ["show_schedule"];

function matchRoutes(message: string): Set<string> {
  const lower = message.toLowerCase();
  const names = new Set<string>();
  for (const route of ROUTES) {
    if (route.keywords.some((k) => lower.includes(k))) route.tools.forEach((t) => names.add(t));
  }
  return names;
}

const FOLLOW_UP_RE = /^(yes|yeah|yep|yup|ok|okay|sure|please|do it|go ahead|go for it|sounds good|perfect|great|that works|keep|no|nope|not that|instead|actually|and |also )/i;

function selectTools(message: string, history: HistoryMessage[]): NeutralTool[] {
  const names = matchRoutes(message);
  ALWAYS_ON.forEach((t) => names.add(t));

  // "Yes, move it" / "make it shorter" / "and Tolu too" carry no keywords of
  // their own -- inherit whatever the previous couple of turns needed.
  const isShort = message.trim().split(/\s+/).length <= 8;
  if (isShort || FOLLOW_UP_RE.test(message.trim())) {
    const recent = history.slice(-4);
    for (const m of recent) matchRoutes(m.parts.map((p) => p.text).join(" ")).forEach((t) => names.add(t));
    // A pending draft in the last reply means "send it"/"shorter" is about email.
    const last = recent[recent.length - 1]?.parts.map((p) => p.text).join(" ") ?? "";
    if (last.includes("Draft (NOT sent) email")) ["draft_email", "read_email"].forEach((t) => names.add(t));
  }

  return ALL_TOOLS.filter((t) => names.has(t.name));
}

// GPT-OSS's reasoning trace costs real tokens -- keep it off for the simple
// stuff and only switch it on when the message calls for multi-step thinking.
const DEEP_REASONING_KEYWORDS = [
  "plan", "compare", "analyze", "strategy", "should i", "pros and cons",
  "explain why", "think through", "decide between", "help me figure out",
  "write code", "debug", "algorithm", "fit", "clash", "prioriti",
];

function needsDeepReasoning(message: string): boolean {
  const lower = message.toLowerCase();
  return DEEP_REASONING_KEYWORDS.some((k) => lower.includes(k));
}

// --- Tool execution -----------------------------------------------------

type ToolEnv = {
  accounts: GoogleAccount[];
  primary: GoogleAccount | null;
  location: { lat: number; lon: number } | null;
  weather: FullWeatherData | null;
};

function requirePrimary(env: ToolEnv): string {
  if (!env.primary) throw new Error("No Google account connected -- connect one on the Accounts page first.");
  return env.primary.refresh_token;
}

function accountFor(env: ToolEnv, label: unknown): GoogleAccount {
  const acc = pickAccount(env.accounts, typeof label === "string" ? label : null);
  if (!acc) throw new Error("No Google account connected -- connect one on the Accounts page first.");
  return acc;
}

function extractAddress(from: string): string {
  const m = from.match(/<(.+)>/);
  return m ? m[1] : from.trim();
}

async function executeTool(name: string, args: Record<string, unknown>, env: ToolEnv) {
  const today = lagosParts().dateKey;
  switch (name) {
    case "show_schedule": {
      const date = (args.date as string) || today;
      const items = await getAgenda(date, env.primary?.refresh_token ?? null, env.weather);
      const from = args.from_time as string | undefined;
      const to = args.to_time as string | undefined;
      return {
        date,
        items: items.filter((i) => {
          if (!from && !to) return true;
          if (!i.start) return false;
          const m = toMinutes(i.start);
          return (!from || m >= toMinutes(from)) && (!to || m <= toMinutes(to));
        }),
      };
    }
    case "create_calendar_event":
      return createCalendarEvent(requirePrimary(env), args as never);
    case "list_upcoming_events":
      return listUpcomingEvents(requirePrimary(env), (args.hoursAhead as number) ?? 24);
    case "delete_calendar_event":
      return deleteCalendarEvent(requirePrimary(env), args.eventId as string);
    case "update_calendar_event":
      return updateCalendarEvent(requirePrimary(env), args.eventId as string, args as never);
    case "create_schedule_event":
      return createScheduleEvent(args as never);
    case "create_reminder":
      // Same underlying schedule_events row create_schedule_event uses --
      // this just guarantees the date defaults sensibly and
      // remind_before_minutes is never left unset (unset = "not a reminder"
      // as far as the Reminders tab and the push scheduler are concerned).
      return createScheduleEvent({
        title: args.title as string,
        event_date: (args.event_date as string | undefined) ?? today,
        start_time: (args.start_time as string | undefined) ?? null,
        remind_before_minutes: (args.remind_before_minutes as number | undefined) ?? 0,
      } as never);
    case "list_schedule_events":
      return listScheduleEvents((args.date as string | undefined) ?? today);
    case "delete_schedule_event":
      return deleteScheduleEvent(args.id as string, (args.scope as "single" | "series" | undefined) ?? "single");
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
    case "list_recent_emails": {
      const max = Math.min((args.maxResults as number) ?? 10, 20);
      const targets = args.account ? [accountFor(env, args.account)] : env.accounts;
      if (targets.length === 0) throw new Error("No Google account connected.");
      const lists = await Promise.all(
        targets.map(async (acc) => {
          try {
            const emails = await listRecentEmails(acc.refresh_token, max);
            return emails.map((e) => ({ ...e, account: acc.label }));
          } catch {
            return [];
          }
        })
      );
      return lists
        .flat()
        .filter((e) => !args.unread_only || e.unread)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, max)
        .map((e) => ({ id: e.id, account: e.account, from: e.from, subject: e.subject, snippet: e.snippet, unread: e.unread, date: e.date }));
    }
    case "read_email": {
      const acc = accountFor(env, args.account);
      const meta = await getEmailMeta(acc.refresh_token, args.id as string);
      const { body } = await getFullEmailBody(acc.refresh_token, args.id as string);
      return { id: args.id, account: acc.label, from: meta.from, subject: meta.subject, body: body.slice(0, 4000) };
    }
    case "draft_email": {
      let acc = accountFor(env, args.account);
      let to = (args.to as string | undefined) ?? "";
      let subject = (args.subject as string | undefined) ?? "";
      let threadId: string | null = null;
      let inReplyTo: string | null = null;
      let replyToMessageId: string | null = null;

      if (args.reply_to_email_id) {
        // Find the account the original arrived on if none was named.
        const candidates = args.account ? [acc] : env.accounts;
        let meta = null;
        for (const candidate of candidates) {
          try {
            meta = await getEmailMeta(candidate.refresh_token, args.reply_to_email_id as string);
            acc = candidate;
            break;
          } catch {
            // not in this mailbox
          }
        }
        if (!meta) throw new Error("Couldn't find the email to reply to.");
        threadId = meta.threadId;
        inReplyTo = meta.messageIdHeader;
        replyToMessageId = meta.id;
        to = to || extractAddress(meta.from);
        subject = subject || (meta.subject.toLowerCase().startsWith("re:") ? meta.subject : `Re: ${meta.subject}`);
      }

      if (!to) throw new Error("Who should this go to? I need an email address.");
      // Automated senders (security alerts, receipts, notifications) don't
      // read replies -- drafting one only invites a pointless or confusing send.
      if (/no-?reply|do-?not-?reply|mailer-daemon|notifications?@/i.test(to)) {
        throw new Error(
          `${to} is an automated address that doesn't read replies, so I didn't draft one. If it's a Google security alert about CeeBee, that's from you connecting your account -- nothing to reply to.`
        );
      }
      return {
        status: "draft_ready_NOT_sent",
        draft: {
          accountLabel: acc.label,
          fromEmail: acc.email,
          to,
          subject,
          body: args.body as string,
          threadId,
          inReplyTo,
          replyToMessageId,
        },
      };
    }
    case "mark_emails_read": {
      const ids = (args.ids as string[] | undefined) ?? [];
      if (!args.all_unread && ids.length === 0) throw new Error("Which emails? I need ids, or all_unread.");
      const targets = args.account ? [accountFor(env, args.account)] : env.accounts;
      if (targets.length === 0) throw new Error("No Google account connected.");
      let marked = 0;
      for (const acc of targets) {
        try {
          // Specific ids belong to one mailbox; trying them against each
          // account just fails harmlessly on the ones they aren't in.
          marked += await markEmailsRead(acc.refresh_token, args.all_unread ? { all: true } : { ids });
          if (!args.all_unread) break;
        } catch (err) {
          if (isMissingScopeError(err)) {
            throw new Error(
              `The ${acc.label} account was connected before I could change emails. Shina needs to tap Reconnect on the Accounts page once to allow marking email read.`
            );
          }
          if (args.all_unread) throw err;
        }
      }
      return { marked };
    }
    case "get_weather":
      return getWeatherCached(env.location).then((w) => {
        if (!w) throw new Error("Weather service is unavailable right now.");
        return w;
      });
    case "remember_fact":
      await addMemoryFact(args.fact as string, (args.category as string | undefined) ?? "general");
      return { saved: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// A remind_before_minutes value of 0 is a real, intentional setting ("notify
// right at start time") -- so this checks for null/undefined specifically.
function remindPhrase(remindBeforeMinutes: unknown): string {
  if (remindBeforeMinutes === null || remindBeforeMinutes === undefined) return "";
  const mins = remindBeforeMinutes as number;
  return mins === 0 ? ", reminder at start" : `, reminder ${mins}m before`;
}

// One receipt line per successful write -- built from the real tool result,
// so the "what I did" list can never claim something that didn't happen.
function receiptFor(name: string, args: Record<string, unknown>, result: unknown): string | null {
  switch (name) {
    case "create_calendar_event": {
      const r = result as { meetLink: string | null };
      return `Added "${args.title}" to your calendar${r.meetLink ? " with a Meet link" : ""}`;
    }
    case "delete_calendar_event":
      return "Removed that from your calendar";
    case "update_calendar_event": {
      const r = result as { title: string | null };
      return `Updated "${r.title ?? args.title ?? "event"}" on your calendar`;
    }
    case "create_schedule_event": {
      const r = result as { occurrences: number };
      const time = args.start_time ? ` at ${args.start_time}` : "";
      const repeat = r.occurrences > 1 ? `, repeating (${r.occurrences} days)` : "";
      return `Scheduled "${args.title}"${time} · P${(args.priority as number | undefined) ?? 3}${repeat}${remindPhrase(args.remind_before_minutes)}`;
    }
    case "create_reminder": {
      const time = args.start_time ? ` at ${args.start_time}` : "";
      return `Reminder set: "${args.title}"${time}`;
    }
    case "delete_schedule_event": {
      const r = result as { scope: "single" | "series" };
      return r.scope === "series" ? "Removed that and every future repeat" : "Removed that from your schedule";
    }
    case "update_schedule_event": {
      const r = result as { event: { title: string; event_date: string; start_time: string | null; priority: number } };
      const when = [
        args.event_date !== undefined ? labelForKey(r.event.event_date, "short") : null,
        args.start_time !== undefined ? r.event.start_time?.slice(0, 5) : null,
      ].filter(Boolean);
      const bits = [
        when.length ? `now ${when.join(" ")}` : null,
        args.priority !== undefined ? `P${r.event.priority}` : null,
      ].filter(Boolean);
      return `Updated "${r.event.title}"${bits.length ? ` · ${bits.join(" · ")}` : ""}`;
    }
    case "create_task":
      return `Added task "${args.title}"`;
    case "update_task": {
      const r = result as { task: { title: string } };
      if (args.done === true) return `Ticked off "${r.task.title}"`;
      if (args.done === false) return `Reopened "${r.task.title}"`;
      return `Updated task "${r.task.title}"`;
    }
    case "delete_task":
      return "Deleted that task";
    case "create_note":
      return "Saved that note";
    case "update_note":
      return "Updated that note";
    case "delete_note":
      return "Deleted that note";
    case "remember_fact":
      return "Remembered that";
    case "mark_emails_read": {
      const r = result as { marked: number };
      return r.marked === 0 ? "No unread emails to mark" : `Marked ${r.marked} email${r.marked === 1 ? "" : "s"} as read`;
    }
    default:
      return null;
  }
}

function agendaCard(date: string, items: Awaited<ReturnType<typeof getAgenda>>, from?: string, to?: string): Card {
  const today = lagosParts().dateKey;
  const dayLabel = date === today ? "Today" : labelForKey(date, "short");
  const range = from || to ? ` · ${from ?? "…"}–${to ?? "…"}` : "";
  return {
    type: "agenda",
    title: `${dayLabel}${range}`,
    items: items.map<AgendaCardItem>((i) => {
      const rainy = !i.meetLink && i.rainChance !== null && i.rainChance >= 50;
      return {
        time: i.start,
        title: i.title,
        note: rainy ? `Rain ${i.rainChance}%` : i.done ? "Done" : i.meetLink ? "Meet" : null,
        tone: i.done ? "done" : rainy ? "ember" : "honey",
      };
    }),
  };
}

// Turns the executed calls into the cards Shina sees under CeeBee's words.
function buildCards(executed: ExecutedCall[]): Card[] {
  const cards: Card[] = [];
  const receipts: { ok: boolean; text: string }[] = [];

  for (const call of executed) {
    const r = call.result as Record<string, unknown> | null;
    if (r && typeof r === "object" && "skipped" in r) continue;
    if (r && typeof r === "object" && "error" in r) {
      if (WRITE_TOOLS.has(call.name) || call.name === "draft_email") {
        receipts.push({ ok: false, text: `Couldn't ${call.name.replace(/_/g, " ")}: ${r.error}` });
      }
      continue;
    }

    switch (call.name) {
      case "show_schedule": {
        const res = call.result as { date: string; items: Awaited<ReturnType<typeof getAgenda>> };
        cards.push(agendaCard(res.date, res.items, call.args.from_time as string, call.args.to_time as string));
        break;
      }
      case "draft_email": {
        const res = call.result as { draft: Extract<Card, { type: "email_draft" }> };
        cards.push({ ...res.draft, type: "email_draft", status: "draft" });
        break;
      }
      case "list_recent_emails": {
        const res = call.result as { id: string; account: string; from: string; subject: string; snippet: string; unread: boolean }[];
        if (res.length) {
          cards.push({
            type: "emails",
            items: res.slice(0, 6).map((e) => ({
              id: e.id,
              accountLabel: e.account,
              from: e.from.replace(/<.*>/, "").replace(/"/g, "").trim() || e.from,
              subject: e.subject,
              snippet: e.snippet,
              unread: e.unread,
            })),
          });
        }
        break;
      }
      default: {
        if (!WRITE_TOOLS.has(call.name)) break;
        const line = receiptFor(call.name, call.args, call.result);
        if (line) receipts.push({ ok: true, text: line });
      }
    }
  }

  if (receipts.length) cards.unshift({ type: "actions", items: receipts });
  return cards;
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

export type HistoryMessage = { role: "user" | "model"; parts: { text: string }[]; cards?: Card[] };

// How many back-and-forth tool rounds a single request is allowed before
// CeeBee is forced to wrap up with whatever she's completed so far.
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
  env: ToolEnv,
  seenSignatures: Set<string>,
  executed: ExecutedCall[]
): Promise<unknown> {
  // Models sometimes send explicit nulls for optional fields -- drop them
  // so downstream "only update what was passed" logic stays correct.
  const args = Object.fromEntries(Object.entries(call.args).filter(([, v]) => v !== null && v !== undefined));
  const signature = `${call.name}:${JSON.stringify(args)}`;
  let result: unknown;
  if (seenSignatures.has(signature)) {
    result = { skipped: true, reason: "Already done earlier in this same request." };
  } else {
    seenSignatures.add(signature);
    try {
      result = await executeTool(call.name, args, env);
    } catch (err) {
      result = {
        error: isReconnectError(err)
          ? "Google has disconnected this account (its sign-in expired). Shina needs to tap Reconnect on the Accounts page."
          : err instanceof Error
            ? err.message
            : "Unknown error",
      };
    }
  }
  executed.push({ name: call.name, args, result });
  return result;
}

// What the model gets back for a tool call. show_schedule's agenda can be
// long; the model only needs the gist since Shina sees the full card.
function resultForModel(name: string, result: unknown): unknown {
  if (name === "draft_email" && result && typeof result === "object" && "draft" in result) {
    return { ...result, note: "Shown to Shina as a card with Send/Edit. It has NOT been sent. Do not say it was sent." };
  }
  if (name === "show_schedule" && result && typeof result === "object" && "items" in result) {
    const r = result as { date: string; items: { id: string; title: string; start: string | null; source: string; rainChance: number | null; done: boolean }[] };
    return {
      date: r.date,
      shownToShinaAsCard: true,
      items: r.items.map((i) => ({ id: i.id, title: i.title, start: i.start, source: i.source, rain: i.rainChance, done: i.done })),
    };
  }
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

function historyText(m: HistoryMessage): string {
  const text = m.parts.map((p) => p.text).join(" ");
  const digest = m.cards?.length ? cardsDigest(m.cards) : "";
  return digest ? `${text}\n${digest}` : text;
}

async function callGemini(
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  tools: NeutralTool[],
  env: ToolEnv
): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in your .env file.");

  const ai = new GoogleGenAI({ apiKey });

  // Typed loosely (not against the SDK's exact Content/Part types) because
  // these are built by hand across three different shapes (text,
  // functionCall passthrough, functionResponse).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: historyText(m) }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const config: Record<string, unknown> = {
    systemInstruction: systemPrompt,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
  if (tools.length) config.tools = [{ functionDeclarations: toGeminiDeclarations(tools) }];

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

    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const functionResponseParts = [];
    for (const call of calls) {
      const result = await runToolOnce(call, env, seenSignatures, executed);
      functionResponseParts.push({ functionResponse: { name: call.name, response: { result: resultForModel(call.name, result) } } });
    }
    contents.push({ role: "user", parts: functionResponseParts });
  }

  return { text: finalText, executed, usage: totalUsage };
}

// --- Groq requests with rate-limit handling --------------------------------
// Groq's free tier caps gpt-oss-120b at 8,000 tokens per minute, and one
// CeeBee turn is ~3-4k tokens, so two quick messages can hit it. Short waits
// ("try again in 2.4s") are waited out once; otherwise the request moves to
// gpt-oss-20b, which has its own separate limits. Only if both are busy does
// the caller get a GroqBusyError (shown to Shina in plain words).

const GROQ_FALLBACK_MODEL = "openai/gpt-oss-20b";

export class GroqBusyError extends Error {
  constructor() {
    super("CeeBee is busy (Groq rate limit)");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function groqRequest(body: Record<string, unknown>, apiKey: string): Promise<any> {
  const models = [body.model as string];
  if (body.model !== GROQ_FALLBACK_MODEL) models.push(GROQ_FALLBACK_MODEL);

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model }),
      });
      if (res.ok) return res.json();

      const errText = await res.text();
      if (res.status === 429 || res.status === 503) {
        const wait = Number(/try again in ([d.]+)s/i.exec(errText)?.[1]);
        if (attempt === 0 && wait > 0 && wait <= 6) {
          await new Promise((r) => setTimeout(r, wait * 1000 + 250));
          continue;
        }
        console.warn(`Groq ${model} rate-limited, trying next model`, errText.slice(0, 200));
        break;
      }
      throw new Error(`Groq API error: ${errText}`);
    }
  }
  throw new GroqBusyError();
}

async function callGroq(
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
  tools: NeutralTool[],
  useReasoning: boolean,
  env: ToolEnv
): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in your .env file.");

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: historyText(m),
    })),
    { role: "user", content: userMessage },
  ];

  const groqTools = tools.map((t) => ({
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
              // Nullable optional fields become a JSON Schema union type so
              // GPT-OSS sending an explicit null isn't rejected by Groq's
              // strict tool-call validator.
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
      include_reasoning: useReasoning,
    };
    if (groqTools.length) {
      body.tools = groqTools;
      body.tool_choice = "auto";
      body.parallel_tool_calls = true;
    }

    const data = await groqRequest(body, apiKey);
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
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }
      const call = { name: tc.function.name, args: parsedArgs };
      const result = await runToolOnce(call, env, seenSignatures, executed);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultForModel(call.name, result)) });
    }
  }

  return { text: finalText, executed, usage: totalUsage };
}

// --- System prompt ---------------------------------------------------

function buildSystemPrompt(dayContext: string, facts: string[]) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  }).format(new Date());

  const memorySection = facts.length > 0
    ? `\n\nWHAT YOU KNOW ABOUT SHINA:\n${facts.map((f) => `- ${f}`).join("\n")}`
    : "";

  return `You are CeeBee, Shina's personal assistant (she/her). Your voice: quick, warm, a little cheeky. Busy days, handled.

HOW YOU TALK
- Short. 1-3 sentences unless she asks for more. No headings, no bullet dumps -- cards show lists for you.
- When you've done something, say what you did in plain words, then offer the obvious next step. e.g. "Done -- gym is now Tue 07:00. Want me to tell Adeola you'll send comments by 5?"
- Be proactive: if something in THINGS YOU'VE NOTICED is relevant to what she asked, mention it and offer the fix.
- Never claim you did, moved, added, sent or deleted anything unless a tool in THIS turn actually returned success. If a tool failed, say so plainly.
- Finish EVERY reply with one final line in exactly this format, giving 1-3 short tappable next steps written as Shina would say them (max 6 words each):
NEXT: Yes, move it | Summarise Adeola's email
Omit the NEXT line only if there is genuinely nothing useful to suggest.

YOU ALREADY KNOW HER DAY
The snapshot below is live. Answer from it directly -- don't call a list tool for today or tomorrow. Use the ids in it to edit/delete without looking anything up. When she asks what's on (a day, morning, afternoon, evening), call show_schedule so she sees it as a card, and add one useful observation (a clash, rain, a gap).

WHERE THINGS GO -- never mix them up
- Google Calendar: real meetings/appointments. Only when she says "calendar", wants a Meet link, or invites people.
- Schedule: her personal day list with priorities (P1 low .. P5 urgent) and reminders. The default for "schedule", priorities, routines.
- Reminders: use create_reminder whenever she says "remind me"/"reminder". If she gives no lead time, leave remind_before_minutes out.
- Tasks: plain checkbox to-dos.
- Notes: freeform text saved verbatim.
If she lists several things, call the matching create tool once per item, all in this same turn. "Every day" -> recurrence daily; weekdays -> weekdays; weekends -> weekends; specific days -> custom with recurrence_days (0=Sun..6=Sat). Moving something = update its date/time, never delete + recreate.
Pass her wording through exactly for tasks and notes. If something is genuinely ambiguous, ask instead of guessing.

EMAIL
You can list, read, draft, and mark emails as read across all her accounts. You can NOT send -- draft_email shows a card with Send/Edit and Shina sends it herself. Say "Here's the draft" / "ready to go", never "sent". To summarise an email, read_email first. When replying, use reply_to_email_id.

Current date/time: ${formatted} (Africa/Lagos). Resolve every relative date ("tomorrow", "next Tuesday") against this exact moment. Times are 24h HH:MM; ISO datetimes for Calendar need the +01:00 offset.

=== LIVE SNAPSHOT ===
${dayContext}${memorySection}`;
}

// --- Reply post-processing -------------------------------------------------

export function splitSuggestions(raw: string): { text: string; suggestions: string[] } {
  const lines = raw.trim().split("\n");
  let suggestions: string[] = [];
  // The NEXT line is usually last, but tolerate trailing blank/markdown lines.
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const m = lines[i].match(/^\s*\**\s*NEXT\s*\**\s*:\s*(.+)$/i);
    if (m) {
      suggestions = m[1]
        .split("|")
        .map((s) => s.replace(/[*_`"]/g, "").trim())
        .filter((s) => s.length > 0 && s.length <= 60)
        .slice(0, 3);
      lines.splice(i, 1);
      break;
    }
  }
  return { text: lines.join("\n").trim(), suggestions };
}

// Catches the model claiming it did something in a turn where no write tool
// actually succeeded -- v1 avoided this by never showing model text after a
// tool call at all; v2 shows her words, so it needs this guard instead.
const CLAIM_RE = /^(done|all set|sorted|got it, (i'?ve|i have))\b|\bi'?ve (added|moved|scheduled|created|deleted|removed|updated|rescheduled|cancelled|canceled|set|booked|marked|sent)\b|\b(has|have) been (sent|added|moved|scheduled|deleted|updated)\b/i;

function guardClaims(text: string, executed: ExecutedCall[]): string {
  const anyWriteSucceeded = executed.some((c) => {
    const r = c.result as Record<string, unknown> | null;
    return WRITE_TOOLS.has(c.name) && !(r && typeof r === "object" && ("error" in r || "skipped" in r));
  });
  const drafted = executed.some((c) => c.name === "draft_email" && !(c.result as Record<string, unknown>)?.error);
  if (anyWriteSucceeded) return text;
  if (drafted && !/\b(sent|has been sent)\b/i.test(text)) return text;
  if (!CLAIM_RE.test(text)) return text;
  console.warn("CeeBee: model claimed an action with no successful write tool -- replacing reply", text);
  return "I haven't actually changed anything yet. Want me to go ahead?";
}

// --- Main entry point ---------------------------------------------------

export async function runAgent(
  userMessage: string,
  accounts: GoogleAccount[],
  history: HistoryMessage[] = [],
  location: { lat: number; lon: number } | null = null,
  accountLabel: string | null = null
): Promise<AgentReply> {
  const model = await getCurrentModel();
  const provider = providerForModel(model);

  const allowed = await checkRateLimit(provider);
  if (!allowed) {
    return {
      text: `I'm a bit swamped right now (hit my ${provider === "gemini" ? "Gemini" : "Groq"} request limit). Give me a moment and try again.`,
      cards: [],
      suggestions: [],
    };
  }

  const primary = pickAccount(accounts, accountLabel);
  // 6 turns keeps follow-ups working while staying inside Groq's free
  // tokens-per-minute budget.
  const recentHistory = history.slice(-6);

  const [ctx, facts] = await Promise.all([
    buildDayContext(primary, location),
    getRelevantMemoryFacts(userMessage),
  ]);
  const env: ToolEnv = { accounts, primary, location, weather: ctx.weather };

  const tools = selectTools(userMessage, recentHistory);
  const systemPrompt = buildSystemPrompt(describeDayContext(ctx, accounts), facts);
  const useReasoning = needsDeepReasoning(userMessage);

  const start = Date.now();
  let result: ProviderResult;
  try {
    result =
      provider === "gemini"
        ? await callGemini(model, systemPrompt, recentHistory, userMessage, tools, env)
        : await callGroq(model, systemPrompt, recentHistory, userMessage, tools, useReasoning, env);
  } catch (err) {
    if (err instanceof GroqBusyError) {
      return {
        text: "I'm getting a lot of requests right now and need a few seconds to catch my breath. Try that again in a moment.",
        cards: [],
        suggestions: [userMessage.slice(0, 60)],
      };
    }
    throw err;
  }
  const latencyMs = Date.now() - start;

  // Usage logging must never cost Shina her answer.
  await logUsage({
    model,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens,
    thoughtTokens: result.usage.thoughtTokens,
    cachedTokens: result.usage.cachedTokens,
    totalTokens: result.usage.totalTokens,
    toolCalls: result.executed.length,
    latencyMs,
  }).catch((err) => console.error("logUsage failed", err));

  for (const call of result.executed) {
    const r = call.result as Record<string, unknown> | null;
    if (r && typeof r === "object" && "skipped" in r) {
      console.warn(`CeeBee: skipped duplicate tool call ${call.name}`, call.args);
    }
  }

  const cards = buildCards(result.executed);
  const { text: rawText, suggestions } = splitSuggestions(result.text);
  let text = guardClaims(rawText, result.executed);

  if (!text) {
    // Ran out of tool rounds, or the model only called tools. Fall back to
    // the receipts so she still hears what happened.
    const receipts = cards.find((c) => c.type === "actions");
    text = receipts && receipts.type === "actions"
      ? receipts.items.map((i) => i.text).join(". ") + "."
      : cards.length
        ? "Here you go."
        : "I didn't quite catch what you needed there -- could you rephrase?";
  }

  return { text, cards, suggestions };
}

// --- Plain completions (titles, briefs, inbox triage) -----------------------
// One-shot, no tools. Returns null on any failure so callers can fall back
// to something deterministic -- these are nice-to-haves, never blockers.

// `preferModel` pins a specific model (e.g. the morning brief always thinks
// with Gemini); if that model fails or is out of quota, it falls back to
// whatever chat model is selected, so the caller still gets an answer.
export async function completeText(
  prompt: string,
  maxTokens = 200,
  opts: { preferModel?: string } = {}
): Promise<string | null> {
  if (opts.preferModel) {
    const preferred = await completeWithModel(opts.preferModel, prompt, maxTokens);
    if (preferred) return preferred;
    console.warn(`completeText: ${opts.preferModel} unavailable, falling back to the chat model`);
  }
  return completeWithModel(await getCurrentModel(), prompt, maxTokens);
}

async function completeWithModel(model: string, prompt: string, maxTokens: number): Promise<string | null> {
  const provider = providerForModel(model);
  if (!(await checkRateLimit(provider))) {
    console.error("completeText: rate limited");
    return null;
  }

  // Summaries count toward the same quotas as chat, so they're logged too --
  // previously only chat turns were, which made Developer tools undercount.
  const start = Date.now();
  const log = (usage: { promptTokens?: number; outputTokens?: number; totalTokens?: number }) =>
    logUsage({ model, ...usage, toolCalls: 0, latencyMs: Date.now() - start }).catch((err) =>
      console.error("logUsage failed", err)
    );

  try {
    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("completeText: missing GEMINI_API_KEY");
        return null;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, maxOutputTokens: maxTokens + 400 },
      });
      await log({
        promptTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
        totalTokens: response.usageMetadata?.totalTokenCount,
      });
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        console.error("completeText: Gemini reply truncated (MAX_TOKENS)");
        return null;
      }
      return response.text?.trim() || null;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("completeText: missing GROQ_API_KEY");
      return null;
    }
    const data = await groqRequest(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        // GPT-OSS is a reasoning model -- even with include_reasoning:false
        // its hidden reasoning spends from max_tokens before the answer is
        // written, which cut the morning brief off mid-sentence. Keep the
        // reasoning effort low and leave generous headroom on top of the
        // answer budget.
        max_tokens: maxTokens + 800,
        reasoning_effort: "low",
        include_reasoning: false,
      },
      apiKey
    );
    await log({
      promptTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    });
    const choice = data.choices?.[0];
    // A cut-off answer is worse than none -- let the caller fall back.
    if (choice?.finish_reason === "length") {
      console.error("completeText: Groq reply truncated (finish_reason=length)");
      return null;
    }
    return (choice?.message?.content ?? "").trim() || null;
  } catch (err) {
    console.error("completeText: unexpected error", err);
    return null;
  }
}

// --- Conversation titling -------------------------------------------------
// Generates a short (3-6 word) title from the first exchange, the way
// Gemini/ChatGPT rename a chat after your first message. Best-effort: on
// failure the caller keeps its placeholder title.
export async function generateConversationTitle(userMessage: string, reply: string): Promise<string | null> {
  const prompt = `Summarize this exchange as a short chat title, 3-6 words, no quotes, no trailing punctuation, no emoji.\n\nUser: ${userMessage}\nAssistant: ${reply}\n\nTitle:`;
  const raw = await completeText(prompt, 60, { preferModel: SUMMARY_MODEL });
  if (!raw) {
    console.error("generateConversationTitle: no title produced");
    return null;
  }
  return cleanTitle(raw);
}

function cleanTitle(raw: string): string | null {
  const firstLine = raw.split("\n").find((l) => l.trim()) ?? "";
  const cleaned = firstLine.trim().replace(/^title:\s*/i, "").replace(/^["']|["']$/g, "").replace(/[.!]+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : null;
}

export type { DayContext };
