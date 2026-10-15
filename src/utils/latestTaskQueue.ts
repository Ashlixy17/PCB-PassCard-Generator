export class SupersededTaskError extends Error {
  constructor() { super('A newer preview replaced this task'); this.name = 'SupersededTaskError'; }
}

export interface QueuedTask<T> {id: number; kind: 'preview' | 'export'; payload: T}
interface PendingTask<T, R> extends QueuedTask<T> {resolve: (value: R) => void; reject: (error: Error) => void}

/** One running task, one latest preview, and an ordered queue of explicit exports. */
export class LatestTaskQueue<T, R> {
  private serial = 0;
  private latestPreview = 0;
  private active: PendingTask<T, R> | null = null;
  private pending: PendingTask<T, R> | null = null;
  private exports: PendingTask<T, R>[] = [];
  private closed = false;

  constructor(private execute: (task: QueuedTask<T>) => Promise<R>) {}

  isCurrent(id: number): boolean { return this.active?.id === id && (this.active.kind === 'export' || id === this.latestPreview); }

  preview(payload: T): Promise<R> {
    this.cancelPreview();
    return this.enqueue('preview', payload);
  }

  export(payload: T): Promise<R> { return this.enqueue('export', payload); }

  cancelPreview() {
    this.latestPreview = 0;
    if (this.active?.kind === 'preview') this.active.reject(new SupersededTaskError());
    this.pending?.reject(new SupersededTaskError());
    this.pending = null;
  }

  dispose(error = new Error('PCB processor closed')) {
    this.closed = true;
    this.active?.reject(error); this.pending?.reject(error);
    for (const task of this.exports) task.reject(error);
    this.pending = null; this.exports = [];
  }

  private enqueue(kind: 'preview' | 'export', payload: T): Promise<R> {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('PCB processor closed')); return; }
      const task = {id: ++this.serial, kind, payload, resolve, reject};
      if (kind === 'preview') { this.latestPreview = task.id; this.pending = task; }
      else this.exports.push(task);
      this.pump();
    });
  }

  private pump() {
    if (this.active || this.closed) return;
    const task = this.exports.shift() || this.pending;
    if (!task) return;
    if (task === this.pending) this.pending = null;
    this.active = task;
    Promise.resolve().then(() => this.execute(task)).then(result => {
      if (this.isCurrent(task.id)) task.resolve(result);
    }, error => task.reject(error)).finally(() => { this.active = null; this.pump(); });
  }
}
