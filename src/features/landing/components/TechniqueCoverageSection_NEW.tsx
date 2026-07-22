import React from 'react';
import { Atom, Layers, Sparkle, Waves } from 'lucide-react';
import {
  createSvgPath,
  generateFtirTrace,
  generateRamanTrace,
  generateXpsTrace,
  generateXrdTrace,
  SyntheticTracePoint,
} from '../../../data/syntheticTraces';
import { useLandingReveal } from './useLandingReveal';

const techniques = [
  {
    name: 'XRD',
    fullName: 'X-Ray Diffraction',
    role: 'Crystal structure / phase evidence',
    desc: 'Bulk diffraction evidence helps bound phase and structural assignments.',
    capabilities: ['Peak detection', 'Phase matching', 'Lattice refinement', 'Crystallite size'],
    Icon: Atom,
    color: '#0284c7',
    data: generateXrdTrace(190),
  },
  {
    name: 'XPS',
    fullName: 'X-Ray Photoelectron Spectroscopy',
    role: 'Surface chemistry / oxidation-state evidence',
    desc: 'Surface-sensitive chemistry evidence supports oxidation-state review.',
    capabilities: ['Peak fitting', 'Background subtraction', 'Quantification', 'Oxidation-state assignment'],
    Icon: Layers,
    color: '#4f46e5',
    data: generateXpsTrace(190),
  },
  {
    name: 'FTIR',
    fullName: 'Fourier-Transform Infrared Spectroscopy',
    role: 'Functional group / bonding evidence',
    desc: 'Vibrational band evidence supports functional-group and bonding context.',
    capabilities: ['Baseline correction', 'Band assignment', 'Functional-group detection', 'ATR mode support'],
    Icon: Waves,
    color: '#0f766e',
    data: generateFtirTrace(190),
  },
  {
    name: 'Raman',
    fullName: 'Raman Spectroscopy',
    role: 'Vibrational fingerprint / local-structure evidence',
    desc: 'Mode evidence adds local-structure and vibrational fingerprint context.',
    capabilities: ['Mode assignment', 'Factor group analysis', 'Peak deconvolution', 'Calibration standard'],
    Icon: Sparkle,
    color: '#7c3aed',
    data: generateRamanTrace(190),
  },
];

function TechniqueCurve({ data, color }: { data: SyntheticTracePoint[]; color: string }) {
  return (
    <svg viewBox="0 0 300 92" preserveAspectRatio="none" className="landing-technique-curve h-full w-full" aria-hidden="true">
      <line x1="9" y1="74" x2="291" y2="74" stroke="#cbd5e1" strokeWidth="1" />
      <line x1="9" y1="42" x2="291" y2="42" stroke="#e2e8f0" strokeWidth="1" />
      <path
        d={createSvgPath(data, 300, 92, 9)}
        fill="none"
        pathLength={1}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function TechniqueCoverageSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>({ threshold: 0.12 });

  return (
    <section id="techniques" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-[#f6f8fc] py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className={`landing-reveal max-w-[900px] ${isVisible ? 'is-visible' : ''}`}>
          <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            Four characterization techniques, one evidence workflow
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            DIFARYX treats each technique as a source of bounded scientific evidence. XRD, XPS, FTIR, and Raman results are interpreted in context and linked to reasoning, validation gaps, and report-ready outputs.
          </p>
        </div>

        <div className={`landing-technique-field mt-10 ${isVisible ? 'is-visible' : ''}`}>
          <div className="grid gap-4 lg:grid-cols-4">
            {techniques.map(({ name, fullName, role, desc, capabilities, Icon, color, data }, index) => (
              <article
                key={name}
                className="landing-technique-card border border-slate-200 bg-white p-4 shadow-[0_22px_64px_rgba(15,23,42,0.08)]"
                style={{ '--landing-delay': `${index * 130}ms` } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-200 bg-slate-50" style={{ color }}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <h3 className="text-[18px] font-semibold text-slate-950">{name}</h3>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{fullName}</p>
                  </div>
                </div>

                <div className="mt-4 h-[92px] border border-slate-200 bg-slate-50 px-1">
                  <TechniqueCurve data={data} color={color} />
                </div>

                <div className="mt-4 border-l-2 pl-3" style={{ borderColor: color }}>
                  <div className="text-[12px] font-semibold text-slate-950">{role}</div>
                  <p className="mt-2 text-[12px] leading-5 text-slate-600">{desc}</p>
                </div>

                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {capabilities.map((capability) => (
                    <li key={capability} className="flex gap-2 text-[12px] leading-5 text-slate-600">
                      <span className="mt-2 h-1 w-1 shrink-0" style={{ backgroundColor: color }} />
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="relative hidden h-24 lg:block">
            <svg viewBox="0 0 1000 96" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <path className="landing-fusion-connector" d="M125 0 C125 34 350 48 500 94" />
              <path className="landing-fusion-connector" d="M375 0 C375 34 438 56 500 94" />
              <path className="landing-fusion-connector" d="M625 0 C625 34 562 56 500 94" />
              <path className="landing-fusion-connector" d="M875 0 C875 34 650 48 500 94" />
              <circle cx="500" cy="94" r="4" className="landing-fusion-node" />
            </svg>
          </div>

          <div className="relative border border-blue-200 bg-slate-950 p-6 text-white shadow-[0_30px_92px_rgba(15,23,42,0.22)] lg:mx-auto lg:max-w-[960px]">
            <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-start">
              <div>
                <div className="text-[11px] font-semibold uppercase text-sky-200">Central evidence panel</div>
                <h3 className="mt-3 text-[24px] font-semibold leading-tight text-white">
                  Cross-Technique Evidence Fusion
                </h3>
              </div>
              <div>
                <p className="text-[14px] leading-7 text-slate-200">
                  Compare XRD phase assignments with XPS oxidation states, FTIR functional groups, and Raman vibrational modes in a unified evidence workspace. The agent synthesizes evidence across techniques to strengthen supporting data and identify conflicts.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <div className="border border-sky-200/15 bg-white/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-sky-100">Supporting evidence</div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-200">Phase, surface, bond, and mode signals remain source-linked.</p>
                  </div>
                  <div className="border border-amber-200/15 bg-amber-100/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-amber-100">Validation gap</div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-200">Reference validation required before phase-purity confirmation.</p>
                  </div>
                  <div className="border border-emerald-200/15 bg-emerald-100/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-emerald-100">Next scientific action</div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-200">Use the conflict review to bound the next measurement.</p>
                  </div>
                  <div className="border border-indigo-200/15 bg-indigo-100/[0.07] p-3">
                    <div className="text-[10px] font-semibold uppercase text-indigo-100">Report-ready discussion</div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-200">Notebook memory keeps evidence, gaps, and decision notes together.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
