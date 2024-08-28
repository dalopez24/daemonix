export interface WorkersConfig {
    restartOnException: boolean;
    count: number | 'auto';
    restartTimeout: number;
    shutdownTimeout: number;
}
