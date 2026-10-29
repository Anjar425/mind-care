import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
} from '@nestjs/common';
import { ExpertService } from './expert.service';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';

@Controller('expert')
export class ExpertController {
	constructor(private readonly expertService: ExpertService) {}

	@Post()
	create(@Body() createExpertDto: CreateExpertDto) {
		return this.expertService.create(createExpertDto);
	}

	@Get()
	findAll(@Query() paginationDto: PaginationDto) {
		return this.expertService.findAll(paginationDto);
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.expertService.findOne(+id);
	}

	@Patch(':id')
	update(@Param('id') id: string, @Body() updateExpertDto: UpdateExpertDto) {
		return this.expertService.update(+id, updateExpertDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.expertService.remove(+id);
	}
}
