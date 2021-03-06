var app = app || {};

app.onDeviceReady(function() {

	'use strict';

	$('html').removeClass('no-js');

	// Register partial templates with handlebars.
	Handlebars.registerPartial('formField', $('#template-form-field').html());
	Handlebars.registerPartial('formFieldRow', $('#template-form-field-row').html());

	app.onReady(function() {
		app.services.coin = _.mapObject(app.config.webServices, function(webServiceConfig) {
			return new webServiceConfig.constructor({
				defaultUrls: webServiceConfig.defaultUrls,
			});
		});
	});

	app.onReady(function() {
		var toggleDeprecatedFlag = function() {
			$('html').toggleClass('deprecated-network', app.wallet.networkIsDeprecated());
		};
		app.settings.on('change:network', toggleDeprecatedFlag);
		toggleDeprecatedFlag();
	});

	app.onReady(function() {
		app.settings.on('change:fiatCurrency', function() {
			if (app.settings.get('useFiat')) {
				app.wallet.refreshCachedExchangeRate();
				var displayCurrency = app.settings.get('displayCurrency');
				var fiatCurrency = app.settings.get('fiatCurrency');
				var coinSymbol = app.wallet.getCoinSymbol();
				if (displayCurrency !== coinSymbol) {
					app.settings.set('displayCurrency', fiatCurrency);
				}
			}
		});
		app.settings.on('change:useFiat', function() {
			if (app.settings.get('useFiat')) {
				app.wallet.getExchangeRate(_.noop);
			} else {
				app.settings.set('displayCurrency', app.wallet.getCoinSymbol());
			}
		});
		if (app.settings.get('useFiat')) {
			app.wallet.refreshCachedExchangeRate();
		} else {
			app.settings.set('displayCurrency', app.wallet.getCoinSymbol());
		}
	});

	app.onReady(function() {

		// Initialize the main view.
		app.mainView = new app.views.Main();

		app.device.initialize();

		$('html').addClass('loaded');

		// Initialize the router.
		app.router = new app.Router();

		// Don't initialize backbone history when testing.
		if (!app.isTest()) {
			// Start storing in-app browsing history.
			Backbone.history.start();
		}

		if (!app.hasReadDisclaimers()) {
			app.router.navigate('#disclaimers', { trigger: true });
		}
	});

	app.queues.onStart.resume();
});
