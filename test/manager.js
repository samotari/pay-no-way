const _ = require('underscore');
const async = require('async');
const express = require('express');
const mkdirp = require('mkdirp');
const path = require('path');
const puppeteer = require('puppeteer');
const serveStatic = require('serve-static');
const WebSocket = require('ws');

let manager = module.exports = {

	browser: null,
	page: null,

	prepareStaticWebServer: function() {
		return new Promise(function(resolve, reject) {
			try {
				let app = express();
				app.use(serveStatic('www'));
				app.server = app.listen(3000, function(error) {
					if (error) return reject(error);
					resolve(app);
				});
			} catch (error) {
				return reject(error);
			}
		});
	},

	prepareBrowser: function(options) {
		options = _.defaults({}, options || {}, {
			args: [
				// To prevent CORS errors:
				'--disable-web-security',
			],
			headless: false,
			slowMo: 50,
			timeout: 10000,
		});
		return puppeteer.launch(options).then(function(browser) {
			manager.browser = browser;
		});
	},

	navigate: function(uri) {
		if (!manager.page) {
			return Promise.reject(new Error('Must load a page before navigating.'));
		}
		const host = process.env.HTTP_SERVER_HOST || 'localhost';
		const port = parseInt(process.env.HTTP_SERVER_PORT || 3000);
		const baseUrl = 'http://' + host + ':' + port;
		const pageUrl = baseUrl + uri;
		return manager.page.goto(pageUrl);
	},

	preparePage: function() {
		if (!manager.browser) {
			return Promise.reject(new Error('Must prepare browser before opening a page.'));
		}
		return manager.browser.newPage().then(function(newPage) {
			manager.page = newPage;
		});
	},

	evaluateInPageContext: function(fn, args) {
		args = args || [];
		if (!_.isFunction(fn)) {
			return Promise.reject(new Error('Invalid argument ("fn"): Function expected'));
		}
		return manager.page.evaluate.apply(manager.page, [fn].concat(args));
	},

	onAppLoaded: function() {
		return manager.navigate('/').then(function() {
			return manager.page.waitFor(function() {
				return !!app && !!app.mainView;
			});
		});
	},

	getPageLocationHash: function() {
		if (!manager.page) {
			throw new Error('No page is loaded.');
		}
		const pageUrl = manager.page.url();
		const parts = pageUrl.indexOf('#') !== -1 ? pageUrl.split('#') : [];
		return parts[1] || '';
	},

	electrumServer: function(port) {
		let wss = new WebSocket.Server({
			port: port,
		});
		let sockets = [];
		wss.on('connection', function(socket) {
			sockets.push(socket);
			const send = socket.send;
			socket.send = function(message) {
				send.apply(socket, arguments);
			};
			socket.on('message', function(message) {
				let data;
				try {
					data = JSON.parse(message);
				} catch (error) {
					console.log(error);
				}
				switch (data.method) {
					case 'server.peers.subscribe':
						socket.send(JSON.stringify({
							jsonrpc: '2.0',
							method: data.method,
							result: [],
							id: data.id,
						}));
						break;
					case 'server.ping':
					case 'blockchain.scripthash.unsubscribe':
						socket.send(JSON.stringify({
							jsonrpc: '2.0',
							method: data.method,
							result: null,
							id: data.id,
						}));
						break;
				}
			});
		});
		return {
			wss,
			sockets,
			waitForClient: function() {
				return new Promise(function(resolve, reject) {
					let socket;
					async.until(function() {
						socket = _.last(sockets);
						return !!socket;
					}, function(next) {
						_.delay(next, 5);
					}, function(error) {
						if (error) return reject(error);
						resolve(socket);
					});
				});
			},
			mock: {
				// Put mock helper functions here.
				// For example, if we need to mock UTXOs for a given address/scripthash.
			},
			close: function() {
				return new Promise(function(resolve, reject) {
					wss.close(function(error) {
						if (error) return reject(error);
						resolve();
					});
				});
			},
		};
	},

	connectElectrumClient: function(name, servers) {
		manager.socketServer.sockets = [];
		return manager.evaluateInPageContext(function(name, servers) {
			app.paymentMethods[name].electrum.servers = servers;
			app.initializeElectrumServices({
				force: true,
			});
		}, [name, servers]).then(function() {
			return manager.page.waitFor(function(name) {
				return !!app.services.electrum[name];
			}, {}/* options */, [name]).then(function() {
				return manager.evaluateInPageContext(function(name) {
					app.services.electrum[name].connectClients(function() {});
				}, [name]).then(function() {
					return manager.socketServer.waitForClient();
				});
			})
		});
	},

	screenshot: function(name) {
		const extension = '.png';
		const dir = path.join(__dirname, '..', 'build', 'screenshots');
		const fileName = name + extension;
		const filePath = path.join(dir, fileName);
		return mkdirp(dir).then(function() {
			return manager.page.screenshot({
				path: filePath,
			});
		});
	},

	// Execute a function in the context of the current browser page.
	evaluateFn: function(options) {
		// Note that we use ES5 syntax when running JavaScript in the context of the browser.
		return manager.page.evaluate(function(evaluateOptions) {
			return new Promise(function(resolve, reject) {
				try {
					(function() {
						if (typeof evaluateOptions !== 'object') {
							throw new Error('Invalid argument ("evaluateOptions"): Object expected');
						}
						if (typeof evaluateOptions.args === 'undefined') {
							throw new Error('Missing required option ("args")');
						}
						if (typeof evaluateOptions.fn === 'undefined') {
							throw new Error('Missing required option ("fn")');
						}
						if (typeof evaluateOptions.isAsync === 'undefined') {
							throw new Error('Missing required option ("isAsync")');
						}
						if (typeof evaluateOptions.fn !== 'string') {
							throw new Error('Invalid option ("fn"): String expected');
						}
						if (!(evaluateOptions.args instanceof Array)) {
							throw new Error('Missing required option ("args"): Array expected');
						}
						evaluateOptions.isAsync = evaluateOptions.isAsync === true;
						// Find the test function in the context of the page.
						var testFn = (function() {
							var parts = evaluateOptions.fn.split('.');
							var parent = window;
							while (parts.length > 1) {
								parent = parent[parts.shift()];
							}
							var fn = parent[parts[0]];
							if (typeof fn === 'undefined') {
								throw new Error('Function does not exist: "' + evaluateOptions.fn + '"');
							}
							// Bind the function to the parent context.
							return function() {
								return fn.apply(parent, arguments);
							};
						})();
						if (evaluateOptions.isAsync) {
							// Asynchronous execution.
							var done = function(error) {
								var args = Array.prototype.slice.call(arguments);
								if (args[0] instanceof Error) {
									args[0] = args[0].message
								} else if (_.isObject(args[0])) {
									if (args[0].responseJSON && args[0].responseJSON.error) {
										args[0] = args[0].responseJSON.error;
									} else if (args[0].status) {
										args[0] = args[0].statusText;
									} else if (args[0].status === 0) {
										args[0] = 'FAILED_HTTP_REQUEST';
									}
								}
								resolve(args);
							};
							var args = evaluateOptions.args.concat(done);
							testFn.apply(undefined, args);
						} else {
							// Synchronous execution.
							var thrownError;
							try {
								var result = testFn.apply(undefined, evaluateOptions.args);
							} catch (error) {
								return resolve([error.message]);
							}
							return resolve([null, result]);
						}
					})();
				} catch (error) {
					return reject(error);
				}
			});
		}, options).then(function(result) {
			result = result || [];
			if (result[0]) {
				throw new Error(result[0]);
			}
			return result[1] || null;
		});
	},

};
