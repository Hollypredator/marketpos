const axios = require('axios');
const cheerio = require('cheerio');

async function checkP2() {
  try {
    const url = 'https://ebeymar.com/atistirmalik?p=2';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const productCount = $('.productItem').length;
    console.log(`Products on p=2: ${productCount}`);
    
    const { data: data1 } = await axios.get('https://ebeymar.com/atistirmalik');
    const $1 = cheerio.load(data1);
    const firstProductName1 = $1('.productItemTitle strong').first().text().trim();
    const firstProductName2 = $('.productItemTitle strong').first().text().trim();
    
    console.log(`First product page 1: ${firstProductName1}`);
    console.log(`First product page 2: ${firstProductName2}`);
    
    if (firstProductName1 !== firstProductName2) {
      console.log('Pagination works with ?p= parameter!');
    } else {
      console.log('Pagination does NOT work with ?p= parameter.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkP2();
