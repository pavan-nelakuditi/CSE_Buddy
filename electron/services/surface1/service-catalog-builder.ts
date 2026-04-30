import type { ServiceCatalog, ServiceCatalogEntry } from '../../../src/shared/surface1.js';

export function buildServiceCatalog(
  awsRegion: string,
  awsProfile: string | undefined,
  entries: ServiceCatalogEntry[]
): ServiceCatalog {
  return {
    source: 'aws_apigateway_bulk',
    importedAt: new Date().toISOString(),
    awsProfile,
    awsRegion,
    totals: {
      detected: entries.length,
      imported: entries.filter((entry) => entry.status === 'imported').length,
      skipped: entries.filter((entry) => entry.status === 'skipped').length,
      failed: entries.filter((entry) => entry.status === 'failed').length
    },
    services: entries
  };
}
