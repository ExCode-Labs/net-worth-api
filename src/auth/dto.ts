import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class EmailPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MyPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Rahul' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MyPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP from email' })
  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class EmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP from email' })
  @IsString()
  @Length(6, 6)
  otp!: string;

  @ApiProperty({ example: 'NewPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class GoogleTokenDto {
  @ApiProperty({ description: 'Google ID token from GoogleSignIn.signIn()' })
  @IsString()
  idToken!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token returned by login or verify' })
  @IsString()
  refreshToken!: string;
}

export class VaultPinDto {
  @ApiProperty({
    description: 'SHA-256 hex digest of (salt + PIN). Client hashes before sending.',
    example: 'a'.repeat(64),
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  pinHash!: string;
}

export class VaultPinResetDto {
  @ApiProperty({ example: '482910', description: '6-digit OTP from email' })
  @IsString()
  @Length(6, 6)
  otp!: string;

  @ApiProperty({
    description: 'New PIN as SHA-256 hex digest',
    example: 'a'.repeat(64),
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  pinHash!: string;
}
