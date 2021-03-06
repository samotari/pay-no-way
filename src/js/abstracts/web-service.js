var app = app || {};

app.abstracts = app.abstracts || {};

app.abstracts.WebService = (function() {

	'use strict';

	var Service = function(options) {
		options = _.defaults(options || {}, {
			url: null,
			defaultUrls: null,
		});
		if (!this.type) {
			throw new Error('Missing required prototype property: "type"');
		}
		if (!_.isNull(options.url)) {
			if (!options.url || !_.isString(options.url)) {
				throw new Error('Invalid option ("url"): Non-empty string expected');
			}
		}
		if (!_.isNull(options.defaultUrls)) {
			if (_.isEmpty(options.defaultUrls) || !_.isObject(options.defaultUrls)) {
				throw new Error('Invalid option ("defaultUrls"): Non-empty object expected');
			}
		}
		if (_.isNull(options.url) && _.isNull(options.urls)) {
			throw new Error('Must provide either "url" or "urls" option');
		}
		this.options = options;
	};

	Service.prototype.type = null;

	Service.prototype.doRequest = function(method, uri, data, cb) {
		if (_.isFunction(data)) {
			cb = data;
			data = null;
		}
		var log = _.bind(this.log, this);
		var url = this.getUrl();
		if (!url) {
			log('http-request', 'skipped because missing URL');
			return cb(null, null);
		}
		uri = uri || '';
		url += uri;
		var ajaxOptions = {
			method: method.toUpperCase(),
			url: url,
			cache: false,
		};
		if (data) {
			if (!_.isString(data)) {
				data = JSON.stringify(data);
				ajaxOptions.contentType = 'application/json';
			}
			ajaxOptions.data = data;
			ajaxOptions.processData = false;
		}
		log('http-request', ajaxOptions);
		$.ajax(ajaxOptions).done(function(responseData) {
			log('http-response', ajaxOptions, responseData);
			cb(null, responseData);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			log('http-error', jqXHR, textStatus, errorThrown);
			if (jqXHR.readyState === 0 && app.device.offline) {
				// Unsent request and device is offline.
				return cb(new Error(app.i18n.t('http-request-failed.no-connection')));
			}
			var errorText;
			if (jqXHR.responseText) {
				errorText = jqXHR.responseText;
			} else {
				errorText = app.i18n.t('http-request-failed.generic');
			}
			cb(new Error(errorText));
		});
	};

	Service.prototype.getUrl = function() {
		if (this.options.url) {
			return this.options.url;
		}
		if (this.type === app.wallet.getSetting('webServiceType')) {
			return app.wallet.getSetting('webServiceUrl');
		}
		var network = app.wallet.getNetwork();
		return this.options.defaultUrls[network] || null;
	};

	Service.prototype.log = function() {
		var args = Array.prototype.slice.call(arguments);
		if (_.isString(args[0])) {
			args[0] = ['service', this.type, args[0]].join('.');
		} else {
			args.unshift(['service', this.type].join('.'));
		}
		app.log.apply(app, args);
	};

	Service.extend = function(prototypeProps, classProps) {
		var CustomService = function() {
			Service.apply(this, arguments);
		};
		_.extend(CustomService.prototype, Service.prototype, prototypeProps);
		_.extend(CustomService, Service, classProps);
		return CustomService;
	};

	return Service;

})();
