export type BusyState = {
  enter: () => void;
  leave: () => void;
  isBusy: () => boolean;
};

export function createBusyState(): BusyState {
  let depth = 0;

  return {
    enter: () => {
      depth += 1;
    },
    leave: () => {
      depth = Math.max(0, depth - 1);
    },
    isBusy: () => depth > 0,
  };
}
