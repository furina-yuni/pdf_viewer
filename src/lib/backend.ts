export type BackendLease = {
  baseUrl: string;
  release: () => Promise<void>;
};

export async function acquireBackend(): Promise<BackendLease> {
  if (!window.desktop?.isElectron) {
    return { baseUrl: "", release: async () => undefined };
  }

  const lease = await window.desktop.acquireBackend();
  let released = false;
  return {
    baseUrl: lease.baseUrl,
    release: async () => {
      if (released) return;
      released = true;
      await window.desktop?.releaseBackend(lease.leaseId);
    },
  };
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const backend = await acquireBackend();
  try {
    return await fetch(`${backend.baseUrl}${path}`, init);
  } finally {
    await backend.release();
  }
}
