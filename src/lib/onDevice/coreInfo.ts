// Which Recite engine a Revisely Dev build carries (on-device-plan.md §14.7): the private recite-core library, or the
// stub a build without the token links, which leaves takes to the server. Shown on the bench screen, so a build that
// silently shipped the stub is seen on its first launch.

interface CoreInfo {
  version: string;
  /** The library's ABI, and the one the app's glue was compiled against. */
  abi: number;
  headerAbi: number;
  stub: boolean;
  /** "passed", "skipped" (the stub, or an engine that needs its data pack) or "failed: <step>". */
  selfTest: string;
}

export interface CoreLine {
  version: string;
  stub: boolean;
  /** The replay stand-in: it plays a recorded take's frames and can't read a real pack. */
  replay: boolean;
  /** Why the engine can't be used, or null. */
  failed: string | null;
}

/** Null where the module is too old to say, or what it said can't be read. */
export function coreLine(engine: { coreInfo?(): string } | null): CoreLine | null {
  if (!engine?.coreInfo) return null;
  let info: CoreInfo;
  try {
    info = JSON.parse(engine.coreInfo()) as CoreInfo;
  } catch {
    return null;
  }
  if (!info || typeof info.version !== 'string') return null;
  if (info.stub) return { version: info.version, stub: true, replay: false, failed: null };
  const failed =
    info.abi !== info.headerAbi
      ? `ABI ${info.abi}, app expects ${info.headerAbi}`
      : info.selfTest?.startsWith('failed: ')
        ? info.selfTest.slice('failed: '.length)
        : null;
  return { version: info.version, stub: false, replay: /replay/.test(info.version), failed };
}
