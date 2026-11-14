/**
 * Black Box persistence (P8): attempts, procedures, adopted extensions, leads and the history of
 * extension tests survive reloads. IndexedDB in the browser; an in-memory store (which still
 * serialises, to behave like storage) for tests and environments without IndexedDB.
 *
 * Save an in-progress attempt now and then (putAttempt with its snapshot) so that data up to
 * the moment of loss survives a closed tab, and again when it ends.
 */

import type {
  AttemptRecord,
  BlackBoxArchive,
  Lead,
  Procedure,
  ProcedureId,
} from '../contracts/index.ts';
import type { ExtensionRecord } from '../model/extensions.ts';
import { emptyArchive, reissue } from './archive.ts';

export interface BlackBoxMeta {
  readonly adoptedExtensions: BlackBoxArchive['adoptedExtensions'];
  readonly leads: readonly Lead[];
  /** Every extension test with its numbers (spec §6.1). Not in BlackBoxArchive yet. */
  readonly extensions: readonly ExtensionRecord[];
}

export interface StoredBlackBox {
  readonly archive: BlackBoxArchive;
  readonly extensions: readonly ExtensionRecord[];
}

export interface BlackBoxStore {
  load(): Promise<StoredBlackBox>;
  putAttempt(rec: AttemptRecord): Promise<void>;
  putProcedure(p: Procedure): Promise<void>;
  deleteProcedure(id: ProcedureId): Promise<void>;
  putMeta(meta: BlackBoxMeta): Promise<void>;
  /** Delete everything in this save. */
  clear(): Promise<void>;
}

function assemble(
  attempts: AttemptRecord[],
  procedures: Procedure[],
  meta: BlackBoxMeta | undefined,
): StoredBlackBox {
  return {
    archive: {
      ...emptyArchive(),
      attempts: attempts.map(reissue).sort((a, b) => a.index - b.index),
      procedures,
      adoptedExtensions: meta?.adoptedExtensions ?? [],
      leads: meta?.leads ?? [],
    },
    extensions: meta?.extensions ?? [],
  };
}

/** In-memory store. Values are serialised as JSON, like real storage. */
export class MemoryBlackBoxStore implements BlackBoxStore {
  private attempts = new Map<string, string>();
  private procedures = new Map<string, string>();
  private meta: string | undefined;

  async load(): Promise<StoredBlackBox> {
    return assemble(
      [...this.attempts.values()].map((s) => JSON.parse(s) as AttemptRecord),
      [...this.procedures.values()].map((s) => JSON.parse(s) as Procedure),
      this.meta === undefined ? undefined : (JSON.parse(this.meta) as BlackBoxMeta),
    );
  }
  async putAttempt(rec: AttemptRecord): Promise<void> {
    this.attempts.set(rec.id, JSON.stringify(rec));
  }
  async putProcedure(p: Procedure): Promise<void> {
    this.procedures.set(p.id, JSON.stringify(p));
  }
  async deleteProcedure(id: ProcedureId): Promise<void> {
    this.procedures.delete(id);
  }
  async putMeta(meta: BlackBoxMeta): Promise<void> {
    this.meta = JSON.stringify(meta);
  }
  async clear(): Promise<void> {
    this.attempts.clear();
    this.procedures.clear();
    this.meta = undefined;
  }
}

const DB_VERSION = 1;
const ATTEMPTS = 'attempts';
const PROCEDURES = 'procedures';
const META = 'meta';
const META_KEY = 'meta';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

/** IndexedDB store, one database per save slot. */
export class IndexedDbBlackBoxStore implements BlackBoxStore {
  private db: Promise<IDBDatabase> | null = null;
  private readonly name: string;
  private readonly factory: IDBFactory;

  constructor(name = 'recursion-blackbox', factory: IDBFactory = indexedDB) {
    this.name = name;
    this.factory = factory;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      const r = this.factory.open(this.name, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(ATTEMPTS))
          db.createObjectStore(ATTEMPTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(PROCEDURES))
          db.createObjectStore(PROCEDURES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      this.db = req(r as IDBRequest<IDBDatabase>);
    }
    return this.db;
  }

  async load(): Promise<StoredBlackBox> {
    const db = await this.open();
    const tx = db.transaction([ATTEMPTS, PROCEDURES, META], 'readonly');
    const [attempts, procedures, meta] = await Promise.all([
      req(tx.objectStore(ATTEMPTS).getAll() as IDBRequest<AttemptRecord[]>),
      req(tx.objectStore(PROCEDURES).getAll() as IDBRequest<Procedure[]>),
      req(tx.objectStore(META).get(META_KEY) as IDBRequest<BlackBoxMeta | undefined>),
    ]);
    return assemble(attempts, procedures, meta);
  }

  private async write(store: string, fn: (s: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    await done(tx);
  }

  putAttempt(rec: AttemptRecord): Promise<void> {
    // Structured clone handles frozen records; a JSON round trip keeps only plain data.
    return this.write(ATTEMPTS, (s) => s.put(JSON.parse(JSON.stringify(rec))));
  }
  putProcedure(p: Procedure): Promise<void> {
    return this.write(PROCEDURES, (s) => s.put(JSON.parse(JSON.stringify(p))));
  }
  deleteProcedure(id: ProcedureId): Promise<void> {
    return this.write(PROCEDURES, (s) => s.delete(id));
  }
  putMeta(meta: BlackBoxMeta): Promise<void> {
    return this.write(META, (s) => s.put(JSON.parse(JSON.stringify(meta)), META_KEY));
  }
  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([ATTEMPTS, PROCEDURES, META], 'readwrite');
    tx.objectStore(ATTEMPTS).clear();
    tx.objectStore(PROCEDURES).clear();
    tx.objectStore(META).clear();
    await done(tx);
  }

  close(): void {
    void this.db?.then((d) => d.close());
    this.db = null;
  }
}

/** IndexedDB when available, else memory. */
export function createBlackBoxStore(name?: string): BlackBoxStore {
  return typeof indexedDB !== 'undefined'
    ? new IndexedDbBlackBoxStore(name)
    : new MemoryBlackBoxStore();
}
