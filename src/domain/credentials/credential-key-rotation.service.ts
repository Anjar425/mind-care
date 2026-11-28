import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CredentialStorageService } from './credential-storage.service';

export interface ReencryptReport {
	/** Revisions examined. */
	scanned: number;
	/** Credential numbers re-sealed with the current key. */
	numbers: number;
	/** Stored documents re-sealed with the current key. */
	documents: number;
	/** Revisions whose number or document could not be opened or verified. */
	failed: number;
}

const BATCH = 100;

/**
 * Moves every credential number and stored document to the current encryption key, so an
 * old key can be removed from CREDENTIAL_ENCRYPTION_KEYS afterwards. Idempotent: values that
 * already use the current key are skipped. Run under the job lease (see the CLI).
 */
@Injectable()
export class CredentialKeyRotationService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: CredentialStorageService,
	) {}

	async reencrypt(apply: boolean): Promise<ReencryptReport> {
		const report: ReencryptReport = {
			scanned: 0,
			numbers: 0,
			documents: 0,
			failed: 0,
		};
		const current = this.storage.currentKid();
		let cursor: string | undefined;
		for (;;) {
			const rows = await this.prisma.credentialRevision.findMany({
				select: {
					id: true,
					numberCipher: true,
					objectKey: true,
					digest: true,
					size: true,
					purgedAt: true,
				},
				orderBy: { id: 'asc' },
				take: BATCH,
				...(cursor && { cursor: { id: cursor }, skip: 1 }),
			});
			if (rows.length === 0) break;
			cursor = rows[rows.length - 1].id;
			for (const row of rows) {
				report.scanned += 1;
				try {
					if (this.storage.kidOf(row.numberCipher) !== current) {
						report.numbers += 1;
						if (apply)
							// Compare-and-swap: a concurrent change to the row wins.
							await this.prisma.credentialRevision.updateMany({
								where: {
									id: row.id,
									numberCipher: row.numberCipher,
								},
								data: {
									numberCipher: this.storage.reseal(
										row.numberCipher,
										row.id,
									),
								},
							});
						else this.storage.open(row.numberCipher, row.id);
					}
					// Purged revisions no longer have a document.
					if (!row.purgedAt) {
						const changed = apply
							? await this.storage.resealObject(
									row.objectKey,
									row.digest,
									row.size,
								)
							: await this.needsDocumentReseal(row);
						if (changed) report.documents += 1;
					}
				} catch {
					report.failed += 1;
				}
			}
		}
		return report;
	}

	private async needsDocumentReseal(row: {
		objectKey: string;
		digest: string;
		size: number;
	}): Promise<boolean> {
		// Dry run: prove the document opens and verifies, without writing.
		await this.storage.read(row.objectKey, row.digest, row.size);
		return this.storage
			.sealedKid(row.objectKey)
			.then((kid) => kid !== this.storage.currentKid());
	}
}
