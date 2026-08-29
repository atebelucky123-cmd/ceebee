import {
  GoogleGenerativeAI,
  SchemaType,
  type Tool,
} from "@google/generative-ai";
import { createCalendarEvent, listUpcomingEvents } from "@/lib/calendar";
import { listRecentEmails, sendEmail } from "@/lib/gmail";

// --- Tool definitions -------------------------------------------------
// Each tool here is a function Gemini can decide to call based on what the
// person asks. The `parameters` schema tells Gemini what arguments to
// extract from natural language.

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "create_calendar_event",
        description:
          "Creates a new event on the user's Google Calendar, optionally with a Google Meet link and attendees.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            startTime: {
              type: SchemaType.STRING,
              description: "ISO 8601 datetime, e.g. 2026-09-02T15:00:00+01:00",
            },
            endTime: {
              type: SchemaType.STRING,
              description: "ISO 8601 datetime",
            },
            attendeeEmails: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            createMeetLink: { type: SchemaType.BOOLEAN },
          },
          required: ["title", "startTime", "endTime"],
        },
      },
      {
        name: "list_upcoming_events",
        description:
          "Lists the user's calendar events between now and a number of hours ahead.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            hoursAhead: { type: SchemaType.NUMBER },
          },
        },
      },
      {
        name: "list_recent_emails",
        description: "Lists the most recent emails in the user's inbox.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            maxResults: { type: SchemaType.NUMBER },
          },
        },
      },
      {
        name: "send_email",
        description: "Sends an email from the user's connected account.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            to: { type: SchemaType.STRING },
            subject: { type: SchemaType.STRING },
            body: { type: SchemaType.STRING },
          },
          required: ["to", "subject", "body"],
        },
      },
    ],
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

// Runs one turn of the conversation: sends the message + history to Gemini,
// executes any tool calls it requests, feeds results back, and returns the
// final natural-language reply.
export async function runAgent(
  userMessage: string,
  refreshToken: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[] = []
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in your .env file.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools,
  });

  const chat = model.startChat({ history });
  let result = await chat.sendMessage(userMessage);

  // Keep executing tool calls until Gemini returns a plain text answer.
  // Capped at 5 rounds so a bug can't loop forever.
  for (let round = 0; round < 5; round++) {
    const call = result.response.functionCalls()?.[0];
    if (!call) break;

    const toolResult = await executeTool(
      call.name,
      call.args as Record<string, unknown>,
      refreshToken
    );

    result = await chat.sendMessage([
      {
        functionResponse: {
          name: call.name,
          response: { result: toolResult },
        },
      },
    ]);
  }

  return result.response.text();
}
