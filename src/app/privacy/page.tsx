import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · CeeBee" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="10 OCTOBER 2026">
      <p>
        CeeBee is a personal assistant built and used by its owner. This policy explains what CeeBee accesses when you
        connect a Google account, and what it does with it.
      </p>

      <h2>What CeeBee accesses</h2>
      <ul>
        <li>
          <strong>Gmail:</strong> reads your recent inbox messages so CeeBee can list, summarise and help you reply to
          them, and sends email only when you press Send on a draft.
        </li>
        <li>
          <strong>Google Calendar:</strong> reads, creates, edits and deletes events when you ask CeeBee to.
        </li>
        <li>
          <strong>Your email address:</strong> used to tell connected accounts apart.
        </li>
      </ul>

      <h2>How it&apos;s used</h2>
      <p>
        Your data is used only to provide CeeBee&apos;s features to you. It is not sold, not used for advertising, and
        not shared with anyone except the services that make CeeBee work:
      </p>
      <ul>
        <li>Supabase, which stores your connection, schedule, tasks, notes and chat history.</li>
        <li>Groq and Google Gemini, which process the text needed to answer you and to speak CeeBee&apos;s replies.</li>
        <li>Vercel, which hosts the app.</li>
      </ul>
      <p>
        CeeBee&apos;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Removing access</h2>
      <p>
        You can disconnect CeeBee at any time from your Google Account&apos;s{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
          third-party access settings
        </a>
        . To have your stored data deleted, contact the owner (see below).
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: use the support email shown on CeeBee&apos;s Google sign-in screen.</p>
    </LegalPage>
  );
}
