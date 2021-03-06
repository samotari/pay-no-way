(function() {

	jQuery.fn.serializeJSON = function() {

		var json = {};
		var nameRegex = /^([a-zA-Z0-9]+)\[([a-zA-Z0-9]*)\]$/;

		jQuery.map(jQuery(this).serializeArray(), function(field) {
			var name = field['name'];
			var value = field['value'];
			var match = name.match(nameRegex);
			if (match) {
				name = match[1];
				if (typeof json[name] === 'undefined') {
					json[name] = match[2] ? {} : [];
				}
				if (match[2] && !_.isArray(json[name])) {
					json[name][match[2]] = value;
				} else if (_.isArray(json[name])) {
					json[name].push(value);
				}
			} else if (typeof json[name] !== 'undefined') {
				if (!_.isArray(json[name])) {
					var previousValue = json[name];
					json[name] = [ previousValue ];
				}
				json[name].push(value);
			} else {
				json[name] = value;
			}
		});

		return json;
	};

})();
