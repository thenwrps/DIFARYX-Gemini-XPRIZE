import {
  getAnalysisSession,
  getAnalysisSessions,
} from '../../data/analysisSessions';
import type { ScientificReviewSession } from '../domain/contracts';
import type { RepositoryCompatibilityMetadata } from './repositoryMetadata';

export interface ReviewSessionRepository {
  readonly compatibility: RepositoryCompatibilityMetadata;
  get(reviewId: string): ScientificReviewSession | null;
  listByProject(projectId: string): ScientificReviewSession[];
  saveProjection(session: ScientificReviewSession): ScientificReviewSession;
}

function fromAnalysisSession(session: ReturnType<typeof getAnalysisSession>): ScientificReviewSession | null {
  if (!session) return null;
  return {
    reviewId: session.analysisId,
    projectId: session.projectId ?? '',
    analysisSessionId: session.analysisId,
    status: session.status === 'needs-review' ? 'needs-review' : 'projection',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    authoritativeRecordIds: { analysisSessionId: session.analysisId },
    derived: {},
    compatibility: {
      sourceLabel: session.fileName,
      warnings: ['ScientificReviewSession is an in-memory projection over AnalysisSession.'],
      persistable: false,
    },
  };
}

/** Read-through adapter; projections are never written to a new storage key. */
export class AnalysisSessionReviewSessionRepository implements ReviewSessionRepository {
  readonly compatibility: RepositoryCompatibilityMetadata = {
    delegatedHelpers: ['getAnalysisSession', 'getAnalysisSessions'],
    storageKeys: ['difaryx-analysis-sessions-v1'],
    serializedSchema: 'AnalysisSession[]',
    readsLossless: true,
    writesLossless: false,
    legacyFormats: ['seed AnalysisSession records', 'user-persisted AnalysisSession records'],
    migration: 'deferred',
  };

  private readonly projections = new Map<string, ScientificReviewSession>();

  get(reviewId: string): ScientificReviewSession | null {
    return this.projections.get(reviewId) ?? fromAnalysisSession(getAnalysisSession(reviewId));
  }

  listByProject(projectId: string): ScientificReviewSession[] {
    const stored = getAnalysisSessions({ excludeSeeds: true })
      .map(fromAnalysisSession)
      .filter((session): session is ScientificReviewSession => Boolean(session))
      .filter((session) => session.projectId === projectId);
    const projected = [...this.projections.values()].filter((session) => session.projectId === projectId);
    return [...stored, ...projected.filter((session) => !stored.some((item) => item.reviewId === session.reviewId))];
  }

  saveProjection(session: ScientificReviewSession): ScientificReviewSession {
    this.projections.set(session.reviewId, session);
    return session;
  }
}
