import * as os from 'os';
import { WorkersConfig } from './types';
import cluster from 'cluster';

export interface DaemonixConfig {
  app: () => Promise<void>;
  log?: (...args: any[]) => void;
  workers?: Partial<WorkersConfig>;
}

const defaultConfig: { workers: WorkersConfig } = {
  workers: {
    restartOnException: true,
    count: 2,
    restartTimeout: 1000,
    shutdownTimeout: 30000,
  },
};

export class Daemonix {
  private readonly _app: () => Promise<void>;
  private readonly _log: (...args: any[]) => void;
  private readonly _workersConfig: WorkersConfig;
  private _shuttingDown: boolean = false;

  constructor(config: DaemonixConfig) {
    this._app = config.app;
    this._log = config.log || console.log;
    this._workersConfig = { ...defaultConfig.workers, ...config.workers };

    this.setupUncaughtExceptionHandler();

    if (cluster.isPrimary) {
      this.startMaster();
    } else {
      this.startWorker();
    }
  }

  private setupUncaughtExceptionHandler(): void {
    process.on('uncaughtException', (err: Error) => {
      this._log('error', 'UNCAUGHT EXCEPTION: ' + err.message, err.stack);

      if (this._workersConfig.restartOnException) {
        process.exit(1);
      }
    });
  }

  private startMaster(): void {
    const targetWorkerCount = this.getTargetWorkerCount();

    cluster.on('exit', (worker, code, signal) => {
      this._log('info', `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);

      if (!this._shuttingDown) {
        setTimeout(() => {
          cluster.fork();
        }, this._workersConfig.restartTimeout);
      }
    });

    for (let i = 0; i < targetWorkerCount; i++) {
      cluster.fork();
    }

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private getTargetWorkerCount(): number {
    if (this._workersConfig.count === 'auto') {
      return os.cpus().length;
    }
    return Math.max(1, this._workersConfig.count);
  }

  private async startWorker(): Promise<void> {
    try {
      await this._app();
    } catch (err) {
      this._log('error', 'Application error:', err);
      process.exit(1);
    }
  }

  private shutdown(): void {
    this._shuttingDown = true;
    this._log('info', 'Shutting down...');

    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill('SIGTERM');
    }

    setTimeout(() => {
      this._log('warning', 'Forced shutdown');
      process.exit(1);
    }, this._workersConfig.shutdownTimeout);
  }
}
