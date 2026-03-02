import Link from "next/link";
import CTASection from "@/components/CTASection";
import {
  ArrowRight,
  Zap,
  Bot,
  Database,
  Target,
  Puzzle,
  Clock,
  TrendingDown,
  AlertTriangle,
  Users,
  CheckCircle,
  BarChart3,
} from "lucide-react";

const solutions = [
  {
    icon: Zap,
    title: "Workflow Automation",
    description:
      "Automate multi-step business processes across tools — approvals, notifications, data routing, and more.",
    href: "/solutions/workflow-automation",
  },
  {
    icon: Bot,
    title: "AI Assistants & Chatbots",
    description:
      "Customer-facing and internal AI assistants for support, sales, and onboarding.",
    href: "/solutions/workflow-automation",
  },
  {
    icon: Database,
    title: "Data Pipeline Automation",
    description:
      "Automated data collection, transformation, reporting, and syncing across systems.",
    href: "/solutions/workflow-automation",
  },
  {
    icon: Target,
    title: "CRM & Sales Automation",
    description:
      "Lead scoring, follow-up sequences, deal tracking, and pipeline management on autopilot.",
    href: "/solutions/workflow-automation",
  },
  {
    icon: Puzzle,
    title: "Custom Integrations",
    description:
      "Connect tools that don't natively talk to each other via APIs and intelligent middleware.",
    href: "/solutions/workflow-automation",
  },
];

const painPoints = [
  {
    icon: Clock,
    title: "20+ hours/week wasted",
    description:
      "Your team spends a full day every week on tasks that could take zero human time.",
  },
  {
    icon: Users,
    title: "Scaling means more headcount",
    description:
      "Every growth goal requires hiring more people instead of building smarter systems.",
  },
  {
    icon: AlertTriangle,
    title: "Manual errors cost real money",
    description:
      "Handoff mistakes, missed follow-ups, and data entry errors are silently eating your margins.",
  },
  {
    icon: TrendingDown,
    title: "Competitors are moving faster",
    description:
      "While you handle things manually, others have already automated and pulled ahead.",
  },
];

const steps = [
  {
    number: "01",
    title: "AI Audit",
    description:
      "We map your workflows, identify automation opportunities, and build a prioritized roadmap ranked by ROI.",
  },
  {
    number: "02",
    title: "Design & Build",
    description:
      "We architect and build your automations, test everything rigorously, and prepare for a seamless launch.",
  },
  {
    number: "03",
    title: "Launch & Scale",
    description:
      "Go live, monitor performance, optimize based on real data, then expand automations across your business.",
  },
];

const stats = [
  { value: "150+", label: "Automations Built" },
  { value: "12,000+", label: "Hours Saved" },
  { value: "$2.4M", label: "Operational Savings" },
  { value: "98%", label: "Client Retention" },
];

