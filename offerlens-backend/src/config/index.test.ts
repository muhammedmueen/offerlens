import config from './index';

describe('Config', () => {
  it('should load configuration successfully', () => {
    expect(config).toBeDefined();
    expect(config.env).toBeDefined();
    expect(config.port).toBeDefined();
    expect(config.host).toBeDefined();
  });

  it('should have valid environment', () => {
    expect(['development', 'test', 'production']).toContain(config.env);
  });

  it('should have valid port number', () => {
    expect(typeof config.port).toBe('number');
    expect(config.port).toBeGreaterThan(0);
    expect(config.port).toBeLessThan(65536);
  });

  it('should have database configuration', () => {
    expect(config.database).toBeDefined();
    expect(config.database.url).toBeDefined();
  });

  it('should have redis configuration', () => {
    expect(config.redis).toBeDefined();
    expect(config.redis.url).toBeDefined();
  });

  it('should have JWT configuration', () => {
    expect(config.jwt).toBeDefined();
    expect(config.jwt.secret).toBeDefined();
    expect(config.jwt.expiresIn).toBeDefined();
  });
});
