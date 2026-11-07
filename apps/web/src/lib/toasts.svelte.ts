export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

let nextId = 1;

class Toasts {
  items = $state<Toast[]>([]);

  push(text: string, kind: Toast['kind'] = 'info'): void {
    const id = nextId++;
    this.items.push({ id, text, kind });
    setTimeout(() => this.dismiss(id), kind === 'error' ? 5000 : 3500);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((toast) => toast.id !== id);
  }
}

export const toasts = new Toasts();
