import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { ReferenceDataService } from './reference-data.service';
import { QuestionnaireResponseDto } from './dto/questionnaire-response.dto';

@ApiTags('Reference data')
@Controller('references')
export class ReferenceDataController {
	constructor(private readonly references: ReferenceDataService) {}

	@Get('dass21')
	@ApiOperation({
		summary: 'Read the complete candidate DASS21 questionnaire',
		description:
			'Public reference content only. Candidate content has not been clinically reviewed. Returns 503 until the database catalog is complete and matches the release.',
	})
	@ApiCommonResponse([200, 429, 503, 500], {
		model: QuestionnaireResponseDto,
	})
	dass21() {
		return this.references.getQuestionnaire('DASS21');
	}

	@Get('dass42')
	@ApiOperation({
		summary: 'Read the complete candidate DASS42 questionnaire',
		description:
			'Separate from DASS21 and screening computation. Candidate content has not been clinically reviewed. Returns 503 until the database catalog is complete and matches the release.',
	})
	@ApiCommonResponse([200, 429, 503, 500], {
		model: QuestionnaireResponseDto,
	})
	dass42() {
		return this.references.getQuestionnaire('DASS42');
	}
}
