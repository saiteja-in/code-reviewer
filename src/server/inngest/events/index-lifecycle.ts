export type IndexCompletedEvent = {
  name: "repo/index.completed";
  data: {
    repositoryId: string;
    headSha: string;
    jobId?: string;
    branch?: string | null;
  };
};

export type IndexFailedEvent = {
  name: "repo/index.failed";
  data: {
    repositoryId: string;
    headSha: string;
    jobId?: string;
    error: string;
  };
};
