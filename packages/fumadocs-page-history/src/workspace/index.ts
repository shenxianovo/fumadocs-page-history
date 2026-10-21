import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { x } from 'tinyexec';
import { normalizeRepositoryPath } from '../paths';
import { buildInlineChanges } from './inline';
import type { PageChangesResult } from '../index';

export interface WorkspaceOptions {
  /** A directory inside the checkout. Defaults to the current working directory. */
  repositoryDirectory?: string;
  /** Document directory, relative to the Git root, or an absolute directory inside it. */
  contentDirectory: string;
  /** Maximum bytes per source. Default: 200,000. */
  maxBytes?: number;
}

class WorkspaceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fresh HEAD-to-working-file comparison, including staged and unstaged edits. */
export async function readPageChanges(
  options: WorkspaceOptions,
  sourcePath: string,
): Promise<PageChangesResult> {
  let file: string;
  try {
    file = normalizeRepositoryPath(sourcePath);
    if (file.includes('\0')) throw new Error('Invalid path.');
  } catch {
    throw new WorkspaceError(400, 'Invalid document path.');
  }
  const run = async (args: string[], cwd: string, throwOnError = true) =>
    x('git', ['--no-optional-locks', '--literal-pathspecs', ...args], {
      throwOnError,
      nodeOptions: { cwd },
    });
  const root = (
    await run(['rev-parse', '--show-toplevel'], options.repositoryDirectory ?? process.cwd())
  ).stdout.trim();
  const directory = await realpath(path.resolve(root, options.contentDirectory));
  const prefix = path.relative(root, directory).split(path.sep).join('/');
  if (prefix === '..' || prefix.startsWith('../') || path.isAbsolute(prefix))
    throw new Error('contentDirectory must be inside the repository.');
  const includes = (name: string) =>
    (!prefix || name.startsWith(`${prefix}/`)) && /\.mdx?$/i.test(name);
  if (!includes(file)) throw new WorkspaceError(404, 'Document not found.');
  const git = async (args: string[]) => (await run(args, root)).stdout;
  // Read directory-wide rename pairs; restricting status to only the new path
  // can turn a staged rename into an add and lose its HEAD identity.
  const records = (
    await git([
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--renames',
      '--',
      prefix || '.',
    ])
  ).split('\0');
  let status: string | undefined;
  let previousPath = file;
  for (let i = 0; i < records.length && records[i]; i++) {
    const record = records[i];
    const previous = /[RC]/.test(record.slice(0, 2)) ? records[++i] : undefined;
    if (record.slice(3) === file && (!status || record.slice(0, 2) !== '??')) {
      status = record.slice(0, 2);
      previousPath = previous ?? file;
    }
  }
  if (!status) return { changed: false };
  if (status.includes('U') || ['AA', 'DD'].includes(status))
    return { changed: true, unavailable: 'conflict' };
  const maxBytes = options.maxBytes ?? 200_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error('maxBytes must be a positive safe integer.');
  let current = '';
  {
    const diskPath = path.join(root, file);
    const info = await lstat(diskPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (info) {
      const canonical = await realpath(diskPath);
      const relative = path.relative(directory, canonical);
      if (
        !info.isFile() ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new WorkspaceError(
          422,
          'Only regular documents inside the content directory can be compared.',
        );
      if (info.size > maxBytes) return { changed: true, unavailable: 'too-large' };
      current = await readFile(canonical, 'utf8');
    }
  }
  let previous = '';
  // Untracked and added documents have no HEAD blob. Explicitly constrain the
  // old side of renames too, so moving a file cannot expose other directories.
  if (
    status !== '??' &&
    status !== ' A' &&
    status[0] !== 'A' &&
    status[0] !== 'C' &&
    includes(previousPath)
  ) {
    const spec = `HEAD:${previousPath}`;
    const size = Number((await git(['cat-file', '-s', spec])).trim());
    if (size > maxBytes) return { changed: true, unavailable: 'too-large' };
    previous = await git(['cat-file', 'blob', spec]);
  }
  return buildInlineChanges(previous, current, file);
}

/** Local-development-only Web GET endpoint. Production always returns 404. */
export function createWorkspaceHandler(options: WorkspaceOptions) {
  return async function handle(request: Request): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin, Sec-Fetch-Site' };
    const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
    if (process.env.NODE_ENV !== 'development') return json({ error: 'Not found.' }, 404);
    const url = new URL(request.url);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
      (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
    )
      return json({ error: 'Only same-origin localhost requests are allowed.' }, 403);
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const file = url.searchParams.get('path');
    if (!file) return json({ error: 'A document path is required.' }, 400);
    try {
      return json(await readPageChanges(options, file));
    } catch (error) {
      return error instanceof WorkspaceError
        ? json({ error: error.message }, error.status)
        : json({ error: 'Unable to read page changes. Refresh and try again.' }, 500);
    }
  };
}
