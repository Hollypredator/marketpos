import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeCategory(url) {
  try {
    console.log(`Scraping category: ${url}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const products = [];

    $('.productItem').each((i, el) => {
      const nameEl = $(el).find('.productName a');
      const nameText = nameEl.text().trim();
      
      // Extract name, barcode and stok kodu from the title/text if possible
      // Example: [BANVİT POSET PILIC BANVİT Stok Kodu : 2902020 Barkodu : 2902020]
      // Or they might be in separate elements in the actual HTML.
      // Based on my previous view_file, they seem to be in the title or text of the link.
      
      const priceText = $(el).find('.currentPrice').text().trim().replace(' TL', '').replace(',', '.');
      const price = parseFloat(priceText);

      // Let's try to extract barcode from the product details or link
      const productUrl = nameEl.attr('href');
      
      // Usually, in these sites, the barcode/stok kodu is visible.
      // In the text representation from read_url_content, it looked like:
      // [Name Stok Kodu : XXX Barkodu : YYY]
      // This might be the 'alt' or 'title' attribute or just the text.
      
      const fullText = nameEl.text().trim();
      const stokKoduMatch = fullText.match(/Stok Kodu\s*:\s*(\w+)/);
      const barcodeMatch = fullText.match(/Barkodu\s*:\s*(\w+)/);
      
      const stokKodu = stokKoduMatch ? stokKoduMatch[1] : null;
      const barcode = barcodeMatch ? barcodeMatch[1] : stokKodu; // Fallback to stok kodu if barcode is missing

      const cleanName = fullText.split('Stok Kodu')[0].trim();

      if (barcode) {
        products.push({
          name: cleanName,
          barcode: barcode,
          price: price,
          url: productUrl
        });
      }
    });

    console.log(`Found ${products.length} products in ${url}`);
    return products;
  } catch (error) {
    console.error(`Error scraping ${url}: ${error.message}`);
    return [];
  }
}

// Test with one category
async function test() {
    const products = await scrapeCategory('https://ebeymar.com/ettavukbalik/beyaz-et/tavuk');
    console.log(products.slice(0, 5));
}

test();
