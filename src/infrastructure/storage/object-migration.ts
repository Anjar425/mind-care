import { createHash } from 'node:crypto';
import { ObjectNotFoundError, type ObjectStore } from './object-store';

export interface CopyReport {
	scanned: number;
	/** Copied and read back with an identical SHA-256. */
	copied: number;
	/** Already in the target with identical content. */
	present: number;
	/** In the target with DIFFERENT content: never overwritten, needs a person. */
	conflicts: number;
	failed: number;
}

const sha256 = (body: Buffer) =>
	createHash('sha256').update(body).digest('hex');

/**
 * Copies every object from `source` to `target` and verifies each copy by digest. Never
 * deletes or overwrites anything; safe to re-run. With `apply: false` only reports what
 * would be copied.
 */
export async function copyObjects(
	source: ObjectStore,
	target: ObjectStore,
	apply: boolean,
): Promise<CopyReport> {
	const report: CopyReport = {
		scanned: 0,
		copied: 0,
		present: 0,
		conflicts: 0,
		failed: 0,
	};
	let after = '';
	for (;;) {
		const batch = await source.list(after, 100);
		if (batch.length === 0) break;
		after = batch[batch.length - 1].key;
		for (const { key } of batch) {
			report.scanned += 1;
			try {
				const body = await source.get(key);
				const existing = await target
					.get(key)
					.catch((error: unknown) => {
						if (error instanceof ObjectNotFoundError)
							return undefined;
						throw error;
					});
				if (existing) {
					if (sha256(existing) === sha256(body)) report.present += 1;
					else report.conflicts += 1;
					continue;
				}
				if (!apply) {
					report.copied += 1;
					continue;
				}
				await target.put(key, body);
				if (sha256(await target.get(key)) !== sha256(body))
					throw new Error('Copy verification failed');
				report.copied += 1;
			} catch {
				report.failed += 1;
			}
		}
	}
	return report;
}
