import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImageCollector } from './image.collector.js';

const describeBrowser = process.env.RUN_BROWSER_TESTS === '1' ? describe : describe.skip;

describeBrowser('ImageCollector browser integration', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('preserva categorías ALT usando el DOM real y HTML original', async () => {
    const page = await browser.newPage();
    const html = `
      <img src="https://assets.test/bare.jpg" alt>
      <img src="https://assets.test/decorative.jpg" alt="">
      <img src="https://assets.test/missing.jpg">
      <img src="https://assets.test/generic.jpg" alt="IMG_0042">
      <img src="https://assets.test/description.jpg" alt="Equipo durante la presentación del producto">
    `;

    await page.setContent(html);
    const result = await new ImageCollector().extractRaw(page, html);

    expect(result.images.map((image) => image.category)).toEqual([
      'bare', 'empty', 'missing', 'generic', 'descriptive',
    ]);
    expect(result.imagesWithoutAlt).toBe(2);
    await page.close();
  });
});
