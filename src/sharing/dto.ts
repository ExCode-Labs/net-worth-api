import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class DiscoverDto {
  @ApiProperty({
    description: 'SHA-256 hashes of E.164 phone numbers from the contact list.',
    type: [String],
    example: ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  hashes: string[];
}

export class UpsertShareDto {
  @ApiProperty({ description: 'ID of the user to share with', example: 'clxyz1234567890' })
  @IsString()
  recipientId: string;

  @ApiProperty({
    description: 'Categories to share. Empty array revokes all access.',
    type: [String],
    example: ['accounts', 'cards', 'transactions'],
  })
  @IsArray()
  @IsString({ each: true })
  categories: string[];
}
