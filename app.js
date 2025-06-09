
const track = document.getElementById('carousel-track');
const slides = Array.from(track.children).filter(child => child.classList.contains('slide'));
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

const scrollContent = document.getElementById('scroll-content');
const template = document.getElementById('crypto-template');

// Duplicate content for smooth scroll
for (let i = 0; i < 10; i++) {
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
      if (price) el.textContent = price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    });
  } catch (err) {
    console.error('Error fetching prices:', err);
  }
}

fetchPrices();


let lastScrollTop = 0;
const navbar = document.querySelector('nav');
const mobileMenu = document.getElementById('mobile-menu');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

  if (currentScroll > lastScrollTop) {
    // Scroll Down — hide navbar and dropdown (if open)
    navbar.classList.add('opacity-0', 'pointer-events-none');
    navbar.classList.remove('opacity-100');

    if (!mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('opacity-0', 'pointer-events-none');
      mobileMenu.classList.remove('opacity-100');
    }
  } else {
    // Scroll Up — show navbar ONLY
    navbar.classList.remove('opacity-0', 'pointer-events-none');
    navbar.classList.add('opacity-100');

    // Do NOT show the dropdown here — leave it hidden unless manually triggered
  }

  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});


  const menu = document.getElementById('mobile-menu');
  const button = document.getElementById('mobile-menu-button');

  let menuOpen = false;

  button.addEventListener('click', () => {
    menuOpen = !menuOpen;
    menu.classList.toggle('opacity-0', !menuOpen);
    menu.classList.toggle('pointer-events-none', !menuOpen);
    menu.classList.toggle('opacity-100', menuOpen);
  });

