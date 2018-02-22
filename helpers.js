module.exports = {};

/**
 * Replace characters like = , & | with a - for use as a filename
 *
 * @param  {string} str String to be sanitized
 * @return {string}     Sanitized string
 */
module.exports.sanitizeQueryString = function( str ) {
	str = decodeURIComponent( str );
	return encodeURIComponent( str.replace(/[=,&|]/g,'-' ) );
};

/**
 * Turn a query string into an object with the keys sorted alphabetically
 *
 * @param  {string} queryString Like foo=bar&baz=bop
 * @return {object}             Like { foo: "bar", baz:"bop" }
 */
module.exports.queryStringToJSON = function( queryString ) {
	if ( typeof queryString !== 'string' ) {
		return {};
	}
	const pairs = queryString.split('&');
	let result = {};
	pairs.forEach(function(pair) {
		pair = pair.split('=');
		result[ pair[0] ] = decodeURIComponent( pair[1] || '' );
	});
	let sortedResult = {}
	Object.keys( result ).sort().forEach(function(key) {
		sortedResult[key] = result[key];
	});
	return JSON.parse( JSON.stringify( sortedResult ) );
};

/**
 * Turn an object into a query string
 *
 * @param  {object} queryString Like { foo: "bar", baz:"bop" }
 * @return {string}             Like foo=bar&baz=bop
 */
module.exports.JSONToQueryString = function( obj ) {
	if ( typeof obj !== 'object' ) {
		return '';
	}
	return Object
		.keys( obj )
		.reduce( function( a, k ) {
			a.push( k + '=' + encodeURIComponent( obj[k] ) );
			return a;
		}, [] )
		.join( '&' );
};

/**
 * Compare two arrays and return deduped values that are in each array
 *
 * @param  {array} array1 Array of values to compare
 * @param  {array} array2 Other array of values to compare
 * @return {array}        Deduped values that are in both arrays
 */
module.exports.getIntersectingValues = function( array1, array2 ) {
	return array1
			.filter( function( val ) {
				return array2.indexOf( val ) !== -1;
			})
			// Remove duplicates
			.filter( function( val, index, arr ) {
				return arr.indexOf( val ) === index;
			});
};

/**
 * Get a file extension from a given string
 *
 * @param  {string} str Path to a file with an extension
 * @return {string}     The file extension
 */
module.exports.getFileExtension = function( str ) {
	// Remove a query string
	str = str.split('?')[0];
	// Split at the . and take the last item from the resulting array
	str = str.split('.').pop();
	return str.toLowerCase();
};
