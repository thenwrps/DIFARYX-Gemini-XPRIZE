export interface RepositoryCompatibilityMetadata {
  delegatedHelpers: string[];
  storageKeys: string[];
  serializedSchema: string;
  readsLossless: boolean;
  writesLossless: boolean;
  legacyFormats: string[];
  migration: 'deferred' | 'not-applicable';
}
