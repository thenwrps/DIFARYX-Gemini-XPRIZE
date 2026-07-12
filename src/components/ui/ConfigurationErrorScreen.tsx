import React from 'react';

interface ConfigurationErrorScreenProps {
  error: string;
}

export function ConfigurationErrorScreen({ error }: ConfigurationErrorScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-slate-900 font-sans">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-red-600">Configuration Error</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          DIFARYX Scientific Workflow Intelligence
        </div>
      </div>
    </div>
  );
}
export default ConfigurationErrorScreen;
