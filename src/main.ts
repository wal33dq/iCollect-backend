mport { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';

async function bootstrap() {
  let httpsOptions = null;

  // Check if SSL environment variables are set; only enable HTTPS if they are
  if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
    try {
      httpsOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      };
      console.log('HTTPS enabled with provided certificates.');
    } catch (error) {
      console.error('Failed to load SSL certificates. Falling back to HTTP.', error);
      httpsOptions = null;
    }
  } else {
    console.log('SSL environment variables not set. Starting in HTTP mode (CORS issues may persist).');
  }

  const app = await NestFactory.create(AppModule, httpsOptions ? { httpsOptions } : undefined);

  // Set a global prefix for all routes (e.g., https://your-domain.com/api/...)
  app.setGlobalPrefix('api');

  // --- CORS Configuration for Production on AWS ---
  // This allows requests only from your specified frontend domains, fixing cross-origin errors.
  // In your AWS environment variables, you can set FRONTEND_URL to a comma-separated list
  // of your allowed domains, e.g., "https://your-domain.com,https://www.your-domain.com"
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')
    : ['http://icollect.huburllc.com', 'https://icollect.huburllc.com', 'https://huburllc.com'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Set to true if your frontend needs to send cookies/auth headers
    methods: ['GET','HEAD','POST', 'PUT','PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe to ensure all incoming data conforms to DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strips properties that do not have any decorators
    forbidNonWhitelisted: true, // Throws an error for non-whitelisted properties
    transform: true, // Automatically transforms payloads to DTO instances
  }));

  // Listen on the port specified in environment variables (for AWS), with a fallback to 3001
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Application is running on: ${httpsOptions ? 'https' : 'http'}://localhost:${port}`);
}

bootstrap();
