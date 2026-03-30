class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener("click", (event) => {
      event.preventDefault();
      const cartItems =
        this.closest("cart-items") || this.closest("cart-drawer-items");
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define("cart-remove-button", CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById("shopping-cart-line-item-status") ||
      document.getElementById("CartDrawer-LineItemStatus");

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener("change", debouncedOnChange.bind(this));

    // Use event delegation to handle upsell toggle events
    // This prevents multiple event listeners when DOM elements are replaced
    if (!CartItems.upsellToggleListenerAttached) {
      document.addEventListener("change", (event) => {
        if (event.target && event.target.id === "cart-upsell-toggle") {
          // Find the active cart-items instance to handle the event
          const activeCartItems = document.querySelector("cart-items") || document.querySelector("cart-drawer-items");
          if (activeCartItems && activeCartItems.onCartUpsellToggle) {
            activeCartItems.onCartUpsellToggle(event);
          }
        }
      });
      
      // Listen for cart open events to update toggle state
      document.addEventListener("cart:open", () => {
        console.log("Cart opened - updating toggle state");
        const activeCartItems = document.querySelector("cart-items") || document.querySelector("cart-drawer-items");
        if (activeCartItems && activeCartItems.updateCartUpsellToggleState) {
          activeCartItems.updateCartUpsellToggleState().catch(e => console.error(e));
        }
      });
      
      // Listen for cart updated events to update toggle state
      document.addEventListener("cart:updated", () => {
        console.log("Cart updated - updating toggle state");
        const activeCartItems = document.querySelector("cart-items") || document.querySelector("cart-drawer-items");
        if (activeCartItems && activeCartItems.updateCartUpsellToggleState) {
          activeCartItems.updateCartUpsellToggleState().catch(e => console.error(e));
        }
      });
      
      CartItems.upsellToggleListenerAttached = true;
    }
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(
      PUB_SUB_EVENTS.cartUpdate,
      (event) => {
        if (event.source === "cart-items") {
          return;
        }
        this.onCartUpdate();
      }
    );
    if (this.tagName !== "CART-DRAWER-ITEMS") {
      fetch(`${routes.cart_url}.js`)
        .then((response) => response.json())
        .then((parsedState) => {
          this.updateCartUpsellToggleState().catch(e => console.error(e));
          this.updateCartUpsellVisibility(parsedState.item_count);
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      // For cart-drawer-items, also update toggle state on initial load
      setTimeout(() => {
        this.updateCartUpsellToggleState().catch(e => console.error(e));
      }, 100); // Small delay to ensure DOM is ready
    }
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute("value");
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = "";

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace(
        "[min]",
        event.target.dataset.min
      );
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace(
        "[max]",
        event.target.max
      );
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace(
        "[step]",
        event.target.step
      );
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity("");
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        document.activeElement.getAttribute("name"),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  async onCartUpdate() {
    try {
      const updates = [];

      // Update cart drawer if present
      const hasDrawer = document.querySelector("cart-drawer-items") || document.querySelector(".cart-drawer__footer");
      if (hasDrawer) {
        updates.push(
          (async () => {
            const response = await fetch(`${routes.cart_url}?section_id=cart-drawer`);
            const responseText = await response.text();
            const html = new DOMParser().parseFromString(responseText, "text/html");
            const selectors = ["cart-drawer-items", ".drawer__footer"];
            for (const selector of selectors) {
              const targetElement = document.querySelector(selector);
              const sourceElement = html.querySelector(selector);
              if (targetElement && sourceElement) {
                targetElement.replaceWith(sourceElement);
              }
            }
          })()
        );
      }

      // Update main cart if present
      const mainCartRoot = document.getElementById("main-cart-items");
      if (mainCartRoot) {
        updates.push(
          (async () => {
            const response = await fetch(`${routes.cart_url}?section_id=main-cart-items`);
            const responseText = await response.text();
            const html = new DOMParser().parseFromString(responseText, "text/html");
            const sourceQty = html.querySelector("cart-items");
            if (sourceQty) {
              mainCartRoot.querySelector(".js-contents").innerHTML = sourceQty.innerHTML;
            }
          })()
        );
      }

      await Promise.all(updates);

      // Best-effort toggle state + visibility update after DOM swaps
      await this.updateCartUpsellToggleState();
      try {
        const cartResponse = await fetch(`${routes.cart_url}.js`);
        const parsedState = await cartResponse.json();
        this.updateCartUpsellVisibility(parsedState.item_count);
      } catch (e) {
        // non-fatal
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async updateCartUpsellToggleState() {
    console.log("=== updateCartUpsellToggleState called ===");
    const cartUpsellToggle = document.getElementById("cart-upsell-toggle");
    const scriptTag = document.querySelector(
      "script[data-cart-upsell-variant-id]"
    );
    const cartUpsellVariantId = scriptTag
      ? scriptTag.dataset.cartUpsellVariantId
      : "";

    console.log("Toggle element:", cartUpsellToggle);
    console.log("Variant ID:", cartUpsellVariantId);
    console.log("Adding flag:", this.addingUpsellProduct);
    console.log("Removing flag:", this.removingUpsellProduct);

    if (!cartUpsellVariantId || !cartUpsellToggle) {
      console.log("Missing toggle element or variant ID, skipping update");
      return;
    }

    // Don't update toggle state if we're in the middle of an operation
    if (this.addingUpsellProduct || this.removingUpsellProduct) {
      console.log("Skipping toggle state update - operation in progress");
      return;
    }

    try {
      // Get the current cart to check for upsell items
      const cartResponse = await fetch(`${routes.cart_url}.js`);
      const cart = await cartResponse.json();
      
      console.log("Cart items count:", cart.items.length);
      
      // Find the upsell item by variant ID and properties
      const upsellItem = cart.items.find(item => {
        // First check if variant ID matches
        if (item.variant_id.toString() === cartUpsellVariantId.toString()) {
          // If it has the special properties, use them for identification
          if (item.properties && item.properties._upsell === 'true' && item.properties._upsell_type === 'cart_checkbox') {
            return true;
          }
          // If no properties or no upsell properties, assume it's the upsell product
          if (!item.properties || !item.properties._upsell) {
            return true;
          }
        }
        return false;
      });

      const shouldBeChecked = !!upsellItem;
      console.log("Found upsell item:", upsellItem);
      console.log("Should be checked:", shouldBeChecked);
      console.log("Currently checked:", cartUpsellToggle.checked);
      
      if (cartUpsellToggle.checked !== shouldBeChecked) {
        cartUpsellToggle.checked = shouldBeChecked;
        console.log("Updated upsell toggle state to:", shouldBeChecked);
      } else {
        console.log("Toggle state already correct, no update needed");
      }
    } catch (error) {
      console.error("Error checking upsell toggle state:", error);
    }
  }

  updateCartUpsellVisibility(itemCount) {
    const cartUpsellContainer = document.querySelector(
      ".cart-upsell-toggle-container"
    );
    if (cartUpsellContainer) {
      if (itemCount === 0) {
        cartUpsellContainer.classList.add("hidden");
      } else {
        cartUpsellContainer.classList.remove("hidden");
      }
    }
  }

  onCartUpsellToggle(event) {
    console.log("=== onCartUpsellToggle called ===");
    console.log("Event target:", event.target);
    console.log("Event type:", event.type);
    console.log("Adding flag:", this.addingUpsellProduct);
    console.log("Removing flag:", this.removingUpsellProduct);
    
    const scriptTag = document.querySelector(
      "script[data-cart-upsell-variant-id]"
    );
    const cartUpsellVariantId = scriptTag
      ? scriptTag.dataset.cartUpsellVariantId
      : "";
    const isChecked = event.target.checked;

    console.log("Cart upsell toggle changed. Checked:", isChecked, "Variant ID:", cartUpsellVariantId);

    if (!cartUpsellVariantId) {
      console.error("No upsell variant ID found. Cannot proceed with upsell operation.");
      event.target.checked = false; // Reset the toggle
      return;
    }

    if (isChecked) {
      if (!this.addingUpsellProduct) {
        this.addingUpsellProduct = true;
        event.target.disabled = true; // Disable toggle during operation
        
        // Set a timeout to reset the flag in case something goes wrong
        const timeoutId = setTimeout(() => {
          console.warn("Upsell addition timeout - resetting flags");
          this.addingUpsellProduct = false;
          event.target.disabled = false;
        }, 10000); // 10 second timeout
        
        this.addUpsellProduct(cartUpsellVariantId).then(async () => {
          clearTimeout(timeoutId);
          // Fetch cart data to update progress bar
          try {
            const response = await fetch(`${routes.cart_url}.js`);
            const parsedState = await response.json();
            this.updateProgressBar({
              total_price: parsedState.total_price,
              items_subtotal_price: parsedState.items_subtotal_price,
            });
          } catch (e) {
            console.error(e);
          } finally {
            this.addingUpsellProduct = false;
            event.target.disabled = false; // Re-enable toggle
          }
        }).catch((error) => {
          clearTimeout(timeoutId);
          console.error("Failed to add upsell product:", error);
          event.target.checked = false; // Reset the toggle on error
          this.addingUpsellProduct = false;
          event.target.disabled = false; // Re-enable toggle
        });
      } else {
        console.log("Upsell addition already in progress, ignoring toggle");
        event.target.checked = false; // Reset toggle since we can't proceed
      }
    } else {
      if (!this.removingUpsellProduct) {
        this.removingUpsellProduct = true;
        event.target.disabled = true; // Disable toggle during operation
        
        // Set a timeout to reset the flag in case something goes wrong
        const timeoutId = setTimeout(() => {
          console.warn("Upsell removal timeout - resetting flags");
          this.removingUpsellProduct = false;
          event.target.disabled = false;
        }, 10000); // 10 second timeout
        
        this.removeUpsellProduct(cartUpsellVariantId).then(async () => {
          clearTimeout(timeoutId);
          // Fetch cart data to update progress bar
          try {
            const response = await fetch(`${routes.cart_url}.js`);
            const parsedState = await response.json();
            this.updateProgressBar({
              total_price: parsedState.total_price,
              items_subtotal_price: parsedState.items_subtotal_price,
            });
          } catch (e) {
            console.error(e);
          } finally {
            this.removingUpsellProduct = false;
            event.target.disabled = false; // Re-enable toggle
          }
        }).catch((error) => {
          clearTimeout(timeoutId);
          console.error("Failed to remove upsell product:", error);
          this.removingUpsellProduct = false;
          event.target.checked = true; // Reset the toggle on error
          event.target.disabled = false; // Re-enable toggle
        });
      } else {
        console.log("Upsell removal already in progress, ignoring toggle");
        event.target.checked = true; // Reset toggle since we can't proceed
      }
    }
  }

  async addUpsellProduct(cartUpsellVariantId) {
    try {
      console.log("=== Starting addUpsellProduct ===");
      console.log("Variant ID:", cartUpsellVariantId);
      console.log("Adding flag:", this.addingUpsellProduct);
      
      // First, check if the upsell product is already in the cart
      const cartResponse = await fetch(`${routes.cart_url}.js`);
      const cart = await cartResponse.json();
      
      console.log("Current cart items:", cart.items.length);
      cart.items.forEach((item, index) => {
        console.log(`Item ${index}:`, {
          variant_id: item.variant_id,
          properties: item.properties,
          quantity: item.quantity
        });
      });
      
      // Check if upsell product already exists
      const existingUpsellItem = cart.items.find(item => {
        // First check if variant ID matches
        if (item.variant_id.toString() === cartUpsellVariantId.toString()) {
          // If it has the special properties, use them for identification
          if (item.properties && item.properties._upsell === 'true' && item.properties._upsell_type === 'cart_checkbox') {
            return true;
          }
          // If no properties or no upsell properties, assume it's the upsell product
          if (!item.properties || !item.properties._upsell) {
            return true;
          }
        }
        return false;
      });

      if (existingUpsellItem) {
        console.log("Upsell product already exists in cart, skipping addition");
        console.log("Existing item:", existingUpsellItem);
        return;
      }

      console.log("Adding upsell product with variant ID:", cartUpsellVariantId);

      const upsellFormData = new FormData();
      upsellFormData.append("id", cartUpsellVariantId);
      upsellFormData.append("quantity", 1);
      // Add special properties to identify this as an upsell product
      upsellFormData.append("properties[_upsell]", "true");
      upsellFormData.append("properties[_upsell_type]", "cart_checkbox");

      const config = fetchConfig("javascript");
      config.headers["X-Requested-With"] = "XMLHttpRequest";
      delete config.headers["Content-Type"];
      config.body = upsellFormData;

      const response = await fetch(`${routes.cart_add_url}`, config);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to add upsell product:", errorText);
        throw new Error("Failed to add upsell product");
      }

      console.log("Successfully added upsell product");
      console.log("=== Finished addUpsellProduct ===");
      
      // Wait for cart update to complete
      await this.onCartUpdate();
      
      // Dispatch cart update event to notify other components
      document.dispatchEvent(new CustomEvent('cart:updated'));
    } catch (error) {
      console.error("Error adding upsell product:", error);
      throw error;
    }
  }

  async removeUpsellProduct(cartUpsellVariantId) {
    try {
      // First, get the current cart to find the upsell item
      const cartResponse = await fetch(`${routes.cart_url}.js`);
      const cart = await cartResponse.json();
      
      // Find the upsell item by variant ID and properties
      const upsellItem = cart.items.find(item => {
        // First check if variant ID matches
        if (item.variant_id.toString() === cartUpsellVariantId.toString()) {
          // If it has the special properties, use them for identification
          if (item.properties && item.properties._upsell === 'true' && item.properties._upsell_type === 'cart_checkbox') {
            return true;
          }
          // If no properties or no upsell properties, assume it's the upsell product
          if (!item.properties || !item.properties._upsell) {
            return true;
          }
        }
        return false;
      });

      if (!upsellItem) {
        console.log("Upsell product not found in cart or already removed");
        this.removingUpsellProduct = false;
        return;
      }

      console.log("Found upsell item to remove:", upsellItem);

      // Use the cart change API to set this specific line-item key to 0
      const changePayload = {
        id: upsellItem.key,
        quantity: 0
      };

      const response = await fetch(`${routes.cart_change_url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(changePayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to remove upsell product:", errorText);
        throw new Error("Failed to remove upsell product");
      }

      console.log("Successfully removed upsell product");
      
      // Wait for cart update to complete before resetting the flag
      await this.onCartUpdate();
      
      // Dispatch cart update event to notify other components
      document.dispatchEvent(new CustomEvent('cart:updated'));
      
      this.removingUpsellProduct = false;
      
    } catch (error) {
      console.error("Error removing upsell product:", error);
      this.removingUpsellProduct = false;
    }
  }

  getSectionsToRender() {
    return [
      {
        id: "main-cart-items",
        section: document.getElementById("main-cart-items").dataset.id,
        selector: ".js-contents",
      },
      {
        id: "cart-icon-bubble",
        section: "cart-icon-bubble",
        selector: ".shopify-section",
      },
      {
        id: "cart-live-region-text",
        section: "cart-live-region-text",
        selector: ".shopify-section",
      },
      {
        id: "main-cart-footer",
        section: document.getElementById("main-cart-footer").dataset.id,
        selector: ".js-contents",
      },
    ];
  }

  updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.getElementById(`Quantity-${line}`) ||
          document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll(".cart-item");

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute("value");
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle("is-empty", parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector("cart-drawer");
        const cartFooter = document.getElementById("main-cart-footer");

        if (cartFooter)
          cartFooter.classList.toggle("is-empty", parsedState.item_count === 0);
        if (cartDrawerWrapper)
          cartDrawerWrapper.classList.toggle(
            "is-empty",
            parsedState.item_count === 0
          );

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document
              .getElementById(section.id)
              .querySelector(section.selector) ||
            document.getElementById(section.id);
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        });
        const updatedValue = parsedState.items[line - 1]
          ? parsedState.items[line - 1].quantity
          : undefined;
        let message = "";
        if (
          items.length === parsedState.items.length &&
          updatedValue !== parseInt(quantityElement.value)
        ) {
          if (typeof updatedValue === "undefined") {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace(
              "[quantity]",
              updatedValue
            );
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem =
          document.getElementById(`CartItem-${line}`) ||
          document.getElementById(`CartDrawer-Item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper
            ? trapFocus(
                cartDrawerWrapper,
                lineItem.querySelector(`[name="${name}"]`)
              )
            : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          trapFocus(
            cartDrawerWrapper.querySelector(".drawer__inner-empty"),
            cartDrawerWrapper.querySelector("a")
          );
        } else if (document.querySelector(".cart-item") && cartDrawerWrapper) {
          trapFocus(
            cartDrawerWrapper,
            document.querySelector(".cart-item__name")
          );
        }

        this.updateProgressBar({
          total_price: parsedState.total_price,
          items_subtotal_price: parsedState.items_subtotal_price,
        });

        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: "cart-items",
          cartData: parsedState,
          variantId: variantId,
        });
        this.updateCartUpsellToggleState().catch(e => console.error(e));
        this.updateCartUpsellVisibility(parsedState.item_count);
      })
      .catch(() => {
        this.querySelectorAll(".loading__spinner").forEach((overlay) =>
          overlay.classList.add("hidden")
        );
        const errors =
          document.getElementById("cart-errors") ||
          document.getElementById("CartDrawer-CartErrors");
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateProgressBar({ total_price, items_subtotal_price }) {
    const progressWrapper = document.getElementById("cart-progress-wrapper");
    if (!progressWrapper) return;

    const cartTotalCents =
      progressWrapper.dataset.useItemsSubtotal === "true"
        ? items_subtotal_price
        : total_price;

    const currencyFormat = progressWrapper.dataset.currencyFormat;
    const thresholds = progressWrapper.dataset.thresholds
      .split(",")
      .map(Number);
    const preGoalMessages = progressWrapper.dataset.preGoalMessages.split("||");
    const postGoalMessages =
      progressWrapper.dataset.postGoalMessages.split("||");
    const goalPositions = progressWrapper.dataset.goalPositions
      .split(",")
      .map(Number);

    const totalThreshold = thresholds[thresholds.length - 1];
    const progressPercentage = Math.min(
      (cartTotalCents / totalThreshold) * 100,
      100
    );

    const progressBar = document.getElementById("cart-progress-bar");
    const goalIcons = document.querySelectorAll(".goal-icon");
    const goalMessageElement = document.querySelector(".goal-message");

    if (cartTotalCents === 0) {
      progressWrapper.style.display = "none";
      goalMessageElement.style.display = "none";
      progressBar.style.width = "0%";
    } else {
      progressWrapper.style.display = "block";
      const previousWidth = parseFloat(progressBar.style.width) || 0;
      progressBar.style.width = `${progressPercentage}%`;

      if (progressPercentage >= 100) {
        progressWrapper.classList.add("full");
      } else {
        progressWrapper.classList.remove("full");
      }

      let nextGoalIndex = -1;
      for (let i = 0; i < thresholds.length; i++) {
        if (cartTotalCents < thresholds[i]) {
          nextGoalIndex = i;
          break;
        }
      }

      goalIcons.forEach((goalIcon, index) => {
        const cartTotalDiff = cartTotalCents - thresholds[index];
        const icon = goalIcon.querySelector("img");
        const goalNumber = goalIcon.dataset.index;

        if (icon) {
          if (cartTotalDiff < 0) {
            const regularIconUrl = goalIcon.dataset.regularIcon;
            if (regularIconUrl) {
              icon.src = regularIconUrl;
              icon.srcset = `${regularIconUrl} 50w`;
              icon.alt = `Goal ${goalNumber}`;
            }
          } else {
            const reachedIconUrl = goalIcon.dataset.reachedIcon;
            if (reachedIconUrl) {
              icon.src = reachedIconUrl;
              icon.srcset = `${reachedIconUrl} 50w`;
              icon.alt = `Goal ${goalNumber} Reached`;
            }
          }
        }
      });

      goalMessageElement.style.display = "block";
      if (nextGoalIndex === -1) {
        const message = postGoalMessages[postGoalMessages.length - 1];
        goalMessageElement.innerHTML = message;
      } else {
        const remainingForGoal = thresholds[nextGoalIndex] - cartTotalCents;
        const remainingAmount = remainingForGoal / 100;
        const remainingAmountFormatted = this.formatCurrency(
          currencyFormat,
          remainingAmount
        );
        const preGoalMessageTemplate = preGoalMessages[nextGoalIndex];
        const message = preGoalMessageTemplate.replace(
          "[x]",
          remainingAmountFormatted
        );
        goalMessageElement.innerHTML = message;
      }
    }
  }

  formatCurrency(currencyFormat, amount) {
    let formattedAmount = "";
    formattedAmount = currencyFormat
      .replace("{{amount}}", amount.toFixed(2)) // Standard with two decimals
      .replace("{{amount_no_decimals}}", amount.toFixed(0)) // No decimals
      .replace(
        "{{amount_with_comma_separator}}",
        amount.toFixed(2).replace(".", ",")
      ) // Replace period with comma
      .replace(
        "{{amount_no_decimals_with_comma_separator}}",
        amount.toFixed(0).replace(".", ",")
      ) // No decimals, use comma
      .replace(
        "{{amount_with_apostrophe_separator}}",
        amount.toFixed(2).replace(".", "'")
      ) // Apostrophe separator
      .replace(
        "{{amount_no_decimals_with_space_separator}}",
        amount.toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")
      ) // No decimals, space
      .replace(
        "{{amount_with_space_separator}}",
        amount
          .toFixed(2)
          .replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")
          .replace(".", ",")
      ) // Space separator
      .replace(
        "{{amount_with_period_and_space_separator}}",
        amount.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")
      ); // Period and space
    return formattedAmount;
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) ||
      document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError)
      lineItemError.querySelector(".cart-item__error-text").textContent =
        message;

    this.lineItemStatusElement.setAttribute("aria-hidden", true);

    const cartStatus =
      document.getElementById("cart-live-region-text") ||
      document.getElementById("CartDrawer-LiveRegionText");
    cartStatus.setAttribute("aria-hidden", false);

    setTimeout(() => {
      cartStatus.setAttribute("aria-hidden", true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems =
      document.getElementById("main-cart-items") ||
      document.getElementById("CartDrawer-CartItems");
    mainCartItems.classList.add("cart__items--disabled");

    const cartItemElements = this.querySelectorAll(
      `#CartItem-${line} .loading__spinner`
    );
    const cartDrawerItemElements = this.querySelectorAll(
      `#CartDrawer-Item-${line} .loading__spinner`
    );

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) =>
      overlay.classList.remove("hidden")
    );

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute("aria-hidden", false);
  }

  disableLoading(line) {
    const mainCartItems =
      document.getElementById("main-cart-items") ||
      document.getElementById("CartDrawer-CartItems");
    mainCartItems.classList.remove("cart__items--disabled");

    const cartItemElements = this.querySelectorAll(
      `#CartItem-${line} .loading__spinner`
    );
    const cartDrawerItemElements = this.querySelectorAll(
      `#CartDrawer-Item-${line} .loading__spinner`
    );

    cartItemElements.forEach((overlay) => overlay.classList.add("hidden"));
    cartDrawerItemElements.forEach((overlay) =>
      overlay.classList.add("hidden")
    );
  }
}

customElements.define("cart-items", CartItems);

if (!customElements.get("cart-note")) {
  customElements.define(
    "cart-note",
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          "input",
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, {
              ...fetchConfig(),
              ...{ body },
            });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
