import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, FileText, Play, Settings } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const agentFlow = [
  'Evidence Object',
  'Candidate Interpretation',
  'Conflict / Uncertainty',
  'Validation Gap',
  'Bounded Decision',
];

const claimLanguage = [
  'possible phase indication',
  'supporting evidence',
  'reference validation required',
  'not phase-purity confirmation',
  'complementary evidence needed',
];

const compileSources = ['Evidence', 'Reasoning trace', 'Validation gaps', 'Decision notes'];

const demoFeatures = [
  {
    title: 'Deterministic workflow run',
    detail: 'Plan steps, execute tools, and collect evidence step by step.',
    Icon: Play,
  },
  {
    title: 'Visible interpretation',
    detail: 'Inspect support, conflict analysis, uncertainty, and provenance.',
    Icon: Eye,
  },
  {
    title: 'Report handoff',
    detail: 'Carry supporting data into a traceable scientific discussion.',
    Icon: FileText,
  },
  {
    title: 'Parameter control',
    detail: 'Review preprocessing choices and source-linked evidence.',
    Icon: Settings,
  },
];

export default function AgentDemoSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>({ threshold: 0.14 });

  return (
    <section id="demo" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.84fr)_minmax(520px,1fr)] lg:items-start">
          <div className={`landing-reveal ${isVisible ? 'is-visible' : ''}`}>
            <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
              The agent reasons over structured evidence instead of generating a loose conclusion.
            </h2>
            <p className="mt-5 text-[16px] leading-8 text-slate-600">
              DIFARYX makes uncertainty visible. Evidence objects, candidate interpretations, conflicts, validation requirements, and bounded decisions remain part of the workflow state.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {claimLanguage.map((phrase) => (
                <span key={phrase} className="border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700">
                  {phrase}
                </span>
              ))}
            </div>
          </div>

          <div className={`landing-reveal border border-slate-200 bg-[#f8faff] p-5 shadow-[0_28px_82px_rgba(15,23,42,0.11)] ${isVisible ? 'is-visible' : ''}`}>
            <div className="border-b border-slate-200 pb-4">
              <div className="text-[11px] font-semibold uppercase text-blue-700">Reasoning flow</div>
              <div className="mt-2 text-[16px] font-semibold text-slate-950">Evidence-bound interpretation path</div>
            </div>
            <div className="mt-5 space-y-2">
              {agentFlow.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  <span className={`h-px w-5 shrink-0 ${index === agentFlow.length - 1 ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                  <div className="flex-1 border border-slate-200 bg-white px-4 py-3 text-[13px] font-semibold text-slate-800">
                    {step}
                  </div>
                  {index < agentFlow.length - 1 && <ArrowRight size={15} className="text-slate-400" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`landing-compile-field mt-16 ${isVisible ? 'is-visible' : ''}`}>
          <div className="max-w-[860px]">
            <h3 className="text-[28px] font-semibold leading-tight text-slate-950 lg:text-[36px]">
              Scientific memory compiles the trace, not only the final answer.
            </h3>
            <p className="mt-4 text-[16px] leading-8 text-slate-600">
              DIFARYX preserves scientific memory by keeping evidence, parameters, assumptions, reasoning steps, validation gaps, and decisions connected from analysis to report.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(260px,0.58fr)_auto_minmax(0,1fr)] lg:items-center">
            <div className="space-y-3">
              {compileSources.map((source, index) => (
                <div
                  key={source}
                  className="landing-compile-source border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-semibold text-slate-700"
                  style={{ '--landing-delay': `${index * 90}ms` } as React.CSSProperties}
                >
                  {source}
                </div>
              ))}
            </div>

            <div className="hidden items-center justify-center lg:flex">
              <ArrowRight size={28} className="text-blue-600" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="border border-blue-200 bg-blue-50 p-5">
                <div className="text-[11px] font-semibold uppercase text-blue-700">Notebook Memory</div>
                <p className="mt-3 text-[14px] leading-7 text-slate-800">
                  Evidence, parameters, assumptions, caveats, and the next scientific action stay connected.
                </p>
              </article>
              <article className="border border-slate-200 bg-white p-5 shadow-[0_22px_62px_rgba(15,23,42,0.08)]">
                <div className="text-[11px] font-semibold uppercase text-slate-500">Report-ready Scientific Discussion</div>
                <p className="mt-3 text-[14px] leading-7 text-slate-800">
                  The discussion carries visible support, claim boundaries, and validation notes into review.
                </p>
              </article>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-slate-200 pt-10">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {demoFeatures.map(({ title, detail, Icon }) => (
              <article key={title} className="border border-slate-200 bg-[#fbfcfe] p-4">
                <span className="flex h-9 w-9 items-center justify-center border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon size={17} />
                </span>
                <h3 className="mt-4 text-[14px] font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col justify-between gap-4 border border-slate-200 bg-slate-950 px-5 py-5 text-white sm:flex-row sm:items-center">
            <p className="max-w-[700px] text-[14px] leading-7 text-slate-200">
              The autonomous demo runs a deterministic XRD phase-identification workflow from signal review to evidence-linked discussion.
            </p>
            <Link
              to="/demo/agent?project=cu-fe2o4-spinel&mode=demo"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-blue-600 px-5 text-[14px] font-semibold text-white transition hover:bg-blue-500"
            >
              Run Agent Demo
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
