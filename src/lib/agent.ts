import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import { createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { listRecentEmails, sendEmail } from "@/lib/gmail";

// --- Tool definitions -------------------------------------------------
// Each tool here is a function Gemini can decide to call based on what the
// person asks. The `parameters` schema tells Gemini what arguments to
// extract from natural language.

const functionDeclarations: FunctionDeclaration[] = [
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
        endTime: {
          type: Type.STRING,
          description: "ISO 8601 datetime",
        },
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
      properties: {
        hoursAhead: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "list_recent_emails",
    description: "Lists the most recent emails in the user's inbox.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        maxResults: { type: Type.NUMBER },
      },
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
];

// --- Tool execution -----------------------------------------------------
// Maps a Gemini function-call name to the actual code that runs it.

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  refreshToken: string
) {
  switch (name) {
    case "create_calendar_event":
      return createCalendarEvent(refreshToken, args as never);
    case "list_upcoming_events":
      return listUpcomingEvents(
        refreshToken,
        (args.hoursAhead as number) ?? 24
      );
    case "list_recent_emails":
      return listRecentEmails(refreshToken, (args.maxResults as number) ?? 10);
    case "send_email":
      return sendEmail(
        refreshToken,
        args.to as string,
        args.subject as string,
        args.body as string
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const SYSTEM_PROMPT = `You are CeeBee, a personal assistant for Shina. You have
access to his Google Calendar and Gmail through tools. Be direct and concise.
When creating events, default to a Google Meet link only if the event sounds
like a meeting/call. Confirm actions you've taken in plain language rather
than repeating raw tool output.`;

type HistoryMessage = { role: "user" | "model"; parts: { text: string }[] };

// Runs one turn of the conversation: sends the message + history to Gemini,
// executes any tool calls it requests, feeds results back, and returns the
// final natural-language reply.
export async function runAgent(
  userMessage: string,
  refreshToken: string,
  history: HistoryMessage[] = []
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in your .env file.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build up the running conversation as "contents" -- the format the
  // current SDK expects for both text turns and function call/response turns.
  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [
    ...history.map((m) => ({
      role: m.role,
      parts: m.parts.map((p) => ({ text: p.text })),
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const config = {
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations }],
  };

  // Keep executing tool calls until Gemini returns a plain text answer.
  // Capped at 5 rounds so a bug can't loop forever.
  for (let round = 0; round < 5; round++) {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config,
    });

    const call = response.functionCalls?.[0];

    if (!call) {
      return response.text ?? "";
    }

    // Push the model's own turn back verbatim -- Gemini 3.x attaches a
    // thought_signature to function-call parts that must be echoed back
    // exactly as received, so we use the raw candidate content rather than
    // rebuilding the functionCall part ourselves.
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      contents.push(modelContent as { role: string; parts: Array<Record<string, unknown>> });
    }

    const toolResult = await executeTool(
      call.name!,
      (call.args as Record<string, unknown>) ?? {},
      refreshToken
    );

    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        },
      ],
    });
  }

  return "Sorry, that took too many steps -- try rephrasing your request.";
}
