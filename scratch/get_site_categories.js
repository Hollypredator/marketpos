const axios = require('axios');
const cheerio = require('cheerio');

async function getCategoryLinks() {
  try {
    const { data } = await axios.get('https://ebeymar.com/');
    const $ = cheerio.load(data);
    const categories = [];

    // The categories are in the .menuBar or .dropdown-menu
    $('.dropdown-menu.menuDropDown.accordionCategory > li > a').each((i, el) => {
      const name = $(el).text().trim().replace(/\s*\d+$/, '').replace(/\s*<span.*$/, '').replace(/ - Tümü$/, '');
      // Clean up name from "ANNE &BEBEK <span class=\"fa fa-angle-right\"></span>"
      const cleanName = $(el).contents().filter(function() {
        return this.nodeType === 3;
      }).text().trim();
      
      const href = $(el).attr('href');
      if (href && href !== '#') {
        categories.push({
          name: cleanName,
          url: href.startsWith('http') ? href : `https://ebeymar.com${href}`
        });
      }
    });

    return categories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

async function main() {
  const cats = await getCategoryLinks();
  console.log(JSON.stringify(cats, null, 2));
}

main();
