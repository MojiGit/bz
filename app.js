const carousel = document.getElementById('carousel');
    const totalSlides = carousel.children.length;
    let currentSlide = 0;

    function updateCarousel() {
      carousel.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % totalSlides;
      updateCarousel();
    }

    function prevSlide() {
      currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
      updateCarousel();
    }


const menuButton = document.getElementById('mobile-menu-button');
const menu = document.getElementById('mobile-menu');

  menuButton.addEventListener('click', () => {
    menu.classList.toggle('hidden');
  });



const scrollContent = document.getElementById('scroll-content');
const template = document.getElementById('crypto-template');

// Duplicate content twice for smooth scroll
for (let i = 0; i < 2; i++) {
  const clone = template.content.cloneNode(true);
  scrollContent.appendChild(clone);
}

async function fetchPrices() {
  try {
    const ids = ['bitcoin', 'ethereum', 'matic-network', 'polkadot', 'solana'];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const res = await fetch(url);
    const data = await res.json();

    document.querySelectorAll('.crypto-price').forEach(el => {
      const id = el.dataset.symbol;
      const price = data[id]?.usd;
      if (price) el.textContent = price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  } catch (err) {
    console.error('Error fetching prices:', err);
  }
}

fetchPrices();
setInterval(fetchPrices, 10000); // update every 10 seconds



