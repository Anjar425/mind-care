import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupEligibilityService } from '../groups/group-eligibility.service';
import { RuleReferenceService } from '../rules/rule-reference.service';
import { RuleConflictCoreService } from './rule-conflict-core.service';
import { COMPARISON_VERSION } from './rule-conflict-comparison';
import {
	conflictScope,
	conflictTransaction,
	requireConflictMember,
} from './conflict-persistence';

@Injectable()
export class Dass42RuleAssessmentService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly groups: GroupEligibilityService,
		private readonly core: RuleConflictCoreService,
		private readonly references: RuleReferenceService,
	) {}
	// Internal boundary only: a later numerical engine must consume this same transaction snapshot.
	async readCurrentConflictFreeSnapshot(
		groupId: number,
		db?: Prisma.TransactionClient,
	) {
		const work = async (tx: Prisma.TransactionClient) => {
			const eligibility = await this.groups.requireCurrent(groupId, tx);
			const snapshot = await this.core.snapshot(
				tx,
				groupId,
				eligibility.validExpertIds,
			);
			if (!snapshot.inputs.length)
				throw new ConflictException(
					'No applicable current DASS42 rules',
				);
			await this.references.resolveMany(
				snapshot.inputs.map((r) => r.content),
				tx,
			);
			if (snapshot.conflicts.length)
				throw new ConflictException(
					'Applicable DASS42 rules contain unresolved conflicts',
				);
			return {
				groupId,
				sourceHash: snapshot.sourceHash,
				comparisonVersion: COMPARISON_VERSION,
				evaluatedAt: eligibility.evaluatedAt,
				rules: snapshot.inputs,
			};
		};
		return db ? work(db) : conflictTransaction(this.prisma, work, true);
	}
	async privateAssessment(userId: string, groupId: number) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				requireConflictMember(await conflictScope(tx, userId, groupId));
				const governance = await this.core.snapshot(tx, groupId);
				let eligible: Awaited<
					ReturnType<GroupEligibilityService['requireCurrent']>
				>;
				try {
					eligible = await this.groups.requireCurrent(groupId, tx);
				} catch (error) {
					if (error instanceof ConflictException)
						return {
							groupId,
							commonEligible: false,
							applicableStatus: 'BLOCKED',
							governanceConflictCount:
								governance.conflicts.length,
							evaluatedAt: new Date(),
						};
					throw error;
				}
				const applicable = await this.core.snapshot(
					tx,
					groupId,
					eligible.validExpertIds,
				);
				await this.references.resolveMany(
					applicable.inputs.map((r) => r.content),
					tx,
				);
				return {
					groupId,
					commonEligible: true,
					applicableStatus: !applicable.inputs.length
						? 'EMPTY'
						: applicable.conflicts.length
							? 'CONFLICTED'
							: 'CONFLICT_FREE',
					governanceConflictCount: governance.conflicts.length,
					applicableConflictCount: applicable.conflicts.length,
					applicableRuleCount: applicable.inputs.length,
					sourceHash: applicable.sourceHash,
					comparisonVersion: COMPARISON_VERSION,
					evaluatedAt: eligible.evaluatedAt,
				};
			},
			true,
		);
	}
}
