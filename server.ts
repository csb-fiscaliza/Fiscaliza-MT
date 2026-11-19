import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPendenciasRouter,
  type PendenciasServerDeps
} from './src/server/pendenciasApi.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);

export interface ServerAppOptions {
  isProduction?: boolean;
  port?: number;
  host?: string;
  distDir?: string;
  pendenciasDeps?: PendenciasServerDeps;
}

interface ServerRuntime {
  app: express.Express;
  close: () => Promise<void>;
}

async function createServerRuntime(options: ServerAppOptions = {}): Promise<ServerRuntime> {
  const isProduction = options.isProduction ?? IS_PRODUCTION;
  const app = express();
  let closeVite: (() => Promise<void>) | null = null;

  app.use('/api/pendencias', createPendenciasRouter(options.pendenciasDeps));

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota de API não encontrada.' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    closeVite = () => vite.close();
    app.use(vite.middlewares);
  } else {
    const distDir = options.distDir ?? path.resolve(CURRENT_DIR, 'dist');
    app.use(express.static(distDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return {
    app,
    close: async () => {
      if (closeVite) {
        await closeVite();
      }
    }
  };
}

export async function createApp(options: ServerAppOptions = {}): Promise<express.Express> {
  const { app } = await createServerRuntime(options);
  return app;
}

export async function startServer(options: ServerAppOptions = {}) {
  const isProduction = options.isProduction ?? IS_PRODUCTION;
  const port = options.port ?? PORT;
  const host = options.host ?? '0.0.0.0';
  const { app, close } = await createServerRuntime(options);

  return await new Promise<ReturnType<express.Express['listen']>>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(
          `[Fiscaliza] Servidor em execução na porta ${port} (${isProduction ? 'produção' : 'desenvolvimento'})`
        );
      }
      resolve(server);
    });
    server.once('error', err => {
      void close().finally(() => reject(err));
    });
    server.once('close', () => {
      void close();
    });
  });
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(CURRENT_FILE);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(CURRENT_FILE);
  }
}

if (isDirectExecution()) {
  startServer().catch(err => {
    console.error('[Fiscaliza] Falha ao iniciar servidor:', err);
    process.exit(1);
  });
}
