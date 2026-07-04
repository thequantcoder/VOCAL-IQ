/** Terms of Service (Day 60) — placeholder legal copy the operator customizes. */
export const metadata = { title: 'Terms of Service · VocalIQ' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-vq-text-hi">
      <h1 className="mb-6 font-display font-semibold text-2xl">Terms of Service</h1>
      <div className="flex flex-col gap-4 text-sm text-vq-text-lo leading-relaxed">
        <p>
          By using VocalIQ you agree to operate voice agents lawfully: obtain the consent required
          in your jurisdiction, honor do-not-call requests, disclose AI use where required, and not
          use the platform for spam, fraud, or abuse.
        </p>
        <p>
          You are responsible for the content of your agents and the calls you place. VocalIQ
          provides anti-abuse controls (DNC, consent capture, rate limits, AI disclosure); you must
          use them in accordance with applicable law (TCPA, GDPR, and local regulations).
        </p>
        <p>
          Service is provided &ldquo;as is.&rdquo; Billing, plan limits, and acceptable-use terms
          are set by your platform operator. Continued use constitutes acceptance of these terms.
        </p>
      </div>
    </main>
  );
}
