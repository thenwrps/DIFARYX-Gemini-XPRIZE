import type { Request, Response } from 'express';
import { HttpError } from '../middleware/errorHandler';
import {
  IdentityVerificationError,
  type GoogleIdentityVerifier,
  type VerifiedGoogleIdentity,
} from './types';

const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

export async function requireGoogleIdentity(
  request: Request,
  response: Response,
  verifier: GoogleIdentityVerifier,
): Promise<VerifiedGoogleIdentity> {
  if (!verifier.configured) {
    response.locals.authOutcome = 'unavailable';
    throw new HttpError(503, 'Identity verification unavailable');
  }

  const authorization = request.header('Authorization');
  const match = authorization?.match(BEARER_PATTERN);
  if (!match) {
    response.locals.authOutcome = 'missing_or_malformed';
    throw new HttpError(401, 'Authentication required');
  }

  try {
    const identity = await verifier.verifyIdentityToken(match[1]);
    response.locals.authOutcome = 'verified';
    response.locals.identity = identity;
    return identity;
  } catch (error) {
    if (error instanceof IdentityVerificationError && error.category === 'unavailable') {
      response.locals.authOutcome = 'unavailable';
      throw new HttpError(503, 'Identity verification unavailable');
    }
    response.locals.authOutcome = 'invalid';
    throw new HttpError(401, 'Authentication required');
  }
}
