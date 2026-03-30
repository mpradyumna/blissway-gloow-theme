class PromotionalBlock {
  constructor(block) {
    this.block = block;
    this.countdownElement = block.querySelector('.promotional-block__countdown');
    this.sliderHandle = block.querySelector('.promotional-block__slider-handle');
    this.priceElement = block.querySelector('.promotional-block__price');
    this.init();
  }

  init() {
    this.setupCountdown();
    this.setupSlider();
    this.setupVariantChangeListener();
  }

  setupCountdown() {
    if (!this.countdownElement) return;
    
    // Get the target time from the block settings
    const targetHour = parseInt(this.block.dataset.targetHour);
    const targetMinute = parseInt(this.block.dataset.targetMinute);
    
    // Use new target time settings if available, otherwise fall back to reset_hour
    if (targetHour !== undefined && targetHour !== null && !isNaN(targetHour)) {
      this.startCountdownToTime(targetHour, targetMinute || 0);
    } else {
      // Fallback to old reset_hour setting
      const resetHour = parseInt(this.block.dataset.resetHour) || 18; // Default to 6 PM
      this.startCountdownToTime(resetHour, 0);
    }
  }

  startCountdownToTime(targetHour, targetMinute) {
    const updateCountdown = () => {
      const now = new Date();
      const targetTime = new Date(now);
      targetTime.setHours(targetHour, targetMinute, 0, 0); // Set to target time today
      
      let timeRemaining = targetTime.getTime() - now.getTime();
      
      // If target time has passed today, set it for tomorrow
      if (timeRemaining <= 0) {
        targetTime.setDate(targetTime.getDate() + 1);
        timeRemaining = targetTime.getTime() - now.getTime();
      }
      
      this.updateCountdownDisplay(timeRemaining);
      
      // Update every second
      setTimeout(updateCountdown, 1000);
    };
    
    updateCountdown();
  }

  updateCountdownDisplay(timeRemaining) {
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    
    // Format to 00:00:00
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');
    
    // Get custom countdown text from block settings or use default
    let countdownText = this.block.dataset.countdownText || 'Prices Go Up in [TIME]';
    
    // Check if we should show urgent text (less than 1 hour remaining)
    if (hours === 0 && minutes < 60) {
      countdownText = this.block.dataset.countdownUrgentText || '⚠️ Last Hour! [TIME] Left!';
      this.countdownElement.classList.add('urgent');
    } else {
      this.countdownElement.classList.remove('urgent');
    }
    
    // Replace placeholders with actual values (case-insensitive)
    countdownText = countdownText
      .replace(/\[TIME\]/gi, `${formattedHours}:${formattedMinutes}:${formattedSeconds}`)
      .replace(/\[HOURS\]/gi, formattedHours)
      .replace(/\[MINUTES\]/gi, formattedMinutes)
      .replace(/\[SECONDS\]/gi, formattedSeconds);
    
    this.countdownElement.textContent = countdownText;
  }

  setupSlider() {
    if (!this.sliderHandle) return;
    
    // Add hover effect to slider handle
    this.sliderHandle.addEventListener('mouseenter', () => {
      this.sliderHandle.style.transform = 'translateX(-50%) scale(1.2)';
    });
    
    this.sliderHandle.addEventListener('mouseleave', () => {
      this.sliderHandle.style.transform = 'translateX(-50%) scale(1)';
    });
  }

  setupVariantChangeListener() {
    if (!this.priceElement) return;

    // Listen for variant change events
    document.addEventListener('variant:change', (event) => {
      this.updatePrice(event.detail.variant);
    });

    // Also listen for custom variant change events
    document.addEventListener('variant:changed', (event) => {
      this.updatePrice(event.detail.variant);
    });

    // Listen for form changes (fallback method)
    const productForm = document.querySelector('form[data-product-form]');
    if (productForm) {
      productForm.addEventListener('change', (event) => {
        if (event.target.name === 'id') {
          // Get the selected variant ID
          const variantId = event.target.value;
          this.fetchAndUpdatePrice(variantId);
        }
      });
    }

    // Listen for variant selector changes (common in many themes)
    const variantSelectors = document.querySelectorAll('select[name="id"], input[name="id"]');
    variantSelectors.forEach(selector => {
      selector.addEventListener('change', (event) => {
        const variantId = event.target.value;
        this.fetchAndUpdatePrice(variantId);
      });
    });

    // Listen for radio button changes (common in many themes)
    const variantRadios = document.querySelectorAll('input[type="radio"][name="id"]');
    variantRadios.forEach(radio => {
      radio.addEventListener('change', (event) => {
        const variantId = event.target.value;
        this.fetchAndUpdatePrice(variantId);
      });
    });

    // Mutation observer to catch dynamically added variant selectors
    this.setupMutationObserver();
  }

  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for new variant selectors
              const newSelectors = node.querySelectorAll && node.querySelectorAll('select[name="id"], input[name="id"]');
              if (newSelectors) {
                newSelectors.forEach(selector => {
                  selector.addEventListener('change', (event) => {
                    const variantId = event.target.value;
                    this.fetchAndUpdatePrice(variantId);
                  });
                });
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  updatePrice(variant) {
    if (!variant || !this.priceElement) return;

    const comparePriceColor = this.block.dataset.comparePriceColor || '#e74c3c';
    const priceColor = this.block.dataset.priceColor || '#000000';

    if (variant.compare_at_price && variant.compare_at_price > variant.price) {
      // Show compare price and current price
      this.priceElement.innerHTML = `
        <span class="promotional-block__compare-price" style="color: ${priceColor};">${this.formatMoney(variant.compare_at_price)}</span>
        <span class="promotional-block__current-price" style="color: ${comparePriceColor};">${this.formatMoney(variant.price)}</span>
      `;
    } else {
      // Show only current price
      this.priceElement.innerHTML = `<span style="color: ${priceColor};">${this.formatMoney(variant.price)}</span>`;
    }

    // Update discount variables and content
    this.updateDiscountContent(variant);
  }

  async fetchAndUpdatePrice(variantId) {
    try {
      // Try to get product data from the page first
      const productData = this.getProductDataFromPage();
      if (productData && productData.variants) {
        const variant = productData.variants.find(v => v.id.toString() === variantId.toString());
        if (variant) {
          this.updatePrice(variant);
          return;
        }
      }

      // Fallback: try to get from Shopify's product object
      if (window.Shopify && window.Shopify.product) {
        const variant = window.Shopify.product.variants.find(v => v.id.toString() === variantId.toString());
        if (variant) {
          this.updatePrice(variant);
          return;
        }
      }

      // Try to get from the promotional block's product data
      const productJson = this.block.dataset.productJson;
      if (productJson) {
        try {
          const productData = JSON.parse(productJson);
          if (productData.variants) {
            const variant = productData.variants.find(v => v.id.toString() === variantId.toString());
            if (variant) {
              this.updatePrice(variant);
              return;
            }
          }
        } catch (e) {
          console.log('Could not parse product JSON from promotional block:', e);
        }
      }

      // Last resort: try to fetch from the product JSON endpoint
      const productUrl = window.location.pathname + '.js';
      const response = await fetch(productUrl);
      const fetchedProductData = await response.json();
      
      if (fetchedProductData.variants) {
        const variant = fetchedProductData.variants.find(v => v.id.toString() === variantId.toString());
        if (variant) {
          this.updatePrice(variant);
        }
      }
    } catch (error) {
      console.log('Could not fetch variant price:', error);
    }
  }

  getProductDataFromPage() {
    // Try to find product data in script tags
    const productScripts = document.querySelectorAll('script[type="application/json"][data-product-json]');
    for (const script of productScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data && data.variants) {
          return data;
        }
      } catch (e) {
        // Continue to next script
      }
    }

    // Try to find product data in other common locations
    const productDataElements = document.querySelectorAll('[data-product-json], [data-product]');
    for (const element of productDataElements) {
      try {
        const data = JSON.parse(element.textContent || element.dataset.productJson || element.dataset.product);
        if (data && data.variants) {
          return data;
        }
      } catch (e) {
        // Continue to next element
      }
    }

    return null;
  }

  updateDiscountContent(variant) {
    // Calculate discount values
    let discountPrice = '0';
    let discountPercentage = '0%';

    if (variant.compare_at_price && variant.compare_at_price > variant.price) {
      const discountPriceDraft = variant.compare_at_price - variant.price;
      discountPrice = this.formatMoney(discountPriceDraft);
      const discountPercentageDraft = (discountPriceDraft / variant.compare_at_price) * 100;
      discountPercentage = Math.round(discountPercentageDraft) + '%';
    }

    // Update subtext if it exists
    const subtextElement = this.block.querySelector('.promotional-block__subtext');
    if (subtextElement) {
      const subtextTemplate = subtextElement.dataset.subtextTemplate;
      if (subtextTemplate) {
        const updatedSubtext = subtextTemplate
          .replace(/\[%\]/g, discountPercentage)
          .replace(/\[\$\]/g, discountPrice);
        subtextElement.textContent = updatedSubtext;
      }
    }

    // Update button text if it exists
    const buttonElements = this.block.querySelectorAll('.promotional-block__button');
    buttonElements.forEach(button => {
      const buttonTextTemplate = button.dataset.buttonTextTemplate;
      if (buttonTextTemplate) {
        const updatedButtonText = buttonTextTemplate
          .replace(/\[%\]/g, discountPercentage)
          .replace(/\[\$\]/g, discountPrice);
        button.textContent = updatedButtonText;
      }
    });
  }

  formatMoney(amount) {
    // Basic money formatting - you can enhance this based on your theme's money format
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: window.ShopifyAnalytics.meta.page.currency || 'USD'
    }).format(amount / 100);
  }
}

// Initialize all promotional blocks when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const promotionalBlocks = document.querySelectorAll('.promotional-block');
  promotionalBlocks.forEach(block => {
    new PromotionalBlock(block);
  });
});

// Initialize blocks that might be added dynamically (e.g., through AJAX)
document.addEventListener('shopify:section:load', (event) => {
  const promotionalBlocks = event.target.querySelectorAll('.promotional-block');
  promotionalBlocks.forEach(block => {
    new PromotionalBlock(block);
  });
});
