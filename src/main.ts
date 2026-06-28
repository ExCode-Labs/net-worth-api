import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type Express } from 'express';
import { AppModule } from './app.module';

// Vercel imports this module and uses the default export (an Express app) as the
// serverless handler. Locally we still call listen().
const server = express();

async function bootstrap(expressInstance: Express) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressInstance),
  );
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

  return app;
}

if (process.env.VERCEL) {
  // Serverless: just wire up routes onto `server`, no listen.
  // ponytail: known cold-start race — a request landing before init() resolves
  // 404s. Wrap with @codegenie/serverless-express (already a dep) if it bites.
  void bootstrap(server).then((app) => app.init());
} else {
  void bootstrap(server).then(async (app) => {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    Logger.log(`Listening on http://localhost:${port}`, 'Bootstrap');
    Logger.log(`Swagger UI at http://localhost:${port}/docs`, 'Bootstrap');
  });
}

export default server;
