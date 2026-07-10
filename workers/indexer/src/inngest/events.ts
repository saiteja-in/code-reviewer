export type IndexRepoEvent = {
  name: "repo/index.requested";
  data: {
    repositoryId: string;
    jobId?: string;
    installationId?: number | null;
    owner?: string;
    repo?: string;
    headSha?: string;
    branch?: string;
  };
};
