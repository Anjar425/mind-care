/**
 * Private object storage for sealed (already encrypted) credential documents. Keys are
 * generated and validated by the caller; implementations never interpret the bytes.
 */
export interface ObjectStore {
	/** Writes a new object; fails if the key already exists. */
	put(key: string, body: Buffer): Promise<void>;
	/** Overwrites an existing object (re-encryption). */
	replace(key: string, body: Buffer): Promise<void>;
	/** Throws ObjectNotFoundError when the key does not exist. */
	get(key: string): Promise<Buffer>;
	/** Idempotent: deleting a missing key succeeds. */
	delete(key: string): Promise<void>;
	/** Keys strictly after `after` in ascending order, at most `limit`. */
	list(after: string, limit: number): Promise<StoredObject[]>;
}

export interface StoredObject {
	key: string;
	lastModified: Date;
}

export class ObjectNotFoundError extends Error {
	constructor() {
		super('Object not found');
	}
}

export const OBJECT_STORE = Symbol('OBJECT_STORE');
