import { Injectable } from '@nestjs/common';
import { screeningPresentation } from '../../shared/contracts/screening-presentation';
import type { ScreeningResponse } from '../../shared/contracts/screening';
@Injectable()
export class ScreeningPresentationService {
	build(
		instrument: ScreeningResponse['instrument'],
		result: Record<string, unknown>,
	) {
		return screeningPresentation(instrument, result);
	}
}
