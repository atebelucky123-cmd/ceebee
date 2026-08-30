import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google";

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: string; // ISO 8601, e.g. "2026-09-02T15:00:00+01:00"
  endTime: string; // ISO 8601
  attendeeEmails?: string[];
  createMeetLink?: boolean;
}

// Creates a calendar event, optionally attaching a Google Meet link and
// inviting attendees. Returns the event details including the Meet link
// if one was requested.
export async function createCalendarEvent(
  refreshToken: string,
  input: CreateEventInput
) {
  const auth = getAuthenticatedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const requestId = `ceebee-${Date.now()}`;

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: input.createMeetLink ? 1 : 0,
    requestBody: {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startTime },
      end: { dateTime: input.endTime },
      attendees: input.attendeeEmails?.map((email) => ({ email })),
      conferenceData: input.createMeetLink
        ? {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          }
        : undefined,
    },
  });

  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    meetLink: data.hangoutLink ?? null,
  };
}

// Lists events between now and `hoursAhead` hours from now. Used for things
// like "what's on my calendar today" or the morning briefing.
// Lists events within an explicit date range -- used for month-grid
// calendar views where "hours from now" doesn't apply (e.g. browsing a
// future or past month).
export async function listEventsInRange(
  refreshToken: string,
  startISO: string,
  endISO: string
) {
  const auth = getAuthenticatedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (data.items ?? []).map((event) => ({
    id: event.id,
    title: event.summary,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    meetLink: event.hangoutLink ?? null,
  }));
}

export async function listUpcomingEvents(
  refreshToken: string,
  hoursAhead: number = 24
) {
  const auth = getAuthenticatedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const later = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: later.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (data.items ?? []).map((event) => ({
    id: event.id,
    title: event.summary,
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    meetLink: event.hangoutLink ?? null,
    attendees: event.attendees?.map((a) => a.email) ?? [],
  }));
}
