if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.section = {
          settings: JSON.parse(this.getAttribute('data-section-settings') || '{}')
        };
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
          dots: this.querySelector('.mobile-dot-navigation'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        this.productInfo = document.getElementById(`ProductInfo-${this.dataset.section}`);
        this.prependMedia = this.dataset.disablePrepend != 'true';
        if (this.productInfo && Shopify.postLinksRetry) this.productInfo.initShareLinks();
        this.filteringOption = this.dataset.filteringOption;
        this.productSpecificFiltering = this.dataset.productSpecificFiltering === 'true';
        if (!this.elements.thumbnails && !this.elements.dots) return;

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        
        // Add thumbnail event listeners
        if (this.elements.thumbnails) {
          this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
            mediaToSwitch
              .querySelector('button')
              .addEventListener('click', (event) => {
                // First set the active media
                this.setActiveMedia(mediaToSwitch.dataset.target, false);
                // Then handle thumbnail scrolling behavior
                this.handleThumbnailClick(event, mediaToSwitch);
              });
          });
        }
        
        // Add dot navigation event listeners
        if (this.elements.dots) {
          this.elements.dots.querySelectorAll('[data-target]').forEach((dot) => {
            dot.addEventListener('click', () => {
              this.setActiveMedia(dot.dataset.target, false);
            });
          });
        }
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
        
        // Listen for variant changes if filtering is enabled
        if (this.filteringOption) {
          document.addEventListener('variant:change', this.handleVariantChange.bind(this));
        }
      }

      onSlideChanged(event) {
        // Update thumbnail navigation
        if (this.elements.thumbnails) {
          const thumbnail = this.elements.thumbnails.querySelector(
            `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
          );
          if (thumbnail && !thumbnail.classList.contains('hidden')) {
            this.setActiveThumbnail(thumbnail);
          }
        }
        
        // Update dot navigation
        if (this.elements.dots) {
          this.setActiveDot(event.detail.currentElement.dataset.mediaId);
        }
      }

      setActiveMedia(mediaId, prepend, filtering = false, currentVariant = null) {
        if (filtering && currentVariant) {
          // Use the dedicated filtering method
          this.updateMediaFiltering(currentVariant);
        }

        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');

        if (prepend && this.prependMedia) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          if (!this.section?.settings?.no_scroll) {
            window.scrollTo({ top: top, behavior: 'smooth' });
          }
        });
        this.playActiveMedia(activeMedia);

        if (filtering && currentVariant) {
          if (this.elements.viewer && this.elements.viewer.initPages) this.elements.viewer.initPages();
          if (this.elements.viewer && this.elements.viewer.update) this.elements.viewer.update();
          
          // Debug: Check all thumbnails
          if (this.elements.thumbnails) {
            const allThumbnails = this.elements.thumbnails.querySelectorAll('.thumbnail-list__item');
            console.log('All thumbnails:', allThumbnails.length);
            allThumbnails.forEach((thumb, index) => {
              console.log(`Thumbnail ${index}:`, thumb.dataset.target, 'alt:', thumb.dataset.alt, 'hidden:', thumb.classList.contains('hidden'));
            });
          }
          
          // Update thumbnail navigation after filtering
          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            console.log('Found active thumbnail:', activeThumbnail, 'hidden:', activeThumbnail?.classList.contains('hidden'));
            if (activeThumbnail && !activeThumbnail.classList.contains('hidden')) {
              this.setActiveThumbnail(activeThumbnail);
              this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
            }
          }
          
          // Update dot navigation after filtering
          if (this.elements.dots) {
            this.setActiveDot(mediaId);
          }
          
          return; // Skip the regular navigation update when filtering
        }

        if (!this.elements.thumbnails && !this.elements.dots) return;
        
        // Update thumbnail navigation (regular flow)
        if (this.elements.thumbnails) {
          const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
          this.setActiveThumbnail(activeThumbnail);
          this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
        }
        
        // Update dot navigation (regular flow)
        if (this.elements.dots) {
          this.setActiveDot(mediaId);
        }
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        
        // Check if thumbnail is visible, if not, scroll to make it visible
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        // Get thumbnail position relative to the slider
        const thumbnailRect = thumbnail.getBoundingClientRect();
        const sliderRect = this.elements.thumbnails.slider.getBoundingClientRect();
        
        // Calculate if thumbnail is on the left or right side of the visible area
        const isLeftSide = thumbnailRect.left < sliderRect.left + (sliderRect.width * 0.3);
        const isRightSide = thumbnailRect.right > sliderRect.right - (sliderRect.width * 0.3);
        
        if (isLeftSide) {
          // Scroll to show previous thumbnails (scroll left)
          const scrollAmount = Math.max(0, this.elements.thumbnails.slider.scrollLeft - (this.elements.thumbnails.sliderItemOffset * 2));
          this.elements.thumbnails.slider.scrollTo({ left: scrollAmount, behavior: 'smooth' });
        } else if (isRightSide) {
          // Scroll to show next thumbnails (scroll right)
          const scrollAmount = this.elements.thumbnails.slider.scrollLeft + (this.elements.thumbnails.sliderItemOffset * 2);
          this.elements.thumbnails.slider.scrollTo({ left: scrollAmount, behavior: 'smooth' });
        } else {
          // Default behavior - scroll to make thumbnail visible
          this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft, behavior: 'smooth' });
        }
      }

      setActiveDot(mediaId) {
        if (!this.elements.dots) return;

        this.elements.dots
          .querySelectorAll('.dot-navigation-dot')
          .forEach((dot) => {
            dot.classList.remove('active');
            dot.removeAttribute('aria-current');
          });
        
        const activeDot = this.elements.dots.querySelector(`[data-target="${mediaId}"]`);
        if (activeDot) {
          activeDot.classList.add('active');
          activeDot.setAttribute('aria-current', true);
        }
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
       // window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }

      handleThumbnailClick(event, thumbnail) {
        if (!this.elements.thumbnails || !this.elements.thumbnails.slider) return;
        
        // Get thumbnail position relative to the slider
        const thumbnailRect = thumbnail.getBoundingClientRect();
        const sliderRect = this.elements.thumbnails.slider.getBoundingClientRect();
        
        // Calculate if thumbnail is on the left or right side of the visible area
        const isLeftSide = thumbnailRect.left < sliderRect.left + (sliderRect.width * 0.3);
        const isRightSide = thumbnailRect.right > sliderRect.right - (sliderRect.width * 0.3);
        
        if (isLeftSide) {
          // Scroll to show previous thumbnails (scroll left)
          const scrollAmount = Math.max(0, this.elements.thumbnails.slider.scrollLeft - (this.elements.thumbnails.sliderItemOffset * 2));
          this.elements.thumbnails.slider.scrollTo({ left: scrollAmount, behavior: 'smooth' });
        } else if (isRightSide) {
          // Scroll to show next thumbnails (scroll right)
          const scrollAmount = this.elements.thumbnails.slider.scrollLeft + (this.elements.thumbnails.sliderItemOffset * 2);
          this.elements.thumbnails.slider.scrollTo({ left: scrollAmount, behavior: 'smooth' });
        }
      }

      handleVariantChange(event) {
        if (!this.filteringOption || !event.detail.variant) return;
        
        console.log('Variant change detected, updating media filtering:', event.detail.variant);
        if (this.productSpecificFiltering) {
          console.log('Product-specific filtering is enabled for this product');
          console.log('This product is either in the selected products list or has the "variant_filtering_enabled" tag');
        }
        
        // Get the current variant from the event
        const currentVariant = event.detail.variant;
        
        // Update the filtering based on the new variant
        this.updateMediaFiltering(currentVariant);
        
        // Find the first visible media item and set it as active
        const firstVisibleMedia = this.querySelector('.product__media-item:not(.hidden)');
        if (firstVisibleMedia) {
          const mediaId = firstVisibleMedia.dataset.mediaId;
          console.log('Setting first visible media as active:', mediaId);
          this.setActiveMedia(mediaId, false, true, currentVariant);
        }
      }

      updateMediaFiltering(currentVariant) {
        if (!this.filteringOption || !currentVariant) return;
        
        console.log('Updating media filtering for variant:', currentVariant);
        if (this.productSpecificFiltering) {
          console.log('Product-specific filtering is active for this product');
          console.log('Filtering by option:', this.filteringOption, 'with value:', currentVariant[this.filteringOption]);
        }
        
        // Filter all media items, thumbnails, and dots
        const allSlides = this.querySelectorAll('.product__media-item, .thumbnail-list__item, .dot-navigation-dot');
        allSlides.forEach(slide => {
          const slideAlt = slide.dataset.alt;
          // Treat images without alt tags as 'always_display'
          const shouldShow = slideAlt === currentVariant[this.filteringOption] || 
                           slideAlt === 'always_display' || 
                           !slideAlt || 
                           slideAlt === '';
          
          if (shouldShow) {
            slide.classList.remove('hidden');
          } else {
            slide.classList.add('hidden');
          }
        });
        
        // Also filter slider counter links if they exist
        const sliderLinks = this.querySelectorAll('.slider-counter__link');
        sliderLinks.forEach(link => {
          const linkAlt = link.dataset.alt;
          // Treat links without alt tags as 'always_display'
          const shouldShow = linkAlt === currentVariant[this.filteringOption] || 
                           linkAlt === 'always_display' || 
                           !linkAlt || 
                           linkAlt === '';
          
          if (shouldShow) {
            link.classList.remove('hidden');
          } else {
            link.classList.add('hidden');
          }
        });
        
        console.log('Media filtering updated. Hidden elements:', this.querySelectorAll('.hidden').length);
      }
    }
  );
}
