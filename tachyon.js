const 	AWS = require('aws-sdk'),
		fs = require('fs');

// We need to setup AWS configuration before instantiating an S3 object
let configPath = '';
let configPaths = [
	'./config.json',      // Settings for AWS Lambda
	'./local-config.json' // Settings for local version
];
for ( var i = 0; i < configPaths.length; i++ ) {
	var path = configPaths[ i ];
	if ( fs.existsSync( path ) ) {
		configPath = path;
		break;
	}
}

let config = {};
if ( configPath ) {
	config = JSON.parse( fs.readFileSync( configPath ) );
	AWS.config.loadFromPath( configPath );
}

const	S3 = new AWS.S3({
			signatureVersion: 'v4',
		}),
		Sharp = require('sharp'),
		Helpers = require( './helpers' );

/**
 * For use in referncing functions from this file
 *
 * @type {object}
 */
var self = module.exports = {};

/**
 * Parse a URL and setup different options that can be passed along our Promise chain
 *
 * @param  {string} url The URL to parse
 * @return {Promise|object} Returns a promise that resolves to an object with various data about the image
 */
module.exports.setup = function( url ) {
	return new Promise( function( resolve, reject ) {
		// Remove preceeding slash
		url = url.replace(/^\/+/g, '');
		const originalURL = url;

		let parts = originalURL.split( '?' );
		let path = parts[0];
		let querystring = parts[1];
		let params = Helpers.queryStringToJSON( querystring );
		let newQuerystring = Helpers.JSONToQueryString( params );
		newQuerystring = Helpers.sanitizeQueryString( newQuerystring );

		// Transform the path for how we store resized versions on S3
		let newPath = 'resized/' + path;
		let newURL = newPath + '_' + newQuerystring;

		let returnObj = {
			originalURL: originalURL,
			path: path,
			querystring: params,
			S3Path: newPath,
			S3Querystring: newQuerystring,
			S3Key: newURL,
		};

		// Make sure we're dealing with a supported file extension
		const originalExtension = path.split('.').pop().toLowerCase();
		const allowedExtensions = [ 'jpg', 'jpeg', 'png', 'webp', 'gif' ];
		if ( allowedExtensions.indexOf( originalExtension ) === -1 ) {
			returnObj.code = 'invalid-extension';
			returnObj.reason = originalExtension + ' is not an allowed file extension!';
			return reject( returnObj );
		}

		// Make sure one of the following query strings is provided, otherwise there is nothing to process
		const allowedParams = [
			'w',          // Reisze to a certain width
			'h',          // Resize to a certain height
			'resize',     // Center cropped to the exact size
			'fit',        // Alias of resize
			'quality',    // Adjust JPG quality
			'crop',       // Extract a region of the image
			'webp',       // Output in webp format
			'rotate',     // Rotate image 0, 90, 180, 270 degrees
			'flip',       // Flip the image vertically
			'flop',       // Flip the image horizontally
			'negative',   // Convert image to opposite colors
			'grayscale',  // Convert image to black and white
			'greyscale',  // Alias of grayscale
			'lb',         // Letterbox an image at a certain size
			'background'  // Background color of letterbox
		];
		let matchingKeys = Helpers.getIntersectingValues( Object.keys( params ), allowedParams );
		if ( matchingKeys.length === 0 ) {
			returnObj.code = 'invalid-query-string';
			returnObj.reason = 'No valid query strings were used: ' + Object.keys( params );
			return reject( returnObj );
		}

		return resolve( returnObj );
	}); // end Promise
};

/**
 * Check if the image is already cached on S3 based on the query string
 *
 * @param  {object} data Data about the image from setup()
 * @return {Promise|object} Returns a promise that resolves to an object with various data about the image
 */
module.exports.checkIfCached = function( data ) {
	console.log( 'checkIfCached' );
	return new Promise(function( resolve, reject ) {
		if ( ! ( 'S3Key' in data ) ) {
			data.code = 'no-s3-key';
			data.reason = 'No S3 Key was passed to checkIfCached';
			return reject( data );
		}
		self.getFromS3( data.S3Key )
			.then(function( s3Obj ) {
				data.obj = s3Obj;
				data.code ='found-on-s3';
				// Sweet! We're done. End the Promise chain...
				return reject( data )
			})
			.catch(function( err ) {
				// Nothing in cache so keep going down the Promise chain...
				return resolve( data );
			});
	}); // end Promise
};

/**
 * Get the original, querystring-less image from S3
 *
 * @param  {object} data Data about the image from setup()
 * @return {Promise|object} Returns a promise that resolves to an object with various data about the image
 */
module.exports.getOriginal = function( data ) {
	console.log( 'getOriginal' );
	return new Promise(function( resolve, reject ) {
		if ( ! ( 'path' in data ) ) {
			data.code = 'no-path';
			data.reason = 'No path was passed to getOriginal';
			return reject( data );
		}
		self.getFromS3( data.path )
			.then(function( s3Obj ) {
				data.obj = s3Obj;
				return resolve( data );
			})
			.catch(function( err ) {
				// The original image wasn't found on S3
				data.code ='original-not-found-from-s3';
				return reject( data );
			});
	}); // end Promise
};

/**
 * Save the processed image back to S3 in a new /resized/ directory
 *
 * @param  {object} data Data about the image from setup()
 * @return {Promise|object} Returns a promise that resolves to an object with various data about the image
 */
module.exports.cacheProcessedImage = function( data ) {
	console.log( 'cacheProcessedImage' );
	return new Promise(function( resolve, reject ) {
		let args = {
			key: data.S3Key,
			body: data.obj.Body
		};
		self.putToS3( args )
			.then(function(resp) {
				data.code = 'cached-processed-image';
				data.reason = 'The processed image was saved to S3';
				resolve( data );
			})
			.catch(function( err ) {
				data.code = 'processed-image-not-cached';
				data.reason = 'The processed image couldn\'t be cached on S3';
				console.log( err );
				return reject( data );
			});
	} ); // end Promise
};

