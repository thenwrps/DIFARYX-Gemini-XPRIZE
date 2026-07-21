import React from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Database,
  FlaskConical,
  ShieldCheck,
  Target,
} from 'lucide-react';

export type ScientificStageId =
  | 'objective'
  | 'evidence'
  | 'reasoning'
  | 'validation'
  | 'decision'
  | 'memory';

export const SCIENTIFIC_STAGES: Array<{
  id: ScientificStageId;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'objective', label: 'Objective', icon: Target },
  { id: 'evidence', label: 'Evidence', icon: Database },
  { id: 'reasoning', label: 'Reasoning', icon: Brain },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
  { id: 'decision', label: 'Decision', icon: FlaskConical },
  { id: 'memory', label: 'Memory', icon: BookOpen },
];

interface CompactWorkflowStepperProps {
  activeStage: ScientificStageId;
  onStageChange: (stage: ScientificStageId) => void;
  completedThrough?: ScientificStageId;
}

export function CompactWorkflowStepper({
  activeStage,
  onStageChange,
  completedThrough = 'objective',
}: CompactWorkflowStepperProps) {
  const completedIndex = SCIENTIFIC_STAGES.findIndex((stage) => stage.id === completedThrough);

  return (
    <nav aria-label="Scientific review stages" className="border-b border-slate-200 bg-slate-50 px-3">
      <ol className="grid grid-cols-6">
        {SCIENTIFIC_STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = stage.id === activeStage;
          const isComplete = index < completedIndex;
          return (
            <li key={stage.id}>
              <button
                type="button"
                onClick={() => onStageChange(stage.id)}
                aria-current={isActive ? 'step' : undefined}
                className={`flex h-12 w-full items-center justify-center gap-1.5 border-b-2 px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                  isActive
                    ? 'border-blue-600 bg-white text-blue-700'
                    : 'border-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {isComplete ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Icon size={14} />}
                <span>{stage.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
