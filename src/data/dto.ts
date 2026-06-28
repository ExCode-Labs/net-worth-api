import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEntityDto {
  @ApiPropertyOptional({
    description: 'Client-generated CUID. Omit to let the server generate one.',
    example: 'clxyz1234567890',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: 'Resource fields. Shape depends on the resource type.',
    example: { amount: 500, label: 'Coffee', type: 'Expense', date: '2026-06-01T10:00:00Z' },
  })
  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateEntityDto {
  @ApiProperty({
    description: 'Partial resource fields to update.',
    example: { amount: 750 },
  })
  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onboarded?: boolean;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Guest User' })
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Rahul' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Sharma' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
