const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.toString()));
  
  await page.goto('https://localhost:5174/');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    // Need to find and click the "Scan Ingredients" button or similar
    const buttons = await page.$$('button');
    let clicked = false;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.toLowerCase().includes('scan') || text.toLowerCase().includes('search')) {
        await b.click();
        clicked = true;
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Type in search box
    await page.type('input', 'kit kat');
    await new Promise(r => setTimeout(r, 2000));
    
    // Click the autocomplete suggestion
    const suggestions = await page.$$('li');
    for (const s of suggestions) {
      const text = await page.evaluate(el => el.textContent, s);
      if (text.toLowerCase().includes('kit kat')) {
        console.log('Found suggestion, clicking...');
        await s.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 8000));
  } catch (e) {
    console.error('Error during interaction:', e);
  }
  
  await browser.close();
})();
