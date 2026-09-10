import 'reflect-metadata';
import {
  BadRequestException,
  Controller,
  Get,
  Module,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Sample1 extends Record<string, unknown> {
  total: number;
  rows: unknown[];
}
interface Sample2 extends Record<string, unknown> {
  items: unknown[];
  test_field6: boolean;
}
interface Fixtures {
  sample1: Sample1;
  sample2: Sample2;
  csv: Buffer;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isSample1(value: unknown): value is Sample1 {
  return (
    isRecord(value) &&
    Array.isArray(value.rows) &&
    value.total === value.rows.length
  );
}
function isSample2(value: unknown): value is Sample2 {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    typeof value.test_field6 === 'boolean'
  );
}

export function loadFixtures(root = join(__dirname, 'fixtures')): Fixtures {
  const readJson = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch {
      throw new Error(`Invalid or missing fixture: ${file}`);
    }
  };
  const sample1 = readJson('sources/sample1.json');
  const sample2 = readJson('sources/sample2.json');
  if (!isSample1(sample1)) {
    throw new Error('Invalid sample1 rows/total');
  }
  if (!isSample2(sample2)) {
    throw new Error('Invalid sample2 items/test_field6');
  }
  let csv: Buffer;
  try {
    csv = readFileSync(join(root, 'csv/vulnerabilities.csv'));
  } catch {
    throw new Error('Invalid or missing fixture: csv/vulnerabilities.csv');
  }
  return { sample1, sample2, csv };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.MOCK_PORT ?? '3001';
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 1 ||
    Number(raw) > 65535
  ) {
    throw new Error('MOCK_PORT must be an integer from 1 to 65535');
  }
  return { host: env.MOCK_HOST ?? '127.0.0.1', port: Number(raw) };
}

export async function createApp(root?: string) {
  const fixtures = loadFixtures(root);
  @Controller()
  class MockController {
    @Get('sample1')
    page(@Req() request: { originalUrl: string }): Sample1 {
      const query = new URL(request.originalUrl, 'http://mock.local')
        .searchParams;
      const integer = (
        key: string,
        fallback: number,
        min: number,
        max: number,
      ) => {
        const values = query.getAll(key);
        if (
          [...query.keys()].some((k) => k.startsWith(`${key}[`)) ||
          values.length > 1
        ) {
          throw new BadRequestException(`Invalid ${key}`);
        }
        if (!values.length) return fallback;
        const value = Number(values[0]);
        if (
          !/^\d+$/.test(values[0]) ||
          !Number.isSafeInteger(value) ||
          value < min ||
          value > max
        ) {
          throw new BadRequestException(`Invalid ${key}`);
        }
        return value;
      };
      const offset = integer('offset', 0, 0, Number.MAX_SAFE_INTEGER);
      const limit = integer('limit', 1000, 1, 1000);
      return {
        total: fixtures.sample1.rows.length,
        rows: fixtures.sample1.rows.slice(offset, offset + limit),
      };
    }
    @Get('sample2')
    all(): Sample2 {
      return fixtures.sample2;
    }
    @Get('vulnerabilities.csv')
    download() {
      return new StreamableFile(fixtures.csv, {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="vulnerabilities.csv"',
      });
    }
  }
  @Module({ controllers: [MockController] })
  class MockModule {}
  return NestFactory.create(MockModule, { logger: false, abortOnError: false });
}
