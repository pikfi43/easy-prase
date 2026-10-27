type SourceLink = { source?: string; externalUrl?: string };

/** Return a current product-detail URL for catalog links stored by older imports. */
export function normalizeExternalUrl(source: string | undefined, externalUrl: string | undefined): string | undefined {
  if (!externalUrl) return externalUrl;

  try {
    const url = new URL(externalUrl);
    const isTechnodom = source?.toLocaleLowerCase() === 'technodom' || /(^|\.)technodom\.kz$/i.test(url.hostname);
    if (!isTechnodom) return externalUrl;

    const productPath = url.pathname.match(/\/catalog\/(?:.*\/)?([^/]+)$/i);
    if (productPath && /-\d{4,}$/.test(productPath[1])) url.pathname = `/kokshetau/p/${productPath[1]}`;
    return url.toString();
  } catch {
    return externalUrl;
  }
}

export function normalizeSourceLink<T extends SourceLink>(item: T): T {
  return { ...item, externalUrl: normalizeExternalUrl(item.source, item.externalUrl) };
}
