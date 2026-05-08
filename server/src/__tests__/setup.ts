// Sets env vars before any module loads; dotenv won't override already-set vars
process.env['DATABASE_URL'] = 'file:./test.db';
process.env['JWT_SECRET'] = 'test-secret-for-vitest-must-be-at-least-32-chars';
process.env['PORT'] = '4001';
process.env['NODE_ENV'] = 'test';
