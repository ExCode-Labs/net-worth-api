import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class DiscoverDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  hashes: string[];
}

export class UpsertShareDto {
  @IsString()
  recipientId: string;

  @IsArray()
  @IsString({ each: true })
  categories: string[];
}
