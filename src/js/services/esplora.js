var app = app || {};

app.services = app.services || {};

app.services.Esplora = (function() {

	'use strict';

	// Documentation for API can be found here:
	// https://github.com/Blockstream/esplora/blob/master/API.md

	return app.abstracts.WebService.extend({
		type: 'esplora',
		broadcastRawTx: function(rawTx, cb) {
			return this.doRequest('POST', '/api/tx', rawTx, function(error, result) {
				if (error) return cb(error);
				cb(null, result);
			});
		},
		fetchMinRelayFeeRate: function(cb) {
			return this.doRequest('GET', '/api/fee-estimates', function(error, result) {
				if (error) return cb(error);
				var minFeeRate;
				try {
					minFeeRate = (new BigNumber(result['1008'])).toNumber();
				} catch (error) {
					app.log(error);
					minFeeRate = null;
				}
				if (!_.isNumber(minFeeRate) || _.isNaN(minFeeRate)) {
					return cb(new Error('Unexpected response from web service'));
				}
				cb(null, minFeeRate);
			});
		},
		fetchTx: function(txid, cb) {
			return this.doRequest('GET', '/api/tx/' + txid, cb);
		},
		fetchRawTx: function(txid, cb) {
			return this.doRequest('GET', '/api/tx/' + txid + '/hex', cb);
		},
		fetchUnspentTxOutputs: function(address, cb) {
			return this.doRequest('GET', '/api/address/' + address + '/utxo', cb);
		},
		fetchTransactions: function(address, lastSeenTxid, cb) {
			if (_.isFunction(lastSeenTxid)) {
				cb = lastSeenTxid;
				lastSeenTxid = null;
			}
			var uri = '/api/address/' + address + '/txs';
			if (lastSeenTxid) {
				uri += '/chain/' + lastSeenTxid;
			}
			return this.doRequest('GET', uri, cb);
		},
	});

})();
