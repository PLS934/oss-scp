try {
  const response = await fetch(`http://127.0.0.1:${process.env.MOCK_PORT ?? 3001}/sample1?limit=1`, { signal: AbortSignal.timeout(3000) });
  process.exit(response.ok ? 0 : 1);
} catch { process.exit(1); }
