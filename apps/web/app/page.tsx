export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full border border-vq-border px-3 py-1 text-sm text-vq-text-lo">
        Day 0 · scaffold
      </span>
      <h1 className="bg-gradient-to-r from-vq-violet to-vq-cyan bg-clip-text text-5xl font-bold text-transparent sm:text-6xl">
        VocalIQ
      </h1>
      <p className="max-w-xl text-lg text-vq-text-lo">
        AI that picks up the phone. The monorepo is live — the visual builder, the live-call
        console, and the signature waveform land in the days ahead.
      </p>
    </main>
  );
}
