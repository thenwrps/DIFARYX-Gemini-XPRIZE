import {
  createNotebookEntryFromRefinement,
  refineDiscussionFromProcessing,
  saveAgentDiscussionRefinement,
  saveProcessingResult,
  saveNotebookEntry,
  type AgentDiscussionRefinement,
  type NotebookEntry,
  type NotebookTemplateMode,
  type ProcessingResult,
} from '../../data/workflowPipeline';

/** Exact wrapper over existing processing/refinement/notebook handoff helpers. */
export class NotebookHandoffService {
  saveProcessing(result: ProcessingResult) {
    return saveProcessingResult(result);
  }

  refine(result: ProcessingResult, templateMode: NotebookTemplateMode) {
    return refineDiscussionFromProcessing(result, templateMode);
  }

  saveRefinement(refinement: AgentDiscussionRefinement) {
    return saveAgentDiscussionRefinement(refinement);
  }

  createEntry(refinement: AgentDiscussionRefinement, templateMode: NotebookTemplateMode) {
    return createNotebookEntryFromRefinement(refinement, templateMode);
  }

  saveEntry(entry: NotebookEntry) {
    return saveNotebookEntry(entry);
  }
}
