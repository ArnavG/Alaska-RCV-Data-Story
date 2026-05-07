function withCacheBust(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

export async function loadContestIndex() {
  const response = await fetch(withCacheBust('/data/contests.json'), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load processed contest index. Run `npm run preprocess` first.');
  }
  return response.json();
}

export async function loadContestData(file) {
  const response = await fetch(withCacheBust(file), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load contest file: ${file}`);
  }
  return response.json();
}
