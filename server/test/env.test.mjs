/**
 * 配置解析的契约测试（node:test，零依赖）。
 *
 * server/src/config/env.ts 全是纯函数 + 惰性 getter，是性价比最高的一组测试：
 * 这里解析错了不会立刻炸，而是把错的连接参数 / 上传上限 / 日志级别带进运行时。
 * 尤其是 DATABASE_URL 与 sqliteFile 的 `file:` 兼容分支——都是"老部署的 .env 不改也能跑"
 * 的关键，一旦回归用户会直接起不来。
 *
 * env 的 getter 是惰性读 process.env 的，所以测试可以临时改环境变量再读。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { env, parseLogFormat, parseLogLevel, parseSize, uploadLimits } from '../src/config/env.ts';

/** 临时改环境变量后执行，结束时无论成功失败都还原 */
function withEnv(patch, fn) {
  const saved = new Map();
  for (const key of Object.keys(patch)) {
    saved.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('parseSize：字节数与 k/m/g/t 单位', () => {
  assert.equal(parseSize('1024'), 1024);
  assert.equal(parseSize('1b'), 1);
  assert.equal(parseSize('2k'), 2048);
  assert.equal(parseSize('2kb'), 2048);
  assert.equal(parseSize('10mb'), 10 * 1024 ** 2);
  assert.equal(parseSize('1gb'), 1024 ** 3);
  assert.equal(parseSize('1TB'), 1024 ** 4);
  assert.equal(parseSize(' 10 MB '), 10 * 1024 ** 2, '允许空格与大小写');
  assert.equal(parseSize('1.5mb'), 1572864);
  assert.equal(parseSize('1.9k'), 1945, '向下取整');
  assert.equal(parseSize(undefined, '512kb'), 512 * 1024, '默认值可覆盖');
});

test('parseSize：无法解析时回退到默认值，默认值也不合法时回退到 0（而不是 NaN）', () => {
  assert.equal(parseSize('abc'), 1024 ** 3);
  assert.equal(parseSize('-5'), 1024 ** 3, '负数不匹配正则');
  assert.equal(parseSize('abc', '1b'), 0);
  assert.equal(parseSize('abc', '不对'), 0, '递归一层后固定以 1b 收尾，保证不会无限递归');
});

test('parseLogLevel：展开成"该级别及以下"，未知值按 log', () => {
  assert.deepEqual(parseLogLevel(undefined), ['error', 'warn', 'log']);
  assert.deepEqual(parseLogLevel('info'), ['error', 'warn', 'log'], 'info 是 log 的别名');
  assert.deepEqual(parseLogLevel('fatal'), ['error'], 'fatal 是 error 的别名');
  assert.deepEqual(parseLogLevel('error'), ['error']);
  assert.deepEqual(parseLogLevel('warn'), ['error', 'warn']);
  assert.deepEqual(parseLogLevel('DEBUG'), ['error', 'warn', 'log', 'debug']);
  assert.deepEqual(parseLogLevel('verbose'), ['error', 'warn', 'log', 'debug', 'verbose']);
  assert.deepEqual(parseLogLevel('  log  '), ['error', 'warn', 'log']);
  assert.deepEqual(parseLogLevel('乱写'), ['error', 'warn', 'log']);
});

test('parseLogFormat：只认 json / nginx，其余按 pretty', () => {
  assert.equal(parseLogFormat(undefined), 'pretty');
  assert.equal(parseLogFormat('json'), 'json');
  assert.equal(parseLogFormat('JSON'), 'json');
  assert.equal(parseLogFormat('nginx'), 'nginx');
  assert.equal(parseLogFormat('other'), 'pretty');
});

test('sqliteFile：剥掉 Prisma 时代的 file: 前缀并按 server/ 解析成绝对路径', () => {
  withEnv({ DB_FILE_PATH: 'file:./data/homebucket.db' }, () => {
    assert.equal(env.sqliteFile, resolve(process.cwd(), 'data/homebucket.db'));
  });
  withEnv({ DB_FILE_PATH: 'file:/var/lib/hb/x.db' }, () => {
    assert.equal(env.sqliteFile, '/var/lib/hb/x.db', '绝对路径原样保留');
  });
  withEnv({ DB_FILE_PATH: 'FILE:data/x.db' }, () => {
    assert.equal(env.sqliteFile, resolve(process.cwd(), 'data/x.db'), '前缀大小写不敏感');
  });
  withEnv({ DB_FILE_PATH: undefined }, () => {
    assert.equal(env.sqliteFile, resolve(process.cwd(), 'data/homebucket.db'), '默认值');
  });
});

test('mysqlConnection：DATABASE_URL 为准，DB_* 可逐项覆盖', () => {
  withEnv(
    {
      DATABASE_URL: 'mysql://user:p%40ss@db.example.com:3307/homebucket',
      DB_HOST: undefined,
      DB_PORT: undefined,
      DB_USER: undefined,
      DB_PASSWORD: undefined,
      DB_NAME: undefined,
    },
    () => {
      assert.deepEqual(env.mysqlConnection, {
        host: 'db.example.com',
        port: 3307,
        username: 'user',
        password: 'p@ss',
        database: 'homebucket',
      });
    },
  );

  withEnv(
    {
      DATABASE_URL: 'mysql://user:pw@db.example.com:3307/homebucket',
      DB_HOST: '127.0.0.1',
      DB_PORT: '3308',
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'other',
    },
    () => {
      assert.deepEqual(env.mysqlConnection, {
        host: '127.0.0.1',
        port: 3308,
        username: 'root',
        password: '',
        database: 'other',
      });
    },
  );

  withEnv(
    {
      DATABASE_URL: undefined,
      DB_HOST: undefined,
      DB_PORT: undefined,
      DB_USER: undefined,
      DB_PASSWORD: undefined,
      DB_NAME: undefined,
    },
    () => {
      assert.deepEqual(
        env.mysqlConnection,
        { host: '127.0.0.1', port: 3306, username: '', password: '', database: '' },
        '什么都没有时给出一组安全的默认值（连不上会由驱动报错，而不是变成 undefined）',
      );
    },
  );
});

test('mysqlConnection：DATABASE_URL 非法时只警告并继续用 DB_* 变量', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    withEnv({ DATABASE_URL: '这不是 URL', DB_NAME: 'hb', DB_HOST: 'myhost' }, () => {
      assert.deepEqual(env.mysqlConnection, {
        host: 'myhost',
        port: 3306,
        username: '',
        password: '',
        database: 'hb',
      });
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /DATABASE_URL/);
});

test('apiPrefix / dbProvider / storageDriver：不做大小写与空值的意外放行', () => {
  withEnv({ API_PREFIX: undefined }, () => assert.equal(env.apiPrefix, 'api'));
  withEnv({ API_PREFIX: 'v1' }, () => assert.equal(env.apiPrefix, 'v1'));

  withEnv({ DB_PROVIDER: undefined }, () => assert.equal(env.dbProvider, 'mysql'));
  withEnv({ DB_PROVIDER: 'SQLITE' }, () => assert.equal(env.dbProvider, 'sqlite'));
  withEnv({ DB_PROVIDER: 'postgres' }, () => assert.equal(env.dbProvider, 'mysql'), '未知值按 mysql');

  withEnv({ STORAGE_DRIVER: undefined }, () => assert.equal(env.storageDriver, 'local'));
  withEnv({ STORAGE_DRIVER: 's3' }, () => assert.equal(env.storageDriver, 's3'));
  withEnv({ STORAGE_DRIVER: 'S3' }, () => assert.equal(env.storageDriver, 's3'));
  withEnv({ STORAGE_DRIVER: 'oss' }, () => assert.equal(env.storageDriver, 'local'));
});

test('布尔开关：只有显式 false 才算关（默认开）', () => {
  const flags = [
    ['ALLOW_REGISTRATION', () => env.allowRegistration],
    ['AUTO_MIGRATE', () => env.autoMigrate],
    ['LOG_ACCESS', () => env.accessLog],
    ['AUTO_CREATE_ADMIN', () => env.autoCreateAdmin],
    ['S3_FORCE_PATH_STYLE', () => env.s3ForcePathStyle],
    ['DATA_COLLECTION_ENABLED', () => env.dataCollectionEnabled],
    ['DATA_COLLECTION_SUBMIT', () => env.dataCollectionSubmit],
  ];
  for (const [key, read] of flags) {
    withEnv({ [key]: undefined }, () => assert.equal(read(), true, `${key} 默认开`));
    withEnv({ [key]: 'false' }, () => assert.equal(read(), false, `${key}=false 关闭`));
    withEnv({ [key]: 'FALSE' }, () => assert.equal(read(), false, `${key} 大小写不敏感`));
    withEnv({ [key]: '0' }, () => assert.equal(read(), true, `${key}=0 仍视为开（只认字符串 false）`));
  }
});

test('目录与上传上限：相对路径一律按 server/ 解析', () => {
  withEnv({ DATA_DIR: undefined, UPLOAD_DIR: undefined, MAX_UPLOAD_SIZE: undefined }, () => {
    assert.equal(env.dataDir, resolve(process.cwd(), 'data'));
    assert.equal(env.uploadDir, resolve(process.cwd(), 'data/uploads'), '默认落在 dataDir 下');
    assert.equal(env.maxUploadSize, 1024 ** 3);
    assert.deepEqual(uploadLimits(), { fileSize: 1024 ** 3, files: 20 });
  });
  withEnv({ DATA_DIR: '/srv/hb', UPLOAD_DIR: undefined }, () => {
    assert.equal(env.uploadDir, '/srv/hb/uploads');
  });
  withEnv({ DATA_DIR: '/srv/hb', UPLOAD_DIR: '/mnt/u' }, () => {
    assert.equal(env.uploadDir, '/mnt/u', 'UPLOAD_DIR 优先于 dataDir');
  });
  withEnv({ MAX_UPLOAD_SIZE: '10mb' }, () => {
    assert.equal(env.maxUploadSize, 10 * 1024 ** 2);
    assert.equal(uploadLimits().fileSize, 10 * 1024 ** 2, 'uploadLimits 跟随配置');
  });
});

test('本地化与对外地址：币种大写、尾部斜杠剥掉、超时值非法时回退', () => {
  withEnv({ DEFAULT_CURRENCY: 'cny' }, () => assert.equal(env.defaultCurrency, 'CNY'));
  withEnv({ DEFAULT_CURRENCY: undefined }, () => assert.equal(env.defaultCurrency, 'CNY'));
  withEnv({ DEFAULT_LOCALE: undefined }, () => assert.equal(env.defaultLocale, 'zh-CN'));
  withEnv({ PUBLIC_BASE_URL: 'https://hb.example.com///' }, () =>
    assert.equal(env.publicBaseUrl, 'https://hb.example.com'),
  );
  withEnv({ PUBLIC_BASE_URL: undefined }, () => assert.equal(env.publicBaseUrl, ''));
  withEnv({ DATA_COLLECTION_ENDPOINT: 'https://collect.example.com/' }, () =>
    assert.equal(env.dataCollectionEndpoint, 'https://collect.example.com'),
  );
  withEnv({ DATA_COLLECTION_TIMEOUT_MS: '2000' }, () => assert.equal(env.dataCollectionTimeoutMs, 2000));
  for (const bad of ['abc', '0', '-1', undefined]) {
    withEnv({ DATA_COLLECTION_TIMEOUT_MS: bad }, () =>
      assert.equal(env.dataCollectionTimeoutMs, 1500, `非法值 ${String(bad)} 回退到 1500`),
    );
  }
});

test('默认管理员与 JWT：未配置时给出开发默认值（生产部署必须覆盖）', () => {
  withEnv(
    {
      JWT_SECRET: undefined,
      JWT_EXPIRES_IN: undefined,
      DEFAULT_ADMIN_USERNAME: undefined,
      DEFAULT_ADMIN_PASSWORD: undefined,
      DEFAULT_ADMIN_EMAIL: undefined,
    },
    () => {
      assert.equal(env.jwtSecret, 'homebucket-dev-secret');
      assert.equal(env.jwtExpiresIn, '7d');
      assert.equal(env.defaultAdminUsername, 'admin');
      assert.equal(env.defaultAdminPassword, 'admin');
      assert.equal(env.defaultAdminEmail, 'admin@example.com');
    },
  );
  withEnv({ DEFAULT_ADMIN_USERNAME: '   ', JWT_EXPIRES_IN: '1h' }, () => {
    assert.equal(env.defaultAdminUsername, 'admin', '空白值视为未配置');
    assert.equal(env.jwtExpiresIn, '1h');
  });
});
