const FIELD_WEIGHTS = {
  "title": 5,
  "headings": 3,
  "tags": 2.5,
  "categories": 2,
  "excerpt": 1.5,
  "content_text": 1
};
const FIELD_NAMES = Object.keys(FIELD_WEIGHTS);
const RECENCY_BOOST_MAX = 0.15;
const SEGMENTER_LOCALE = "en-US";
const DEFAULT_LIMIT = 20;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

let preparedIndexPromise;

export async function preload() {
  await loadPreparedIndex();
}

export async function search(query, options = {}) {
  const prepared = await loadPreparedIndex();
  const terms = tokenize(query);
  const phrase = normalizeText(query);
  if (terms.length === 0 && !phrase) {
    return { results: [] };
  }

  const hits = [];
  for (const document of prepared.documents) {
    const score = scoreDocument(document, terms, phrase, prepared);
    if (score > 0) {
      hits.push({ document, score });
    }
  }

  const limit = normalizeLimit(options.limit);
  hits.sort((left, right) => right.score - left.score || left.document.raw.title.localeCompare(right.document.raw.title));

  return {
    results: hits.slice(0, limit).map((hit) => ({
      id: hit.document.raw.id,
      score: Number(hit.score.toFixed(6)),
      data: async () => buildResultData(hit.document.raw, query),
    })),
  };
}

async function loadPreparedIndex() {
  if (!preparedIndexPromise) {
    preparedIndexPromise = fetch(new URL('./search.json', import.meta.url))
      .then((response) => {
        if (!response.ok) {
          throw new Error('ZeroPress search index not found');
        }
        return response.json();
      })
      .then((items) => prepareIndex(Array.isArray(items) ? items : []));
  }

  return preparedIndexPromise;
}

function prepareIndex(items) {
  const documents = items.map((item) => prepareDocument(item));
  const documentFrequencies = new Map();
  const averageLengths = Object.fromEntries(FIELD_NAMES.map((fieldName) => [fieldName, 1]));
  const newestPostTime = documents.reduce((newest, document) => {
    if (document.raw.type !== 'post') {
      return newest;
    }
    return Math.max(newest, document.publishedTime || 0);
  }, 0);

  for (const document of documents) {
    const seenTerms = new Set();
    for (const fieldName of FIELD_NAMES) {
      for (const term of document.fieldTokens[fieldName]) {
        seenTerms.add(term);
      }
    }
    for (const term of seenTerms) {
      documentFrequencies.set(term, (documentFrequencies.get(term) || 0) + 1);
    }
  }

  for (const fieldName of FIELD_NAMES) {
    const total = documents.reduce((sum, document) => sum + document.fieldLengths[fieldName], 0);
    averageLengths[fieldName] = documents.length > 0 ? Math.max(1, total / documents.length) : 1;
  }

  return {
    documents,
    documentFrequencies,
    averageLengths,
    documentCount: documents.length,
    newestPostTime,
  };
}

function prepareDocument(item) {
  const raw = normalizeItem(item);
  const fields = {
    title: raw.title,
    headings: raw.headings.join(' '),
    tags: raw.tags.join(' '),
    categories: raw.categories.join(' '),
    excerpt: raw.excerpt,
    content_text: raw.content_text,
  };
  const fieldTexts = {};
  const fieldTokens = {};
  const fieldTermCounts = {};
  const fieldLengths = {};

  for (const [fieldName, value] of Object.entries(fields)) {
    const normalizedText = normalizeText(value);
    const tokens = tokenize(normalizedText);
    fieldTexts[fieldName] = normalizedText;
    fieldTokens[fieldName] = tokens;
    fieldTermCounts[fieldName] = countTerms(tokens);
    fieldLengths[fieldName] = Math.max(1, tokens.length);
  }

  return {
    raw,
    fieldTexts,
    fieldTokens,
    fieldTermCounts,
    fieldLengths,
    publishedTime: Date.parse(raw.published_at_iso) || 0,
  };
}

function normalizeItem(item) {
  return {
    id: String(item && item.id || ''),
    type: item && item.type === 'page' ? 'page' : 'post',
    title: String(item && item.title || ''),
    url: String(item && item.url || ''),
    excerpt: String(item && item.excerpt || ''),
    headings: Array.isArray(item && item.headings) ? item.headings.map(String) : [],
    categories: Array.isArray(item && item.categories) ? item.categories.map(String) : [],
    tags: Array.isArray(item && item.tags) ? item.tags.map(String) : [],
    published_at_iso: String(item && item.published_at_iso || ''),
    updated_at_iso: String(item && item.updated_at_iso || ''),
    content_text: String(item && item.content_text || ''),
  };
}

