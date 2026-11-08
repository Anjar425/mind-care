import { UseFilters } from '@nestjs/common';
import type { ErrorPolicyName } from './error-policies';
import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Selects how GlobalExceptionFilter renders this controller's errors (see ErrorPolicyName).
 * Nest does not expose the controller class to global filters, so the policy is bound as a
 * controller-scoped instance of the same filter.
 */
export const ErrorPolicy = (policy: ErrorPolicyName) =>
	UseFilters(new GlobalExceptionFilter(policy));
