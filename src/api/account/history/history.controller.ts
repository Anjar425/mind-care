import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	Put,
	Query,
	Req,
	Res,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { HistoryService } from '../../../domain/history/history.service';
import { HistoryVaultService } from '../../../domain/history/history-vault.service';
import { HistoryResponse } from './history-api.decorator';
import { ErrorPolicy } from '../../common/errors/error-policy.decorator';
import {
	HistoryConsentDto,
	HistoryEntrySubmissionDto,
	HistoryPageDto,
	HistoryRecoveryReplacementDto,
	HistoryRevisionDto,
	HistoryVaultInitializationDto,
} from './dto/history.requests.dto';
import {
	HistoryEntryDto,
	HistoryMutationDto,
	HistoryPageResponseDto,
	HistorySavedDto,
	HistoryVaultDto,
} from './dto/history.responses.dto';
type Request = { user: AccessPrincipal };
@ApiTags('Private screening history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ErrorPolicy('history')
@Roles('USER', 'EXPERT')
@Controller('account/history')
export class HistoryController {
	constructor(
		private readonly history: HistoryService,
		private readonly vaults: HistoryVaultService,
	) {}
	@Get('vault')
	@HistoryResponse(
		HistoryVaultDto,
		'Read own ciphertext vault and explicit storage-consent state',
	)
	vault(@Req() req: Request) {
		return this.vaults.read(req.user.sub);
	}
	@Post('vault')
	@HistoryResponse(
		HistoryVaultDto,
		'Initialize own client-encrypted vault; storage consent defaults off',
		true,
	)
	initialize(
		@Req() req: Request,
		@Body() dto: HistoryVaultInitializationDto,
	) {
		return this.vaults.initialize(req.user.sub, dto);
	}
	@Put('vault')
	@HistoryResponse(
		HistoryVaultDto,
		'Replace own encrypted recovery envelope; does not rotate the data key',
	)
	recovery(@Req() req: Request, @Body() dto: HistoryRecoveryReplacementDto) {
		return this.vaults.replaceRecovery(req.user.sub, dto);
	}
	@Put('consent')
	@HistoryResponse(
		HistoryVaultDto,
		'Enable or withdraw automatic encrypted-history storage consent',
	)
	consent(@Req() req: Request, @Body() dto: HistoryConsentDto) {
		return this.vaults.consent(req.user.sub, dto);
	}
	@Get('entries')
	@HistoryResponse(
		HistoryPageResponseDto,
		'List own encrypted entries with revision-bound pagination',
	)
	list(@Req() req: Request, @Query() query: HistoryPageDto) {
		return this.history.list(req.user.sub, query);
	}
	@Get('entries/:id')
	@HistoryResponse(HistoryEntryDto, 'Read one own encrypted history entry')
	read(@Req() req: Request, @Param('id') id: string) {
		return this.history.read(req.user.sub, id);
	}
	@Put('entries/:id')
	@HttpCode(200)
	@HistoryResponse(
		HistorySavedDto,
		'Save immutable ciphertext after storage opt-in; identical retry is200, creation201',
		false,
		true,
	)
	async save(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: HistoryEntrySubmissionDto,
		@Res({ passthrough: true }) res: Response,
	) {
		const result = await this.history.save(req.user.sub, id, dto);
		res.status(result.created ? 201 : 200);
		return result;
	}
	@Delete('entries/:id')
	@HistoryResponse(
		HistoryMutationDto,
		'Delete one own entry; require current revision',
	)
	remove(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: HistoryRevisionDto,
	) {
		return this.history.remove(req.user.sub, id, dto);
	}
	@Delete('entries')
	@HistoryResponse(
		HistoryMutationDto,
		'Delete all own entries; preserve vault, consent, device keys and recovery code',
	)
	removeAll(@Req() req: Request, @Body() dto: HistoryRevisionDto) {
		return this.history.removeAll(req.user.sub, dto);
	}
}
