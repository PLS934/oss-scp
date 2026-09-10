import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';
import { PlatformDbConfigError, type PlatformDbSetting } from './errors';

export function readConfigFile(path: string, maxBytes: number, setting: PlatformDbSetting): string {
  try {
    if (!isAbsolute(path)) throw new Error();
    // FIFO 등 특수 파일에서 open 자체가 대기하지 않도록 한다. 심볼릭 링크는 허용한다.
    const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > maxBytes) throw new Error();
      const buffer = Buffer.alloc(maxBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length === 0 || length > maxBytes) throw new Error();
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
    } finally {
      closeSync(fd);
    }
  } catch {
    // open/read/decode뿐 아니라 close 실패도 원본 오류를 노출하지 않는다.
    throw new PlatformDbConfigError('INVALID_FILE', setting);
  }
}
