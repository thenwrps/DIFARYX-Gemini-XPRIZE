import type {
  XrdWorkflowSession,
  XrdWorkflowEvent,
  XrdWorkflowRuntimeState,
} from '../types/xrdWorkflowSession';

/**
 * Validates whether a state transition from current status to next status is permitted.
 * Rules:
 * - idle -> processing (Valid)
 * - processing -> processing / completed / failed / idle (Valid)
 * - completed -> processing / idle (Valid)
 * - failed -> processing / idle (Valid)
 */
export function isValidTransition(
  current: XrdWorkflowRuntimeState['status'],
  next: XrdWorkflowRuntimeState['status'],
): boolean {
  if (current === next) return true;
  switch (current) {
    case 'idle':
      return next === 'processing';
    case 'processing':
      return next === 'completed' || next === 'failed' || next === 'idle';
    case 'completed':
    case 'failed':
      return next === 'processing' || next === 'idle';
    default:
      return false;
  }
}

/**
 * Reducer for managing canonical session state machine.
 * Enforces business logic and transactional integrity.
 */
export function xrdSessionReducer(
  state: XrdWorkflowSession,
  event: XrdWorkflowEvent,
): XrdWorkflowSession {
  const currentStatus = state.runtime.status;
  const now = new Date().toISOString();

  switch (event.type) {
    case 'START_PROCESSING': {
      const nextStatus: XrdWorkflowRuntimeState['status'] = 'processing';
      if (!isValidTransition(currentStatus, nextStatus)) {
        console.warn(
          `[XrdWorkflowSession Reducer] Blocked invalid status transition: ${currentStatus} -> ${nextStatus} via START_PROCESSING`,
        );
        return state;
      }

      return {
        ...state,
        updatedAt: now,
        runtime: {
          ...state.runtime,
          status: nextStatus,
          activeStage: event.payload.stage,
          startedAt: state.runtime.startedAt || now,
          errorMessage: undefined,
        },
      };
    }

    case 'UPDATE_STAGE': {
      const nextStatus: XrdWorkflowRuntimeState['status'] = 'processing';
      if (!isValidTransition(currentStatus, nextStatus)) {
        console.warn(
          `[XrdWorkflowSession Reducer] Blocked invalid status transition: ${currentStatus} -> ${nextStatus} via UPDATE_STAGE`,
        );
        return state;
      }

      return {
        ...state,
        updatedAt: now,
        runtime: {
          ...state.runtime,
          status: nextStatus,
          activeStage: event.payload.stage,
        },
      };
    }

    case 'COMPLETE_PROCESSING': {
      const nextStatus: XrdWorkflowRuntimeState['status'] = 'completed';
      if (!isValidTransition(currentStatus, nextStatus)) {
        console.warn(
          `[XrdWorkflowSession Reducer] Blocked invalid status transition: ${currentStatus} -> ${nextStatus} via COMPLETE_PROCESSING`,
        );
        return state;
      }

      return {
        ...state,
        updatedAt: now,
        runtime: {
          ...state.runtime,
          status: nextStatus,
          completedAt: event.payload?.completedAt || now,
          errorMessage: undefined,
        },
        publication: state.publication
          ? {
              ...state.publication,
              notebookReady: true,
              reportReady: true,
              agentReady: true,
            }
          : {
              published: false,
              notebookReady: true,
              reportReady: true,
              agentReady: true,
            },
      };
    }

    case 'FAIL_PROCESSING': {
      const nextStatus: XrdWorkflowRuntimeState['status'] = 'failed';
      if (!isValidTransition(currentStatus, nextStatus)) {
        console.warn(
          `[XrdWorkflowSession Reducer] Blocked invalid status transition: ${currentStatus} -> ${nextStatus} via FAIL_PROCESSING`,
        );
        return state;
      }

      return {
        ...state,
        updatedAt: now,
        runtime: {
          ...state.runtime,
          status: nextStatus,
          errorMessage: event.payload.errorMessage,
          completedAt: undefined,
        },
      };
    }

    case 'FORCE_RESET_SESSION': {
      // Enforce reset to idle
      const nextStatus: XrdWorkflowRuntimeState['status'] = 'idle';
      
      return {
        ...state,
        sessionId: event.payload.newSessionId,
        createdAt: now,
        updatedAt: now,
        runtime: {
          status: nextStatus,
          activeStage: undefined,
          startedAt: undefined,
          completedAt: undefined,
          errorMessage: undefined,
        },
        validation: {
          isValidated7E4: false,
          validationStatus: 'pending',
        },
        publication: {
          published: false,
          notebookReady: false,
          reportReady: false,
          agentReady: false,
        },
      };
    }

    case 'SET_VALIDATION': {
      return {
        ...state,
        updatedAt: now,
        validation: {
          ...state.validation,
          isValidated7E4: event.payload.isValidated7E4,
          validatedAt: event.payload.isValidated7E4 ? now : undefined,
          validationStatus: event.payload.isValidated7E4 ? 'validated' : 'pending',
        },
      };
    }

    default:
      return state;
  }
}
