export const byId = <T extends Element = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing UI element #${id}`);
  }
  return element as unknown as T;
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
