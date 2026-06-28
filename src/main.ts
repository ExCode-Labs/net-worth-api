import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type Express, type Request, type Response } from 'express';
import { AppModule } from './app.module';

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
    // Serverless: swagger-ui-dist static assets aren't bundled by @vercel/node,
    // so load the UI from a CDN instead of the function's filesystem.
    customCssUrl:
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],
  });

  return app;
}

// Cache the init across warm invocations; first request awaits it so routes and
// DI-provided guards (ThrottlerGuard's `throttlers`) are wired before we serve.
let ready: Promise<unknown> | undefined;

if (!process.env.VERCEL) {
  void bootstrap(server).then(async (app) => {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    Logger.log(`Listening on http://localhost:${port}`, 'Bootstrap');
    Logger.log(`Swagger UI at http://localhost:${port}/docs`, 'Bootstrap');
  });
}

// Vercel's @vercel/node runtime calls this default export per request.
export default async function handler(req: Request, res: Response) {
  ready ??= bootstrap(server).then((app) => app.init());
  await ready;
  server(req, res);
}
