import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--ignore-certificate-errors', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR_EVENT:', err.toString()));
  
  try {
    await page.goto('https://localhost:5173/', { waitUntil: 'networkidle0' });
  } catch (e) {
    try {
      await page.goto('https://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    } catch (e2) {
      await page.goto('https://[::1]:5173/', { waitUntil: 'networkidle0' });
    }
  }
  
  try {
    console.log('Page loaded. Waiting for UI...');
    
    // Evaluate in browser context to find the scan button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const scanBtn = btns.find(b => b.textContent.toLowerCase().includes('search') || b.textContent.toLowerCase().includes('scan') || b.textContent.toLowerCase().includes('new scan'));
      if (scanBtn) {
        console.log('Clicking scan button...');
        scanBtn.click();
      }
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Now type "kit kat" in input
    console.log('Typing kit kat...');
    await page.type('input', 'kit kat', { delay: 100 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Hitting enter...');
    await page.keyboard.press('Enter');
    
    // Wait for crash
    await new Promise(r => setTimeout(r, 8000));
    
    console.log('Checking if root element is empty...');
    const rootEmpty = await page.evaluate(() => {
      const root = document.getElementById('root');
      return !root || root.innerHTML.trim() === '';
    });
    console.log('Is root empty:', rootEmpty);
    
  } catch (e) {
    console.error('Error during interaction:', e);
  }
  
  await browser.close();
})();
