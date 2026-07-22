import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

type WorkflowStepKey = 'objective' | 'setup' | 'evidence' | 'reasoning' | 'gap' | 'decision' | 'memory';

type WorkflowStep = {
  key: WorkflowStepKey;
  number: string;
  title: string;
  summary: string;
};

const workflowSteps: WorkflowStep[] = [
  {
    key: 'objective',
    number: '01',
    title: 'Research Objective',
    summary: 'Start with the scientific question and the claim boundary the workflow must respect.',
  },
  {
    key: 'setup',
    number: '02',
    title: 'Experimental Setup',
    summary: 'Attach sample, technique, preparation, measurement, and processing context.',
  },
  {
    key: 'evidence',
    number: '03',
    title: 'Evidence Workspace',
    summary: 'Turn technique-specific signals into reviewable evidence objects.',
  },
  {
    key: 'reasoning',
    number: '04',
    title: 'Agent Reasoning',
    summary: 'Compare support, conflicts, uncertainty, and provenance across evidence.',
  },
  {
    key: 'gap',
    number: '05',
    title: 'Validation Gap',
    summary: 'Expose what the current evidence cannot confirm yet.',
  },
  {
    key: 'decision',
    number: '06',
    title: 'Next Experiment / Decision',
    summary: 'Prepare a bounded recommendation or the next scientific action.',
  },
  {
    key: 'memory',
    number: '07',
    title: 'Notebook Memory / Report',
    summary: 'Compile evidence, reasoning, gaps, and decision notes into scientific memory.',
  },
];

const setupFields = [
  ['Sample', 'CuFe2O4 catalyst batch'],
  ['Technique', 'XRD + XPS + FTIR + Raman'],
  ['Preparation', 'Powder mount and surface review'],
  ['Measurement', 'Instrument metadata retained'],
  ['Processing', 'Baseline, thresholds, references'],
];

const evidenceCards = [
  ['XRD', 'Crystal structure / phase evidence'],
  ['XPS', 'Surface oxidation evidence'],
  ['FTIR', 'Functional-group support'],
  ['Raman', 'Local-structure fingerprint'],
];

function WorkflowPreview({ step }: { step: WorkflowStep }) {
  if (step.key === 'objective') {
    return (
      <div className="space-y-3">
        <div className="border border-blue-100 bg-blue-50 p-4">
          <div className="text-[11px] font-semibold uppercase text-blue-700">Structured goal card</div>
          <p className="mt-2 text-[15px] font-medium leading-7 text-slate-950">
            Determine whether cross-technique evidence supports a possible phase indication without overstating phase purity.
          </p>
        </div>
        <div className="grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 px-3 py-2">Objective linked</div>
          <div className="border border-slate-200 bg-slate-50 px-3 py-2">Claim boundary defined</div>
        </div>
      </div>
    );
  }

  if (step.key === 'setup') {
    return (
      <dl className="divide-y divide-slate-100 border border-slate-200 bg-slate-50 px-4">
        {setupFields.map(([term, value]) => (
          <div key={term} className="grid gap-1 py-3 sm:grid-cols-[110px_1fr]">
            <dt className="text-[11px] font-semibold uppercase text-slate-500">{term}</dt>
            <dd className="text-[13px] leading-5 text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (step.key === 'evidence') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {evidenceCards.map(([technique, role]) => (
          <div key={technique} className="border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase text-blue-700">{technique}</div>
            <p className="mt-2 text-[12px] leading-5 text-slate-700">{role}</p>
          </div>
        ))}
      </div>
    );
  }

  if (step.key === 'reasoning') {
    return (
      <div className="space-y-2">
        {[
          'Evidence objects parsed with source references',
          'Candidate interpretation compared against support',
          'Uncertainty and conflicts stay visible',
        ].map((line, index) => (
          <div key={line} className="flex gap-3 border border-slate-200 bg-slate-50 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-slate-950 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="text-[13px] leading-6 text-slate-700">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  if (step.key === 'gap') {
    return (
      <div className="border border-amber-200 bg-amber-50 p-4">
        <div className="text-[11px] font-semibold uppercase text-amber-800">Validation gap</div>
        <div className="mt-3 border-l-2 border-amber-500 pl-3">
          <div className="text-[14px] font-semibold text-slate-950">Reference validation required</div>
          <p className="mt-2 text-[13px] leading-6 text-slate-700">
            Current support is not phase-purity confirmation. Complementary evidence is needed before a stronger claim.
          </p>
        </div>
      </div>
    );
  }

  if (step.key === 'decision') {
    return (
      <div className="space-y-3">
        <div className="border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[11px] font-semibold uppercase text-emerald-800">Bounded recommendation</div>
          <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-950">
            Continue with reference comparison and targeted follow-up measurement before elevating the interpretation.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-600">
          <span className="bg-slate-950 px-2 py-1 font-semibold text-white">Decision note</span>
          <ArrowRight size={14} />
          <span>Next experiment saved</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {['Evidence', 'Reasoning trace', 'Gap notes'].map((item) => (
          <div key={item} className="border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] font-medium text-slate-700">
            {item}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center">
        <div className="text-[13px] font-semibold text-slate-950">Notebook Memory</div>
        <ArrowRight size={15} className="text-blue-700" />
        <div className="text-[13px] leading-5 text-slate-700">Report-ready scientific discussion</div>
      </div>
    </div>
  );
}

export default function ProductFunctionSection() {
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.workflowIndex);
            setActiveIndex(index);
          }
        });
      },
      {
        rootMargin: '-32% 0px -45% 0px',
        threshold: 0.15,
      },
    );

    stepRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  const activeStep = workflowSteps[activeIndex];

  return (
    <section id="workflow" className="scroll-mt-24 border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className="max-w-[860px]">
          <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            One scientific journey from goal to report.
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            The canonical DIFARYX workflow keeps objective, experimental setup, evidence review, reasoning, validation, decision, and memory connected as the visitor moves through the story.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(460px,1fr)] lg:items-start">
          <div className="space-y-5">
            {workflowSteps.map((step, index) => {
              const isActive = index === activeIndex;

              return (
                <article
                  key={step.key}
                  ref={(node) => {
                    stepRefs.current[index] = node;
                  }}
                  data-workflow-index={index}
                  className={`relative min-h-[188px] border p-5 transition-colors duration-500 ${
                    isActive
                      ? 'border-blue-300 bg-blue-50 shadow-[0_24px_64px_rgba(37,99,235,0.12)]'
                      : 'border-slate-200 bg-[#fbfcfe]'
                  }`}
                >
                  <div className="flex gap-4">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center text-[13px] font-semibold ${
                        isActive ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-[18px] font-semibold text-slate-950">{step.title}</h3>
                      <p className="mt-3 max-w-[480px] text-[14px] leading-7 text-slate-600">{step.summary}</p>
                    </div>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <span className="absolute left-[41px] top-[72px] h-[calc(100%+20px)] w-px bg-gradient-to-b from-blue-200 via-slate-200 to-transparent" />
                  )}
                </article>
              );
            })}
          </div>

          <aside className="border border-slate-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.12)] lg:sticky lg:top-28">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-[11px] font-semibold uppercase text-blue-700">Active workflow panel</div>
                <h3 className="mt-2 text-[22px] font-semibold text-slate-950">{activeStep.title}</h3>
              </div>
              <span className="bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white">{activeStep.number}</span>
            </div>
            <div className="mt-5">
              <WorkflowPreview step={activeStep} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