export default function HomePage() {
  return (
    <>
      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950">
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-sky-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-sky-500/10 border border-sky-500/20 rounded-full text-sky-300 text-sm font-medium mb-6">
              <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
              AI-Powered Business Automation
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Stop Hiring for Tasks{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
                AI Can Handle
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 leading-relaxed mb-8 max-w-2xl">
              We design, build, and maintain end-to-end AI automations that save
              your team thousands of hours, eliminate costly errors, and let you
              scale without scaling headcount.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/audit"
                className="inline-flex items-center justify-center px-8 py-4 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/25 text-base"
              >
                Get Your $49 Automation Audit
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link
                href="/how-we-work"
                className="inline-flex items-center justify-center px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition-all border border-white/10 text-base"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SOCIAL PROOF BAR ========== */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PAIN POINTS ========== */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Sound Familiar?
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              These are the problems we solve every day for businesses like
              yours.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {painPoints.map((point) => (
              <div
                key={point.title}
                className="p-6 bg-gray-50 rounded-2xl border border-gray-100 card-hover"
              >
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center mb-4">
                  <point.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {point.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SOLUTIONS OVERVIEW ========== */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What We Build
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              End-to-end AI automations across your entire business — from
              strategy to deployment to ongoing optimization.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {solutions.map((solution) => (
              <Link
                key={solution.title}
                href={solution.href}
                className="group p-6 bg-white rounded-2xl border border-gray-100 card-hover"
              >
                <div className="w-12 h-12 bg-sky-50 text-sky-500 rounded-xl flex items-center justify-center mb-4 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                  <solution.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-sky-600 transition-colors">
                  {solution.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-4">
                  {solution.description}
                </p>
                <span className="inline-flex items-center text-sm font-medium text-sky-500 group-hover:text-sky-600">
                  Learn more <ArrowRight className="ml-1 w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              From first call to live automation in weeks, not months.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.number} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-sky-200 to-transparent -translate-x-8" />
                )}
                <div className="text-5xl font-bold text-sky-100 mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              href="/how-we-work"
              className="inline-flex items-center text-sky-500 font-semibold hover:text-sky-600 transition-colors"
            >
              Learn more about our process{" "}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ========== FEATURED CASE STUDY ========== */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <div className="grid lg:grid-cols-2">
              <div className="p-8 sm:p-12 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-semibold uppercase tracking-wider mb-6 w-fit">
                  Case Study
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                  How a 50-person services firm cut invoice processing from 4
                  hours to 12 minutes
                </h3>
                <p className="text-gray-500 leading-relaxed mb-6">
                  A growing professional services company was losing a full
                  workday every week to manual invoice processing. We built an
                  AI-powered pipeline that extracts, validates, and routes
                  invoices automatically — with human review only for
                  exceptions.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">95%</div>
                    <div className="text-xs text-gray-500">Time Reduction</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      $140K
                    </div>
                    <div className="text-xs text-gray-500">Annual Savings</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">0</div>
                    <div className="text-xs text-gray-500">
                      Errors Since Launch
                    </div>
                  </div>
                </div>
                <Link
                  href="/audit"
                  className="inline-flex items-center text-sky-500 font-semibold hover:text-sky-600 transition-colors"
                >
                  Get your personalized audit{" "}
                  <ArrowRight className="ml-1 w-4 h-4" />
                </Link>
              </div>
              <div className="bg-gradient-to-br from-sky-500 to-cyan-500 p-8 sm:p-12 flex items-center justify-center">
                <div className="text-center text-white">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-80" />
                  <blockquote className="text-lg font-medium italic opacity-90 mb-4">
                    &quot;Flowbotics didn&apos;t just automate a process — they
                    gave us back an entire day every week. That&apos;s the kind
                    of ROI that changes how you think about growth.&quot;
                  </blockquote>
                  <div className="text-sm opacity-70">
                    — Operations Director, Professional Services Firm
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== USE CASES TEASER ========== */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Automations for Every Team
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              No matter what department, there are processes eating your
              team&apos;s time that AI can handle.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Operations",
                examples: [
                  "Automated approval workflows",
                  "Inventory tracking and alerts",
                  "Vendor onboarding pipelines",
                ],
              },
              {
                title: "Sales & Marketing",
                examples: [
                  "Lead scoring and routing",
                  "Automated follow-up sequences",
                  "Campaign performance dashboards",
                ],
              },
              {
                title: "Finance & Accounting",
                examples: [
                  "Invoice processing and matching",
                  "Expense report automation",
                  "Financial reconciliation",
                ],
              },
              {
                title: "Customer Support",
                examples: [
                  "AI-powered ticket triage",
                  "Automated FAQ responses",
                  "Escalation routing",
                ],
              },
              {
                title: "HR & Recruiting",
                examples: [
                  "Resume screening automation",
                  "Onboarding task workflows",
                  "PTO tracking and approvals",
                ],
              },
              {
                title: "IT & Engineering",
                examples: [
                  "Alert monitoring and routing",
                  "Automated deployment pipelines",
                  "License management",
                ],
              },
            ].map((category) => (
              <div
                key={category.title}
                className="p-6 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {category.title}
                </h3>
                <ul className="space-y-2">
                  {category.examples.map((example) => (
                    <li key={example} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                      <span className="text-sm text-gray-600">{example}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <CTASection />
    </>
  );
}
