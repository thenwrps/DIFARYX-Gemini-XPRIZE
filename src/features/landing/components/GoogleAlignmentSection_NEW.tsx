import React from 'react';
import { BarChart3, Cloud, Cpu, Database, Network, Sparkles } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const infrastructureLayers = [
  {
    title: 'Versioned evidence layer',
    desc: 'Scientific signals, derived artifacts, and provenance remain source-linked across runs.',
    Icon: Database,
  },
  {
    title: 'Reviewable processing services',
    desc: 'Technique-specific preprocessing executes with parameters and evidence context intact.',
    Icon: Cpu,
  },
  {
    title: 'Interpretation service layer',
    desc: 'Evidence synthesis, uncertainty review, and report discussion stay separable and inspectable.',
    Icon: Sparkles,
  },
  {
    title: 'Scalable execution path',
    desc: 'Multi-step characterization workflows can move into controlled service execution as load grows.',
    Icon: Network,
  },
];

const scalePath = [
  {
    title: 'Evidence storage',
    detail: 'Source files, parameters, and report artifacts map cleanly to versioned storage and provenance records.',
    Icon: Cloud,
  },
  {
    title: 'Distributed compute',
    detail: 'Processing tasks and workflow jobs can be isolated, queued, and scaled for larger characterization loads.',
    Icon: Cpu,
  },
  {
    title: 'Controlled runtime',
    detail: 'Container-ready interpretation and workflow services support governed deployment and operational review.',
    Icon: BarChart3,
  },
];

export default function GoogleAlignmentSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>();

  return (
    <section id="roadmap" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-[#f6f8fc] py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className={`landing-reveal max-w-[940px] ${isVisible ? 'is-visible' : ''}`}>
          <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            Reliable scientific workflow infrastructure designed to scale
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            DIFARYX keeps scientific data, reviewable processing, interpretation services, and execution boundaries connected so deterministic local workflows can grow into larger multi-step characterization systems.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {infrastructureLayers.map(({ title, desc, Icon }, index) => (
            <article
              key={title}
              className={`landing-reveal border border-slate-200 bg-white p-5 ${isVisible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              <span className="flex h-10 w-10 items-center justify-center border border-blue-100 bg-blue-50 text-blue-700">
                <Icon size={18} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-600">{desc}</p>
            </article>
          ))}
        </div>

        <div className={`landing-reveal mt-8 grid gap-6 border border-slate-200 bg-white p-6 shadow-[0_28px_82px_rgba(15,23,42,0.1)] lg:grid-cols-[minmax(280px,0.56fr)_1fr] ${isVisible ? 'is-visible' : ''}`}>
          <div>
            <div className="text-[11px] font-semibold uppercase text-blue-700">Scale path</div>
            <h3 className="mt-3 text-[24px] font-semibold leading-tight text-slate-950">
              From local deterministic runs to controlled service deployment
            </h3>
            <p className="mt-4 text-[14px] leading-7 text-slate-600">
              The architecture direction makes storage, compute, and runtime boundaries explicit, so repeatable scientific workflows can move into managed infrastructure without overstating current production maturity.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {scalePath.map(({ title, detail, Icon }) => (
              <article key={title} className="border border-slate-200 bg-slate-50 p-4">
                <span className="flex h-9 w-9 items-center justify-center bg-slate-950 text-sky-100">
                  <Icon size={17} />
                </span>
                <h4 className="mt-4 text-[14px] font-semibold text-slate-950">{title}</h4>
                <p className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
