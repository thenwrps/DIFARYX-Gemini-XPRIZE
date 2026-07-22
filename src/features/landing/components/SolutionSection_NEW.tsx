import React from 'react';
import { Brain, FileCheck, Layers, Workflow } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const solutionPillars = [
  {
    title: 'Unified Workflow System',
    desc: 'Load signals, preprocess, compare, reason, and report across XRD, XPS, FTIR, and Raman without losing the scientific chain.',
    Icon: Workflow,
  },
  {
    title: 'Scientific Reasoning Layer',
    desc: 'The agent reasons over structured evidence objects, uncertainty, validation gaps, and source-linked interpretations.',
    Icon: Brain,
  },
  {
    title: 'Controllable Preprocessing',
    desc: 'Researchers keep parameters for baseline correction, smoothing, normalization, thresholds, and reference review visible.',
    Icon: FileCheck,
  },
  {
    title: 'Cross-Technique Evidence Fusion',
    desc: 'Technique-specific results connect to supporting data, conflicts, and the next bounded scientific action.',
    Icon: Layers,
  },
];

const contextRows = [
  ['Research objective', 'Resolve structure, surface state, and supporting vibrational evidence'],
  ['Experimental setup', 'Sample, preparation, measurement, processing context'],
  ['Signal inputs', 'XRD, XPS, FTIR, Raman uploads and derived features'],
  ['Output boundary', 'Decision notes with validation gaps kept visible'],
];

export default function SolutionSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>();

  return (
    <section id="product" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-[#f7f9fc] py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(500px,1fr)]">
          <div className={`landing-reveal ${isVisible ? 'is-visible' : ''}`}>
            <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
              DIFARYX is a workflow intelligence system, not an isolated analyzer.
            </h2>
            <p className="mt-5 text-[16px] leading-8 text-slate-600">
              Experimental R&amp;D needs more than a graph viewer or a dashboard. DIFARYX connects objective, setup, uploaded signals, evidence review, agent reasoning, validation gaps, notebook memory, and report generation in one traceable workflow.
            </p>
          </div>

          <div className={`landing-reveal border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] ${isVisible ? 'is-visible' : ''}`}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-[11px] font-semibold uppercase text-blue-700">Context record</div>
                <div className="mt-1 text-[14px] font-semibold text-slate-950">Scientific setup travels with evidence</div>
              </div>
              <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                Traceable
              </span>
            </div>
            <dl className="mt-3 divide-y divide-slate-100">
              {contextRows.map(([term, detail]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]">
                  <dt className="text-[12px] font-semibold text-slate-500">{term}</dt>
                  <dd className="text-[13px] leading-6 text-slate-800">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {solutionPillars.map(({ title, desc, Icon }, index) => (
            <article
              key={title}
              className={`landing-reveal flex gap-4 border border-slate-200 bg-white p-5 ${isVisible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-blue-100 bg-blue-50 text-blue-700">
                <Icon size={19} />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-slate-600">{desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
