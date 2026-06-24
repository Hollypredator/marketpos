const axios = require('axios');
const fs = require('fs');

async function main() {
  const url = 'https://ebeymar.com/ettavukbalik/beyaz-et/tavuk';
  const { data } = await axios.get(url);
  fs.writeFileSync('scratch/category.html', data);
  console.log('Saved HTML to scratch/category.html');
}

main();
