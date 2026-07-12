export interface UserProfile {
  externalProvider: string;
  displayName: string;
}

export interface OrganizationMembership {
  organizationId: string;
  organizationName: string;
  userId: string;
  role: string;
}

export interface CurrentUserResponse {
  user: UserProfile;
  memberships: OrganizationMembership[];
  requestId: string;
}

export interface OrganizationResponse {
  id: string;
  slug: string;
  displayName: string;
  planTier: string;
  isActive: boolean;
}

export interface ProjectResponse {
  id: string;
  organizationId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  myProjectRole?: string;
}

export interface PaginatedProjectsResponse {
  projects: ProjectResponse[];
  nextCursor: string | null;
  requestId: string;
}

export interface ApiError {
  errorCode: string;
  message: string;
  requestId?: string;
  details?: Record<string, any>;
}
