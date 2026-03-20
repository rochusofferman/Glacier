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
    await page.goto('https://www.glaciernationalparklodges.com/', {
      waitUntil: 'networkidle',
    });

    const data = await page.evaluate(
      async ({ date, nights }) => {
        const url = `https://webapi.xanterra.net/v1/api/availability/hotels/glaciernationalparklodges?date=${date}&limit=31&is_group=false&nights=${nights}&children=0`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Glacier API status:' + response.status);
        return response.json();
      },
      { date, nights: Number(nights) }
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