import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set a global prefix for all routes
  app.setGlobalPrefix("api");

  // Allow larger JSON payloads for base64 file uploads (e.g., check copy).
  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));

  app.enableCors(); // Enable Cross-Origin Resource Sharing
  app.useGlobalPipes(new ValidationPipe()); // Enable validation globally
  await app.listen(3001);
}
bootstrap();
