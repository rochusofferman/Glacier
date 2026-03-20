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
    // Launch headless Chromium using serverless-compatible binary
    browser = await pwChromium.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });

    const page = await browser.newPage();

    // Optional: block images/fonts for speed
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font') route.abort();
      else route.continue();
    });

    // Navigate to main site to get Cloudflare session
    await page.goto('https://www.glaciernationalparklodges.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(3000); // let Cloudflare JS run

    // Navigate to the Glacier API URL directly in the browser
    const apiUrl = `https://webapi.xanterra.net/v1/api/availability/hotels/glaciernationalparklodges?date=${date}&limit=31&is_group=false&nights=${nights}&children=0`;

    await page.goto(apiUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Get the page content and extract JSON
    const content = await page.content();

    // Glacier API returns JSON wrapped in <pre> tags
    const dataMatch = content.match(/<pre.*?>(.*)<\/pre>/s);
    if (!dataMatch) throw new Error('Failed to parse Glacier API JSON');

    const data = JSON.parse(dataMatch[1]);

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