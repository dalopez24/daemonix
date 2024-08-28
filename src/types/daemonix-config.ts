import {WorkersConfig} from "./worker-config";

export interface DaemonixConfig {
    app: () => Promise<void>;
    log?: (...args: any[]) => void;
    workers?: Partial<WorkersConfig>;
}
