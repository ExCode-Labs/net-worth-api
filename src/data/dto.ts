import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEntityDto {
  @IsString()
  id: string;

  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateEntityDto {
  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateMeDto {
  @IsOptional()
  @IsBoolean()
  onboarded?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
