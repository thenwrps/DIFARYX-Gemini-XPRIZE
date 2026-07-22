import React from 'react';
import { FileQuestion, FileText, GitBranch, Layers, Lock, RefreshCw } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const workflowFragments = [
  {
    title: 'Instrument software',
    detail: 'Raw acquisition',
    Icon: Layers,
    scatterX: '-18px',
    scatterY: '-18px',
    scatterR: '-2deg',
  },
  {
    title: 'Origin / CasaXPS / Python',
    detail: 'Plot, fit, script',
    Icon: GitBranch,
    scatterX: '24px',
    scatterY: '-12px',
    scatterR: '2deg',
  },
  {
    title: 'Spreadsheets',
    detail: 'Manual parameters',
    Icon: Lock,
    scatterX: '-28px',
    scatterY: '10px',
    scatterR: '1.5deg',
  },
  {
    title: 'Manual lab notes',
    detail: 'Context and caveats',
    Icon: FileQuestion,
    scatterX: '22px',
    scatterY: '18px',
    scatterR: '-2deg',
  },
  {
    title: 'Report drafts',
    detail: 'Late-stage synthesis',
    Icon: FileText,
    scatterX: '-14px',
    scatterY: '24px',
    scatterR: '-1deg',
  },
  {
    title: 'Repeated preprocessing',
    detail: 'Baseline and peaks',
    Icon: RefreshCw,
    scatterX: '30px',
    scatterY: '-2px',
    scatterR: '2.5deg',
  },
];

const corePains = [
  {
    number: '01',
    title: 'Fragmented tools',
    detail: 'Signal files, scripts, figures, and notes split context before interpretation begins.',
  },
  {
    number: '02',
    title: 'Disconnected interpretation',
    detail: 'XRD, XPS, FTIR, and Raman claims are compared across handoffs instead of evidence objects.',
  },
  {
    number: '03',
    title: 'Weak reproducibility',
    detail: 'Preprocessing choices, assumptions, and decision logic drift away from the final discussion.',
  },
];

export default function ProblemSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>({ threshold: 0.24 });

  return (
    <section id="problem" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-[#f6f8fc] py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(520px,1fr)] lg:items-start">
          <div className={`landing-reveal ${isVisible ? 'is-visible' : ''}`}>
            <h2 className="max-w-[620px] text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
              The bottleneck is not data generation. The bottleneck is interpretation and workflow execution.
            </h2>
            <p className="mt-5 max-w-[610px] text-[16px] leading-8 text-slate-600">
              Researchers move between acquisition software, Origin, CasaXPS, Python, spreadsheets, lab notes, and report drafts. Exports, conversions, repeated preprocessing, and manual figure preparation break the reasoning chain before a decision is documented.
            </p>
          </div>

          <div className={`landing-problem-map ${isVisible ? 'is-visible' : ''}`}>
            <div className="landing-lab-desk relative overflow-hidden border border-slate-200 bg-[#e8eef7] p-4 shadow-[0_26px_80px_rgba(15,23,42,0.11)]">
              <div className="pointer-events-none absolute -left-5 top-5 w-[180px] rotate-[-5deg] border border-slate-200 bg-white/85 p-3 shadow-[0_14px_35px_rgba(15,23,42,0.13)]">
                <div className="text-[10px] font-semibold uppercase text-slate-500">XRD pattern</div>
                <svg viewBox="0 0 160 54" className="mt-2 h-12 w-full" aria-hidden="true">
                  <path d="M4 45 L22 44 L27 12 L31 44 L52 43 L59 26 L63 43 L83 42 L91 8 L95 42 L110 41 L118 29 L122 41 L156 40" fill="none" stroke="#2563eb" strokeWidth="1.7" />
                  <line x1="4" y1="46" x2="156" y2="46" stroke="#cbd5e1" />
                </svg>
              </div>
              <div className="pointer-events-none absolute right-3 top-3 w-[176px] rotate-[4deg] border border-slate-200 bg-[#fff7d9]/85 p-3 text-[10px] leading-5 text-slate-600 shadow-[0_14px_35px_rgba(15,23,42,0.13)]">
                <div className="font-semibold text-slate-700">Lab note</div>
                <div>Check background.</div>
                <div>Compare reference.</div>
                <div>Preserve parameters.</div>
              </div>
              <div className="pointer-events-none absolute bottom-4 left-1/2 hidden w-[188px] -translate-x-1/2 rotate-[1deg] border border-slate-200 bg-white/80 p-3 shadow-[0_14px_35px_rgba(15,23,42,0.13)] sm:block">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>Report draft</span>
                  <span>Discussion</span>
                </div>
                <div className="mt-2 space-y-1">
                  <span className="block h-px bg-slate-200" />
                  <span className="block h-px w-11/12 bg-slate-200" />
                  <span className="block h-px w-4/5 bg-slate-200" />
                </div>
              </div>
              <div className="relative z-10 mb-4 flex flex-wrap gap-2 pt-[86px] text-[10px] font-semibold uppercase text-slate-500 sm:pt-16">
                <span className="border border-slate-200 bg-white/70 px-2 py-1">Scattered files</span>
                <span className="border border-slate-200 bg-white/70 px-2 py-1">Notebook assumptions</span>
                <span className="border border-slate-200 bg-white/70 px-2 py-1">Manual exports</span>
              </div>
              <div className="relative z-10 grid gap-3 sm:grid-cols-2">
                {workflowFragments.map(({ title, detail, Icon, scatterX, scatterY, scatterR }, index) => (
                  <div
                    key={title}
                    className="landing-fragment flex min-h-[98px] items-start gap-3 border border-slate-200 bg-white/90 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)]"
                    style={{
                      '--landing-delay': `${index * 70}ms`,
                      '--landing-scatter-x': scatterX,
                      '--landing-scatter-y': scatterY,
                      '--landing-scatter-r': scatterR,
                    } as React.CSSProperties}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-blue-100 bg-blue-50 text-blue-700">
                      <Icon size={17} />
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-slate-950">{title}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-slate-500">{detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {corePains.map((pain, index) => (
                <article
                  key={pain.title}
                  className="landing-pain border-t-2 border-blue-600 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)]"
                  style={{ '--landing-delay': `${480 + index * 120}ms` } as React.CSSProperties}
                >
                  <div className="text-[11px] font-semibold text-blue-700">{pain.number}</div>
                  <h3 className="mt-2 text-[15px] font-semibold text-slate-950">{pain.title}</h3>
                  <p className="mt-2 text-[12px] leading-6 text-slate-600">{pain.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
