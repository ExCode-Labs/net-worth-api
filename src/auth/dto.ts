import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class EmailPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class EmailDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class GoogleTokenDto {
  @IsString()
  idToken!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
