import { Daemonix, DaemonixConfig } from '../daemonix';
import cluster from 'cluster';
import * as os from 'os';

jest.mock('cluster');
jest.mock('os');

describe('Daemonix', () => {
  let mockApp: jest.Mock;
  let mockLog: jest.Mock;
  let mockExit: jest.Mock;
  let mockOn: jest.Mock;
  let config: DaemonixConfig;

  beforeEach(() => {
    jest.resetAllMocks();
    mockApp = jest.fn().mockResolvedValue(undefined);
    mockLog = jest.fn();
    mockExit = jest.fn();
    mockOn = jest.fn();

    process.exit = mockExit as any;
    process.on = mockOn as any;

    (cluster as any).isPrimary = true;
    (cluster as any).workers = {};
    (cluster.fork as jest.Mock).mockReturnValue({ process: { pid: 1234 } });
    (os.cpus as jest.Mock).mockReturnValue(Array(4));

    config = {
      app: mockApp,
      log: mockLog,
      workers: { count: 2, restartOnException: true, restartTimeout: 1000, shutdownTimeout: 30000 },
    };
  });

  test('should initialize with default config', () => {
    const daemonix = new Daemonix({ app: mockApp });
    expect(daemonix).toBeInstanceOf(Daemonix);
    expect(cluster.fork).toHaveBeenCalledTimes(2);
  });

  test('should use custom log function if provided', () => {
    new Daemonix(config);
    expect(mockOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

    const uncaughtHandler = mockOn.mock.calls.find((call) => call[0] === 'uncaughtException')[1];
    uncaughtHandler(new Error('Test error'));

    expect(mockLog).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('UNCAUGHT EXCEPTION'),
      expect.any(String),
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('should use correct number of workers when set to "auto"', () => {
    const autoConfig: DaemonixConfig = { ...config, workers: { ...config.workers, count: 'auto' } };
    new Daemonix(autoConfig);
    expect(cluster.fork).toHaveBeenCalledTimes(4);
  });

  test('should use specified number of workers', () => {
    const specificConfig: DaemonixConfig = { ...config, workers: { ...config.workers, count: 3 } };
    new Daemonix(specificConfig);
    expect(cluster.fork).toHaveBeenCalledTimes(3);
  });

  test('should start worker process when cluster is not primary', () => {
    (cluster as any).isPrimary = false;
    new Daemonix(config);
    expect(mockApp).toHaveBeenCalled();
  });

  test('should handle worker exit and fork new worker', () => {
    jest.useFakeTimers();
    new Daemonix(config);
    const exitHandler = (cluster.on as jest.Mock).mock.calls.find((call) => call[0] === 'exit')[1];
    exitHandler({ process: { pid: 5678 } }, 0, 'SIGTERM');
    jest.runAllTimers();
    expect(cluster.fork).toHaveBeenCalledTimes(3); // 2 initial + 1 after exit
  });

  test('should not fork new worker when shutting down', () => {
    jest.useFakeTimers();
    const daemonix = new Daemonix(config);
    (daemonix as any)._shuttingDown = true;
    const exitHandler = (cluster.on as jest.Mock).mock.calls.find((call) => call[0] === 'exit')[1];
    exitHandler({ process: { pid: 5678 } }, 0, 'SIGTERM');
    jest.runAllTimers();
    expect(cluster.fork).toHaveBeenCalledTimes(2); // only the initial 2 forks
  });

  test('should handle shutdown process', () => {
    jest.useFakeTimers();
    const daemonix = new Daemonix(config);
    (cluster as any).workers = {
      1: { process: { kill: jest.fn() } },
      2: { process: { kill: jest.fn() } },
    };

    const terminationHandler = (process.on as jest.Mock).mock.calls.find(
      (call) => call[0] === 'SIGTERM',
    )[1];
    terminationHandler();

    expect(mockLog).toHaveBeenCalledWith('info', 'Shutting down...');
    expect((cluster as any).workers[1].process.kill).toHaveBeenCalledWith('SIGTERM');
    expect((cluster as any).workers[2].process.kill).toHaveBeenCalledWith('SIGTERM');

    jest.runAllTimers();

    expect(mockLog).toHaveBeenCalledWith('warning', 'Forced shutdown');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
