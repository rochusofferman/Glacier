import express from 'express';
import { chromium as pwChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

const app = express();
app.use(express.json());

app.get('/glacier', async (req, res) => {
  const { date, nights } = req.query;

  if (!date || !nights) {
    return res.status(400).json({ error: 'Missing date or nights' });
  }

  let browser;

  try {
    browser = await pwChromium.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });

    const page = await browser.newPage();

    // Speed optimization
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font') route.abort();
      else route.continue();
    });

    // Step 1: open main site (Cloudflare challenge)
    await page.goto('https://www.glaciernationalparklodges.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(5000); // important

    // Step 2: get cookies from browser session
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Step 3: fetch API from inside browser context with real headers
    const data = await page.evaluate(
      async ({ date, nights, cookieHeader }) => {
        const url = `https://webapi.xanterra.net/v1/api/availability/hotels/glaciernationalparklodges?date=${date}&limit=31&is_group=false&nights=${nights}&children=0`;

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'referer': 'https://www.glaciernationalparklodges.com/',
            'origin': 'https://www.glaciernationalparklodges.com',
            'cookie': cookieHeader,
          },
        });

        if (!res.ok) {
          throw new Error(`Glacier API status: ${res.status}`);
        }

        return res.json();
      },
      { date, nights: Number(nights), cookieHeader }
    );

    res.json({ ok: true, data });

  } catch (error) {
    console.error('Glacier scrape error:', error);
    res.status(500).json({ ok: false, error: String(error) });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Glacier scraper listening on', PORT);
});