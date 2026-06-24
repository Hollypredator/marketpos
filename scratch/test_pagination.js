const axios = require('axios');
const cheerio = require('cheerio');

async function checkPage2() {
  try {
    // Try a category that definitely has more than one page
    const url = 'https://ebeymar.com/atistirmalik?page=2';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const productCount = $('.productItem').length;
    console.log(`Products on page 2: ${productCount}`);
    
    // Check if it's the same as page 1
    const { data: data1 } = await axios.get('https://ebeymar.com/atistirmalik');
    const $1 = cheerio.load(data1);
    const firstProductName1 = $1('.productItemTitle strong').first().text().trim();
    const firstProductName2 = $('.productItemTitle strong').first().text().trim();
    
    console.log(`First product page 1: ${firstProductName1}`);
    console.log(`First product page 2: ${firstProductName2}`);
    
    if (firstProductName1 !== firstProductName2) {
      console.log('Pagination works with ?page= parameter!');
    } else {
      console.log('Pagination does NOT work with ?page= parameter. Likely uses AJAX or different parameter.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPage2();
