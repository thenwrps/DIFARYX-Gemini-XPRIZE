/**
 * Provenance Timeline Utility
 * 
 * Aggregates scientific workflow events to build a chronological audit timeline.
 */

import { readUploadedSignalRuns } from '../data/uploadedSignalRuns';
import { readParameterHistory } from './parameterStateManager';
import type { ProjectNotebook } from '../data/demoProjects';

export interface TimelineEvent {
  timestamp: string;
  type:
    | 'project_created'
    | 'file_uploaded'
    | 'parameter_changed'
    | 'notebook_saved'
    | 'report_exported'
    | 'session_imported'
    | 'session_exported';
  title: string;
  description: string;
  projectId?: string;
  projectName?: string;
}

/**
 * Log session bundle portability action (import/export) to local activity registry
 */
export function logSessionActivity(
  type: 'session_imported' | 'session_exported',
  description: string
): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  const key = 'difaryx-session-portability-log-v1';
  try {
    const raw = window.localStorage.getItem(key);
    let logs = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) logs = parsed;
    }
    logs.unshift({
      timestamp: new Date().toISOString(),
      type,
      description
    });
    window.localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
  } catch (e) {
    console.warn('Failed to log portability action:', e);
  }
}

/**
 * Aggregates all session events from local storage, filtered by project if requested
 */
export function getProvenanceTimelineEvents(projectIdFilter?: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return [];

  // Helper to resolve project name from project notebooks
  const getProjectName = (pId: string): string => {
    try {
      const rawProjects = window.localStorage.getItem('difaryx_user_project_notebooks');
      if (rawProjects) {
        const projects = JSON.parse(rawProjects) as ProjectNotebook[];
        const found = projects.find(p => p.id === pId);
        if (found) return found.title;
      }
    } catch {}
    return pId === 'standalone' ? 'Standalone' : 'Untitled Project';
  };

  // 1. Project creation
  try {
    const rawProjects = window.localStorage.getItem('difaryx_user_project_notebooks');
    if (rawProjects) {
      const projects = JSON.parse(rawProjects) as ProjectNotebook[];
      projects.forEach(p => {
        if (projectIdFilter && p.id !== projectIdFilter) return;
        events.push({
          timestamp: p.createdAt || new Date().toISOString(),
          type: 'project_created',
          title: 'Project Created',
          description: `Research project "${p.title}" was initialized.`,
          projectId: p.id,
          projectName: p.title
        });
      });
    }
  } catch {}

  // 2. File upload
  try {
    const runs = readUploadedSignalRuns();
    runs.forEach(run => {
      const pId = run.projectId;
      if (projectIdFilter && pId !== projectIdFilter) return;
      const projName = pId ? getProjectName(pId) : 'Standalone';
      events.push({
        timestamp: run.uploadedAt || new Date().toISOString(),
        type: 'file_uploaded',
        title: 'Evidence File Uploaded',
        description: `Signal dataset "${run.fileName}" (${run.technique}) uploaded to ${projName}.`,
        projectId: pId,
        projectName: projName
      });
    });
  } catch {}

  // 3. Parameter changes
  const techniques = ['xrd', 'xps', 'ftir', 'raman'];
  const projectIds: string[] = [];
  if (projectIdFilter) {
    projectIds.push(projectIdFilter);
  } else {
    // Collect all project IDs from notebooks plus standalone
    try {
      const rawProjects = window.localStorage.getItem('difaryx_user_project_notebooks');
      if (rawProjects) {
        const projects = JSON.parse(rawProjects) as ProjectNotebook[];
        projects.forEach(p => projectIds.push(p.id));
      }
    } catch {}
    projectIds.push('standalone');
  }

  projectIds.forEach(pId => {
    const projName = pId === 'standalone' ? 'Standalone' : getProjectName(pId);
    techniques.forEach(tech => {
      try {
        const history = readParameterHistory(pId, tech);
        history.forEach(entry => {
          events.push({
            timestamp: entry.timestamp,
            type: 'parameter_changed',
            title: `Parameters Tuned (${tech.toUpperCase()})`,
            description: entry.parameter === 'all_parameters'
              ? `Workspace parameters reset to defaults.`
              : `Parameter "${entry.parameter}" changed from "${entry.oldValue}" to "${entry.newValue}".`,
            projectId: pId === 'standalone' ? undefined : pId,
            projectName: projName
          });
        });
      } catch {}
    });
  });

  // 4. Notebook saves
  try {
    const rawEntries = window.localStorage.getItem('difaryx-workflow-notebook-entries');
    if (rawEntries) {
      const entries = JSON.parse(rawEntries);
      if (Array.isArray(entries)) {
        entries.forEach(entry => {
          if (projectIdFilter && entry.projectId !== projectIdFilter) return;
          const projName = getProjectName(entry.projectId);
          events.push({
            timestamp: entry.createdAt || new Date().toISOString(),
            type: 'notebook_saved',
            title: 'Notebook Memory Saved',
            description: `Entry "${entry.title}" was committed to scientific memory.`,
            projectId: entry.projectId,
            projectName: projName
          });
        });
      }
    }
  } catch {}

  // 5. Report exports
  try {
    const rawLedger = window.localStorage.getItem('difaryx-approval-ledger:v1');
    if (rawLedger) {
      const ledger = JSON.parse(rawLedger);
      if (ledger && typeof ledger === 'object' && Array.isArray(ledger.entries)) {
        ledger.entries.forEach((entry: any) => {
          if (entry.actionType === 'report_export' || entry.actionType === 'report_generation') {
            const pId = entry.projectId;
            if (projectIdFilter && pId !== projectIdFilter) return;
            const projName = pId ? getProjectName(pId) : 'Standalone';
            events.push({
              timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
              type: 'report_exported',
              title: 'Report Compiled & Exported',
              description: `Evidence report published (approval level: ${entry.approvalLevel || 'standard'}).`,
              projectId: pId,
              projectName: projName
            });
          }
        });
      }
    }
  } catch {}

  // 6. Session imports/exports
  try {
    const rawPortability = window.localStorage.getItem('difaryx-session-portability-log-v1');
    if (rawPortability) {
      const logs = JSON.parse(rawPortability);
      if (Array.isArray(logs)) {
        logs.forEach((log: any) => {
          events.push({
            timestamp: log.timestamp,
            type: log.type,
            title: log.type === 'session_imported' ? 'Session Package Imported' : 'Session Package Exported',
            description: log.description
          });
        });
      }
    }
  } catch {}

  // Defensive validation and deduplication
  const uniqueSignatures = new Set<string>();
  const validatedEvents: TimelineEvent[] = [];

  events.forEach((e) => {
    // 1. Skip if required properties are missing
    if (!e || typeof e !== 'object' || !e.type || !e.title || !e.description) return;

    // 2. Validate and clean timestamp
    let ts = e.timestamp;
    if (!ts || typeof ts !== 'string' || isNaN(Date.parse(ts))) {
      ts = new Date().toISOString();
    }
    
    // 3. Prevent duplicate events based on rounded timestamp (to nearest second) and text content
    const tsSeconds = Math.floor(Date.parse(ts) / 1000);
    const signature = `${e.type}:${tsSeconds}:${e.title}:${e.description}`;
    
    if (!uniqueSignatures.has(signature)) {
      uniqueSignatures.add(signature);
      validatedEvents.push({
        ...e,
        timestamp: ts
      });
    }
  });

  // Sort events chronologically (latest first)
  return validatedEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
