export interface ExistingProcessingOperation<TResult> {
  name: string;
  execute: () => TResult;
}

/**
 * A synchronous seam around existing runners. It does not own stage state,
 * introduce async behavior, or replace AgentDemo's execution controller.
 */
export class ProcessingOrchestrationService {
  run<TResult>(operation: ExistingProcessingOperation<TResult>): TResult {
    return operation.execute();
  }
}
