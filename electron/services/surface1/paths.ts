import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type ServicePaths = {
  serviceKey: string;
  rootDir: string;
  sourceDir: string;
  normalizedDir: string;
  specContextPath: string;
  normalizedSpecPath: string;
};

const SURFACE1_ROOT = path.resolve(process.cwd(), '.cse-buddy', 'surface1');

export function getSurface1Root(): string {
  return SURFACE1_ROOT;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'service';
}

export function buildServiceKey(name: string, suffix?: string): string {
  const parts = [slugify(name)];
  if (suffix) {
    parts.push(slugify(suffix));
  }
  return parts.join('--');
}

export function getServicePaths(serviceKey: string): ServicePaths {
  const rootDir = path.join(getSurface1Root(), serviceKey);
  return {
    serviceKey,
    rootDir,
    sourceDir: path.join(rootDir, 'source'),
    normalizedDir: path.join(rootDir, 'normalized'),
    specContextPath: path.join(rootDir, 'spec-context.json'),
    normalizedSpecPath: path.join(rootDir, 'normalized', 'openapi.yaml')
  };
}

export async function ensureServiceDirectories(paths: ServicePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.sourceDir, { recursive: true }),
    mkdir(paths.normalizedDir, { recursive: true })
  ]);
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

export function getBulkCatalogPath(): string {
  return path.join(getSurface1Root(), 'service-catalog.json');
}

export function getAwsHome(): string {
  return process.env.HOME ?? os.homedir();
}
