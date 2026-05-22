import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060b16]/95 text-white backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-4 px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-8 lg:gap-10">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/favicon.png" alt="" className="h-7 w-7 object-contain" />
            <span className="text-[14px] font-semibold text-white">DIFARYX</span>
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            {[
              ['Product', '#product'],
              ['Techniques', '#techniques'],
              ['Notebook Lab', '/notebook?project=cu-fe2o4-spinel&mode=demo'],
              ['Agent Demo', '/demo/agent?project=cu-fe2o4-spinel&mode=demo'],
              ['Roadmap', '#roadmap'],
              ['Company', '#company'],
              ['Investor Briefing', '#roadmap'],
            ].map(([item, href]) => (
              <a
                key={item}
                href={href}
                className="text-[13px] font-semibold text-slate-300 transition-colors hover:text-white"
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
        <a
          href="#join-waitlist"
          className="inline-flex h-10 shrink-0 items-center justify-center bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 sm:px-5"
        >
          Join waitlist
        </a>
      </div>
    </header>
  );
}
