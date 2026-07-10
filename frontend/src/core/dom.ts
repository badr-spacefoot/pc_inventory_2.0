export function queryElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function queryElements<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function requireElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = queryElement<T>(selector, root);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}
