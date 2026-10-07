const decodeHtmlEntities = s => s.replace(/&#(\d+);/g,(_,d)=>String.fromCharCode(d)).replace(/&quot;|&apos;|&amp;|&lt;|&gt;/g, m=>({ "&quot;":"\"","&apos;":"'","&amp;":"&","&lt;":"<","&gt;":">" }[m]));

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    appCurrency: {
      ratesUsd: window.currencyRatesUsd || {},
      currency: window.defaultCurrency || 'usd',

      convert(price, fromCurrency, toCurrency = this.currency) {
        const fromRate = this.ratesUsd[fromCurrency.toLowerCase()];
        const toRate = this.ratesUsd[toCurrency.toLowerCase()];

        if (fromCurrency === toCurrency) {
          return price;
        }
        
        if (!fromRate || !toRate) {
          console.error('Invalid currency conversion', { fromCurrency, toCurrency, rates: this.ratesUsd });
          return price;
        }

        return (price / fromRate) * toRate;
      },
      
      format(price, fromCurrency, locale = 'en-US') {
        const toCurrency = this.currency || fromCurrency;
        const convertedPrice = this.convert(price, fromCurrency, toCurrency);

        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: toCurrency,
          currencyDisplay: 'symbol',
        }).format(convertedPrice);
      },
      
      init() {
        const storedDefault = localStorage.getItem('defaultCurrency');
        if (storedDefault && storedDefault !== window.defaultCurrency) {
          localStorage.removeItem('currency');
        }
        localStorage.setItem('defaultCurrency', window.defaultCurrency);

        const storedCurrency = localStorage.getItem('currency')?.toLowerCase();

        if (storedCurrency && this.ratesUsd[storedCurrency]) {
          this.currency = storedCurrency;
        } else if (storedCurrency) {
          console.error('Invalid currency in local storage', storedCurrency, this.ratesUsd);
        }

        window.addEventListener('load', () => {
          if (document.querySelector('.currency-selector select')) {
            document.querySelectorAll('.currency-selector select').forEach((element) => {
              const choices = new Choices(element, { 
                searchPlaceholderValue: 'Currency', 
                shouldSort: false, 
                allowHTML: true 
              });
              
              choices.passedElement.element.addEventListener('change', (event) => {
                this.currency = event.detail.value;
                localStorage.setItem('currency', this.currency);
              });

              choices.setChoiceByValue(this.currency);

              // Workaround to fix default value highlight issue
              const selectedChoiceElement = choices.choiceList.element.querySelector('.is-selected');
              if (selectedChoiceElement) {
                choices._highlightChoice(selectedChoiceElement);
              }
            });
          }
        });
      },
    },

    appCart: {
      items: [],
      
      updateLocalStorage: function () {
        localStorage.setItem('cart', JSON.stringify(this.items));
      },
      
      set: function (items) {
        this.items = items;
        this.updateLocalStorage();
      },
      
      add: function (productId, variantId, quantity, parentVariantId = null) {
        const item = this.items.find((item) => item.variantId === variantId && (!item.parentVariantId || item.parentVariantId === parentVariantId));

        if (item) {
          item.quantity += quantity;
        } else {
          this.items.push({ productId, variantId, quantity, parentVariantId });
        }

        this.updateLocalStorage();
      },
      
      remove: function (variantId, parentVariantId = null) {
        this.items = this.items.filter((item) => item.variantId !== variantId || (item.parentVariantId && item.parentVariantId !== parentVariantId));
        this.updateLocalStorage();
      },
      
      editQuantity: function (variantId, quantity) {
        const item = this.items.find((item) => item.variantId === variantId);
        item.quantity = quantity;
        this.updateLocalStorage();
      },

      isInCart: function (variantId, parentVariantId = null) {
        return this.items.some((item) => item.variantId === variantId && (!item.parentVariantId || item.parentVariantId === parentVariantId));
      },
      
      get countWithQuantities() {
        return this.items.reduce((acc, item) => {
          if (!item.parentVariantId) {
            return acc + item.quantity;
          }

          return acc;
        }, 0);
      },
      
      init: function () {
        if (localStorage.getItem('cart')) {
          try {
            this.items = JSON.parse(localStorage.getItem('cart'));
            if (!Array.isArray(this.items)) {
              this.items = [];
            }
          } catch (error) {
            console.error('Error parsing cart from local storage', error);
            this.items = [];
          }
        }
      }
    },

    appCustomer: {
      modalIsOpen: false,
      modalStep: 1,
      modalEmail: '',
      modalOtpDigits: Array(6).fill(''),
      modalEmailError: '',
      modalOtpError: '',
      modalLoading: false,
      altchaPayload: null,
      afterLoginPath: '/customer/dashboard',
      modalUsePassword: false,
      modalPassword: '',
      modalTfaCode: '',
      modalTfaError: '',
      modalDiscordCode: null,
      discordError: '',
      discordPopup: null,
      discordPoll: null,
      discordListening: false,

      addAltchaEventListener: function () {
        window.alpineApp.$refs['appCustomer.altcha'].addEventListener('statechange', (event) => {
          if (event.detail.state === 'verifying') {
            this.buyNowDisabled = true;
          } else if (event.detail.state === 'verified') {
            this.buyNowDisabled = false;
            this.altchaPayload = event.detail.payload;
          }
        });
      },
      
      modalOpen() {
        this.modalIsOpen = true;
        this.modalStep = 1;
        document.body.style.overflow = 'hidden';

        window.alpineApp.$nextTick(() => {
          window.alpineApp.$refs['appCustomer.modalEmailInput'].focus();
        });
      },
  
      modalClose() {
        this.modalIsOpen = false;

        clearInterval(this.discordPoll);
        this.discordPoll = null;
        this.discordPopup = null;

        setTimeout(() => {
          this.modalEmail = '';
          this.otp = '';
          this.modalStep = 1;
          this.modalEmailError = '';
          this.modalOtpError = '';
          this.modalUsePassword = false;
          this.modalPassword = '';
          this.modalTfaCode = '';
          this.modalTfaError = '';
          this.modalDiscordCode = null;
          this.discordError = '';
        }, 300); // Transition

        document.body.style.overflow = 'auto';
      },

      // Password login skips the captcha/OTP request entirely.
      modalUsePasswordLogin() {
        if (!this.modalEmail) {
          this.modalEmailError = 'Enter your e-mail address first.';
          return;
        }

        this.modalEmailError = '';
        this.modalUsePassword = true;
        this.modalStep = 2;
      },

      modalUseOtpLogin() {
        this.modalUsePassword = false;
        this.modalPassword = '';
        this.modalStep = 1;
      },

      async modalRequestOtp() {
        this.modalEmailError = '';
        this.modalOtpError = '';
        this.modalLoading = true;
  
        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/request-otp`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: this.modalEmail,
              shop_id: window.shopId,
              altcha: this.altchaPayload
            })
          });
  
          const data = await response.json();
  
          if (data.success) {
            this.modalStep = 2;
            setTimeout(() => {
              window.alpineApp.$refs['appCustomer.modalOtpInputs[0]'].focus();
            }, 10);
          } else {
            this.modalEmailError = data?.message || 'Failed to send OTP. Please try again.';
          }
        } catch (error) {
          this.modalEmailError = 'Network error. Please try again.';
        } finally {
          this.modalLoading = false;
        }
      },

      modalOtpHandleInput(index) {
        const input = this.modalOtpDigits[index];
        
        if (input === '' || /^\d$/.test(input)) {
          if (input && index < this.modalOtpDigits.length - 1) {
            window.alpineApp.$refs[`appCustomer.modalOtpInputs[${index + 1}]`].focus();
          }
        } else {
          this.modalOtpDigits[index] = '';
        }
      },
  
      modalOtpHandleKeyDown(index, event) {
        if (event.key === 'Backspace' && !this.modalOtpDigits[index] && index > 0) {
          window.alpineApp.$refs[`appCustomer.modalOtpInputs[${index - 1}]`].focus();
        }
      },
  
      modalOtpHandlePaste(event) {
        event.preventDefault();
        const pastedData = event.clipboardData.getData('text');

        if (/^\d+$/.test(pastedData)) {
          const newOtp = pastedData.split('').slice(0, this.modalOtpDigits.length);
          
          newOtp.forEach((digit, index) => {
            this.modalOtpDigits[index] = digit;
          });
  
          for (let i = newOtp.length; i < this.modalOtpDigits.length; i++) {
            this.modalOtpDigits[i] = '';
          }
  
          window.alpineApp.$refs[`appCustomer.modalOtpInputs[${this.modalOtpDigits.length - 1}]`].focus();
        }
      },
  
      // Popup flow: the callback posts a one-time handoff code that loginWithDiscordCode() trades for a session.
      loginWithDiscord() {
        this.discordError = '';
        this.modalEmailError = '';

        const popup = window.open(
          '/discord/login-redirect?intent=login&origin=' + encodeURIComponent(window.location.origin),
          'sa_discord_login',
          'width=520,height=760'
        );

        if (!popup) {
          this.discordError = 'blocked';
          return;
        }

        this.discordListen();
        this.discordPopup = popup;
        this.modalLoading = true;

        clearInterval(this.discordPoll);
        this.discordPoll = setInterval(() => {
          if (!this.discordPopup || !this.discordPopup.closed) {
            return;
          }

          clearInterval(this.discordPoll);
          this.discordPoll = null;
          this.discordPopup = null;

          if (!this.modalDiscordCode) {
            this.modalLoading = false;
          }
        }, 500);
      },

      discordListen() {
        if (this.discordListening) {
          return;
        }

        this.discordListening = true;
        window.addEventListener('message', (event) => this.onDiscordMessage(event));
      },

      onDiscordMessage(event) {
        if (event.origin !== window.location.origin || !this.discordPopup || event.source !== this.discordPopup) {
          return;
        }

        const data = event.data;

        if (!data || data.type !== 'DISCORD_AUTH' || data.intent !== 'login') {
          return;
        }

        clearInterval(this.discordPoll);
        this.discordPoll = null;
        this.discordPopup = null;

        if (data.error || !data.code) {
          this.modalLoading = false;
          this.discordError = data.error === 'access_denied' ? '' : 'failed';
          return;
        }

        this.modalDiscordCode = data.code;
        this.loginWithDiscordCode();
      },

      async loginWithDiscordCode() {
        this.discordError = '';
        this.modalOtpError = '';
        this.modalTfaError = '';
        this.modalLoading = true;

        try {
          const formData = {
            shop_id: window.shopId,
            code: this.modalDiscordCode,
          };

          if (this.modalTfaCode) {
            formData.tfa_code = this.modalTfaCode;
          }

          try {
            const storedAffiliate = JSON.parse(localStorage.getItem('affiliate'));
            if (storedAffiliate?.code && (!storedAffiliate.expires || Date.now() <= storedAffiliate.expires)) {
              formData.affiliate = storedAffiliate.code;
            }
          } catch {}

          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/login/discord`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
          });

          const data = await response.json();

          if (data.token) {
            Cookies.set('shop_customer_token', data.token, { expires: 30, path: '/' });
            window.location.href = this.afterLoginPath || '/customer/dashboard';
          } else if (data.requires_tfa) {
            this.modalStep = 3;
          } else if (this.modalStep === 3 && response.status === 401 && /two-factor/i.test(data?.message || '')) {
            this.modalTfaError = data.message;
          } else {
            // The handoff is gone (expired, refused or too many wrong codes): start over.
            this.modalDiscordCode = null;
            this.modalTfaCode = '';
            this.modalStep = 1;
            this.discordError = data?.message || 'failed';
          }
        } catch (error) {
          console.error(error);
          this.discordError = 'failed';
        } finally {
          this.modalLoading = false;
        }
      },

      async modalLogin() {
        if (this.modalDiscordCode) {
          return this.loginWithDiscordCode();
        }

        if (this.modalUsePassword) {
          if (!this.modalPassword) {
            this.modalOtpError = 'Enter your password.';
            return;
          }
        } else {
          const otp = this.modalOtpDigits.join('');

          if (otp.length !== 6) {
            this.modalOtpError = 'Invalid OTP.';
            return;
          }
        }

        this.modalEmailError = '';
        this.modalOtpError = '';
        this.modalTfaError = '';
        this.modalLoading = true;

        try {
          const formData = {
            email: this.modalEmail,
            shop_id: window.shopId,
          };

          if (this.modalUsePassword) {
            formData.password = this.modalPassword;
          } else {
            formData.otp = this.modalOtpDigits.join('');
          }

          // 2FA step resubmits the same credentials with the code.
          if (this.modalTfaCode) {
            formData.tfa_code = this.modalTfaCode;
          }

          try {
            const storedAffiliate = JSON.parse(localStorage.getItem('affiliate'));
            if (storedAffiliate?.code && (!storedAffiliate.expires || Date.now() <= storedAffiliate.expires)) {
              formData.affiliate = storedAffiliate.code;
            }
          } catch {}

          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/login`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
          });

          const data = await response.json();

          if (data.token) {
            Cookies.set('shop_customer_token', data.token, { expires: 30, path: '/' });
            window.location.href = this.afterLoginPath || '/customer/dashboard';
          } else if (data.requires_tfa) {
            this.modalStep = 3;
          } else if (this.modalStep === 3) {
            this.modalTfaError = data?.message || 'Invalid two-factor authentication code.';
          } else {
            this.modalOtpError = data?.message || 'Invalid credentials.';
          }
        } catch (error) {
          console.error(error);
          if (this.modalStep === 3) {
            this.modalTfaError = 'Invalid credentials.';
          } else {
            this.modalOtpError = 'Invalid credentials.';
          }
        } finally {
          this.modalLoading = false;
        }
      },

      loginOrRedirect() {
        if (window.shopCustomer) {
          window.location.href = '/customer/dashboard';
        } else {
          this.modalOpen();
        }
      },

      async logout() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        try {
          fetch(`${window.apiBaseUrl}v1/customer-dashboard/logout`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          });
        } catch (error) {
          console.error('Logout error', error);
        }

        Cookies.remove('shop_customer_token');
        window.location.href = '/';
      },

      deleteModalIsOpen: false,
      deleteModalLoading: false,

      openDeleteModal() {
        this.deleteModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeDeleteModal() {
        this.deleteModalIsOpen = false;
        document.body.style.overflow = 'auto';
      },

      loggingOutOtherSessions: false,

      async logoutOtherSessions() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.loggingOutOtherSessions = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/logout-other-sessions`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          });

          const data = await response.json();

          if (data.success) {
            window.location.reload();
          } else {
            console.error('Logout all devices error', data);
            alert(data.message || 'Failed to logout all devices. Please try again.');
          }
        } catch (error) {
          console.error('Logout other sessions error', error);
          alert('Network error. Please try again.');
        } finally {
          this.loggingOutOtherSessions = false;
        }
      },

      async deleteAccount() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.deleteModalLoading = true;
        
        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/delete-account`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          const data = await response.json();
          
          if (data.success) {
            Cookies.remove('shop_customer_token');
            window.location.href = '/';
          } else {
            console.error('Delete account error', data);
            alert(data.message || 'Failed to delete account. Please try again.');
          }
        } catch (error) {
          console.error('Delete account error', error);
          alert('Network error. Please try again.');
        } finally {
          this.deleteModalLoading = false;
          this.closeDeleteModal();
        }
      },

      init() {
        if (window.alpineApp.$refs['appCustomer.altcha']) {
          this.addAltchaEventListener();
        }
        
        if (window.alpineApp.$refs['appCustomer.modalOtpInputs[0]']) {
          window.alpineApp.$refs['appCustomer.modalOtpInputs[0]'].addEventListener('paste', (event) => this.modalOtpHandlePaste(event));
        }

        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.get('login') === '1') {
          this.modalOpen();

          const back = urlParams.get('back');
          if (['dashboard', 'invoices', 'subscriptions', 'tickets', 'balance', 'reseller', 'affiliate'].includes(back)) {
            urlParams.delete('login');
            urlParams.delete('back');
            this.afterLoginPath = `/customer/${back}?${urlParams.toString()}`;
          }
        }

        const affiliate = urlParams.get('a') || urlParams.get('affiliate');
        if (affiliate) {
          const days = window.affiliateAttributionWindowDays || 30;
          localStorage.setItem('affiliate', JSON.stringify({
            code: affiliate,
            expires: Date.now() + days * 24 * 60 * 60 * 1000
          }));
        }
      }
    },

    appTickets: {
      modalIsOpen: false,
      invoiceId: '',
      subject: '',
      message: '',
      error: '',
      loading: false,

      modalOpen(invoiceId = '') {
        this.modalIsOpen = true;
        this.invoiceId = invoiceId;
        document.body.style.overflow = 'hidden';

        window.alpineApp.$nextTick(() => {
          window.alpineApp.$refs['appTickets.subjectInput'].focus();
        });
      },

      modalClose() {
        this.modalIsOpen = false;
        
        setTimeout(() => {
          this.invoiceId = '';
          this.subject = '';
          this.message = '';
          this.error = '';
          this.loading = false;
        }, 300);

        document.body.style.overflow = 'auto';
      },

      async submitTicket() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.error = '';
        this.loading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/tickets`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoice_id: this.invoiceId,
              subject: this.subject,
              content: this.message
            })
          });

          const data = await response.json();

          if (data.success) {
            this.modalClose();
            window.location.href = `/customer/tickets/${data?.ticket?.id}`;
          } else {
            this.error = data?.message || 'Failed to create ticket. Please try again.';
          }
        } catch (error) {
          this.error = 'Network error. Please try again.';
          console.error('Ticket creation error:', error);
        } finally {
          this.loading = false;
        }
      },

      init() {
        const urlParams = new URLSearchParams(window.location.search);
        const ticketInvoiceId = urlParams.get('ticket-invoice-id');
        if (ticketInvoiceId) {
          this.modalOpen(ticketInvoiceId);
        }
      }
    },

    appAffiliate: {
      modalEditCodeIsOpen: false,
      editCodeValue: '',
      editCodeError: '',
      editCodeLoading: false,

      payoutAmount: '',
      payoutDetails: '',
      payoutError: '',
      payoutLoading: false,

      transferAmount: '',
      transferError: '',
      transferLoading: false,

      modalPayoutIsOpen: false,

      modalPayoutOpen() {
        this.payoutError = '';
        this.modalPayoutIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      modalPayoutClose() {
        this.modalPayoutIsOpen = false;
        document.body.style.overflow = 'auto';
      },

      async authedPost(path, body) {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return { message: 'Not logged in.' };
        }

        const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/affiliate/${path}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body || {})
        });

        return await response.json();
      },

      async requestPayout() {
        this.payoutError = '';
        this.payoutLoading = true;

        try {
          const data = await this.authedPost('payout-request', {
            amount: parseFloat(this.payoutAmount),
            payout_details: this.payoutDetails
          });

          if (data.success) {
            window.location.reload();
          } else {
            this.payoutError = data?.message || 'Failed to request the payout. Please try again.';
          }
        } catch (error) {
          this.payoutError = 'Network error. Please try again.';
          console.error('Affiliate payout request error:', error);
        } finally {
          this.payoutLoading = false;
        }
      },

      async cancelPayout(payoutRequestId) {
        try {
          const data = await this.authedPost(`payout-request/${payoutRequestId}/cancel`);

          if (data.success) {
            window.location.reload();
          } else {
            this.payoutError = data?.message || 'Failed to cancel the payout request.';
          }
        } catch (error) {
          this.payoutError = 'Network error. Please try again.';
          console.error('Affiliate payout cancel error:', error);
        }
      },

      async submitTransfer() {
        this.transferError = '';
        this.transferLoading = true;

        try {
          const data = await this.authedPost('transfer', {
            amount: parseFloat(this.transferAmount)
          });

          if (data.success) {
            window.location.reload();
          } else {
            this.transferError = data?.message || 'Failed to transfer the balance. Please try again.';
          }
        } catch (error) {
          this.transferError = 'Network error. Please try again.';
          console.error('Affiliate transfer error:', error);
        } finally {
          this.transferLoading = false;
        }
      },

      modalEditCodeOpen(initialValue = '') {
        this.editCodeValue = initialValue;
        this.modalEditCodeIsOpen = true;
        document.body.style.overflow = 'hidden';

        window.alpineApp.$nextTick(() => {
          window.alpineApp.$refs['appAffiliate.editCodeInput'].focus();
        });
      },

      modalEditCodeClose() {
        this.modalEditCodeIsOpen = false;
        
        setTimeout(() => {
          this.editCodeValue = '';
          this.error = '';
          this.loading = false;
        }, 300);

        document.body.style.overflow = 'auto';
      },

      async submitEditCode() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.editCodeError = '';
        this.editCodeLoading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/affiliate/edit-code`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              affiliate_code: this.editCodeValue
            })
          });

          const data = await response.json();

          if (data.success) {
            this.modalClose();
            window.location.reload();
          } else {
            this.editCodeError = data?.message || 'Failed to update affiliate code. Please try again.';
          }
        } catch (error) {
          this.editCodeError = 'Network error. Please try again.';
          console.error('Affiliate code update error:', error);
        } finally {
          this.editCodeLoading = false;
        }
      }
    },

    appReseller: {
      applicationAnswer: '',
      applyError: '',
      applyLoading: false,

      apiKey: null,
      apiKeyError: '',
      apiKeyLoading: false,

      webhookSecret: '',
      ddError: '',
      ddLoading: false,

      connectError: '',
      connectLoading: false,

      apiModalIsOpen: false,
      ddModalIsOpen: false,

      openApiModal() {
        this.apiModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeApiModal() {
        this.apiModalIsOpen = false;
        document.body.style.overflow = 'auto';

        setTimeout(() => {
          this.apiKeyError = '';
        }, 300); // Transition
      },

      openDeliveryModal() {
        this.ddModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeDeliveryModal() {
        this.ddModalIsOpen = false;
        document.body.style.overflow = 'auto';

        setTimeout(() => {
          this.ddError = '';
        }, 300); // Transition
      },

      async authedPost(path, body) {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return { message: 'Not logged in.' };
        }

        const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/reseller/${path}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body || {})
        });

        return await response.json();
      },

      async apply() {
        this.applyError = '';
        this.applyLoading = true;

        try {
          const data = await this.authedPost('apply', {
            answer: this.applicationAnswer
          });

          if (data.success) {
            window.location.reload();
          } else {
            this.applyError = data?.message || 'Failed to submit the application. Please try again.';
          }
        } catch (error) {
          this.applyError = 'Network error. Please try again.';
          console.error('Reseller apply error:', error);
        } finally {
          this.applyLoading = false;
        }
      },

      async regenerateApiKey() {
        this.apiKeyError = '';
        this.apiKeyLoading = true;

        try {
          const data = await this.authedPost('api-key');

          if (data.api_key) {
            this.apiKey = data.api_key;
          } else {
            this.apiKeyError = data?.message || 'Failed to generate the API key. Please try again.';
          }
        } catch (error) {
          this.apiKeyError = 'Network error. Please try again.';
          console.error('Reseller API key error:', error);
        } finally {
          this.apiKeyLoading = false;
        }
      },

      async saveDynamicDelivery(enabled) {
        this.ddError = '';
        this.ddLoading = true;

        try {
          const body = { enabled: enabled };

          if (this.webhookSecret) {
            body.webhook_secret = this.webhookSecret;
          }

          const data = await this.authedPost('dynamic-delivery', body);

          if (data.success) {
            window.location.reload();
          } else {
            this.ddError = data?.message || 'Failed to update dynamic delivery. Please try again.';
          }
        } catch (error) {
          this.ddError = 'Network error. Please try again.';
          console.error('Reseller dynamic delivery error:', error);
        } finally {
          this.ddLoading = false;
        }
      },

      async regenerateDynamicToken() {
        if (!confirm('Regenerate your delivery URLs? Every URL you have pasted into your own shop will stop working and must be replaced.')) {
          return;
        }

        this.ddError = '';

        try {
          const data = await this.authedPost('dynamic-token/regenerate');

          if (data.success) {
            window.location.reload();
          } else {
            this.ddError = data?.message || 'Failed to regenerate the delivery URLs.';
          }
        } catch (error) {
          this.ddError = 'Network error. Please try again.';
          console.error('Reseller dynamic token error:', error);
        }
      },

      async connectStore() {
        // open synchronously so popup blockers treat it as user-initiated
        const win = window.open('', '_blank');

        this.connectError = '';
        this.connectLoading = true;

        try {
          const data = await this.authedPost('connect-token');

          if (data && data.url) {
            if (win) {
              win.location = data.url;
            } else {
              window.location = data.url;
            }
          } else {
            if (win) win.close();
            this.connectError = data?.message || 'Failed to connect your store. Please try again.';
          }
        } catch (error) {
          if (win) win.close();
          this.connectError = 'Network error. Please try again.';
          console.error('Reseller connect error:', error);
        } finally {
          this.connectLoading = false;
        }
      },

      async disconnectStore() {
        if (!confirm('Disconnect your store? Imported products stay but stop syncing, and dynamic delivery may stop working.')) {
          return;
        }

        this.connectError = '';

        try {
          const data = await this.authedPost('disconnect');

          if (data.success) {
            window.location.reload();
          } else {
            this.connectError = data?.message || 'Failed to disconnect your store.';
          }
        } catch (error) {
          this.connectError = 'Network error. Please try again.';
          console.error('Reseller disconnect error:', error);
        }
      }
    },

    appSecurity: {
      password: '',
      currentPassword: '',
      tfaCodeForPassword: '',
      passwordError: '',
      passwordSuccess: '',
      passwordLoading: false,
      passwordRemoveConfirm: false,

      tfaSecret: null,
      tfaQrCode: null,
      tfaCode: '',
      tfaRecoveryCodes: null,
      tfaError: '',
      tfaLoading: false,

      passwordModalIsOpen: false,
      tfaModalIsOpen: false,

      discordModalIsOpen: false,
      discordCode: null,
      discordCurrentPassword: '',
      discordTfaCode: '',
      discordError: '',
      discordSuccess: '',
      discordLoading: false,
      discordPopup: null,
      discordPoll: null,
      discordListening: false,

      openPasswordModal() {
        this.passwordModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closePasswordModal() {
        this.passwordModalIsOpen = false;
        document.body.style.overflow = 'auto';

        setTimeout(() => {
          this.passwordError = '';
          this.passwordSuccess = '';
          this.passwordRemoveConfirm = false;
        }, 300); // Transition
      },

      openTfaModal() {
        this.tfaModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeTfaModal() {
        this.tfaModalIsOpen = false;
        document.body.style.overflow = 'auto';

        setTimeout(() => {
          this.tfaError = '';
        }, 300); // Transition
      },

      openDiscordModal() {
        this.discordModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeDiscordModal() {
        this.discordModalIsOpen = false;
        document.body.style.overflow = 'auto';

        clearInterval(this.discordPoll);
        this.discordPoll = null;
        this.discordPopup = null;

        setTimeout(() => {
          this.discordError = '';
          this.discordSuccess = '';
          this.discordCurrentPassword = '';
          this.discordTfaCode = '';
        }, 300); // Transition
      },

      discordGuardsMissing() {
        if (window.shopCustomer?.has_password && !this.discordCurrentPassword) {
          this.discordError = 'Enter your current password.';
          return true;
        }

        if (window.shopCustomer?.tfa_enabled && !this.discordTfaCode) {
          this.discordError = 'Enter your two-factor authentication code.';
          return true;
        }

        return false;
      },

      // Popup flow (intent "link"): the posted handoff code is submitted with the modal's password / TFA code.
      connectDiscord() {
        this.discordError = '';

        if (this.discordGuardsMissing()) {
          return;
        }

        if (this.discordCode) {
          this.submitDiscordConnect();
          return;
        }

        const popup = window.open(
          '/discord/login-redirect?intent=link&origin=' + encodeURIComponent(window.location.origin),
          'sa_discord_link',
          'width=520,height=760'
        );

        if (!popup) {
          this.discordError = 'blocked';
          return;
        }

        this.discordListen();
        this.discordPopup = popup;
        this.discordLoading = true;

        clearInterval(this.discordPoll);
        this.discordPoll = setInterval(() => {
          if (!this.discordPopup || !this.discordPopup.closed) {
            return;
          }

          clearInterval(this.discordPoll);
          this.discordPoll = null;
          this.discordPopup = null;

          if (!this.discordCode) {
            this.discordLoading = false;
          }
        }, 500);
      },

      discordListen() {
        if (this.discordListening) {
          return;
        }

        this.discordListening = true;
        window.addEventListener('message', (event) => this.onDiscordMessage(event));
      },

      onDiscordMessage(event) {
        if (event.origin !== window.location.origin || !this.discordPopup || event.source !== this.discordPopup) {
          return;
        }

        const data = event.data;

        if (!data || data.type !== 'DISCORD_AUTH' || data.intent !== 'link') {
          return;
        }

        clearInterval(this.discordPoll);
        this.discordPoll = null;
        this.discordPopup = null;

        if (data.error || !data.code) {
          this.discordLoading = false;
          this.discordError = data.error === 'access_denied' ? '' : 'failed';
          return;
        }

        this.discordCode = data.code;
        this.submitDiscordConnect();
      },

      async submitDiscordConnect() {
        this.discordError = '';
        this.discordLoading = true;

        try {
          const data = await this.authedPost('discord/connect', {
            code: this.discordCode,
            current_password: this.discordCurrentPassword || null,
            tfa_code: this.discordTfaCode || null,
          });

          if (data.success) {
            this.discordCode = null;
            this.discordSuccess = data.message || 'Discord connected.';
            setTimeout(() => window.location.reload(), 1000);
          } else {
            // A guard failure keeps the handoff for a retry; anything else needs a new popup.
            if (!/password|two-factor/i.test(data?.message || '')) {
              this.discordCode = null;
            }

            this.discordError = data?.message || 'failed';
          }
        } catch (error) {
          console.error(error);
          this.discordError = 'failed';
        } finally {
          this.discordLoading = false;
        }
      },

      async disconnectDiscord() {
        this.discordError = '';

        if (this.discordGuardsMissing()) {
          return;
        }

        this.discordLoading = true;

        try {
          const data = await this.authedPost('discord/disconnect', {
            current_password: this.discordCurrentPassword || null,
            tfa_code: this.discordTfaCode || null,
          });

          if (data.success) {
            this.discordSuccess = data.message || 'Discord disconnected.';
            setTimeout(() => window.location.reload(), 1000);
          } else {
            this.discordError = data?.message || 'failed';
          }
        } catch (error) {
          console.error(error);
          this.discordError = 'failed';
        } finally {
          this.discordLoading = false;
        }
      },

      async authedPost(path, body) {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return { message: 'Not logged in.' };
        }

        const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/security/${path}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body || {})
        });

        return await response.json();
      },

      async savePassword(requireCurrent = false) {
        this.passwordError = '';
        this.passwordSuccess = '';

        if (requireCurrent && !this.currentPassword) {
          this.passwordError = 'Enter your current password.';
          return;
        }

        if (!this.password || this.password.length < 8) {
          this.passwordError = 'New password must be at least 8 characters.';
          return;
        }

        this.passwordLoading = true;

        try {
          const data = await this.authedPost('password', {
            password: this.password,
            current_password: this.currentPassword || null,
            tfa_code: this.tfaCodeForPassword || null,
          });

          if (data.success) {
            this.password = '';
            this.currentPassword = '';
            this.tfaCodeForPassword = '';
            this.passwordSuccess = 'Password saved. You can now log in with it.';
          } else {
            this.passwordError = data?.message || 'Failed to save the password. Please try again.';
          }
        } catch (error) {
          this.passwordError = 'Network error. Please try again.';
          console.error('Password save error:', error);
        } finally {
          this.passwordLoading = false;
        }
      },

      startRemovePassword() {
        this.passwordError = '';

        if (!this.currentPassword) {
          this.passwordError = 'Enter your current password first.';
          return;
        }

        this.passwordRemoveConfirm = true;
      },

      async removePassword() {
        this.passwordError = '';
        this.passwordSuccess = '';
        this.passwordLoading = true;

        try {
          const data = await this.authedPost('password/remove', {
            current_password: this.currentPassword,
            tfa_code: this.tfaCodeForPassword || null,
          });

          if (data.success) {
            window.location.reload();
          } else {
            this.passwordError = data?.message || 'Failed to remove the password.';
          }
        } catch (error) {
          this.passwordError = 'Network error. Please try again.';
          console.error('Password remove error:', error);
        } finally {
          this.passwordLoading = false;
          this.passwordRemoveConfirm = false;
        }
      },

      async tfaGetSecret() {
        this.tfaError = '';
        this.tfaLoading = true;

        try {
          const data = await this.authedPost('tfa/secret');

          if (data.secret) {
            this.tfaSecret = data.secret;
            this.tfaQrCode = data.qr_code;
          } else {
            this.tfaError = data?.message || 'Failed to start 2FA setup.';
          }
        } catch (error) {
          this.tfaError = 'Network error. Please try again.';
          console.error('2FA secret error:', error);
        } finally {
          this.tfaLoading = false;
        }
      },

      async tfaEnable() {
        this.tfaError = '';
        this.tfaLoading = true;

        try {
          const data = await this.authedPost('tfa/enable', {
            tfa_code: this.tfaCode
          });

          if (data.success) {
            // Recovery codes are only shown once; keep them on screen until reload.
            this.tfaRecoveryCodes = data.recovery_codes;
            this.tfaSecret = null;
            this.tfaQrCode = null;
            this.tfaCode = '';
          } else {
            this.tfaError = data?.message || 'Invalid code. Please try again.';
          }
        } catch (error) {
          this.tfaError = 'Network error. Please try again.';
          console.error('2FA enable error:', error);
        } finally {
          this.tfaLoading = false;
        }
      },

      async tfaDisable() {
        this.tfaError = '';
        this.tfaLoading = true;

        try {
          const data = await this.authedPost('tfa/disable', {
            tfa_code: this.tfaCode
          });

          if (data.success) {
            window.location.reload();
          } else {
            this.tfaError = data?.message || 'Invalid code. Please try again.';
          }
        } catch (error) {
          this.tfaError = 'Network error. Please try again.';
          console.error('2FA disable error:', error);
        } finally {
          this.tfaLoading = false;
        }
      }
    },

    appMaintenance: {
      modalIsOpen: false,
      modalPassword: '',
      modalError: '',
      modalLoading: false,
      
      modalOpen() {
        this.modalIsOpen = true;
        document.body.style.overflow = 'hidden';

        window.alpineApp.$nextTick(() => {
          window.alpineApp.$refs['appMaintenance.modalPasswordInput'].focus();
        });
      },

      modalClose() {
        this.modalIsOpen = false;
        
        setTimeout(() => {
          this.modalPassword = '';
          this.modalError = '';
        }, 300); // Transition

        document.body.style.overflow = 'auto';
      },

      async modalLogin() {
        this.modalError = '';
        this.modalOtpError = '';
        this.modalLoading = true;

        try {
          const response = await fetch('/maintenance', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              password: this.modalPassword,
            })
          });

          const data = await response.json();

          if (data.success) {
            window.location.href = '/';
          } else {
            this.modalError = data?.message || 'Failed to login. Please try again.';
            this.modalLoading = false;
          }
        } catch (error) {
          this.modalError = 'Network error. Please try again.';
          this.modalLoading = false;
        }
      },
    },

    init: function () {
      window.alpineApp = this;

      this.appCurrency.init();
      this.appCart.init();
      this.appCustomer.init();
      this.appTickets.init();
    }
  }));
});

// Choices enhances the language <select> so each option can show its flag; the
// option value is the locale's URL, so picking one is a navigation.
window.addEventListener('load', () => {
  document.querySelectorAll('.language-selector select').forEach((element) => {
    const choices = new Choices(element, {
      searchEnabled: false,
      shouldSort: false,
      allowHTML: true,
      itemSelectText: '',
    });

    choices.passedElement.element.addEventListener('change', (event) => {
      if (!event.detail.value) {
        return;
      }

      const option = Array.from(element.options).find((o) => o.value === event.detail.value);
      const code = option ? option.dataset.code : '';
      if (code) {
        if (code === element.dataset.defaultLang) {
          Cookies.remove('locale', { path: '/' });
        } else {
          Cookies.set('locale', code, { expires: 365, path: '/' });
        }
      }

      window.location.href = event.detail.value;
    });
  });
});

function snow(config = {}) {
  const settings = {
    count: config.count || 200,
    minSize: config.minSize || 0.5,
    maxSize: config.maxSize || 1.0,
    minSpeed: config.minSpeed || 10,
    maxSpeed: config.maxSpeed || 30,
  };

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  let html = '', css = '';

  for (let i = 1; i < settings.count; i++) {
    html += '<i class="snowflake"></i>';
    
    const sizeMultiplier = settings.minSize + (Math.random() * (settings.maxSize - settings.minSize));
    const rndX = (rand(0, 1000000) * 0.0001);
    const rndO = rand(-100000, 100000) * 0.0001;
    const rndT = (rand(3, 8) * 10).toFixed(2);
    const rndS = (sizeMultiplier * rand(0, 10000) * 0.0001).toFixed(2);
    const animationDuration = rand(settings.minSpeed, settings.maxSpeed);
    
    css += '.snowflake:nth-child(' + i + ') {' +
      'opacity: ' + (rand(1, 10000) * 0.0001).toFixed(2) + ';' +
      'transform: translate(' + rndX.toFixed(2) + 'vw, -10px) scale(' + rndS + ');' +
      'animation: fall-' + i + ' ' + animationDuration + 's -' + rand(0, 30) + 's linear infinite' +
    '}' +
    '@keyframes fall-' + i + ' {' +
      rndT + '% {' +
        'transform: translate(' + (rndX + rndO).toFixed(2) + 'vw, ' + rndT + 'vh) scale(' + rndS + ')' +
      '}' +
      'to {' +
        'transform: translate(' + (rndX + (rndO / 2)).toFixed(2) + 'vw, 105vh) scale(' + rndS + ')' +
      '}' +
    '}';
  }

  document.getElementById('snow').innerHTML = html;

  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}