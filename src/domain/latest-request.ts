export type RequestToken = {
  id: number;
  contextRevision: number;
};

export type LatestRequestGuard = {
  start: (contextRevision: number) => RequestToken;
  isCurrent: (token: RequestToken, contextRevision: number) => boolean;
};

export function createLatestRequestGuard(): LatestRequestGuard {
  let latestId = 0;

  return {
    start: (contextRevision) => {
      latestId += 1;
      return { id: latestId, contextRevision };
    },
    isCurrent: (token, contextRevision) => token.id === latestId
      && token.contextRevision === contextRevision,
  };
}
