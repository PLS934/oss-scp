try {
  const port = process.env.PORT ?? '3000';
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ready`, {
    signal: AbortSignal.timeout(3000),
  });
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('상태 확인 HTTP 응답 오류');
  }
  const body = await response.json();
  if (body.status !== 'ready' || Object.keys(body).length !== 1) throw new Error('준비 상태 JSON 오류');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
