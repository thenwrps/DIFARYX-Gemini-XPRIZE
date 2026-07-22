import React from 'react';
import { Quote } from 'lucide-react';
import { useLandingReveal } from './useLandingReveal';

const feedbackChannels = ['Google Forms', 'LinkedIn', 'Reddit', 'Direct workflow discussions'];

const researchSignals = [
  {
    title: 'Lost processing context',
    detail: 'Researchers need files, parameters, and figures to remain connected after preprocessing.',
  },
  {
    title: 'Cross-tool interpretation',
    detail: 'Technique results become harder to defend when the evidence trail is reconstructed late.',
  },
  {
    title: 'Reproducibility pressure',
    detail: 'A result must preserve its assumptions, source data, and bounded claim language.',
  },
  {
    title: 'Black-box distrust',
    detail: 'Automation earns trust by exposing control, uncertainty, and provenance.',
  },
];

export default function UserResearchSection() {
  const { ref, isVisible } = useLandingReveal<HTMLElement>();

  return (
    <section id="research" ref={ref} className="scroll-mt-24 border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className={`landing-reveal max-w-[900px] ${isVisible ? 'is-visible' : ''}`}>
          <h2 className="text-[32px] font-semibold leading-tight text-slate-950 lg:text-[44px]">
            Shaped by early researcher feedback
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-slate-600">
            DIFARYX is shaped by feedback collected from chemistry and materials researchers through Google Forms, LinkedIn, Reddit, and direct workflow discussions. The feedback highlighted recurring pain points around disconnected tools, lost preprocessing context, weak reproducibility, and distrust of black-box automation.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {feedbackChannels.map((channel) => (
            <span key={channel} className="border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">
              {channel}
            </span>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {researchSignals.map((signal, index) => (
            <article
              key={signal.title}
              className={`landing-reveal border border-slate-200 bg-[#f8faff] p-5 ${isVisible ? 'is-visible' : ''}`}
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-blue-100 bg-white text-blue-700">
                  <Quote size={17} />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-950">{signal.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">{signal.detail}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className={`landing-reveal mt-10 border-l-4 border-blue-600 bg-blue-50 px-6 py-7 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-[11px] font-semibold uppercase text-blue-700">Key insight</p>
          <p className="mt-3 max-w-[1000px] text-[18px] font-medium leading-8 text-slate-900">
            Researchers do not only need faster analysis. They need systems that preserve parameters, expose evidence, explain reasoning, and keep every interpretation linked to its source data.
          </p>
        </div>
      </div>
    </section>
  );
}
