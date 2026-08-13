type ElementConstructor<T extends Element> = new (...args: never[]) => T;

export function byId(id: string): HTMLElement;
export function byId<T extends Element>(id: string, expectedType: ElementConstructor<T>): T;
export function byId<T extends Element>(
  id: string,
  expectedType?: ElementConstructor<T>,
): HTMLElement | T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing UI element #${id}`);
  }
  if (expectedType !== undefined && !(element instanceof expectedType)) {
    throw new Error(`UI element #${id} has an unexpected type`);
  }
  return element;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
