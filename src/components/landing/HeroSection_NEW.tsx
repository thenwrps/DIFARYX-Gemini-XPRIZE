import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  createSvgPath,
  generateFtirTrace,
  generateRamanTrace,
  generateXpsTrace,
  generateXrdTrace,
} from '../../data/syntheticTraces';

const heroEvidence = [
  {
    label: 'XRD',
    role: 'phase indication detected',
    boundary: 'reference validation required',
    color: '#38bdf8',
    data: generateXrdTrace(180),
    position: 'lg:left-0 lg:top-8',
    driftX: '10px',
  },
  {
    label: 'XPS',
    role: 'surface oxidation evidence',
    boundary: 'not bulk confirmation',
    color: '#818cf8',
    data: generateXpsTrace(180),
    position: 'lg:right-0 lg:top-20',
    driftX: '-10px',
  },
  {
    label: 'FTIR',
    role: 'functional-group support',
    boundary: 'complementary evidence',
    color: '#2dd4bf',
    data: generateFtirTrace(180),
    position: 'lg:left-2 lg:bottom-20',
    driftX: '8px',
  },
  {
    label: 'Raman',
    role: 'vibrational fingerprint',
    boundary: 'local-structure evidence',
    color: '#a5b4fc',
    data: generateRamanTrace(180),
    position: 'lg:right-1 lg:bottom-5',
    driftX: '-8px',
  },
];

const evidenceConsoleSteps = [
  'Research Objective',
  'Evidence Workspace',
  'Agent Reasoning',
  'Validation Gap',
  'Decision',
  'Notebook / Report',
];

