import { Injectable } from '@nestjs/common';
import { screeningPresentation } from './client/screening-presentation';
import type { ScreeningResponse } from './screening.types';
@Injectable()
export class ScreeningPresentationService {
	build(
		instrument: ScreeningResponse['instrument'],
		result: Record<string, unknown>,
	) {
		return screeningPresentation(instrument, result);
	}
}
