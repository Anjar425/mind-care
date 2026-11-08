// Inputs accepted by the expert profile domain. HTTP DTOs implement these shapes.
import type { Education } from '../../infrastructure/prisma/generated/enums';

export interface ExpertCapabilityInput {
	education: Education;
	publicationsNumber: number;
	patientsNumber: number;
	clinicalHours: number;
}

export interface ExpertFactorWeightsInput {
	educationWeight: number;
	publicationWeight: number;
	patientWeight: number;
	clinicalHoursWeight: number;
}

export interface UpsertExpertProfileInput {
	expectedVersion: number;
	profile: ExpertCapabilityInput;
	weights: ExpertFactorWeightsInput;
}