function scoreDocument(document, terms, phrase, prepared) {
  let score = 0;
  const uniqueTerms = Array.from(new Set(terms));

  for (const term of uniqueTerms) {
    const documentFrequency = prepared.documentFrequencies.get(term) || 0;
    const idf = Math.log(1 + (prepared.documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));

    for (const fieldName of FIELD_NAMES) {
      const termFrequency = document.fieldTermCounts[fieldName].get(term) || 0;
      if (termFrequency === 0) {
        continue;
      }

      const fieldLength = document.fieldLengths[fieldName];
      const averageLength = prepared.averageLengths[fieldName];
      const denominator = termFrequency + BM25_K1 * (1 - BM25_B + BM25_B * (fieldLength / averageLength));
      score += FIELD_WEIGHTS[fieldName] * idf * ((termFrequency * (BM25_K1 + 1)) / denominator);
    }
  }

  if (phrase && phrase.length > 1) {
    for (const fieldName of FIELD_NAMES) {
      if (document.fieldTexts[fieldName].includes(phrase)) {
        score += FIELD_WEIGHTS[fieldName] * 0.6;
      }
    }
  }

  if (score <= 0) {
    return 0;
  }

  return score * (1 + recencyBoost(document, prepared.newestPostTime));
}

function recencyBoost(document, newestPostTime) {
  if (document.raw.type !== 'post' || !document.publishedTime || !newestPostTime) {
    return 0;
  }
  const ageMs = Math.max(0, newestPostTime - document.publishedTime);
  const halfLifeMs = 180 * 24 * 60 * 60 * 1000;
  return RECENCY_BOOST_MAX * Math.exp(-ageMs / halfLifeMs);
}

function buildResultData(item, query) {
  const excerpt = buildExcerpt(item, query);
  return {
    url: item.url,
    excerpt,
    plain_excerpt: excerpt,
    meta: {
      title: item.title,
      type: item.type,
      published_at_iso: item.published_at_iso,
      updated_at_iso: item.updated_at_iso,
      categories: item.categories,
      tags: item.tags,
    },
    sub_results: [],
  };
}

function buildExcerpt(item, query) {
  const explicitExcerpt = String(item.excerpt || '').trim();
  if (explicitExcerpt) {
    return explicitExcerpt;
  }

  const text = String(item.content_text || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const normalizedText = normalizeText(text);
  const terms = tokenize(query);
  const firstMatch = terms.map((term) => normalizedText.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstMatch || 0) - 80);
  const end = Math.min(text.length, start + 180);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

function countTerms(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function tokenize(value) {
  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  const tokens = [];
  const cjkRuns = Array.from(
    text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu),
    (match) => match[0],
  );
  const nonCjkText = text.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
    ' ',
  );
  let segmented = false;

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter(SEGMENTER_LOCALE, { granularity: 'word' });
      for (const part of segmenter.segment(nonCjkText)) {
        if (part.isWordLike && isUsefulToken(part.segment)) {
          tokens.push(part.segment);
        }
      }
      segmented = true;
    } catch {
      // Fall through to regex tokenization.
    }
  }

  if (!segmented) {
    for (const match of nonCjkText.matchAll(/[\p{Letter}\p{Number}]+/gu)) {
      if (isUsefulToken(match[0])) {
        tokens.push(match[0]);
      }
    }
  }

  for (const run of cjkRuns) {
    tokens.push(...buildCjkTokens(run));
  }

  return tokens;
}

function buildCjkTokens(value) {
  const characters = Array.from(value);
  const tokens = new Set();
  if (isUsefulToken(value)) {
    tokens.add(value);
  }

  if (characters.length > 2) {
    for (let index = 0; index <= characters.length - 2; index += 1) {
      tokens.add(characters.slice(index, index + 2).join(''));
    }
  }

  return Array.from(tokens);
}

function isUsefulToken(value) {
  const token = String(value || '').trim();
  return token.length > 1 || /^\d$/.test(token);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLimit(value) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : DEFAULT_LIMIT;
}
