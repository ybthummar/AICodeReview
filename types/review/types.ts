export interface Review {
  id: string;
  repositoryId: string;
  repository: {
    id: string;
    fullName: string;
    url: string;
  };
  prNumber: number;
  prTitle: string;
  prUrl: string;
  review: string;
  status: "completed" | "pending" | "failed" | string;
  createdAt: Date;
  // False when the viewer only has read access through a workspace.
  canEdit?: boolean;
}

export interface ReviewCardProps {
  review: Review;
  // Votes of the signed-in user for this review, keyed by finding id.
  votes?: Record<string, "up" | "down">;
}

export type ASTSymbolContext = {
  path: string;
  symbolName?: string;
  symbolType?: string;
  startLine?: number;
  endLine?: number;
  content?: string;
};