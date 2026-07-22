import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const WAITLIST_STORAGE_KEY = 'difaryx.waitlist.demo.v1';

const primaryInterests = [
  'Materials characterization workflow',
  'XRD / XPS / FTIR / Raman analysis',
  'Evidence-to-report automation',
  'Lab / R&D team deployment',
  'Investor / partnership discussion',
  'Other',
] as const;

type PrimaryInterest = (typeof primaryInterests)[number];

type WaitlistFormState = {
  name: string;
  workEmail: string;
  roleOrganizationType: string;
  primaryInterest: PrimaryInterest | '';
  workflowNote: string;
};

type WaitlistEntry = {
  id: string;
  version: 1;
  name: string;
  workEmail: string;
  roleOrganizationType: string;
  primaryInterest: PrimaryInterest;
  workflowNote?: string;
  createdAt: string;
};

type WaitlistDialogProps = {
  open: boolean;
  onClose: () => void;
};

const emptyForm: WaitlistFormState = {
  name: '',
  workEmail: '',
  roleOrganizationType: '',
  primaryInterest: '',
  workflowNote: '',
};

function isWaitlistEntry(value: unknown): value is WaitlistEntry {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<WaitlistEntry>;
  return (
    entry.version === 1 &&
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.workEmail === 'string' &&
    typeof entry.roleOrganizationType === 'string' &&
    typeof entry.primaryInterest === 'string' &&
    typeof entry.createdAt === 'string'
  );
}

function readStoredEntries() {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(WAITLIST_STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isWaitlistEntry) : [];
  } catch {
    return [];
  }
}

function createEntry(form: WaitlistFormState & { primaryInterest: PrimaryInterest }): WaitlistEntry {
  const workflowNote = form.workflowNote.trim();

  return {
    id: `waitlist-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
    version: 1,
    name: form.name.trim(),
    workEmail: form.workEmail.trim(),
    roleOrganizationType: form.roleOrganizationType.trim(),
    primaryInterest: form.primaryInterest,
    ...(workflowNote ? { workflowNote } : {}),
    createdAt: new Date().toISOString(),
  };
}

function saveEntry(entry: WaitlistEntry) {
  if (typeof window === 'undefined') {
    throw new Error('Local storage is unavailable.');
  }

  const entries = [...readStoredEntries(), entry];
  window.localStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(entries));
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase text-slate-300">
      {children}
    </label>
  );
}

export default function WaitlistDialog({ open, onClose }: WaitlistDialogProps) {
  const [form, setForm] = useState<WaitlistFormState>(emptyForm);
  const [emailError, setEmailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) return;

    setForm(emptyForm);
    setEmailError('');
    setSubmitError('');
    setSubmitted(false);
  }, [open]);

  if (!open) return null;

  const updateField = <K extends keyof WaitlistFormState>(field: K, value: WaitlistFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'workEmail') setEmailError('');
    setSubmitError('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!looksLikeEmail(form.workEmail)) {
      setEmailError('Enter a valid work email address.');
      return;
    }

    if (!form.primaryInterest) {
      setSubmitError('Select a primary interest.');
      return;
    }

    try {
      saveEntry(createEntry({ ...form, primaryInterest: form.primaryInterest }));
      setSubmitted(true);
    } catch {
      setSubmitError('This demo build could not store the waitlist entry locally.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        className="w-full max-w-[620px] overflow-hidden border border-sky-200/15 bg-[#07111f] text-white shadow-[0_32px_120px_rgba(2,6,23,0.7)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-5 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase text-sky-200">Early workflow access</p>
            <h2 id="waitlist-title" className="mt-2 text-[24px] font-semibold leading-tight text-white">
              Join the DIFARYX waitlist
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close waitlist dialog"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 text-slate-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-6 sm:px-6">
            <div className="border border-emerald-200/20 bg-emerald-100/[0.08] p-5">
              <CheckCircle2 size={24} className="text-emerald-200" />
              <p className="mt-4 text-[18px] font-semibold leading-7 text-white">
                You&apos;re on the DIFARYX waitlist.
              </p>
              <p className="mt-2 text-[14px] leading-7 text-slate-200">
                We&apos;ll use this signal to prioritize early research workflow access and product updates.
              </p>
            </div>
            <p className="mt-4 text-[12px] leading-6 text-slate-400">
              Stored locally in this demo build. No external submission is sent yet.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center bg-blue-600 px-5 text-[14px] font-semibold text-white transition hover:bg-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 sm:px-6">
            <div className="border border-sky-200/15 bg-white/[0.06] px-4 py-3 text-[12px] leading-6 text-slate-200">
              DIFARYX is currently in demo-stage validation. Early access prioritization is based on research workflow fit.
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="waitlist-name">Name</FieldLabel>
                <input
                  id="waitlist-name"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  className="h-11 w-full border border-white/15 bg-white/[0.08] px-3 text-[14px] text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:bg-white/[0.11]"
                  placeholder="Dr. Amina Rahman"
                />
              </div>

              <div>
                <FieldLabel htmlFor="waitlist-email">Work email</FieldLabel>
                <input
                  id="waitlist-email"
                  required
                  type="email"
                  autoComplete="email"
                  value={form.workEmail}
                  onChange={(event) => updateField('workEmail', event.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'waitlist-email-error' : undefined}
                  className="h-11 w-full border border-white/15 bg-white/[0.08] px-3 text-[14px] text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:bg-white/[0.11]"
                  placeholder="researcher@lab.org"
                />
                {emailError ? (
                  <p id="waitlist-email-error" className="mt-1.5 text-[12px] text-amber-200">
                    {emailError}
                  </p>
                ) : null}
              </div>

              <div>
                <FieldLabel htmlFor="waitlist-role">Role / organization type</FieldLabel>
                <input
                  id="waitlist-role"
                  required
                  value={form.roleOrganizationType}
                  onChange={(event) => updateField('roleOrganizationType', event.target.value)}
                  className="h-11 w-full border border-white/15 bg-white/[0.08] px-3 text-[14px] text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:bg-white/[0.11]"
                  placeholder="Materials scientist, university lab"
                />
              </div>

              <div>
                <FieldLabel htmlFor="waitlist-interest">Primary interest</FieldLabel>
                <select
                  id="waitlist-interest"
                  required
                  value={form.primaryInterest}
                  onChange={(event) => updateField('primaryInterest', event.target.value as PrimaryInterest | '')}
                  className="h-11 w-full border border-white/15 bg-[#0b1629] px-3 text-[14px] text-white outline-none transition focus:border-sky-300/60"
                >
                  <option value="">Select an interest</option>
                  {primaryInterests.map((interest) => (
                    <option key={interest} value={interest}>
                      {interest}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel htmlFor="waitlist-workflow">What scientific workflow are you trying to improve?</FieldLabel>
              <textarea
                id="waitlist-workflow"
                rows={3}
                value={form.workflowNote}
                onChange={(event) => updateField('workflowNote', event.target.value)}
                className="w-full resize-y border border-white/15 bg-white/[0.08] px-3 py-2.5 text-[14px] leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:bg-white/[0.11]"
                placeholder="For example: preserve XRD processing context and move validated evidence into report discussion."
              />
            </div>

            <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-[320px] text-[12px] leading-6 text-slate-400">
                Stored locally in this demo build. No external submission is sent yet.
              </p>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                {submitError ? <p className="text-[12px] text-amber-200">{submitError}</p> : null}
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center bg-blue-600 px-5 text-[14px] font-semibold text-white shadow-[0_18px_42px_rgba(37,99,235,0.25)] transition hover:bg-blue-500"
                >
                  Join waitlist
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
