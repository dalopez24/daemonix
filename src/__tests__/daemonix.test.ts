import {Daemonix} from '../daemonix';
import cluster from 'cluster';
import * as os from 'os';

jest.mock('cluster');
jest.mock('os');

describe('Daemonix', () => {
    let mockApp: jest.Mock;
    let mockLog: jest.Mock;

    beforeEach(() => {
        jest.resetAllMocks();
        mockApp = jest.fn();
        mockLog = jest.fn();
        (cluster as any).isPrimary = true;
        (os.cpus as jest.Mock).mockReturnValue(Array(4));
    });

    test('should initialize with default config', () => {
        new Daemonix({app: mockApp});
        expect(mockApp).toHaveBeenCalled();
    });

    test('should use custom log function if provided', () => {
        new Daemonix({app: mockApp, log: mockLog});
        expect(mockLog).toHaveBeenCalled();
    });

    test('should start master process when cluster is primary', () => {
        const daemonix = new Daemonix({app: mockApp});
        expect((daemonix as any)._startMaster).toHaveBeenCalled();
    });

    test('should start worker process when cluster is not primary', () => {
        (cluster as any).isPrimary = false;
        const daemonix = new Daemonix({app: mockApp});
        expect((daemonix as any)._startWorker).toHaveBeenCalled();
    });

    test('should use correct number of workers when set to "auto"', () => {
        new Daemonix({app: mockApp, workers: {count: 'auto'}});
        expect(cluster.fork).toHaveBeenCalledTimes(4);
    });

    test('should use specified number of workers', () => {
        new Daemonix({app: mockApp, workers: {count: 2}});
        expect(cluster.fork).toHaveBeenCalledTimes(2);
    });

    test('should handle uncaught exceptions', () => {
        const mockProcess = {
            on: jest.fn(),
            kill: jest.fn(),
        };
        new Daemonix({app: mockApp});

        const uncaughtHandler = mockProcess.on.mock.calls.find(call => call[0] === 'uncaughtException')[1];
        uncaughtHandler(new Error('Test error'));

        expect(mockProcess.kill).toHaveBeenCalled();
    });

    test('should handle termination signals', () => {
        const mockProcess = {
            on: jest.fn(),
            exit: jest.fn(),
        };
        new Daemonix({app: mockApp});

        const terminationHandler = mockProcess.on.mock.calls.find(call => call[0] === 'SIGTERM')[1];
        terminationHandler();

        expect(mockProcess.exit).toHaveBeenCalled();
    });
});