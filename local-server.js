let http = require( 'http' ),
	url  = require( 'url' ),
	tachyon = require( './tachyon' );

let args  = process.argv.slice(2),
	port  = Number( args[0] ) ? args[0] : 8080;

/**
 * Helper function to pretty-print values as HTML output
 *
 * @return {string} Dumped data wrapped in <xmp> elements
 */
function dump() {
	var output = '';
	var args = Array.prototype.slice.call( arguments );
	args.forEach(function(item) {
		if ( typeof item === 'object' ) {
			item = JSON.stringify( item, null, 4 )
		}
		output += '<xmp>' + item + '</xmp>';
	});
	return output;
}

/**
 * Run a server
 *
 * @param  {object} request  The request coming in to the server
 * @param  {object} response The response to send back to the client
 */
function serverFunc( request, response ) {
	request.on( 'error', function( err ) {
		let output = '<h1>Server Error!</h1>';
		output += dump( data );
		response.statusCode = 500;
		response.end( output );
	});

	/**
	 * Write a response for a given media file
	 *
	 * @param  {object} obj The response to write out including headers and body
	 * @return {object}     The response object to give back to the server
	 */
	function displaySuccess( obj ) {
		// obj contains the headers of the original file from S3
		// We can remove some we don't need and send the file back to the client
		// obj.Body is a buffer of the file
		let respBody = obj.Body;
		delete obj.Body;
		delete obj.Metadata;
		response.writeHead( 200, obj );
		return response.end( respBody );
	}

	/**
	 * Display some HTML with error data
	 *
	 * @param  {object|string} data Value to pass to dump() and be displayed
	 * @return {object}             The response object to give back to the server
	 */
	function displayError( data ) {
		let output = '<h1>Not found!</h1>';
		output += dump( data );
		response.writeHead( 404, {
			'Content-Type': 'text/html',
			'Cache-Control': 'public, max-age=10'
		});
		return response.end( output );
	}

	/**
	 * Handles the response when the Promise chain completes without any rejections
	 *
	 * @param  {object} data Data passed from the Promise chain
	 * @return {object}      Response to give back to the server to send to the client
	 */
	function handlePromiseSuccess( data ) {
		console.log( 'Promise Success!' );
		if ( ! ( 'obj' in data ) ) {
			return displayError( data );
		}

		if ( ! ( 'Body' in data.obj ) ) {
			return displayError( data );
		}

		// data.obj contains the headers of the original file from S3
		// We can remove some we don't need and send the file back to the client
		// data.obj.Body is a buffer of the file
		let respBody = data.obj.Body;
		delete data.obj.Body;
		delete data.obj.Metadata;
		response.writeHead( 200, data.obj );
		return response.end( respBody );
	}

	/**
	 * Handles the response when the Promise chain completes with a rejection
	 *
	 * @param  {object} data Data passed from the Promise chain
	 * @return {object}      Response to give back to the server to send to the client
	 */
	function handlePromiseError( context ) {
		console.log( 'Promise Error!' );
		switch( context.code ) {
			case 'found-on-s3':
			case 'processed-image':
				return displaySuccess( context.obj );
				break;

			default:
				return displayError( context );
				break;
		}
		return displayError( context );
	}

	// Kick off our chain of Promises
	//
	// If we need to short circuit the chain we can reject a Promise and let
	// handlePromiseError() take over.
	//
	// Otherwise we go from .then() call to .then() call until we're all done.
	tachyon.setup(request.url)
		.then(tachyon.checkIfCached)
		.then(tachyon.getOriginal)
		.then(tachyon.processImage)
		.then(tachyon.cacheProcessedImage)
		.then(handlePromiseSuccess)
		.catch(handlePromiseError);
}

// Start the server
http.createServer(serverFunc).listen( parseInt( port, 10 ) );
console.log( "Server running at\n => http://localhost:" + port + "/\nCTRL + C to shutdown" );
