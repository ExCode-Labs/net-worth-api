import express from 'express';
import serverlessExpress from '@codegenie/serverless-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createApp } from '../src/main';

const expressApp = express();

let handler: any;

export default async function (req: any, res: any) {
  if (!handler) {
    const app = await createApp();

    app.useAdapter(new ExpressAdapter(expressApp));

    await app.init();

    handler = serverlessExpress({
      app: expressApp,
    });
  }

  return handler(req, res);
}
