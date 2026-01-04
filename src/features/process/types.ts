export interface TrackedProcess {
  pid: number;
  name: string;
  command: string;
  params: string;
  started: number;
  pcpu: number;
  pmem: number;
}

export interface CompletedProcess {
  pid: number;
  name: string;
  command: string;
  params: string;
  started: number;
  ended: number;
  duration: number;
  maxCpu: number;
  maxMem: number;
}
