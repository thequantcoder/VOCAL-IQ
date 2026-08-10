/** Privacy Policy (Day 60) — region-aware data-handling disclosure. Placeholder legal copy the
 *  operator customizes per jurisdiction; the structure satisfies GDPR/CCPA transparency needs. */
export const metadata = { title: 'Privacy Policy · VocalIQ' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-vq-text-hi">
      <h1 className="mb-6 font-display font-semibold text-2xl">Privacy Policy</h1>
      <div className="flex flex-col gap-4 text-sm text-vq-text-lo leading-relaxed">
        <p>
          VocalIQ processes call audio, transcripts, and contact data on behalf of the businesses
          (tenants) that operate voice agents. This policy explains what we collect, why, and the
          rights you have over your data.
        </p>
        <Section title="Data we process">
          Call recordings and transcripts, contact identifiers (phone, name), consent records, and
          usage/billing metadata. Provider API keys are encrypted at rest and never exposed.
        </Section>
        <Section title="Legal basis & consent">
          In two-party-consent regions we capture and store an explicit recording disclosure before
          a call is recorded. You may withdraw consent and request suppression (do-not-call) at any
          time.
        </Section>
        <Section title="Retention & deletion">
          Each tenant configures retention windows; recordings, transcripts, and agent memory are
          automatically deleted past their window. You may request erasure of your personal data.
        </Section>
        <Section title="PII & PCI">
          Transcripts can be automatically redacted of emails, phone numbers, government IDs, and
          card numbers. Card data captured for payment is never written to a transcript or
          recording.
        </Section>
        <Section title="Your rights">
          Access, rectification, erasure, portability, and objection. Contact your tenant
          administrator or privacy@vocaliq.dev to exercise them.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-medium text-vq-text-hi">{title}</h2>
      <p>{children}</p>
    </div>
  );
}
