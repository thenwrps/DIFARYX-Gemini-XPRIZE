import React, { lazy, Suspense, useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection_NEW';
import { runWhenIdle } from '../../../utils/idle';
import '../components/landingJourney.css';

const ProblemSection = lazy(() => import('../components/ProblemSection_NEW'));
const UserResearchSection = lazy(() => import('../components/UserResearchSection_NEW'));
const SolutionSection = lazy(() => import('../components/SolutionSection_NEW'));
const ProductFunctionSection = lazy(() => import('../components/ProductFunctionSection_NEW'));
const AgentDemoSection = lazy(() => import('../components/AgentDemoSection_NEW'));
const GoogleAlignmentSection = lazy(() => import('../components/GoogleAlignmentSection_NEW'));
const TechniqueCoverageSection = lazy(() => import('../components/TechniqueCoverageSection_NEW'));
const TrustControlSection = lazy(() => import('../components/TrustControlSection_NEW'));
const CTASection = lazy(() => import('../components/CTASection_NEW'));
const FooterSection = lazy(() => import('../components/FooterSection'));

function LandingStoryFallback() {
  return <section aria-hidden="true" className="min-h-[320px] border-t border-slate-200 bg-white" />;
}

export default function Landing() {
  const [showStory, setShowStory] = useState(false);

  useEffect(() => runWhenIdle(() => setShowStory(true), 1200), []);

  return (
    <div className="landing-site min-h-screen bg-white text-slate-900 font-sans">
      <Navbar />
      <HeroSection />
      {showStory ? (
        <Suspense fallback={<LandingStoryFallback />}>
          <ProblemSection />
          <UserResearchSection />
          <SolutionSection />
          <ProductFunctionSection />
          <TechniqueCoverageSection />
          <AgentDemoSection />
          <TrustControlSection />
          <GoogleAlignmentSection />
          <CTASection />
          <FooterSection />
        </Suspense>
      ) : (
        <LandingStoryFallback />
      )}
    </div>
  );
}
