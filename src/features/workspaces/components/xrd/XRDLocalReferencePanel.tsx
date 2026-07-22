/**
 * XRD Local Reference Panel (Phase R1B extraction)
 *
 * Displays XRD local reference import, validation, approval, and backend-use workflow.
 *
 * Receives props only; does not read localStorage, parse files, or call backend directly.
 */

import React from 'react';
import { Layers, Save, RotateCcw, CheckCircle2, Trash2 } from 'lucide-react';
import type { XRDLocalReferenceMetadata, XRDLocalReferenceParseResult } from '../../../../types/xrdLocalReference';
import type { XRDStoredLocalReferenceRecord } from '../../../../data/xrdLocalReferences';

interface XRDLocalReferencePanelProps {
  // Parse preview state
  parsePreview: XRDLocalReferenceParseResult;
  validationLevel: string;
  validationLevelLabel: string;
  canSavePreview: boolean;
  saveStatus: string | null;
  previewIssueCount: number;
  previewIssues: Array<{ message: string; tone: 'error' | 'warning' }>;
  
  // Saved drafts state
  savedDrafts: XRDStoredLocalReferenceRecord[];
  latestDraft: XRDStoredLocalReferenceRecord | null;
  latestDraftEligible: boolean;
  latestDraftApprovedForBackend: boolean;
  latestDraftBlockers: string[];
  
  // Status labels
  approvalStatusLabel: string;
  backendUseStatusLabel: string;
  
  // Backend use toggle
  useLocalReferenceForBackend: boolean;
  
  // Current curated reference set
  curatedReferenceSetId?: string;
  
  // Planned local references
  plannedLocalReferences: XRDLocalReferenceMetadata[];
  
  // Constants
  previewSupportedFormats: string[];
  selectableFormats: string[];
  expectedColumns: Array<{ column: string; requirement: string; detail: string }>;
  statusPreview: Array<{ label: string; detail: string }>;
  
  // Callbacks
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSavePreview: () => void;
  onClearPreview: () => void;
  onDeleteDraft: (draftId: string) => void;
  onApproveDraft: (draftId: string) => void;
  onRejectDraft: (draftId: string) => void;
  onToggleUseForBackend: (enabled: boolean) => void;
  
  // Formatters
  formatFileKind: (kind: string | undefined) => string;
  formatTimestamp: (timestamp: string | undefined) => string;
  formatNumber: (value: number | null | undefined, digits?: number) => string;
  formatCifConversionMode: (mode: string | undefined) => string;
  formatCifCellParameters: (parseResult: XRDLocalReferenceParseResult) => string;
  formatXrdmlRange: (parseResult: XRDLocalReferenceParseResult) => string;
  formatXrdmlStep: (value: number | undefined) => string;
  formatXrdmlIntensityRange: (parseResult: XRDLocalReferenceParseResult) => string;
  getValidationStatusLabel: (status: string) => string;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <span className="text-text-muted">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">{title}</h3>
      </div>
      <div className="space-y-2 px-2 py-2 text-[11px] leading-relaxed">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <span className="font-mono text-text-main">{value}</span>
    </div>
  );
}

