import { OmitType, PartialType } from "@nestjs/swagger";
import { UserDto } from "../user.dto";

export class UpdateUserReqDto extends PartialType(
	OmitType(UserDto, ['password'] as const),
) {}