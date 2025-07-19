import fetch from 'node-fetch';
import { writeFileSync } from 'fs';

fetch('https://api-demo.lyra.finance/public/get_all_instruments', {
  method: 'POST',
  headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({
    currency: 'ETH',
    expired: false,
    instrument_type: 'option',
    page: 1,
    page_size: 100
  })
})
  .then(res => res.json())
  .then(data => writeFileSync('lyra_instruments.json', JSON.stringify(data, null, 2)));