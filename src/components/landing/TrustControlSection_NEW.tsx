import React from 'react';
import { Eye, FileCheck, GitBranch, Settings } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const trustPrinciples = [
  {
    title: 'Reasoning transparency',
    desc: 'Candidate comparison, conflict review, uncertainty, and evidence synthesis stay inspectable.',
    Icon: Eye,
  },
  {
    title: 'Parameter control',
    desc: 'Preprocessing choices, thresholds, reference sources, and review modes remain visible.',
    Icon: Settings,
  },
  {
    title: 'Evidence provenance',
    desc: 'Peaks, signal sources, technique roles, and supporting objects carry lineage into outputs.',
    Icon: FileCheck,
  },
  {
    title: 'Source attribution',
    desc: 'Researchers can see what was derived from source evidence and what was prepared for discussion.',
    Icon: GitBranch,
  },
  {
    title: 'Validation-aware claims',
    desc: 'Missing references, claim boundaries, and complementary evidence needs are not hidden.',
    Icon: FileCheck,
  },
];

export default function TrustControlSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>();

  return (
    <section id="trust" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className={`landing-reveal max-w-[900px] ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-[12px] font-semibold uppercase text-blue-700">Trust and control</p>
          <h2 className="mt-4 text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            Trust through visible evidence, parameters, and reasoning
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            DIFARYX is designed for scientific review where automation has to remain explainable, controlled, and bounded by the evidence in front of the researcher.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {trustPrinciples.map(({ title, desc, Icon }, index) => (
            <article
              key={title}
              className={`landing-reveal border border-slate-200 bg-[#f8faff] p-5 ${isVisible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              <span className="flex h-10 w-10 items-center justify-center border border-blue-100 bg-white text-blue-700">
                <Icon size={18} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-600">{desc}</p>
            </article>
          ))}
        </div>

        <div className={`landing-reveal mt-10 border border-slate-200 bg-slate-950 px-6 py-7 text-white ${isVisible ? 'is-visible' : ''}`}>
          <div className="text-[11px] font-semibold uppercase text-sky-200">No black boxes</div>
          <p className="mt-3 max-w-[1030px] text-[18px] font-medium leading-8 text-slate-100">
            No black boxes. Every analysis step, parameter choice, evidence source, and reasoning step should remain visible, traceable, and verifiable.
          </p>
        </div>
      </div>
    </section>
  );
}
