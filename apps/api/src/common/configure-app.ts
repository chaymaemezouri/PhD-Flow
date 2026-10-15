import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_VERSION } from '../config/constants.js';
import { ApiExceptionFilter } from './filters/api-exception.filter.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.getOrThrow<string>('NODE_ENV');
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
  });
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const docsRequested = config.get<string>('ENABLE_API_DOCS') === 'true';
  if (nodeEnv !== 'production' || docsRequested) {
    const documentConfig = new DocumentBuilder()
      .setTitle('ScholarFlow API')
      .setDescription(
        'REST API for the ScholarFlow scientific publication and conference management system.',
      )
      .setVersion(APP_VERSION)
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
