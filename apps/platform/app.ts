import './tracing';
import type { Ctx, TrpcContext } from './ctx';
import { env } from './env';
import {
  createHonoApp,
  setupCors,
  setupErrorHandlers,
  setupHealthReporting,
  setupHonoListener,
  setupRouteLogger,
  setupRuntime,
  setupTrpcHandler
} from '@u22n/hono';
import { authApi } from './routes/auth';
import { realtimeApi } from './routes/realtime';
import { trpcPlatformRouter } from './trpc';
import { db } from '@u22n/database';
import { authMiddleware, serviceMiddleware } from './middlewares';
import { otel } from '@u22n/otel/hono';
import { servicesApi } from './routes/services';

const app = createHonoApp<Ctx>();

app.use(otel());

setupRouteLogger(app, env.NODE_ENV === 'development');
setupCors(app, { origin: [env.WEBAPP_URL], exposeHeaders: ['Location'] });
setupHealthReporting(app, { service: 'Platform' });
setupErrorHandlers(app);

// Auth middleware
app.use('*', authMiddleware);

setupTrpcHandler(
  app,
  trpcPlatformRouter,
  (_, c) =>
    ({
      db,
      account: c.get('account'),
      org: null,
      event: c,
      selfHosted: !env.EE_LICENSE_KEY
    }) satisfies TrpcContext
);

// Routes
app.route('/auth', authApi);
app.route('/realtime', realtimeApi);
// Service Endpoints
app.use('/services/*', serviceMiddleware);
app.route('/services', servicesApi);

const cleanup = setupHonoListener(app, { port: env.PORT });
setupRuntime([cleanup]);
