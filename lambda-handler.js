const tachyon = require( './tachyon' );

exports.handler = function( event, context, callback ) {
	let request = event.Records[0].cf.request;
	console.log( 'The event!!!' );
	console.log( JSON.stringify( event ) );

	/**
	 * Helper function to return the original request back to CloudFront
	 */
	function sendUnmodifiedResponse() {
		callback( null, request );
	}

	// If no query strings then there is nothing to do...
	if ( ! request.querystring ) {
		return sendUnmodifiedResponse();
	}

	/**
	 * Handles the response when the Promise chain completes without any rejections
	 *
	 * @param  {object} data Data passed from the Promise chain
	 * @return {callback}    Modified request to send back to CloudFront
	 */
	function handlePromiseSuccess( data ) {
		console.log( 'Promise Success!' );
		if ( ! ( 'S3Key' in data ) ) {
			return sendUnmodifiedResponse();
		}

		request.uri = '/' + data.S3Key;
		request.querystring = '';
		console.log( 'RESULT!!!' );
		console.log( JSON.stringify( request ) );
		return callback(null, request);
	}

	/**
	 * Handles the response when the Promise chain completes with a rejection
	 *
	 * @param  {object} data Data passed from the Promise chain
	 * @return {callback}    Request to send back to CloudFront
	 */
	function handlePromiseError( data ) {
		console.log( 'Promise Error!' );
		switch( data.code ) {
			case 'found-on-s3':
			case 'cached-processed-image':
				return handlePromiseSuccess( data );
				break;
		}
		console.log( data );
		return sendUnmodifiedResponse();
	}

	// Kick off our chain of Promises
	//
	// If we need to short circuit the chain we can reject a Promise and let
	// handlePromiseError() take over.
	//
	// Otherwise we go from .then() call to .then() call until we're all done.
	const requestURL = request.uri + '?' + request.querystring;
	tachyon.setup(requestURL)
		.then(tachyon.checkIfCached)
		.then(tachyon.getOriginal)
		.then(tachyon.processImage)
		.then(tachyon.cacheProcessedImage)
		.then(handlePromiseSuccess)
		.catch(handlePromiseError);
};
