export const bullConnection = () => {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const u = new URL(url);

  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    password: u.password || undefined,
    db:
      u.pathname && u.pathname !== '/'
        ? Number(u.pathname.slice(1))
        : undefined,
  };
};
