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
