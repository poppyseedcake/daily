const port = process.env.PORT?.trim() || '5174';

try {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  if (!response.ok) process.exit(1);

  const payload = await response.json();
  if (payload?.status !== 'ok' || Object.keys(payload).length !== 1) process.exit(1);
} catch {
  process.exit(1);
}
