let pagefindPromise;

export async function preload() {
  if (!pagefindPromise) {
    pagefindPromise = import(new URL('./pagefind/pagefind.js', import.meta.url).href).then(async (pagefind) => {
      if (typeof pagefind.options === 'function') {
        await pagefind.options({ baseUrl: '/' });
      }
      return pagefind;
    });
  }

  return pagefindPromise;
}

export async function search(query, options = {}) {
  const pagefind = await preload();
  const result = await pagefind.search(query, options);
  const limit = normalizeLimit(options.limit);
  if (!Array.isArray(result?.results)) {
    return result;
  }

  const results = result.results.map(normalizeResult);
  return {
    ...result,
    results: limit ? results.slice(0, limit) : results,
  };
}

function normalizeResult(result) {
  if (!result || typeof result.data !== 'function') {
    return result;
  }

  return {
    ...result,
    data: async () => normalizeResultData(await result.data()),
  };
}

function normalizeResultData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  return {
    ...data,
    url: normalizeUrl(data.url),
    sub_results: Array.isArray(data.sub_results)
      ? data.sub_results.map((item) => ({ ...item, url: normalizeUrl(item.url) }))
      : data.sub_results,
  };
}

function normalizeUrl(value) {
  const url = String(value || '');
  if (url.startsWith('/_zeropress/') && !url.startsWith('/_zeropress/pagefind/')) {
    return url.replace(/^\/_zeropress/, '') || '/';
  }
  if (url.startsWith('_zeropress/') && !url.startsWith('_zeropress/pagefind/')) {
    return url.replace(/^_zeropress/, '') || '/';
  }
  return url;
}

function normalizeLimit(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    return null;
  }

  return Math.floor(limit);
}
