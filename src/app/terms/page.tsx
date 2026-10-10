import type { Metadata } from "next";
import LegalPage from "../components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · CeeBee" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="10 OCTOBER 2026">
      <p>
        CeeBee is a personal assistant provided as-is for its owner&apos;s own use. By connecting a Google account you
        agree to these terms.
      </p>

      <h2>What CeeBee does</h2>
      <p>
        CeeBee helps manage your schedule, tasks, notes, reminders, calendar and email. It can make mistakes, so check
        anything important. It drafts emails but never sends one unless you press Send.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Only connect Google accounts you own or are allowed to use.</li>
        <li>Review drafts and changes CeeBee makes before relying on them.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        CeeBee is provided without warranty of any kind. Its owner isn&apos;t liable for missed reminders, incorrect
        summaries, or other losses arising from its use.
      </p>

      <h2>Privacy</h2>
      <p>
        How your data is handled is described in the <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Contact</h2>
      <p>Use the support email shown on CeeBee&apos;s Google sign-in screen.</p>
    </LegalPage>
  );
}
