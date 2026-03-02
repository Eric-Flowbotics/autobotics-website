import { ArrowRight, CheckCircle } from "lucide-react";

const tallyUrl = "https://tally.so/r/zxK06R";

const deliverables = [
  "Time waste analysis (where hours are leaking)",
  "Top automation opportunities ranked by impact vs effort",
  "3 quick wins you can implement immediately",
  "Tool recommendations based on your stack and budget",
  "90-day implementation roadmap",
  "Estimated hours and dollar savings",
];

const fit = [
  "Solopreneurs and small teams buried in repetitive admin",
  "Businesses already using common tools (Google Workspace, Stripe, Calendly, Shopify, etc.)",
  "Operators who want a clear plan before paying for full implementation",
];

const notFit = [
  "Done-for-you full implementation for $49",
  "Enterprise security/architecture consulting",
  "People who won’t execute recommendations",
];

const faqs = [
  {
    q: "Is this generic AI advice?",
    a: "No. The report is built from your intake answers: business type, workflow pain points, tool stack, and budget constraints.",
  },
  {
    q: "How fast is delivery?",
    a: "Most audits are delivered in under 24 hours. SLA is 24–48 hours.",
  },
  {
    q: "Do I need technical skills?",
    a: "No. The report is written in plain language with concrete next steps.",
  },
  {
    q: "Is implementation included?",
    a: "This offer is the diagnostic roadmap. Implementation support can be scoped separately.",
  },
];

export default function AuditPage() {
  return (
    <main className="bg-slate-950 text-slate-100">
      <section className="max-w-5xl mx-auto px-6 py-20">
        <p className="inline-block mb-4 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sm text-sky-300">
          $49 one-time • Delivery in 24–48 hours • No sales call required
        </p>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
          Stop guessing what to automate.
          <br />
          Get a personalized automation plan in 48 hours.
        </h1>
        <p className="text-lg text-slate-300 max-w-3xl mb-8">
          I analyze your real workflow, tools, and bottlenecks, then deliver a
          practical roadmap you can execute immediately.
        </p>
        <a
          href={tallyUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-6 py-3 font-semibold text-slate-950"
        >
          Get My Audit
          <ArrowRight className="w-5 h-5" />
        </a>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-8">
        <h2 className="text-2xl font-semibold mb-4">What you get</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {deliverables.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <CheckCircle className="w-5 h-5 text-sky-300 mt-0.5 shrink-0" />
              <p className="text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-3">Who it’s for</h3>
          <ul className="space-y-2 text-slate-300">
            {fit.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-3">Who it’s not for</h3>
          <ul className="space-y-2 text-slate-300">
            {notFit.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <h3 className="text-2xl font-semibold mb-6">FAQ</h3>
        <div className="space-y-4">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="font-semibold mb-2">{f.q}</p>
              <p className="text-slate-300">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 text-center">
        <p className="text-xl mb-4">You don’t need another tool tutorial. You need a plan.</p>
        <a
          href={tallyUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-8 py-4 font-semibold text-slate-950"
        >
          Get My Audit for $49
          <ArrowRight className="w-5 h-5" />
        </a>
      </section>
    </main>
  );
}
