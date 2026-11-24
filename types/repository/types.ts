export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number | null;
  language: string | null;
  topics?: string[];
  isConnected: boolean; 
}

export type RepositoryFetchErrorCode =
  | "unauthorized"
  | "github_auth_required"
  | "github_forbidden"
  | "github_rate_limited"
  | "unavailable";

export type RepositoryFetchIssue = { code: RepositoryFetchErrorCode; message: string };

export type RepositoryFetchResult =
  | { ok: true; repositories: Repository[]; hasNextPage: boolean; needsRepoScope: boolean; restrictedOrganizationAccess?: boolean; warning?: RepositoryFetchIssue }
  | ({ ok: false } & RepositoryFetchIssue);

export interface RepositoryCardProps {
  repo: Repository;
  onRegister: (repo: Repository) => void;
  connectingId: number | null;
}