function SpectrumTrace({ data, color }: { data: (typeof heroEvidence)[number]['data']; color: string }) {
  return (
    <svg viewBox="0 0 230 72" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <line x1="8" y1="58" x2="222" y2="58" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
      <line x1="8" y1="36" x2="222" y2="36" stroke="rgba(148,163,184,0.13)" strokeWidth="1" />
      <path
        className="landing-trace-path"
        d={createSvgPath(data, 230, 72, 8)}
        fill="none"
        pathLength={1}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function HeroSection() {
  return (
    <section className="landing-dark-grid bg-[#060b16] text-white">
      <div className="mx-auto max-w-[1280px] px-6 pb-6 pt-8 sm:pt-10 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(560px,1fr)]">
          <div className="landing-hero-copy max-w-[660px]">
            <div className="mb-6 inline-flex items-center gap-3 border border-sky-200/15 bg-white/[0.07] px-3 py-2 text-[11px] font-semibold uppercase text-sky-100 backdrop-blur">
              <span className="h-1.5 w-1.5 bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.8)]" />
              Evidence-linked scientific workflows
            </div>
            <h1 className="max-w-[620px] text-[38px] font-semibold leading-[1.02] text-white sm:text-[48px] lg:text-[56px] xl:text-[60px]">
              Turn experimental signals into traceable scientific decisions.
            </h1>
            <p className="mt-6 max-w-[585px] text-[16px] leading-8 text-slate-200 sm:text-[18px]">
              DIFARYX keeps spectra, experimental context, agent reasoning, validation gaps, and report memory connected so every decision stays tied to evidence.
            </p>
            <p className="mt-5 max-w-[520px] border-l border-sky-300/35 pl-4 text-[14px] leading-7 text-slate-400">
              Built for chemistry and materials R&amp;D across XRD, XPS, FTIR, and Raman.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/demo/agent?project=cu-fe2o4-spinel&mode=demo"
                className="inline-flex h-[52px] items-center justify-center gap-2 bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-[0_20px_60px_rgba(37,99,235,0.34)] transition hover:bg-blue-500"
              >
                Launch Demo
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex h-[52px] items-center justify-center border border-white/20 bg-white/[0.08] px-6 text-[15px] font-semibold text-white backdrop-blur transition hover:border-sky-200/40 hover:bg-white/[0.12]"
              >
                View Evidence Workflow
              </Link>
            </div>
          </div>

          <div className="relative min-h-[580px] lg:min-h-[560px]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-75">
              <SpectrumTrace data={generateXrdTrace(260)} color="rgba(56,189,248,0.48)" />
            </div>
            <div className="pointer-events-none absolute inset-x-8 bottom-8 h-[310px] opacity-35">
              <SpectrumTrace data={generateRamanTrace(260)} color="rgba(129,140,248,0.5)" />
            </div>
            <svg
              viewBox="0 0 700 560"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 hidden h-full w-full opacity-80 lg:block"
              aria-hidden="true"
            >
              <path className="landing-hero-connector" d="M112 98 C184 98 226 132 282 172" />
              <path className="landing-hero-connector" d="M592 152 C518 152 476 158 420 188" />
              <path className="landing-hero-connector" d="M122 438 C200 438 226 404 282 372" />
              <path className="landing-hero-connector" d="M586 474 C520 474 476 438 420 402" />
              <circle cx="282" cy="172" r="3" className="landing-hero-node" />
              <circle cx="420" cy="188" r="3" className="landing-hero-node" />
              <circle cx="282" cy="372" r="3" className="landing-hero-node" />
              <circle cx="420" cy="402" r="3" className="landing-hero-node" />
            </svg>

            <div className="relative z-10 flex min-h-[580px] items-center justify-center lg:min-h-[560px]">
              <div className="w-full max-w-[450px] border border-white/15 bg-slate-950/70 p-4 shadow-[0_32px_120px_rgba(2,6,23,0.68)] backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase text-sky-200">DIFARYX Evidence Console</div>
                    <div className="mt-1 text-[12px] text-slate-400">Traceable characterization workflow</div>
                  </div>
                  <span className="border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold text-emerald-100">
                    Deterministic demo
                  </span>
                </div>

                <div className="mt-4 border border-white/10 bg-white/[0.05] p-3">
                  <div className="text-[10px] font-semibold uppercase text-slate-400">Research Objective</div>
                  <p className="mt-2 text-[13px] leading-6 text-slate-100">
                    Compare structure, surface chemistry, and vibrational support before assigning a bounded next decision.
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {evidenceConsoleSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-sky-200/15 bg-sky-300/10 text-[11px] font-semibold text-sky-100">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="relative flex h-9 flex-1 items-center border border-white/10 bg-white/[0.055] px-3 text-[12px] font-medium text-slate-100">
                        {step}
                        {index < evidenceConsoleSteps.length - 1 && (
                          <span className="landing-console-line absolute -bottom-[9px] left-5 h-[9px] w-px bg-gradient-to-b from-sky-300 via-indigo-300 to-transparent" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-300">
                  <div className="border border-white/10 bg-white/[0.04] px-2 py-2">Evidence sources linked</div>
                  <div className="border border-white/10 bg-white/[0.04] px-2 py-2">Claim boundary visible</div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_138px]">
                  <div className="border border-amber-200/15 bg-amber-100/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-amber-100">Validation boundary</div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-200">
                      Possible phase indication. Reference validation required before a stronger claim.
                    </p>
                  </div>
                  <div className="border border-sky-200/15 bg-sky-200/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-sky-100">Report handoff</div>
                    <div className="mt-2 space-y-1 text-[10px] text-slate-200">
                      <div>Evidence trace</div>
                      <div>Gap notes</div>
                      <div>Decision memory</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-20 -mt-10 grid gap-3 sm:grid-cols-2 lg:absolute lg:inset-0 lg:z-0 lg:mt-0 lg:block">
              {heroEvidence.map((item) => (
                <article
                  key={item.label}
                  className={`landing-evidence-float border border-white/15 bg-white/[0.09] p-3 shadow-[0_20px_80px_rgba(2,6,23,0.44)] backdrop-blur-md lg:absolute lg:w-[218px] ${item.position}`}
                  style={{ '--landing-drift-x': item.driftX } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase text-sky-100">{item.label}</span>
                    <span className="h-1.5 w-1.5" style={{ backgroundColor: item.color }} />
                  </div>
                  <div className="mt-2 h-14 border border-white/10 bg-slate-950/45 px-1">
                    <SpectrumTrace data={item.data} color={item.color} />
                  </div>
                  <div className="mt-2 text-[12px] font-medium text-white">{item.role}</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-300">{item.boundary}</div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
