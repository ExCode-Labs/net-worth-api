import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('NetWorth API')
    .setDescription(
      'Backend for the NetWorth personal finance app.\n\n' +
        '**Auth:** Most endpoints require a Bearer token. ' +
        'Call `/auth/email/login` → `/auth/email/verify` to obtain one, ' +
        'then click **Authorize** and paste the `accessToken`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('Auth', 'Sign-in, registration, OTP, Google SSO, sessions')
    .addTag('Vault', 'Vault PIN setup, verify, and reset')
    .addTag(
      'Data',
      'Bootstrap, profile, and generic resource CRUD (accounts / cards / transactions / assets / liabilities)',
    )
    .addTag('Sharing', 'Share financial data with contacts')
    .addTag('Reference', 'Banks and card-product reference lists')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger UI at http://localhost:${port}/docs`, 'Bootstrap');
}

if (process.env.VERCEL !== '1') {
  void bootstrap();
}