/**
 * Helper for making a S3 read request
 *
 * @param  {string} key Path to the image in the S3 bucket
 * @return {Promise|object} Returns a promise that resolves to data about the S3 file
 */
module.exports.getFromS3 = function( key ) {
	console.log( 'Get S3 Key: ', key );
	return S3
		.getObject( {
			Bucket: config.bucket,
			Key: key
		} )
		.promise();
};

/**
 * helper for making a S3 write request
 *
 * @param  {object} args Object with the body of the file to be saved and the key of where the file should live in the S3 bucket
 * @return {Promise|object} Returns a promise that resolves to data about the S3 file
 */
module.exports.putToS3 = function( args ) {
	console.log( 'Put S3 Key: ', args.key );
	return S3
		.putObject( {
			Bucket: config.bucket,
			Key: args.key,
			Body: args.body,
			ACL: 'public-read'
		} )
		.promise();
};

/**
 * Process an image based on the query strings passed to the URL
 *
 * @param  {object} data Data about the image from setup()
 * @return {Promise|object} Returns a promise that resolves to an object with various data about the image
 */
module.exports.processImage = function( data ) {
	console.log( 'processImage' );
	let buffer = data.obj.Body;
	let args = data.querystring;

	return new Promise(function( resolve, reject ) {
		var image = Sharp(buffer).withMetadata();
		image.metadata(function( err, metadata ) {
			// Auto rotate based on orientation exif data
			let rotation = null;
			if ( args.rotate ) {
				rotation = Number( args.rotate );
				if ( [ 0, 90, 180, 270 ].indexOf( rotation ) == -1 ) {
					rotation = null;
				}
			}
			image.rotate( rotation );

			if ( metadata.format === 'jpg' ) {
				data.obj.ContentType = 'image/jpeg';
			}

			// Convert gifs to pngs unless animated
			if ( metadata.format === 'gif' ) {
				if ( isAnimated( buffer ) ) {
					data.code = 'animated-gif';
					data.reason = 'The image being processed is an animated gif (unprocessable)';
					return reject( data );
				} else {
					image.png();
					data.obj.ContentType = 'image/png';
				}
			}

			// Normalize dimensions
			if ( args.w ) {
				args.w = Math.min( args.w, metadata.width );
			}

			if ( args.h ) {
				args.h = Math.min( args.h, metadata.height );
			}

			// Reverse the colors
			if ( args.negative ) {
				image.negate();
			}

			// Flip image vertically
			if ( args.flip ) {
				image.flip();
			}

			// Flip the image horizontally
			if ( args.flop ) {
				image.flop();
			}

			// Convert to black and white
			if ( args.grayscale || args.greyscale ) {
				image.grayscale();
			}

			// Crop (assumes crop data from original)
			if ( args.crop ) {
				var cropValues = args.crop;
				if ( typeof args.crop === 'string' ) {
					cropValues = args.crop.split(',')
				}

				// Convert percantages to px values
				cropValues = cropValues.map( function(value, index) {
					if ( value.indexOf('px') > -1 ) {
						return Number( value.substr( 0, value.length - 2 ) );
					} else {
						return Number(
							Number(
								metadata[index % 2 ? 'height' : 'width'] *
									(value / 100)
							).toFixed(0)
						);
					}
				});

				image.extract({
					left: cropValues[0],
					top: cropValues[1],
					width: cropValues[2],
					height: cropValues[3],
				});
			}

			// Resize
			if ( args.resize ) {
				if ( typeof args.resize === 'string' ) {
					args.resize = args.resize.split(',');
				}
				image.resize.apply(
					image,
					args.resize.map( function( v ) {
						return Number( v ) || null;
					} )
				);
			} else if ( args.fit ) {
				if ( typeof args.fit === 'string' ) {
					args.fit = args.fit.split(',');
				}
				image.resize.apply(
					image,
					args.fit.map( function( v ) {
						return Number( v ) || null;
					} )
				);
				image.max();
			} else if ( args.lb ) {
				if ( typeof args.lb === 'string' ) {
					args.lb = args.lb.split(',');
				}
				image.resize.apply(
					image,
					args.lb.map( function( v ) {
						return Number( v ) || null;
					} )
				);

				// Default to a black background to replicate Photon API behaviour
				// when no background color specified
				if ( ! args.background ) {
					args.background = 'black';
				}
				image.background( args.background );
				image.embed();
			} else if ( args.w || args.h ) {
				image.resize(
					Number( args.w ) || null,
					Number( args.h ) || null
				);
				if ( ! args.crop ) {
					image.max();
				}
			}

			// Allow override of compression quality
			if ( args.webp ) {
				image.webp( {
					quality: args.quality
						? Math.min(
								Math.max( Number( args.quality ), 0 )
							, 100 )
						: 80,
				} );
				data.obj.ContentType = 'image/webp';
			} else if ( metadata.format === 'jpeg' && args.quality ) {
				image.jpeg( {
					quality: Math.min(
						Math.max( Number( args.quality ), 0 ),
						100
					),
				} );
			}

			// Save the image out
			image.toBuffer(function(err, img) {
				if ( err ) {
					data.code = 'error-processing-image';
					data.reason = err;
					return reject( data );
				}

				data.code = 'processed-image';
				data.obj.Body = img;
				if ( typeof img === 'Buffer' ) {
					data.obj.ContentLength = Buffer.byteLength( img );
				}
				return resolve( data );
			});
		} );
	}); // end Promise
};
