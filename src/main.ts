import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set a global prefix for all routes
  app.setGlobalPrefix('api');

  app.enableCors(); // Enable Cross-Origin Resource Sharing
  app.useGlobalPipes(new ValidationPipe()); // Enable validation globally
  await app.listen(3001);
}
bootstrap();
