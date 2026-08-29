import { google } from "googleapis";

// Scopes CeeBee needs: read/send email, full calendar access (for creating
// events + Meet links), and basic profile info to tell accounts apart.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI in your .env file."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Builds the URL you send the browser to for the Google consent screen.
// `state` lets us tag which login attempt this is (useful once you add
// multiple Google accounts).
export function getGoogleAuthUrl(state?: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent", // forces Google to always return a refresh_token
    scope: GOOGLE_SCOPES,
    state,
  });
}

// Given a refresh token stored in Supabase, returns an authenticated OAuth2
// client ready to pass into the Calendar/Gmail API clients.
export function getAuthenticatedClient(refreshToken: string) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
