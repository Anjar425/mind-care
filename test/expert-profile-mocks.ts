import { credentialExpert, credentialUser } from './credential-mocks';
import type { StoredExpertProfile } from '../src/expert/expert-profile-completeness.service';
import type { UpsertExpertProfileDto } from '../src/expert/dto/req/upsert-expert-profile.req.dto';
import type { Prisma } from '../src/prisma/generated/client';

export const validProfileSubmission = (): UpsertExpertProfileDto => ({
	expectedVersion: 0,
	profile: {
		education: 'MASTER',
		publicationsNumber: 0,
		patientsNumber: 0,
		clinicalHours: 0,
	},
	weights: {
		educationWeight: 25,
		publicationWeight: 25,
		patientWeight: 25,
		clinicalHoursWeight: 25,
	},
});
export function createExpertProfileMocks() {
	const expert: ReturnType<typeof credentialExpert> & StoredExpertProfile = {
		...credentialExpert(),
		profileVersion: 0,
		profileValidatedAt: null,
		education: null,
		publicationsNumber: null,
		patientsNumber: null,
		clinicalHours: null,
		weight: null,
	};
	const update = (args: {
		where: { profileVersion: number };
		data: UpsertExpertProfileDto['profile'] & { profileValidatedAt: Date };
	}) => {
		if (args.where.profileVersion !== expert.profileVersion)
			return Promise.resolve({ count: 0 });
		Object.assign(expert, {
			...args.data,
			profileVersion: expert.profileVersion + 1,
		});
		return Promise.resolve({ count: 1 });
	};
	const upsert = (args: { update: UpsertExpertProfileDto['weights'] }) => {
		expert.weight = { ...args.update };
		return Promise.resolve(expert.weight);
	};
	const transaction = jest.fn(
		async (
			work: (tx: Prisma.TransactionClient) => Promise<unknown>,
		): Promise<unknown> => {
			const snapshot = structuredClone(expert);
			try {
				return await work(
					prisma as unknown as Prisma.TransactionClient,
				);
			} catch (error) {
				Object.assign(expert, snapshot);
				throw error;
			}
		},
	);
	const prisma = {
		user: { findUnique: jest.fn().mockResolvedValue(credentialUser()) },
		expert: {
			findUnique: jest
				.fn()
				.mockImplementation(() => Promise.resolve(expert)),
			updateMany: jest.fn(update),
		},
		weight: { upsert: jest.fn(upsert) },
		$queryRaw: jest.fn().mockResolvedValue([]),
		$transaction: transaction,
	};
	return { prisma, expert };
}
