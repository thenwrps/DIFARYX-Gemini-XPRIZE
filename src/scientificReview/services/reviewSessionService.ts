import type { ScientificReviewSession } from '../domain/contracts';
import {
  AnalysisSessionReviewSessionRepository,
  type ReviewSessionRepository,
} from '../repositories/ReviewSessionRepository';

/** Projection service; it deliberately has no persistent review lifecycle. */
export class ReviewSessionService {
  constructor(
    private readonly repository: ReviewSessionRepository = new AnalysisSessionReviewSessionRepository(),
  ) {}

  get(reviewId: string) {
    return this.repository.get(reviewId);
  }

  listByProject(projectId: string) {
    return this.repository.listByProject(projectId);
  }

  saveProjection(session: ScientificReviewSession) {
    return this.repository.saveProjection(session);
  }
}
