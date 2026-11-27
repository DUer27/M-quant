// Cache only the most recent series for each visited stock. No all-pool minute downloads.
export function createMinuteLoader(fetcher = (...args) => fetch(...args)) {
  const cache = new Map(), pending = new Map(), failures = new Map();
  async function load(code, version) {
    if (!code || !version) return;
    if (cache.get(code)?.data?.version === version) { failures.delete(code); return cache.get(code); }
    const key = code + ':' + version;
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetcher('/market-data-api/intraday/minute?code=' + encodeURIComponent(code));
        if (!response.ok) throw new Error('分钟图读取失败，保留已加载数据');
        const entry = await response.json();
        if (entry.code !== code || !Array.isArray(entry.data?.rows) || !entry.data.version) throw new Error('分钟图数据不完整');
        const old = cache.get(code);
        // A late response cannot replace a newer received series for the same stock.
        if (!old || !old.received_at || Date.parse(entry.received_at) >= Date.parse(old.received_at)) cache.set(code, entry);
        failures.delete(code);
        return cache.get(code);
      } catch (error) { failures.set(code, error.message); return cache.get(code); }
      finally { pending.delete(key); }
    });
    pending.set(key, request);
    return request;
  }
  function attach(status, selectedCode) {
    return { ...status, minutes: (status.minutes || []).map((entry) => {
      if (entry.code !== selectedCode) return entry;
      const saved = cache.get(entry.code);
      if (!saved) return entry;
      const matched = saved.data.version === entry.data?.version;
      return { ...entry, data: saved.data, cached: entry.cached || !matched,
        received_at: matched ? entry.received_at : saved.received_at, run_id: matched ? entry.run_id : saved.run_id,
        fresh: entry.fresh && matched,
        error: failures.get(entry.code) || entry.error, current_ok: entry.current_ok && matched };
    }) };
  }
  return { load, attach, error: (code) => failures.get(code) || '' };
}