function XRDToggleField({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[10px]">
      <span className="font-semibold text-text-muted">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 cursor-pointer rounded border-border text-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

function XRDFieldLabel({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
      {label}
    </span>
  );
}

export function XRDLocalReferencePanel({
  parsePreview,
  validationLevel,
  validationLevelLabel,
  canSavePreview,
  saveStatus,
  previewIssueCount,
  previewIssues,
  savedDrafts,
  latestDraft,
  latestDraftEligible,
  latestDraftApprovedForBackend,
  latestDraftBlockers,
  approvalStatusLabel,
  backendUseStatusLabel,
  useLocalReferenceForBackend,
  curatedReferenceSetId,
  plannedLocalReferences,
  previewSupportedFormats,
  selectableFormats,
  expectedColumns,
  statusPreview,
  onFileChange,
  onSavePreview,
  onClearPreview,
  onDeleteDraft,
  onApproveDraft,
  onRejectDraft,
  onToggleUseForBackend,
  formatFileKind,
  formatTimestamp,
  formatNumber,
  formatCifConversionMode,
  formatCifCellParameters,
  formatXrdmlRange,
  formatXrdmlStep,
  formatXrdmlIntensityRange,
  getValidationStatusLabel,
}: XRDLocalReferencePanelProps) {
  return (
    <Panel title="Project / Uploaded Local References" icon={<Layers size={13} />}>
      <div className="space-y-2">
        <div className="rounded border border-border bg-background px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">Local Reference Workflow Summary</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
                Import, validate, approve, then explicitly enable a saved local reference for a backend run.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[9px] font-bold text-text-muted">
              {savedDrafts.length} saved
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <Metric label="Import status" value={getValidationStatusLabel(parsePreview.status)} />
            <Metric label="Validation level" value={validationLevelLabel} />
            <Metric label="Approval status" value={approvalStatusLabel} />
            <Metric label="Backend use" value={backendUseStatusLabel} />
            <Metric label="Saved draft" value={latestDraft?.sourceFileName ?? 'None'} />
            <Metric label="Curated set" value={curatedReferenceSetId ?? 'Not selected'} />
          </div>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-900">
            Approval only allows request-scoped local reference matching. Approval does not confirm chemical identity or phase purity. Local reference provenance remains user/lab responsibility.
          </p>
        </div>

        <div className="rounded border border-blue-200 bg-blue-50 px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-blue-900">1. Import & Preview</p>
              <p className="mt-0.5 text-[10px] font-bold text-blue-950">Import local XRD reference file</p>
            </div>
            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
              Preview only
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-blue-900">
            Preview-supported text peak lists / patterns: {previewSupportedFormats.join(', ')}. CIF metadata preview and XRDML measured pattern preview remain diagnostic unless converted into a validated peak list.
          </p>
          <label className="mt-2 block rounded border border-blue-100 bg-white/70 px-2 py-1.5">
            <XRDFieldLabel label="Local reference file" />
            <input
              type="file"
              accept={selectableFormats.join(',')}
              onChange={onFileChange}
              className="mt-1 block w-full text-[10px] text-text-muted file:mr-2 file:rounded file:border-0 file:bg-blue-100 file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-blue-800"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <Metric label="Source file" value={parsePreview.sourceFileName || 'No file selected'} />
            <Metric label="Detected kind" value={formatFileKind(parsePreview.fileKind)} />
            <Metric label="Detected format" value={parsePreview.detectedFormat || 'Not detected'} />
            <Metric label="Parsed peaks" value={parsePreview.peaks.length} />
            <Metric label="Parsed rows" value={parsePreview.parsedRowCount} />
            <Metric label="Ignored rows" value={parsePreview.ignoredRowCount} />
            <Metric label="Warnings" value={parsePreview.validation.warnings.length} />
            <Metric label="Errors" value={parsePreview.validation.errors.length} />
          </div>
          {previewIssueCount > 0 && (
            <div className="mt-2 rounded border border-amber-200 bg-white/80 px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Key diagnostics</p>
              <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed">
                {previewIssues.slice(0, 3).map((issue) => (
                  <li
                    key={`${issue.tone}-${issue.message}`}
                    className={issue.tone === 'error' ? 'text-red-800' : 'text-amber-900'}
                  >
                    - {issue.message}
                  </li>
                ))}
              </ul>
              {previewIssueCount > 3 && (
                <p className="mt-1 text-[9px] text-text-muted">
                  {previewIssueCount - 3} more diagnostics in details.
                </p>
              )}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onSavePreview}
              disabled={!canSavePreview}
              className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-alt disabled:text-text-muted"
            >
              <Save size={12} />
              Save preview
            </button>
            <button
              type="button"
              onClick={onClearPreview}
              className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-border bg-background px-2 text-[10px] font-bold text-text-main hover:bg-surface-hover"
            >
              <RotateCcw size={12} />
              Clear preview
            </button>
          </div>
          {saveStatus && (
            <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-text-muted">
              {saveStatus}
            </p>
          )}
          {parsePreview.cifMetadata && (
            <p className="mt-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[10px] leading-relaxed text-indigo-900">
              CIF metadata preview detected. Full diffraction simulation is planned; this import is not ready for backend matching unless explicit peak data are available.
            </p>
          )}
          {parsePreview.xrdmlMetadata && (
            <p className="mt-2 rounded border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-[10px] leading-relaxed text-cyan-900">
              XRDML measured pattern preview detected. A measured pattern is not automatically a validated reference.
            </p>
          )}
          {parsePreview.peaks.length > 0 && (
            <details className="mt-2 rounded border border-blue-100 bg-white/80 px-2 py-1.5">
              <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-blue-900">
                Peak preview
              </summary>
              <div className="mt-2 overflow-hidden rounded border border-blue-100 bg-white">
                <table className="w-full text-left text-[9px]">
                  <thead className="bg-blue-50 text-blue-950">
                    <tr>
                      <th className="px-2 py-1 font-bold">2theta</th>
                      <th className="px-2 py-1 font-bold">Rel. intensity</th>
                      <th className="px-2 py-1 font-bold">hkl</th>
                      <th className="px-2 py-1 font-bold">d-spacing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsePreview.peaks.slice(0, 5).map((peak, index) => (
                      <tr key={`${peak.twoTheta}-${index}`} className="border-t border-blue-50 text-text-main">
                        <td className="px-2 py-1 font-semibold">{formatNumber(peak.twoTheta, 3)}</td>
                        <td className="px-2 py-1">{formatNumber(peak.relativeIntensity, 1)}</td>
                        <td className="px-2 py-1">{peak.hkl ?? 'Not available'}</td>
                        <td className="px-2 py-1">{formatNumber(peak.dSpacing, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsePreview.peaks.length > 5 && (
                  <p className="border-t border-blue-50 px-2 py-1 text-[9px] text-text-muted">
                    Showing first 5 of {parsePreview.peaks.length} parsed peaks.
                  </p>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">2. Validate & 3. Approve</p>
              <p className="mt-0.5 text-[10px] font-bold text-text-main">Validated local reference peak list</p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-bold text-text-muted">
              {approvalStatusLabel}
            </span>
          </div>
          {latestDraft ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Metric label="Saved draft" value={latestDraft.sourceFileName} />
                <Metric label="Saved at" value={formatTimestamp(latestDraft.savedAt)} />
                <Metric label="Validation level" value={validationLevelLabel} />
                <Metric label="Import status" value={getValidationStatusLabel(latestDraft.validationStatus)} />
                <Metric label="Stored peaks" value={latestDraft.parseResult.peaks.length} />
                <Metric label="Eligibility" value={latestDraftEligible ? 'Parser eligible' : 'Blocked'} />
                <Metric
                  label="Approved at"
                  value={latestDraft.approvedAt
                    ? formatTimestamp(latestDraft.approvedAt)
                    : 'Not approved'}
                />
                <Metric label="Backend ready" value={latestDraftApprovedForBackend ? 'Yes' : 'No'} />
              </div>
              {latestDraftBlockers.length > 0 ? (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Approval gate</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-amber-900">
                    {latestDraftBlockers.slice(0, 4).map((blocker) => (
                      <li key={blocker}>- {blocker}</li>
                    ))}
                  </ul>
                  {latestDraftBlockers.length > 4 && (
                    <p className="mt-1 text-[9px] text-amber-900">
                      {latestDraftBlockers.length - 4} more gate checks not shown.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] leading-relaxed text-emerald-800">
                  This saved draft is approved and can be enabled for a request-scoped backend run.
                </p>
              )}
              {latestDraft.approvalNotes && latestDraft.approvalNotes.length > 0 && (
                <details className="mt-2 rounded border border-border bg-background px-2 py-1.5">
                  <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-text-muted">
                    Approval notes
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-text-muted">
                    {latestDraft.approvalNotes.slice(0, 5).map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onApproveDraft(latestDraft.id)}
                  disabled={!latestDraftEligible || latestDraft.approvalStatus === 'approved_for_local_matching'}
                  className="inline-flex min-h-7 items-center justify-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-alt disabled:text-text-muted"
                >
                  <CheckCircle2 size={12} />
                  Approve for local matching
                </button>
                <button
                  type="button"
                  onClick={() => onRejectDraft(latestDraft.id)}
                  className="inline-flex min-h-7 items-center justify-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
                >
                  Keep preview-only
                </button>
              </div>
              <button
                type="button"
                onClick={() => onDeleteDraft(latestDraft.id)}
                className="mt-2 inline-flex min-h-7 items-center justify-center gap-1 rounded border border-border bg-background px-2 text-[10px] font-bold text-text-main hover:bg-surface-hover"
              >
                <Trash2 size={12} />
                Delete saved draft
              </button>
            </>
          ) : (
            <p className="mt-2 rounded border border-dashed border-border bg-background px-2 py-1.5 text-[10px] leading-relaxed text-text-muted">
              Save a parsed local reference preview before approval.
            </p>
          )}
        </div>

        <div className="rounded border border-border bg-background px-2 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">4. Use for backend run</p>
          <div className="mt-2">
            <XRDToggleField
              label="Use saved local reference for this backend run"
              checked={latestDraftApprovedForBackend && useLocalReferenceForBackend}
              disabled={!latestDraftApprovedForBackend}
              onChange={(enabled) => onToggleUseForBackend(latestDraftApprovedForBackend && enabled)}
            />
          </div>
          <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-relaxed text-text-muted">
            Approve a valid local reference peak list before using it for backend matching.
          </p>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-900">
            Current backend matching uses active curated reference sets unless this approved local-reference toggle is enabled.
          </p>
        </div>

        {parsePreview.cifMetadata && (
          <details className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5">
            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-indigo-900">
              CIF metadata preview
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Metric label="Detected format" value="CIF structure file" />
              <Metric label="Conversion status" value={formatCifConversionMode(parsePreview.cifMetadata.conversionMode)} />
              <Metric label="Structure name" value={parsePreview.structureName || 'Not available'} />
              <Metric label="Formula" value={parsePreview.formulaFromCif || 'Not available'} />
              <Metric label="Space group" value={parsePreview.spaceGroup || 'Not available'} />
              <Metric label="Crystal system" value={parsePreview.crystalSystem || 'Not available'} />
              <Metric label="Cell parameters" value={formatCifCellParameters(parsePreview)} />
              <Metric
                label="Atom sites"
                value={parsePreview.cifMetadata.atomSiteCount !== undefined
                  ? String(parsePreview.cifMetadata.atomSiteCount)
                  : 'Not available'}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-indigo-900">
              CIF import is reference-source metadata only in this phase. Full structure-to-pattern simulation requires crystallographic validation.
            </p>
          </details>
        )}

        {parsePreview.xrdmlMetadata && (
          <details className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1.5">
            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-cyan-900">
              XRDML measured pattern preview
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <Metric label="Detected format" value="XRDML measured pattern" />
              <Metric label="Scan axis" value={parsePreview.xrdmlMetadata.scanAxis || 'Not available'} />
              <Metric label="Parsed points" value={parsePreview.xrdmlMetadata.parsedPointCount} />
              <Metric label="2theta range" value={formatXrdmlRange(parsePreview)} />
              <Metric label="Step" value={formatXrdmlStep(parsePreview.xrdmlMetadata.commonStep)} />
              <Metric label="Intensity range" value={formatXrdmlIntensityRange(parsePreview)} />
              <Metric label="Wavelength" value={formatNumber(parsePreview.xrdmlMetadata.wavelengthAngstrom, 5)} />
              <Metric label="Vendor" value={parsePreview.xrdmlMetadata.vendor || 'Not available'} />
              <Metric label="Instrument" value={parsePreview.xrdmlMetadata.instrument || 'Not available'} />
              <Metric label="Measurement date" value={parsePreview.xrdmlMetadata.measurementDate || 'Not available'} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-900">
              XRDML measured pattern import is preview-only in this phase and is not eligible for backend local reference matching until converted into a validated peak list.
            </p>
          </details>
        )}

        {previewIssueCount > 0 && (
          <details className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-amber-900">
              Full import diagnostics
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {parsePreview.validation.errors.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-red-800">Errors</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-red-800">
                    {parsePreview.validation.errors.map((error) => (
                      <li key={error}>- {error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsePreview.validation.warnings.length > 0 && (
                <div className="rounded border border-amber-200 bg-white/80 px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Warnings</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-amber-900">
                    {parsePreview.validation.warnings.map((warning) => (
                      <li key={warning}>- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}

        <details className="rounded border border-border bg-background px-2 py-1.5">
          <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-text-muted">
            Parser contract preview
          </summary>
          <div className="mt-2 space-y-1">
            {expectedColumns.map((column) => (
              <div key={column.column} className="rounded border border-border bg-surface-alt px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold text-text-main">{column.column}</span>
                  <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                    {column.requirement}
                  </span>
                </div>
                <p className="mt-0.5 text-[9px] leading-relaxed text-text-muted">{column.detail}</p>
              </div>
            ))}
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">Minimum reference requirements</p>
              <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-text-muted">
                <li>- At least 3 reference peaks recommended.</li>
                <li>- Metadata recommended: label, formula or material family, and elements.</li>
                <li>- Relative intensity improves preview quality but remains optional.</li>
              </ul>
            </div>
          </div>
        </details>

        <details className="rounded border border-border bg-background px-2 py-1.5">
          <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-text-muted">
            Validation status glossary
          </summary>
          <div className="mt-2 space-y-1">
            {statusPreview.map((status) => (
              <div key={status.label} className="rounded border border-border bg-surface-alt px-2 py-1">
                <p className="text-[10px] font-semibold text-text-main">{status.label}</p>
                <p className="text-[9px] leading-relaxed text-text-muted">{status.detail}</p>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
          <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-amber-900">
            Boundary notes
          </summary>
          <ul className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-amber-900">
            <li>Saved local references are used for backend matching only when explicitly approved, enabled, and eligible.</li>
            <li>Approval only allows request-scoped local reference matching.</li>
            <li>Approval does not confirm chemical identity.</li>
            <li>Approval does not confirm phase purity.</li>
            <li>Local reference provenance remains user/lab responsibility.</li>
            <li>Unsupported, corrupted, or converter-required imports are not sent to backend matching.</li>
            <li>Current backend matching uses active curated reference sets unless the saved local-reference toggle is enabled.</li>
            <li>CIF import is reference-source metadata only in this phase.</li>
            <li>XRDML measured pattern import is preview-only in this phase.</li>
            <li>A measured pattern is not automatically a validated reference.</li>
            <li>Full structure-to-pattern simulation requires crystallographic validation.</li>
            <li>Previewed/saved reference peaks are not chemical identity confirmation.</li>
            <li>Phase purity is not confirmed.</li>
          </ul>
        </details>

        <details className="rounded border border-border bg-background px-2 py-1.5">
          <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-text-muted">
            Planned local reference entries
          </summary>
          <div className="mt-2 space-y-1">
            {plannedLocalReferences.map((localRef) => (
              <div key={localRef.id} className="rounded border border-border bg-surface-alt px-2 py-1.5">
                <p className="text-[10px] font-semibold text-text-main">{localRef.label}</p>
                <p className="text-[9px] text-text-muted">Status: {localRef.validationStatus}</p>
                <p className="text-[9px] text-text-muted">Backend available: {localRef.backendAvailable ? 'Yes' : 'No'}</p>
                {localRef.notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[9px] leading-relaxed text-text-muted">
                    {localRef.notes.map((note, idx) => (
                      <li key={idx}>- {note}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </details>
      </div>
    </Panel>
  );
}
