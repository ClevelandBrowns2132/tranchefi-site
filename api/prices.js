export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

  let btcPrice = null;
  let strcPrice = null;

  // BTC from CoinGecko
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const d = await r.json();
    btcPrice = d?.bitcoin?.usd || null;
  } catch (e) {}

  // STRC from Yahoo Finance
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/STRC?range=1d&interval=1m',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } }
    );
    const d = await r.json();
    strcPrice = d?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch (e) {}

  // Fallback: try v6 endpoint
  if (!strcPrice) {
    try {
      const r = await fetch(
        'https://query2.finance.yahoo.com/v6/finance/quote?symbols=STRC',
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } }
      );
      const d = await r.json();
      strcPrice = d?.quoteResponse?.result?.[0]?.regularMarketPrice || null;
    } catch (e) {}
  }

  return res.json({ btcPrice, strcPrice, timestamp: Date.now() });
}
