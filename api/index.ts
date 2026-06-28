import express from 'express';
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';

const expressApp = express();

let server: any;

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  await app.init();

  return serverlessExpress({
    app: expressApp,
  });
}

export default async function handler(req: any, res: any) {
  server ??= await bootstrap();
  return server(req, res);
}
