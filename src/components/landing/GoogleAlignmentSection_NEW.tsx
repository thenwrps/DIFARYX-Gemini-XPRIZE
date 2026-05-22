import React from 'react';
import { BarChart3, Cloud, Cpu, Database, Network, Sparkles } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const infrastructureLayers = [
  {
    title: 'Managed data direction',
    desc: 'Versioned scientific datasets and source-linked evidence records.',
    Icon: Database,
  },
  {
    title: 'Processing services',
    desc: 'Technique-specific preprocessing and reviewable parameter execution.',
    Icon: Cpu,
  },
  {
    title: 'Interpretation services',
    desc: 'Evidence synthesis, uncertainty review, and report discussion support.',
    Icon: Sparkles,
  },
  {
    title: 'Cloud execution path',
    desc: 'Scalable job execution for multi-step characterization workflows.',
    Icon: Network,
  },
];

const googleCloudDirection = [
  {
    title: 'Storage',
    detail: 'A future managed data layer can map signals and evidence artifacts to cloud storage patterns.',
    Icon: Cloud,
  },
  {
    title: 'Compute',
    detail: 'Processing services can evolve toward distributed execution for larger characterization workloads.',
    Icon: Cpu,
  },
  {
    title: 'Runtime',
    detail: 'Containerized interpretation and workflow services can support controlled deployment paths.',
    Icon: BarChart3,
  },
];

export default function GoogleAlignmentSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>();

  return (
    <section id="roadmap" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-[#f6f8fc] py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className={`landing-reveal max-w-[940px] ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-[12px] font-semibold uppercase text-blue-700">Architecture direction</p>
          <h2 className="mt-4 text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            Designed for scalable scientific workflow infrastructure
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            DIFARYX is designed to evolve from local deterministic workflows into scalable scientific infrastructure with managed data, processing, interpretation services, and cloud-based execution.
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
            <div className="text-[11px] font-semibold uppercase text-blue-700">Google Cloud alignment</div>
            <h3 className="mt-3 text-[24px] font-semibold leading-tight text-slate-950">
              A scalable deployment direction, not a production-readiness claim
            </h3>
            <p className="mt-4 text-[14px] leading-7 text-slate-600">
              Google Cloud is an architecture direction for managed data, compute, and service execution as DIFARYX moves beyond its local deterministic demo workflow.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {googleCloudDirection.map(({ title, detail, Icon }) => (
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
