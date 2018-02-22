var tachyon   = require('./index'),
	proxyFile = require('./proxy-file');

exports.handler = function( event, context, callback ) {
	var region = process.env.S3_REGION;
	var bucket = process.env.S3_BUCKET;
	var key = decodeURI( event.pathParameters.proxy );

	var config = {
		region: region,
		bucket: bucket
	};

	var args = event.queryStringParameters || {};
	if ( typeof args.webp === 'undefined' && event.headers ) {
		args.webp = !!event.headers['X-WebP'];
	}

	return tachyon.s3( config, key, args, function(
		err,
		data,
		info
	) {
		if ( err ) {
			if ( err.message === 'return-original-file' ) {
				return proxyFile( region, bucket, key, callback );
			}
			return context.fail( err );
		}

		var resp = {
			statusCode: 200,
			headers: {
				'Content-Type': 'image/' + info.format,
			},
			body: new Buffer(data).toString('base64'),
			isBase64Encoded: true
		};

		callback( null, resp );

		data = null;
		info = null;
		err  = null;
	});
};
