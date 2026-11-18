(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const video = document.querySelector('.hero-video');
  const filmToggle = document.querySelector('.film-toggle');
  const motionToggle = document.querySelector('.motion-toggle');
  const rail = document.querySelector('.screenshot-rail');
  const railButtons = [...document.querySelectorAll('.rail-button')];

  const updateFilmButton = () => {
    if (!video || !filmToggle) return;
    const playing = !video.paused;
    filmToggle.textContent = playing ? 'Pause video' : 'Play video';
    filmToggle.setAttribute('aria-label', playing ? 'Pause wheel video' : 'Play wheel video');
  };

  const playFilm = async () => {
    if (!video) return;
    try {
      await video.play();
    } catch {
      // The poster and manual play button remain available if autoplay is blocked.
    }
    updateFilmButton();
  };

  if (video) {
    video.addEventListener('play', updateFilmButton);
    video.addEventListener('pause', updateFilmButton);
    if (!reducedMotion.matches) playFilm();
  }

  if (filmToggle && video) {
    filmToggle.addEventListener('click', () => {
      if (video.paused) {
        if (!reducedMotion.matches && document.documentElement.classList.contains('motion-off')) {
          document.documentElement.classList.remove('motion-off');
          if (motionToggle) {
            motionToggle.setAttribute('aria-pressed', 'false');
            motionToggle.textContent = 'Pause motion';
          }
        }
        playFilm();
      } else {
        video.pause();
      }
    });
  }

  if (motionToggle) {
    if (reducedMotion.matches) {
      document.documentElement.classList.add('motion-off');
      if (video) video.pause();
      motionToggle.setAttribute('aria-pressed', 'true');
      motionToggle.textContent = 'Motion reduced by system';
      motionToggle.disabled = true;
    } else {
      motionToggle.addEventListener('click', () => {
        const paused = document.documentElement.classList.toggle('motion-off');
        motionToggle.setAttribute('aria-pressed', String(paused));
        motionToggle.textContent = paused ? 'Resume motion' : 'Pause motion';
        if (video) {
          if (paused) video.pause();
          else playFilm();
        }
      });
    }
  }

  if (rail && railButtons.length === 2) {
    const updateRailButtons = () => {
      const end = Math.max(0, rail.scrollWidth - rail.clientWidth);
      railButtons[0].disabled = rail.scrollLeft <= 2;
      railButtons[1].disabled = rail.scrollLeft >= end - 2;
    };

    const moveRail = direction => {
      const card = rail.querySelector('.shot-card');
      if (!card) return;
      const gap = parseFloat(window.getComputedStyle(rail).gap) || 0;
      rail.scrollBy({
        left: direction * (card.getBoundingClientRect().width + gap),
        behavior: reducedMotion.matches ? 'auto' : 'smooth'
      });
    };

    railButtons.forEach(button => {
      button.addEventListener('click', () => moveRail(Number(button.dataset.direction)));
    });
    rail.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      moveRail(event.key === 'ArrowRight' ? 1 : -1);
    });
    rail.addEventListener('scroll', updateRailButtons, { passive: true });
    window.addEventListener('resize', updateRailButtons);
    updateRailButtons();
  }

  const imageModal = document.querySelector('.image-modal');
  const shotButtons = [...document.querySelectorAll('.shot-open')];
  if (imageModal && shotButtons.length) {
    const modalImage = imageModal.querySelector('.modal-image');
    const modalStage = imageModal.querySelector('.modal-image-stage');
    const modalTitle = imageModal.querySelector('#modal-title');
    const modalDescription = imageModal.querySelector('#modal-description');
    const modalCount = imageModal.querySelector('#modal-count');
    const closeButton = imageModal.querySelector('.modal-close');
    const zoomButton = imageModal.querySelector('.modal-zoom');
    let currentIndex = 0;
    let opener = null;

    const showShot = index => {
      currentIndex = (index + shotButtons.length) % shotButtons.length;
      const card = shotButtons[currentIndex].closest('.shot-card');
      const image = shotButtons[currentIndex].querySelector('img');
      modalImage.src = image.getAttribute('src');
      modalImage.alt = image.alt;
      modalTitle.textContent = card.querySelector('h3').textContent;
      modalDescription.textContent = card.querySelector('figcaption p').textContent;
      modalCount.textContent = `${currentIndex + 1} / ${shotButtons.length}`;
      modalStage.scrollTo(0, 0);
    };

    shotButtons.forEach((button, index) => button.addEventListener('click', () => {
      opener = button;
      imageModal.classList.remove('is-zoomed');
      zoomButton.setAttribute('aria-pressed', 'false');
      zoomButton.textContent = 'Zoom in';
      showShot(index);
      imageModal.showModal();
      closeButton.focus();
    }));

    closeButton.addEventListener('click', () => imageModal.close());
    imageModal.querySelector('.modal-prev').addEventListener('click', () => showShot(currentIndex - 1));
    imageModal.querySelector('.modal-next').addEventListener('click', () => showShot(currentIndex + 1));
    zoomButton.addEventListener('click', () => {
      const zoomed = imageModal.classList.toggle('is-zoomed');
      zoomButton.setAttribute('aria-pressed', String(zoomed));
      zoomButton.textContent = zoomed ? 'Zoom out' : 'Zoom in';
      modalStage.scrollTo(0, 0);
    });
    imageModal.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      showShot(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    imageModal.addEventListener('click', event => {
      if (event.target === imageModal) imageModal.close();
    });
    imageModal.addEventListener('close', () => opener?.focus());
  }
})();
