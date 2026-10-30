import { Injectable } from '@nestjs/common';
import type { Education } from '../prisma/generated/enums';
import { validCapabilities, validWeights } from './expert-profile.validation';

export interface StoredExpertProfile {
	profileVersion: number;
	profileValidatedAt: Date | null;
	education: Education | null;
	publicationsNumber: number | null;
	patientsNumber: number | null;
	clinicalHours: number | null;
	weight: {
		educationWeight: number;
		publicationWeight: number;
		patientWeight: number;
		clinicalHoursWeight: number | null;
	} | null;
}
@Injectable()
export class ExpertProfileCompletenessService {
	evaluate(expert: StoredExpertProfile | null) {
		const validated =
			!!expert?.profileValidatedAt && expert.profileVersion > 0;
		return {
			profileComplete: validated && validCapabilities(expert),
			weightsComplete: validated && validWeights(expert?.weight),
		};
	}
	response(expert: StoredExpertProfile | null) {
		return {
			version: expert?.profileVersion ?? 0,
			validatedAt: expert?.profileValidatedAt ?? null,
			profile: expert
				? {
						education: expert.education,
						publicationsNumber: expert.publicationsNumber,
						patientsNumber: expert.patientsNumber,
						clinicalHours: expert.clinicalHours,
					}
				: null,
			weights: expert?.weight
				? {
						educationWeight: expert.weight.educationWeight,
						publicationWeight: expert.weight.publicationWeight,
						patientWeight: expert.weight.patientWeight,
						clinicalHoursWeight: expert.weight.clinicalHoursWeight,
					}
				: null,
			...this.evaluate(expert),
		};
	}
}
