
const track = document.getElementById('carousel-track');
const slides = track.children;
const dots = document.querySelectorAll('.dot');
let current = 0;
const total = slides.length;
let timer;

function goTo(index) {
  current = ((index % total) + total) % total;  // safe modulo
  track.style.transform = `translateX(-${current * 100}%)`;

  // Update dots
  dots.forEach((dot, i) => {
    dot.classList.toggle('bg-[#52FFB8]', i === current);
    dot.classList.toggle('bg-[#D8DDEF]', i !== current);
  });
}

function next() {
  goTo(current + 1);
}

function startAutoPlay() {
  stopAutoPlay();  // clear any previous timer first
  timer = setInterval(next, 15000);
}

function stopAutoPlay() {
  if (timer) clearInterval(timer);
}

// Click on any slide to go to next
Array.from(slides).forEach(slide => {
  slide.addEventListener('click', () => {
    stopAutoPlay();
    next();
    startAutoPlay();
  });
});

// Dot navigation
dots.forEach((dot, index) => {
  dot.addEventListener('click', () => {
    stopAutoPlay();
    goTo(index);
    startAutoPlay();
  });
});

//pause auto-play on hover
track.parentElement.addEventListener('mouseenter', stopAutoPlay);
track.parentElement.addEventListener('mouseleave', startAutoPlay);

// Init
goTo(0);
startAutoPlay();


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
    const ids = ['bitcoin', 'ethereum', 'matic-network', 'polkadot', 'solana', 'cardano', 'dogecoin', 'litecoin', 'ripple', 'chainlink', 'stellar', 'uniswap', 'bitcoin-cash', 'monero', 'tron', 'cosmos', 'algorand', 'vechain', 'filecoin', 'aave'];
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


  let lastScrollY = window.scrollY;
  const navbar = document.getElementById('main-navbar');

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      // Scroll down: hide
      navbar.classList.remove('opacity-100');
      navbar.classList.add('opacity-0', 'pointer-events-none');
    } else {
      // Scroll up: show
      navbar.classList.remove('opacity-0', 'pointer-events-none');
      navbar.classList.add('opacity-100');
    }

    lastScrollY = currentScrollY;
  });



